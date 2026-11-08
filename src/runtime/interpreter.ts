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
 */
import { functionBody, mainBody } from '../ir/program';
import { initialState, evaluate, objectiveMet, step } from '../sim/world';
import type { ObjectiveDefinition, SimState, WorldDefinition } from '../sim/types';
import type { IRNode, ProgramIR } from '../ir/types';
import type { RunLimits, RunOutcome, TraceEvent } from './contract';

export interface InterpretInput {
  program: ProgramIR;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  limits: Pick<RunLimits, 'maxSteps'>;
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

const stateKey = (s: SimState) => `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}`;

export function* interpret(input: InterpretInput): Generator<TraceEvent, InterpretSummary, void> {
  const { program, world, objective, limits } = input;
  let state = initialState(world);
  let executed = 0;
  /** Set once something ends the run early. */
  let stop: RunOutcome | null = null;
  /** The call cards being run, outermost first. */
  const calls: string[] = [];

  /** Emit one event, counting it against the limit. Returns false when the run must stop. */
  function* emit(event: DistributiveOmit<TraceEvent, 'index'>): Generator<TraceEvent, boolean, void> {
    if (executed >= limits.maxSteps) {
      stop = { status: 'halted', reason: 'step-limit' };
      return false;
    }
    const full = { index: executed, ...event, ...(calls.length > 0 && { via: [...calls] }) } as TraceEvent;
    executed++;
    yield full;
    return true;
  }

  function* run(nodes: readonly IRNode[]): Generator<TraceEvent, void, void> {
    for (const node of nodes) {
      if (stop) return;
      switch (node.kind) {
        case 'forward':
        case 'rotateCW':
        case 'rotateCCW': {
          const result = step(world, state, node.kind);
          const ok = yield* emit({
            nodeId: node.id,
            op: node.kind,
            before: state,
            after: result.state,
            result:
              result.kind === 'ok'
                ? result.collected
                  ? { kind: 'ok', collected: result.collected }
                  : { kind: 'ok' }
                : { kind: 'blocked', reason: result.reason, at: result.at },
          });
          if (!ok) return;
          if (result.kind === 'blocked') {
            stop = { status: 'blocked', nodeId: node.id, reason: result.reason };
            return;
          }
          state = result.state;
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
            stop = { status: 'error', message: `No function named ${node.name}` };
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
            const key = stateKey(state);
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

  yield* run(mainBody(program));
  if (stop) return { outcome: stop, final: state, executedSteps: executed };
  const outcome: RunOutcome = objectiveMet(world, objective, state) ? { status: 'success' } : { status: 'incomplete' };
  return { outcome, final: state, executedSteps: executed };
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
