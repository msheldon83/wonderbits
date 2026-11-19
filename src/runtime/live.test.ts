import { describe, expect, it, vi } from 'vitest';
import { blankWorld } from '../create/blank';
import { applyStroke, applyTool } from '../create/worldOps';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import type { WorldDefinition } from '../sim/types';
import { createRuntimeClient, type Endpoint } from './client';
import { DEFAULT_LIMITS, type LiveInput, type LiveRequest, type LiveResult, type RuntimeMessage, type TraceEvent } from './contract';
import { createLiveHost } from './host';
import { interpretAll, interpretLive } from './interpreter';

const ir = (spec: NodeSpec[]) => programFromSpec(spec, sequentialIdFactory());
const goal = { reachGoal: true, collectAll: false };
const key = (k: 'up' | 'down' | 'left' | 'right'): LiveInput => ({ kind: 'key', key: k });
const TICK: LiveInput = { kind: 'tick' };
/** Arrow keys that drive the robot: right steps forward, up and down turn it. */
const driver: NodeSpec[] = [{ on: 'key:right', do: ['forward'] }, { on: 'key:up', do: ['rotateCCW'] }, { on: 'key:down', do: ['rotateCW'] }];
const at = (x: number, y: number) => ({ x, y });

/** Play a live run to the end by hand: feed each input when the run asks, and collect what it does. */
function play(spec: NodeSpec[], world: WorldDefinition, inputs: LiveInput[], clock = false, seed?: number) {
  const it = interpretLive({ program: ir(spec), world, objective: goal, limits: { maxSteps: 200 }, live: { clock }, ...(seed !== undefined && { seed }) });
  const trace: TraceEvent[] = [];
  const fed: LiveInput[] = [];
  let next = it.next();
  for (;;) {
    if (next.done) return { ...next.value, trace, fed };
    if (next.value.op === 'await') {
      const input = inputs[fed.length] ?? null;
      if (input) fed.push(input);
      next = it.next(input);
    } else {
      trace.push(next.value);
      next = it.next();
    }
  }
}
const replay = (spec: NodeSpec[], world: WorldDefinition, inputs: LiveInput[], clock = false, seed?: number) =>
  interpretAll({ program: ir(spec), world, objective: goal, limits: { maxSteps: 200 }, live: { clock, inputs }, ...(seed !== undefined && { seed }) });

describe('a live run', () => {
  it('waits for keys after main, and ends when the goal is met', () => {
    const r = play(driver, blankWorld(), [key('right'), key('right'), key('right'), key('right'), key('right')]);
    expect(r.outcome).toEqual({ status: 'success' });
    // The fifth press was never asked for: the run was over.
    expect(r.fed).toHaveLength(4);
    expect(r.trace.map((e) => e.op)).toEqual(['press', 'forward', 'press', 'forward', 'press', 'forward', 'press', 'forward']);
  });

  it('ends unfinished when it is stopped', () => {
    const r = play(driver, blankWorld(), [key('right')]);
    expect(r.outcome).toEqual({ status: 'incomplete' });
    expect(r.final.robot.x).toBe(1);
  });

  it('runs main first, to set the game up', () => {
    const r = play(['forward', ...driver], blankWorld(), [key('right'), key('right'), key('right')]);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace[0]!.op).toBe('forward');
  });

  it('treats a bump as a bump: the robot stays put and play goes on', () => {
    const walled = applyTool(blankWorld(), 'wall', at(1, 2));
    const r = play(driver, walled, [key('right'), key('right'), key('up'), key('right')]);
    expect(r.trace.filter((e) => e.result.kind === 'blocked')).toHaveLength(2);
    expect(r.final.robot).toEqual({ x: 0, y: 1, facing: 'N' });
    // The same bump ends an ordinary run.
    expect(interpretAll({ program: ir(['forward']), world: walled, objective: goal, limits: { maxSteps: 200 } }).outcome).toMatchObject({ status: 'blocked' });
  });

  it('a key with no When card is pressed and nothing happens', () => {
    const r = play(driver, blankWorld(), [key('left'), key('right')]);
    expect(r.trace.map((e) => e.op)).toEqual(['press', 'press', 'forward']);
  });
});

describe('the clock', () => {
  /** A beetle walking down the column the robot must cross. */
  const beetled = [at(2, 1), at(2, 2), at(2, 3)].reduce((w, c, i) => applyStroke(w, 'beetle', c, i === 0), blankWorld());

  it('on a real-time game moves the world on ticks, not on the robot\'s moves', () => {
    const r = play(driver, beetled, [key('right'), key('up'), key('down')], true);
    expect(r.trace.some((e) => e.op === 'tick')).toBe(false);
    expect(r.final.tick).toBe(0);
    const ticked = play(driver, beetled, [TICK, TICK], true);
    expect(ticked.trace.map((e) => e.op)).toEqual(['tick', 'tick']);
    expect(ticked.final.tick).toBe(2);
  });

  it('on a turn-based game moves the world after each robot action', () => {
    const r = play(driver, beetled, [key('up'), key('down')], false);
    expect(r.trace.map((e) => e.op)).toEqual(['press', 'rotateCCW', 'tick', 'press', 'rotateCW', 'tick']);
  });

  it('ends the game when the beetle reaches the robot', () => {
    // The robot steps beside the beetle's path and waits: the beetle walks onto it.
    const r = play(driver, beetled, [key('right'), key('right'), TICK, TICK, TICK], true);
    expect(r.outcome).toMatchObject({ status: 'blocked', reason: 'beetle' });
  });

  it('runs the Every tick card on each tick', () => {
    const r = play([{ remember: 'beats', kind: 'number', start: 0 }, { on: 'tick', do: [{ change: 'beats', by: 1 }] }, ...driver], blankWorld(), [TICK, TICK, TICK], true);
    expect(r.final.memory).toEqual({ beats: 3 });
  });
});

describe('a recording', () => {
  const beetled = [at(3, 0), at(3, 1), at(3, 2), at(3, 3), at(3, 4)].reduce((w, c, i) => applyStroke(w, 'beetle', c, i === 0), applyTool(blankWorld(), 'acorn', at(1, 2)));
  const program: NodeSpec[] = [{ remember: 'roll', kind: 'number', start: 0 }, { on: 'acorn', do: [{ set: 'roll', to: 'random:1-6' }] }, ...driver];
  const inputs: LiveInput[] = [key('right'), TICK, key('right'), TICK, TICK, key('right'), TICK, key('right'), key('right')];

  it('plays back to exactly the trace the live run made', () => {
    const lived = play(program, beetled, inputs, true, 42);
    const again = replay(program, beetled, lived.fed, true, 42);
    expect(again.trace).toEqual(lived.trace);
    expect(again.outcome).toEqual(lived.outcome);
    expect(again.final).toEqual(lived.final);
  });

  it('plays back the same every time, and differently with another seed', () => {
    const a = replay(program, beetled, inputs, true, 42);
    expect(replay(program, beetled, inputs, true, 42)).toEqual(a);
    const rolls = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => (replay(program, beetled, inputs, true, seed).final.memory as { roll: number }).roll));
    expect(rolls.size).toBeGreaterThan(1);
  });

  it('with nothing recorded, a run that is not live-driven stops after main', () => {
    const r = interpretAll({ program: ir(driver), world: blankWorld(), objective: goal, limits: { maxSteps: 200 }, live: { clock: false } });
    expect(r.outcome).toEqual({ status: 'incomplete' });
    expect(r.trace).toEqual([]);
  });
});

describe('a turn\'s limits', () => {
  it('stops one turn that runs away, without counting the turns before it', () => {
    // Each press is 21 events: well under the limit, however many presses there are.
    const spin: NodeSpec[] = [{ on: 'key:up', do: [{ repeat: 10, do: ['rotateCW', 'rotateCCW'] }] }];
    const many = play(spin, blankWorld(), Array.from({ length: 30 }, () => key('up')));
    expect(many.outcome).toEqual({ status: 'incomplete' });
    expect(many.executedSteps).toBeGreaterThan(200);
    const forever: NodeSpec[] = [{ on: 'key:up', do: [{ until: 'atFlag', do: ['rotateCW'] }] }];
    expect(play(forever, blankWorld(), [key('up')]).outcome).toMatchObject({ status: 'halted' });
  });
});

describe('a live run behind the contract', () => {
  /** An endpoint wired to a real live host, answering as a Worker does. */
  const endpoint = (answers = true) => {
    const made: (Endpoint & { terminated: boolean })[] = [];
    const create = () => {
      const host = createLiveHost();
      const listeners = new Set<(e: MessageEvent<RuntimeMessage>) => void>();
      const ep: Endpoint & { terminated: boolean } = {
        terminated: false,
        postMessage(m) {
          if (!answers) return;
          queueMicrotask(() => host(m as LiveRequest, (out) => listeners.forEach((l) => l({ data: out } as MessageEvent<RuntimeMessage>))));
        },
        addEventListener: (_t, l) => listeners.add(l),
        removeEventListener: (_t, l) => listeners.delete(l),
        terminate() {
          this.terminated = true;
        },
      };
      made.push(ep);
      return ep;
    };
    return { create, made };
  };
  const start = (create: () => Endpoint, world = blankWorld()) => {
    const events: TraceEvent[] = [];
    let waits = 0;
    const done = new Promise<LiveResult>((resolve) => {
      handle = createRuntimeClient(create).live({ program: ir(driver), world, objective: goal, limits: DEFAULT_LIMITS, clock: false }, { event: (e) => events.push(e), waiting: () => waits++, done: resolve });
    });
    return { events, done, waits: () => waits };
  };
  let handle!: { send(i: LiveInput): void; stop(): void };

  it('streams events, takes inputs in order however fast they come, and hands back the recording', async () => {
    const { create, made } = endpoint();
    const run = start(create);
    // All four at once, before the run has even started: they wait their turn.
    for (let i = 0; i < 4; i++) handle.send(key('right'));
    const result = await run.done;
    expect(result.outcome).toEqual({ status: 'success' });
    expect(result.inputs).toEqual([key('right'), key('right'), key('right'), key('right')]);
    expect(run.events.map((e) => e.op)).toEqual(['press', 'forward', 'press', 'forward', 'press', 'forward', 'press', 'forward']);
    expect(made[0]!.terminated).toBe(true);
    // The recording plays back to the same events.
    expect(interpretAll({ program: ir(driver), world: blankWorld(), objective: goal, limits: DEFAULT_LIMITS, live: { clock: false, inputs: result.inputs } }).trace).toEqual(run.events);
  });

  it('stops when asked, and drops inputs sent after', async () => {
    const { create } = endpoint();
    const run = start(create);
    handle.send(key('right'));
    await vi.waitFor(() => expect(run.events).toHaveLength(2));
    handle.stop();
    handle.send(key('right'));
    const result = await run.done;
    expect(result.outcome).toEqual({ status: 'incomplete' });
    expect(result.inputs).toEqual([key('right')]);
    handle.send(key('right'));
    expect(run.events).toHaveLength(2);
  });

  it('gives up on a run that never answers', async () => {
    vi.useFakeTimers();
    const { create, made } = endpoint(false);
    const run = start(create);
    await vi.advanceTimersByTimeAsync(DEFAULT_LIMITS.maxMillis + 10);
    expect((await run.done).outcome).toEqual({ status: 'halted', reason: 'time-limit' });
    expect(made[0]!.terminated).toBe(true);
    vi.useRealTimers();
  });

  it('answers an unknown contract version with an error, and ignores an input for no run', () => {
    const host = createLiveHost();
    const out: RuntimeMessage[] = [];
    host({ type: 'live-start', contract: 99 as never, requestId: 'r', program: ir(driver), world: blankWorld(), objective: goal, limits: DEFAULT_LIMITS, clock: false }, (m) => out.push(m));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'done', outcome: { status: 'error' } });
    host({ type: 'live-input', requestId: 'nobody', input: key('up') }, (m) => out.push(m));
    expect(out).toHaveLength(1);
  });
});

describe('a live puzzle in creation mode', async () => {
  const { blankCreation } = await import('../create/blank');
  const { critique, criticWords } = await import('../create/critic');
  const { applyKit, KITS } = await import('../create/kits');
  const { isLivePuzzle } = await import('../create/live');
  const { creationToJson, parseCreation } = await import('../create/parse');
  const { CreationStore } = await import('../create/store');
  const { memoryStore } = await import('../progress/storage');
  const { Sequencer } = await import('../render/sequencer');
  const keys = KITS.find((k) => k.id === 'keys')!;
  const base = blankCreation('Mine');
  const made = { ...base, ...applyKit(base, keys) };
  /** Up, up, up, up wins the empty island: the robot faces the flag. */
  const win: LiveInput[] = [key('up'), key('up'), key('up'), key('up')];
  const ask = (program: NodeSpec[], live: { clock: boolean; inputs?: LiveInput[]; seed?: number }) =>
    critique({ world: made.world, objective: made.objective, rules: { allowedCommands: made.programming.allowedCommands, random: false }, program: ir(program), live, searchMillis: 100 });

  it('is one with a clock or an arrow-key When card', () => {
    expect(isLivePuzzle(base)).toBe(false);
    expect(isLivePuzzle(made)).toBe(true);
    expect(isLivePuzzle({ ...base, clock: 2 })).toBe(true);
    expect(isLivePuzzle({ ...base, program: [{ on: 'tick', do: [] }] })).toBe(false);
  });

  it('is proved by playing back its maker\'s winning play', () => {
    expect(ask(made.program, { clock: false, inputs: win, seed: 1 })).toEqual({ own: { fits: true, solves: true, steps: 3 }, flat: { kind: 'unknown' } });
    // No play yet, or a play that no longer wins once the program changes: not solved.
    expect(ask(made.program, { clock: false }).own.solves).toBe(false);
    expect(ask([{ on: 'key:up', do: ['rotateCW'] }], { clock: false, inputs: win, seed: 1 }).own.solves).toBe(false);
  });

  it('has the critic speak of winning, not of the shortest way', () => {
    const won = criticWords(ask(made.program, { clock: false, inputs: win, seed: 1 }), made.programming, undefined, true).map((l) => `${l.tone}: ${l.text}`);
    expect(won[0]).toBe('good: You played it and won. Others can play it now.');
    expect(won).toHaveLength(2);
    expect(criticWords(ask(made.program, { clock: false }), made.programming, undefined, true)[0]!.text).toMatch(/^You have not won it yet/);
  });

  it('keeps its clock and its winning play through storage, and a new clock makes it a new puzzle', async () => {
    const whole = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...made, clock: 2, replay: { inputs: [...win, TICK], seed: 7 } };
    expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(whole))), 'live')).toEqual(whole);
    expect(() => parseCreation({ ...creationToJson(whole), clock: 3 }, 'bad')).toThrow(/clock/);
    expect(() => parseCreation({ ...creationToJson(whole), replay: { inputs: [{ kind: 'jump' }], seed: 1 } }, 'bad')).toThrow(/replay\.inputs\[0\]/);
    const store = new CreationStore(memoryStore());
    await store.load();
    const c = store.add(made);
    store.prove(c.id, made.program, 3);
    expect(store.update(c.id, { replay: { inputs: win, seed: 1 } })?.status).toBe('proved');
    expect(store.update(c.id, { clock: 4 })?.status).toBe('draft');
  });

  it('draws events as they come: the sequencer plays on into what is added', async () => {
    const played: string[] = [];
    const seq = new Sequencer({ playEvent: async (e) => void played.push(e.op), showState: () => {} });
    const lived = play(made.program, made.world, win);
    seq.load([], lived.trace[0]!.before);
    await seq.play();
    expect(seq.state).toBe('finished');
    seq.extend(lived.trace.slice(0, 2));
    expect(seq.state).toBe('paused');
    await seq.play();
    seq.extend([]);
    expect(seq.state).toBe('finished');
    seq.extend(lived.trace.slice(2));
    await seq.play();
    expect(played).toEqual(lived.trace.map((e) => e.op));
    expect(seq.position).toBe(lived.trace.length);
  });
});
