/**
 * Deterministic interpreter over the program IR. Pure: same input, same trace.
 * It is a generator so a host can stream events and stop it at any point.
 *
 * Every robot action is one event. A block adds events of its own so the
 * child can watch it think: a Repeat emits a `loop` event at the start of
 * each go round, and an If or Repeat until emits a `check` event with the
 * answer it got. A call emits a `call` event, then runs its function's
 * cards, each tagged with the calls it runs inside. Those events change
 * nothing on the board.
 *
 * Events: when a step lands on a plate or picks up an acorn, a `when` event
 * and that When card's cards run right after the step, before the next card.
 * On a timed board every robot action (Forward, a turn, Wait) is followed by
 * a `tick` event: the movers step, a robot on a log rides along, and then the
 * Every tick card runs. Cards inside the Every tick card do not tick again.
 * On input levels the key script plays after main, one `press` event per key,
 * each followed by that key's When card.
 */
import { functionBody, handlerBody, mainBody } from '../ir/program';
import { handlerContainerId, isBirdSource, isPosition, parseField, parseRead, TAP, type Key } from '../ir/types';
import { advance, drawSource, morning, nextRobot, faceTo, gridPlace, initialState, markGrid, missingItem, shiftPlace, evaluate, isTimed, objectiveMet, period, recall, remember, setGate, tileAt, stateKey, step, unlockGate, type WorldEvent } from '../sim/world';
import type { Facing } from '../sim/types';
import type { ObjectiveDefinition, SimState, WorldDefinition } from '../sim/types';
import type { IRNode, ProgramIR } from '../ir/types';
import { LIVE_TOTAL_STEPS, type LiveInput, type LiveSettings, type RunLimits, type RunOutcome, type TraceEvent } from './contract';

export interface InterpretInput {
  program: ProgramIR;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  limits: Pick<RunLimits, 'maxSteps'>;
  input?: readonly Key[];
  seed?: number;
  days?: number;
  live?: LiveSettings;
}

export interface InterpretSummary {
  outcome: RunOutcome;
  final: SimState;
  executedSteps: number;
}

/** Omit that keeps a union a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** How many calls may be running inside one another. */
const MAX_CALL_DEPTH = 16;


/** What a live run yields when it has nothing left to do until the next input arrives. */
export const AWAIT_INPUT = { op: 'await' } as const;
export type LiveStep = TraceEvent | typeof AWAIT_INPUT;

/**
 * The interpreter itself. Not interactive, it runs to the end, reading a
 * live run's inputs from its recording. Interactive, it yields AWAIT_INPUT
 * and is resumed with the next input, or with null to end the run. Both
 * walk the same code, so a recording replays to the same trace.
 */
function* execute(input: InterpretInput, interactive: boolean): Generator<LiveStep, InterpretSummary, LiveInput | null | undefined> {
  const { program, world, objective, limits } = input;
  const live = input.live;
  /** Where this turn's events began: a live run's step limit is for each turn, not for the whole game. */
  let turnStart = 0;
  let state = initialState(world, program.memory, input.seed);
  const timed = isTimed(world, handlerBody(program, 'tick') !== undefined);
  const worldPeriod = period(world);
  /** True while the Every tick card runs, so its own actions do not tick again. */
  let ticking = false;
  let executed = 0;
  /** Set once something ends the run early. */
  let stop: RunOutcome | null = null;
  /** The call cards being run, outermost first. */
  const calls: string[] = [];

  /** Emit one event, counting it against the limit. Returns false when the run must stop. */
  function* emit(event: DistributiveOmit<TraceEvent, 'index'>): Generator<TraceEvent, boolean, unknown> {
    if (executed - turnStart >= limits.maxSteps || (live && executed >= LIVE_TOTAL_STEPS)) {
      stop = { status: 'halted', reason: 'step-limit' };
      return false;
    }
    const full = { index: executed, ...event, ...(calls.length > 0 && { via: [...calls] }) } as TraceEvent;
    executed++;
    yield full;
    return true;
  }

  function* run(nodes: readonly IRNode[]): Generator<TraceEvent, void, unknown> {
    for (const node of nodes) {
      if (stop) return;
      switch (node.kind) {
        case 'forward':
        case 'rotateCW':
        case 'rotateCCW':
        case 'wait': {
          const result = step(world, state, node.kind);
          const ok = yield* emit({
            nodeId: node.id,
            op: node.kind,
            before: state,
            after: result.state,
            result:
              result.kind === 'ok'
                ? { kind: 'ok', ...(result.collected && { collected: result.collected }), ...(result.toggled && { toggled: result.toggled }) }
                : { kind: 'blocked', reason: result.reason, at: result.at },
          });
          if (!ok) return;
          if (result.kind === 'blocked') {
            // In a live game a bump is just a bump: the robot stays put and play goes on. Walking into a beetle still ends it.
            if (live && result.reason !== 'beetle') break;
            stop = { status: 'blocked', nodeId: node.id, reason: result.reason };
            return;
          }
          state = result.state;
          yield* afterAction(node.id, result.events ?? []);
          break;
        }
        case 'openGate':
        case 'closeGate': {
          const after = setGate(state, node.gate, node.kind === 'openGate');
          const ok = yield* emit({ nodeId: node.id, op: node.kind, gate: node.gate, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'set':
        case 'change': {
          const missing = node.kind === 'set' ? missingItem(state, node.to) : undefined;
          if (missing) {
            stop = { status: 'error', message: missing, nodeId: node.id };
            return;
          }
          const old = recall(state, node.slot);
          const drawn = node.kind === 'set' ? drawSource(world, state, node.to) : { value: (typeof old === 'number' ? old : 0) + node.by, state };
          const value = drawn.value;
          const after = remember(drawn.state, node.slot, value);
          // The bird answers questions about the whole board, and reads the map under it.
          const read = node.kind === 'set' ? parseRead(node.to) : null;
          const underBird = read?.at === 'bird';
          const asked = node.kind === 'set' && (isBirdSource(node.to) || underBird);
          // A field of a crate's record is a question for the inventory computer.
          const field = node.kind === 'set' ? parseField(node.to) : null;
          // A record standing on the board, like a sign, is read where it stands; the others are the inventory computer's.
          const onBoard = field !== null && program.memory?.some((m) => m.name === field.record && m.at);
          const who = asked ? { asked: 'bird' as const, ...(underBird && { seen: read.grid }) } : field ? { ...(!onBoard && { asked: 'inventory' as const }), seen: `${field.record}.${field.field}` } : {};
          const ok = yield* emit({ nodeId: node.id, op: 'set', slot: node.slot, value, ...who, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'face': {
          const facing = state.memory?.[node.slot];
          if (facing !== 'N' && facing !== 'E' && facing !== 'S' && facing !== 'W') {
            stop = { status: 'error', message: `${node.slot} holds no direction`, nodeId: node.id };
            return;
          }
          const after = faceTo(state, facing as Facing);
          const ok = yield* emit({ nodeId: node.id, op: 'face', slot: node.slot, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          yield* afterAction(node.id, []);
          break;
        }
        case 'unlock': {
          const after = unlockGate(world, state, node.gate, state.memory?.[node.slot]);
          const opened = after !== state;
          const ok = yield* emit({ nodeId: node.id, op: 'unlock', gate: node.gate, opened, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'push': {
          const missing = missingItem(state, node.to);
          if (missing) {
            stop = { status: 'error', message: missing, nodeId: node.id };
            return;
          }
          const old = state.memory?.[node.list];
          const drawn = drawSource(world, state, node.to);
          const list = [...(Array.isArray(old) ? old : []), drawn.value];
          const after = remember(drawn.state, node.list, list);
          const ok = yield* emit({ nodeId: node.id, op: 'set', slot: node.list, value: list, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'shift': {
          const moved = shiftPlace(state.memory?.[node.slot], node.dir);
          if (moved === undefined) {
            stop = { status: 'error', message: `${node.slot} holds no place`, nodeId: node.id };
            return;
          }
          const after = remember(state, node.slot, moved);
          const ok = yield* emit({ nodeId: node.id, op: 'set', slot: node.slot, value: moved, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'fly': {
          // A place goes straight to a column, a row or both. Walls do not stop the bird, but it stays over the board.
          const from = state.memory?.[node.slot];
          if (!isPosition(from)) {
            stop = { status: 'error', message: `${node.slot} holds no place`, nodeId: node.id };
            return;
          }
          const resolve = (target: number | string | undefined, size: number, what: string, keep: number): number | string => {
            if (target === undefined) return keep;
            const raw = typeof target === 'number' ? target : state.memory?.[target];
            return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < size ? raw : `There is no ${what} ${String(raw)}`;
          };
          const x = resolve(node.column, world.width, 'column', from.x);
          const y = resolve(node.row, world.height, 'row', from.y);
          if (typeof x === 'string' || typeof y === 'string') {
            stop = { status: 'error', message: typeof x === 'string' ? x : (y as string), nodeId: node.id };
            return;
          }
          const after = remember(state, node.slot, { x, y });
          const ok = yield* emit({ nodeId: node.id, op: 'set', slot: node.slot, value: { x, y }, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'goRow':
        case 'goColumn': {
          // Walk straight to a row or a column, counted from 0: turn to face the way, then step by step.
          // A row or column by number, by a number slot, or by a place slot: its row, or its column.
          const held = typeof node.to === 'number' ? node.to : state.memory?.[node.to];
          const raw = isPosition(held) ? (node.kind === 'goRow' ? held.y : held.x) : held;
          const size = node.kind === 'goRow' ? world.height : world.width;
          if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= size) {
            stop = { status: 'error', message: `There is no ${node.kind === 'goRow' ? 'row' : 'column'} ${String(raw)}`, nodeId: node.id };
            return;
          }
          const target = raw;
          const at = node.kind === 'goRow' ? state.robot.y : state.robot.x;
          if (target === at) break;
          const facing: Facing = node.kind === 'goRow' ? (target > at ? 'S' : 'N') : target > at ? 'E' : 'W';
          if (state.robot.facing !== facing) {
            const after = faceTo(state, facing);
            const ok = yield* emit({ nodeId: node.id, op: 'face', slot: '', before: state, after, result: { kind: 'ok' } });
            if (!ok) return;
            state = after;
          }
          for (let k = 0; k < Math.abs(target - at) && !stop; k++) {
            const result = step(world, state, 'forward');
            const ok = yield* emit({
              nodeId: node.id,
              op: 'forward',
              before: state,
              after: result.state,
              result:
                result.kind === 'ok'
                  ? { kind: 'ok', ...(result.collected && { collected: result.collected }), ...(result.toggled && { toggled: result.toggled }) }
                  : { kind: 'blocked', reason: result.reason, at: result.at },
            });
            if (!ok) return;
            if (result.kind === 'blocked') {
              // In a live game the walk just ends where it was stopped; a beetle still ends the game.
              if (live && result.reason !== 'beetle') break;
              stop = { status: 'blocked', nodeId: node.id, reason: result.reason };
              return;
            }
            state = result.state;
            yield* afterAction(node.id, result.events ?? []);
          }
          break;
        }
        case 'mark': {
          const value = state.memory?.[node.slot];
          const after = value === undefined ? state : markGrid(state, node.grid, gridPlace(state, node.at), value);
          const ok = yield* emit({ nodeId: node.id, op: 'set', slot: node.grid, value: value ?? 0, before: state, after, result: { kind: 'ok' } });
          if (!ok) return;
          state = after;
          break;
        }
        case 'forEach': {
          const list = state.memory?.[node.list];
          if (!Array.isArray(list)) {
            stop = { status: 'error', message: `${node.list} is not a list`, nodeId: node.id };
            return;
          }
          // The list is read once, when the loop starts, so the cards inside cannot change how many goes it takes.
          const items = [...list];
          for (let i = 0; i < items.length; i++) {
            const after = remember(state, node.item, items[i]!);
            const ok = yield* emit({ nodeId: node.id, op: 'loop', iteration: i + 1, count: items.length, before: state, after, result: { kind: 'ok' } });
            if (!ok) return;
            state = after;
            yield* run(node.body);
            if (stop) return;
          }
          break;
        }
        case 'repeat': {
          for (let i = 1; i <= node.count; i++) {
            const ok = yield* emit({ nodeId: node.id, op: 'loop', iteration: i, count: node.count, before: state, after: state, result: { kind: 'ok' } });
            if (!ok) return;
            yield* run(node.body);
            if (stop) return;
          }
          break;
        }
        case 'if':
        case 'ifElse': {
          const value = evaluate(world, state, node.condition);
          const ok = yield* emit({ nodeId: node.id, op: 'check', condition: node.condition, value, before: state, after: state, result: { kind: 'ok' } });
          if (!ok) return;
          if (value) yield* run(node.body);
          else if (node.kind === 'ifElse') yield* run(node.elseBody);
          if (stop) return;
          break;
        }
        case 'call': {
          const body = functionBody(program, node.name);
          if (!body) {
            stop = { status: 'error', message: `No function named ${node.name}`, nodeId: node.id };
            return;
          }
          // Programs only call from main today, but a deep stack means a function reached itself.
          if (calls.length >= MAX_CALL_DEPTH) {
            stop = { status: 'halted', reason: 'forever' };
            return;
          }
          const ok = yield* emit({ nodeId: node.id, op: 'call', name: node.name, before: state, after: state, result: { kind: 'ok' } });
          if (!ok) return;
          calls.push(node.id);
          yield* run(body);
          calls.pop();
          if (stop) return;
          break;
        }
        case 'until': {
          // The world is deterministic, so the same state at the top of the
          // loop twice means it would go round forever.
          const seen = new Set<string>();
          for (;;) {
            const value = evaluate(world, state, node.condition);
            const ok = yield* emit({ nodeId: node.id, op: 'check', condition: node.condition, value, before: state, after: state, result: { kind: 'ok' } });
            if (!ok) return;
            if (value) break;
            const key = stateKey(state, worldPeriod);
            if (seen.has(key)) {
              stop = { status: 'halted', reason: 'forever' };
              return;
            }
            seen.add(key);
            yield* run(node.body);
            if (stop) return;
          }
          break;
        }
      }
    }
  }

  /** Run the When card waiting for an event, if there is one. */
  function* fire(event: string): Generator<TraceEvent, void, unknown> {
    const body = handlerBody(program, event);
    if (!body || stop) return;
    if (calls.length >= MAX_CALL_DEPTH) {
      stop = { status: 'halted', reason: 'forever' };
      return;
    }
    const container = handlerContainerId(event);
    const ok = yield* emit({ nodeId: container, op: 'when', event, before: state, after: state, result: { kind: 'ok' } });
    if (!ok) return;
    calls.push(container);
    yield* run(body);
    calls.pop();
  }

  /** After a robot action: the When cards it set off, then, on a timed board, one tick. */
  function* afterAction(nodeId: string, events: readonly WorldEvent[]): Generator<TraceEvent, void, unknown> {
    for (const event of events) yield* fire(event);
    // On a real-time game the clock moves the world, not the robot.
    if (live?.clock) return;
    yield* tick(nodeId);
  }

  /** One tick of the world: movers move, and the Every tick card runs. */
  function* tick(nodeId: string): Generator<TraceEvent, void, unknown> {
    if (stop || !(timed || live?.clock) || ticking) return;
    const t = advance(world, state);
    const ok = yield* emit({
      nodeId,
      op: 'tick',
      before: state,
      after: t.state,
      result: t.kind === 'ok' ? { kind: 'ok', ...(t.rode && { rode: true }) } : { kind: 'blocked', reason: t.reason, at: t.at },
    });
    if (!ok) return;
    state = t.state;
    if (t.kind === 'hazard') {
      stop = { status: 'blocked', nodeId, reason: t.reason };
      return;
    }
    ticking = true;
    yield* fire('tick');
    ticking = false;
  }

  /** A key is pressed: its When card runs, if the program has one. */
  function* press(key: Key, index: number): Generator<TraceEvent, void, unknown> {
    const event = `key:${key}`;
    const body = handlerBody(program, event);
    const container = body ? handlerContainerId(event) : 'input';
    const ok = yield* emit({ nodeId: container, op: 'press', key, press: index, before: state, after: state, result: { kind: 'ok' } });
    if (!ok || !body) return;
    calls.push(container);
    yield* run(body);
    calls.pop();
  }

  /** One day's run: main, then on input levels the key script. */
  function* day(): Generator<TraceEvent, void, unknown> {
    yield* run(mainBody(program));
    for (const [index, key] of (input.input ?? []).entries()) {
      if (stop) break;
      yield* press(key, index);
    }
  }

  // A live run: main sets the game up, then each input is a turn, until the goal is met, something ends it, or the inputs stop.
  if (live) {
    yield* run(mainBody(program));
    const recorded = live.inputs;
    let presses = 0;
    for (let turn = 0; !stop && !objectiveMet(world, objective, state); turn++) {
      let next: LiveInput | null;
      if (recorded) {
        if (turn >= recorded.length) break;
        next = recorded[turn]!;
      } else {
        if (!interactive) break;
        next = (yield AWAIT_INPUT) ?? null;
        if (next === null) break;
      }
      turnStart = executed;
      if (next.kind === 'key') yield* press(next.key, presses++);
      else if (next.kind === 'tap') {
        // A tap off the board is nothing. On it, the tile goes in the place slot named tap, if the program has one, and the When card runs.
        if (tileAt(world, next) === 'outside') continue;
        if (program.memory?.some((m) => m.name === TAP && m.kind === 'position')) state = remember(state, TAP, { x: next.x, y: next.y });
        yield* fire(TAP);
      } else yield* tick('clock');
    }
    if (stop) return { outcome: stop, final: state, executedSteps: executed };
    return { outcome: objectiveMet(world, objective, state) ? { status: 'success' } : { status: 'incomplete' }, final: state, executedSteps: executed };
  }

  // Levels of several days run the program once a day. Each night the robot
  // sleeps, and the next morning starts afresh, but for the backpack.
  const days = input.days ?? 1;
  if (days > 1) state = { ...state, day: 1 };
  yield* day();
  for (let d = 2; d <= days && !stop; d++) {
    const after = morning(world, program.memory ?? [], state);
    const ok = yield* emit({ nodeId: 'night', op: 'night', day: d, before: state, after, result: { kind: 'ok' } });
    if (!ok) break;
    state = after;
    yield* day();
  }
  // A team board: every robot built from the blueprint runs it in turn, on the same board.
  for (let r = 1; r < (world.team?.length ?? 0) && !stop; r++) {
    const after = nextRobot(world, program.memory ?? [], state);
    const ok = yield* emit({ nodeId: 'team', op: 'next', robot: r, before: state, after, result: { kind: 'ok' } });
    if (!ok) break;
    state = after;
    yield* day();
  }
  if (stop) return { outcome: stop, final: state, executedSteps: executed };
  const outcome: RunOutcome = objectiveMet(world, objective, state) ? { status: 'success' } : { status: 'incomplete' };
  return { outcome, final: state, executedSteps: executed };
}

/** Run a program to the end. A live run plays back its recording, or stops after main when it has none. */
export function* interpret(input: InterpretInput): Generator<TraceEvent, InterpretSummary, void> {
  const it = execute(input, false);
  for (;;) {
    const next = it.next();
    if (next.done) return next.value;
    if (next.value.op !== 'await') yield next.value;
  }
}

/** A live run that waits: it yields AWAIT_INPUT when it needs the next input, and is resumed with it, or with null to stop. */
export function interpretLive(input: InterpretInput): Generator<LiveStep, InterpretSummary, LiveInput | null | undefined> {
  return execute(input, true);
}

/** Run to completion and collect the trace. Used by tests and validators. */
export function interpretAll(input: InterpretInput): InterpretSummary & { trace: TraceEvent[] } {
  const trace: TraceEvent[] = [];
  const it = interpret(input);
  for (;;) {
    const next = it.next();
    if (next.done) return { ...next.value, trace };
    trace.push(next.value);
  }
}
