import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromCommands, programFromSpec } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import type { CommandId } from '../ir/types';
import type { ObjectiveDefinition, WorldDefinition } from '../sim/types';
import { createRuntimeClient, type Endpoint } from './client';
import { CONTRACT_VERSION, DEFAULT_LIMITS, type RunRequest, type RuntimeMessage } from './contract';
import { handleRequest } from './host';
import { interpretAll } from './interpreter';

const world: WorldDefinition = {
  width: 4,
  height: 3,
  tiles: [
    ['floor', 'floor', 'wall', 'floor'],
    ['floor', 'floor', 'floor', 'floor'],
    ['floor', 'floor', 'floor', 'floor'],
  ],
  robot: { x: 0, y: 1, facing: 'E' },
  goal: { x: 3, y: 1 },
  collectibles: [],
};
const objective: ObjectiveDefinition = { reachGoal: true, collectAll: false };
const program = (cmds: CommandId[]) => programFromCommands(cmds, sequentialIdFactory());
const run = (cmds: CommandId[], maxSteps = 1000) =>
  interpretAll({ program: program(cmds), world, objective, limits: { maxSteps } });

describe('interpreter', () => {
  it('reaches the goal and records one event per node', () => {
    const r = run(['forward', 'forward', 'forward']);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => e.nodeId)).toEqual(['n1', 'n2', 'n3']);
    expect(r.trace.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(r.trace[2]!.after.robot).toEqual({ x: 3, y: 1, facing: 'E' });
  });

  it('reports incomplete when the program ends early', () => {
    expect(run(['forward']).outcome).toEqual({ status: 'incomplete' });
    expect(run([]).outcome).toEqual({ status: 'incomplete' });
  });

  it('stops at the first blocked move and names the node', () => {
    const r = run(['forward', 'forward', 'rotateCCW', 'forward', 'forward']);
    expect(r.outcome).toEqual({ status: 'blocked', nodeId: 'n4', reason: 'wall' });
    expect(r.trace).toHaveLength(4);
    expect(r.trace[3]!.result).toEqual({ kind: 'blocked', reason: 'wall', at: { x: 2, y: 0 } });
    expect(r.final.robot).toEqual({ x: 2, y: 1, facing: 'N' });
  });

  it('halts at the step limit', () => {
    const r = run(['forward', 'forward', 'forward'], 2);
    expect(r.outcome).toEqual({ status: 'halted', reason: 'step-limit' });
    expect(r.trace).toHaveLength(2);
  });

  it('runs a Repeat with one loop event per go round, and blocks inside it', () => {
    const p = programFromSpec([{ repeat: 3, do: ['forward'] }], sequentialIdFactory());
    const r = interpretAll({ program: p, world, objective, limits: { maxSteps: 100 } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => `${e.op}:${e.nodeId}`)).toEqual(['loop:n1', 'forward:n2', 'loop:n1', 'forward:n2', 'loop:n1', 'forward:n2']);
    expect(r.trace.filter((e) => e.op === 'loop').map((e) => (e.op === 'loop' ? [e.iteration, e.count] : null))).toEqual([[1, 3], [2, 3], [3, 3]]);
    const bump = interpretAll({ program: programFromSpec([{ repeat: 5, do: ['forward'] }], sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(bump.outcome).toEqual({ status: 'blocked', nodeId: 'n2', reason: 'edge' });
    expect(bump.trace).toHaveLength(8);
  });

  it('checks a condition for If and If/else and records the answer', () => {
    // Facing east at (0,1): the path ahead is clear, so the If runs and the else does not.
    const spec: NodeSpec[] = [{ if: 'blockedAhead', do: ['rotateCW'] }, { if: 'pathAhead', do: ['forward'], else: ['rotateCCW'] }, 'forward', 'forward'];
    const r = interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => (e.op === 'check' ? `${e.condition}=${e.value}` : e.op))).toEqual(['blockedAhead=false', 'pathAhead=true', 'forward', 'forward', 'forward']);
    expect(r.trace[0]!.after).toEqual(r.trace[0]!.before);
  });

  it('senses acorns ahead and the flag underfoot', () => {
    const w = { ...world, collectibles: [{ x: 1, y: 1 }] };
    const spec: NodeSpec[] = [{ if: 'acornAhead', do: ['forward'] }, { if: 'acornAhead', do: ['rotateCW'] }, 'forward', 'forward', { if: 'atFlag', do: ['rotateCW'] }];
    const r = interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: w, objective: { reachGoal: true, collectAll: true }, limits: { maxSteps: 100 } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => (e.op === 'check' ? `${e.condition}=${e.value}` : e.op))).toEqual(['acornAhead=true', 'forward', 'acornAhead=false', 'forward', 'forward', 'atFlag=true', 'rotateCW']);
  });

  it('repeats until the condition holds, and halts a loop that gets nowhere', () => {
    const walk = interpretAll({ program: programFromSpec([{ until: 'blockedAhead', do: ['forward'] }], sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(walk.outcome).toEqual({ status: 'success' });
    expect(walk.trace.map((e) => e.op)).toEqual(['check', 'forward', 'check', 'forward', 'check', 'forward', 'check']);
    const spin = interpretAll({ program: programFromSpec([{ until: 'atFlag', do: ['rotateCW'] }], sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(spin.outcome).toEqual({ status: 'halted', reason: 'forever' });
    expect(spin.trace.filter((e) => e.op === 'rotateCW')).toHaveLength(4);
    const empty = interpretAll({ program: programFromSpec([{ until: 'atFlag', do: [] }], sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(empty.outcome).toEqual({ status: 'halted', reason: 'forever' });
    expect(empty.trace).toHaveLength(2);
  });

  it('counts every event against the step limit', () => {
    const r = interpretAll({ program: programFromSpec([{ repeat: 10, do: [{ repeat: 10, do: ['rotateCW'] }] }], sequentialIdFactory()), world, objective, limits: { maxSteps: 50 } });
    expect(r.outcome).toEqual({ status: 'halted', reason: 'step-limit' });
    expect(r.trace).toHaveLength(50);
  });

  it('is deterministic', () => {
    const cmds: CommandId[] = ['forward', 'rotateCW', 'forward', 'rotateCCW', 'forward', 'forward'];
    expect(JSON.stringify(run(cmds))).toBe(JSON.stringify(run(cmds)));
  });

  it('runs a function at each call, tagging its events with the call', () => {
    // Row 1 is open: Hop is two Forwards, called once, then one Forward more.
    const spec: NodeSpec[] = [{ call: 'hop' }, 'forward', { define: 'hop', do: ['forward', 'forward'] }];
    const r = interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective, limits: { maxSteps: 100 } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => [e.op, e.nodeId, e.via ?? null])).toEqual([
      ['call', 'n1', null],
      ['forward', 'n3', ['n1']],
      ['forward', 'n4', ['n1']],
      ['forward', 'n2', null],
    ]);
    expect(r.trace[0]).toMatchObject({ op: 'call', name: 'hop' });
    expect(r.trace[0]!.after).toEqual(r.trace[0]!.before);
  });

  it('stops with an error when a call names no function', () => {
    const p = programFromSpec([{ call: 'hop' }], sequentialIdFactory());
    expect(interpretAll({ program: p, world, objective, limits: { maxSteps: 100 } }).outcome).toMatchObject({ status: 'error', message: 'No function named hop' });
  });

  it('halts a function that reaches itself instead of running out of stack', () => {
    // Content and edits never build this, so the interpreter guards it on its own.
    const p = programFromSpec([{ call: 'hop' }, { define: 'hop', do: [] }], sequentialIdFactory());
    p.procedures[1]!.body = [{ id: 'r1', kind: 'call', name: 'hop' }];
    expect(interpretAll({ program: p, world, objective, limits: { maxSteps: 100 } }).outcome).toEqual({ status: 'halted', reason: 'forever' });
  });
});

/** An in-memory endpoint wired to the real host over a MessageChannel. */
function channelEndpoint(): Endpoint & { terminated: boolean } {
  const channel = new MessageChannel();
  channel.port2.onmessage = (e: MessageEvent<RunRequest>) => handleRequest(e.data, (m) => channel.port2.postMessage(m));
  const listeners = new Set<(e: MessageEvent<RuntimeMessage>) => void>();
  channel.port1.onmessage = (e) => listeners.forEach((l) => l(e as MessageEvent<RuntimeMessage>));
  return {
    terminated: false,
    postMessage: (m) => channel.port1.postMessage(m),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate() {
      this.terminated = true;
      channel.port1.close();
      channel.port2.close();
    },
  };
}

describe('runtime contract over postMessage', () => {
  it('streams the same trace the interpreter produces', async () => {
    const client = createRuntimeClient(channelEndpoint);
    const p = program(['forward', 'forward', 'forward']);
    const result = await client.run({ program: p, world, objective, limits: DEFAULT_LIMITS });
    const direct = interpretAll({ program: p, world, objective, limits: DEFAULT_LIMITS });
    expect(result.outcome).toEqual({ status: 'success' });
    expect(result.trace).toEqual(direct.trace);
    expect(result.final).toEqual(direct.final);
    client.dispose();
  });

  it('halts with time-limit and terminates an endpoint that never answers', async () => {
    let created: (Endpoint & { terminated: boolean }) | null = null;
    const silent = () => {
      created = { terminated: false, postMessage() {}, addEventListener() {}, removeEventListener() {}, terminate() { this.terminated = true; } };
      return created;
    };
    const client = createRuntimeClient(silent);
    const result = await client.run({ program: program(['forward']), world, objective, limits: { maxSteps: 10, maxMillis: 20 } });
    expect(result.outcome).toEqual({ status: 'halted', reason: 'time-limit' });
    expect(created!.terminated).toBe(true);
  });

  it('rejects an unknown contract version with an error outcome', () => {
    const messages: RuntimeMessage[] = [];
    handleRequest(
      { type: 'run', contract: 99 as unknown as typeof CONTRACT_VERSION, requestId: 'r', program: program([]), world, objective, limits: DEFAULT_LIMITS },
      (m) => messages.push(m),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ type: 'done', outcome: { status: 'error' } });
  });
});

describe('interpreter: switches and gates', () => {
  // . S     the robot at (0,0) facing E, the switch at (1,0) flips gate a at (1,1) below it
  // # G     the flag is on the gate's tile
  const gated: WorldDefinition = {
    width: 2,
    height: 2,
    tiles: [
      ['floor', 'floor'],
      ['wall', 'floor'],
    ],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 1, y: 1 },
    collectibles: [],
    gates: [{ id: 'a', x: 1, y: 1, open: false }],
    switches: [{ x: 1, y: 0, toggles: ['a'] }],
  };
  const go = (spec: NodeSpec[], w: WorldDefinition = gated) => interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: w, objective, limits: { maxSteps: 100 } });

  it('records the gates a switch flips and lets the robot through', () => {
    const r = go(['forward', 'rotateCW', 'forward']);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace[0]!.result).toEqual({ kind: 'ok', toggled: ['a'] });
    expect(r.final.open).toEqual(['a']);
  });

  it('stops at a shut gate', () => {
    expect(go(['rotateCW', 'forward'], { ...gated, robot: { x: 1, y: 0, facing: 'E' } }).outcome).toEqual({ status: 'blocked', nodeId: 'n2', reason: 'gate' });
  });

  it('counts a flipped gate as a new state, so pacing on a switch is not called a forever loop', () => {
    // R S G: stepping on the switch shuts the open gate; off and back on opens it again.
    // Both checks happen on the switch facing the gate, so only the gate tells them apart.
    const row: WorldDefinition = {
      width: 3,
      height: 1,
      tiles: [['floor', 'floor', 'floor']],
      robot: { x: 0, y: 0, facing: 'E' },
      goal: { x: 2, y: 0 },
      collectibles: [],
      gates: [{ id: 'a', x: 2, y: 0, open: true }],
      switches: [{ x: 1, y: 0, toggles: ['a'] }],
    };
    const pace: NodeSpec[] = ['forward', { until: 'pathAhead', do: ['rotateCW', 'rotateCW', 'forward', 'rotateCW', 'rotateCW', 'forward'] }, 'forward'];
    expect(go(pace, row).outcome).toEqual({ status: 'success' });
  });
});

describe('interpreter: When cards, keys and ticks', () => {
  // A row of five: plate 1 at (1,0), gate a at (3,0), the flag at (4,0).
  const row: WorldDefinition = {
    width: 5,
    height: 1,
    tiles: [['floor', 'floor', 'floor', 'floor', 'floor']],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 4, y: 0 },
    collectibles: [],
    gates: [{ id: 'a', x: 3, y: 0, open: false }],
    plates: [{ id: '1', x: 1, y: 0 }],
  };
  const go = (spec: NodeSpec[], w: WorldDefinition = row, input?: ('up' | 'down' | 'left' | 'right')[]) =>
    interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: w, objective, limits: { maxSteps: 200 }, ...(input && { input }) });

  it('runs a When card right after the step that sets it off', () => {
    const r = go(['forward', 'forward', 'forward', 'forward', { on: 'stepOn:1', do: [{ open: 'a' }] }]);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.map((e) => [e.op, e.nodeId, e.via ?? null]).slice(0, 4)).toEqual([
      ['forward', 'n1', null],
      ['when', 'on:stepOn:1', null],
      ['openGate', 'n5', ['on:stepOn:1']],
      ['forward', 'n2', null],
    ]);
    expect(go(['forward', 'forward', 'forward', 'forward', { on: 'stepOn:1', do: [] }]).outcome).toMatchObject({ status: 'blocked', reason: 'gate' });
  });

  it('plays the key script after main, one When card per press', () => {
    const open: WorldDefinition = { ...row, gates: [], plates: [] };
    const r = go([{ on: 'key:right', do: ['forward', 'forward'] }], open, ['right', 'up', 'right']);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.trace.filter((e) => e.op === 'press').map((e) => [e.nodeId, e.op === 'press' && e.press])).toEqual([
      ['on:key:right', 0],
      ['input', 1],
      ['on:key:right', 2],
    ]);
  });

  it('ticks after every robot action on a timed board, then runs the Every tick card without ticking again', () => {
    const open: WorldDefinition = { ...row, plates: [] };
    const r = go(['forward', 'wait', 'forward', 'forward', 'forward', { on: 'tick', do: [{ open: 'a' }, 'rotateCW', 'rotateCCW'] }], open);
    expect(r.outcome).toEqual({ status: 'success' });
    const ops = r.trace.map((e) => e.op);
    expect(ops.slice(0, 6)).toEqual(['forward', 'tick', 'when', 'openGate', 'rotateCW', 'rotateCCW']);
    expect(ops.filter((o) => o === 'tick')).toHaveLength(5);
    expect(r.final.tick).toBe(5);
  });

  it('stops a run when the world moves a beetle onto the robot', () => {
    const bug: WorldDefinition = { ...row, gates: [], plates: [], movers: [{ id: 'b', kind: 'beetle', path: [{ x: 2, y: 0 }, { x: 1, y: 0 }] }] };
    expect(go(['wait'], { ...bug, robot: { x: 1, y: 0, facing: 'E' } }).outcome).toEqual({ status: 'blocked', nodeId: 'n1', reason: 'beetle' });
  });
});

describe('interpreter: memory', () => {
  // . . . G .   the robot at (0,0) facing E; gate a at (3,0) opens for the number 2; the flag at (4,0)
  const row: WorldDefinition = {
    width: 5,
    height: 1,
    tiles: [['floor', 'floor', 'floor', 'floor', 'floor']],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 4, y: 0 },
    collectibles: [{ x: 1, y: 0 }],
    gates: [{ id: 'a', x: 3, y: 0, open: false, code: 2 }],
  };
  const go = (spec: NodeSpec[]) => interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: row, objective, limits: { maxSteps: 200 } });

  it('counts, reads the world into slots, and unlocks a gate with the right number', () => {
    const r = go([{ remember: 'steps', kind: 'number' }, { remember: 'saw', kind: 'yesNo' }, { set: 'saw', to: 'acornAhead' }, 'forward', { change: 'steps', by: 1 }, 'forward', { change: 'steps', by: 1 }, { unlock: 'a', with: 'steps' }, 'forward', 'forward']);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory).toEqual({ steps: 2, saw: true });
    expect(r.trace.find((e) => e.op === 'unlock')).toMatchObject({ opened: true });
    expect(r.trace.filter((e) => e.op === 'set').map((e) => e.op === 'set' && e.value)).toEqual([true, 1, 2]);
  });

  it('leaves a gate shut when the number is wrong', () => {
    const r = go([{ remember: 'steps', kind: 'number' }, 'forward', 'forward', { unlock: 'a', with: 'steps' }, 'forward', 'forward']);
    expect(r.trace.find((e) => e.op === 'unlock')).toMatchObject({ opened: false });
    expect(r.outcome).toMatchObject({ status: 'blocked', reason: 'gate' });
  });

  it('walks a list item by item, and faces a remembered way', () => {
    const r = go([
      { remember: 'route', kind: 'list', of: 'direction', start: ['E', 'S', 'E'] },
      { remember: 'way', kind: 'direction' },
      { remember: 'count', kind: 'number' },
      { forEach: 'route', as: 'way', do: [{ if: 'slot:way=E', do: [{ change: 'count', by: 1 }] }] },
      { face: 'way' },
    ]);
    expect(r.final.memory).toMatchObject({ way: 'E', count: 2 });
    expect(r.trace.filter((e) => e.op === 'loop').map((e) => e.after.memory?.way)).toEqual(['E', 'S', 'E']);
    expect(r.trace.at(-1)).toMatchObject({ op: 'face', slot: 'way' });
  });

  it('stops with an error when a For each walks something that is not a list', () => {
    expect(go([{ remember: 'n', kind: 'number' }, { forEach: 'n', as: 'n', do: [] }]).outcome).toMatchObject({ status: 'error', message: 'n is not a list' });
  });
});

describe('interpreter: grids', () => {
  // # . .      the robot at (1,1) facing N, with a rock above it and one to its left
  // # . .      the flag at (2,1)
  const board: WorldDefinition = {
    width: 3,
    height: 2,
    tiles: [
      ['wall', 'wall', 'floor'],
      ['wall', 'floor', 'floor'],
    ],
    robot: { x: 1, y: 1, facing: 'N' },
    goal: { x: 2, y: 1 },
    collectibles: [],
  };
  const walls = [
    [true, true, false],
    [true, false, false],
  ];
  const go = (spec: NodeSpec[], objective: ObjectiveDefinition = { reachGoal: true, collectAll: false }) =>
    interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: board, objective, limits: { maxSteps: 200 } });

  it('reads a grid here, ahead and at a remembered place, and marks it', () => {
    const r = go([
      { remember: 'walls', kind: 'grid', of: 'yesNo', start: walls },
      { remember: 'counts', kind: 'grid', of: 'number', start: [[0, 0, 0], [0, 0, 0]] },
      { remember: 'a', kind: 'yesNo' },
      { remember: 'b', kind: 'yesNo' },
      { remember: 'n', kind: 'number' },
      { remember: 'spot', kind: 'position' },
      { set: 'a', to: 'read:walls@ahead' },
      { set: 'b', to: 'read:walls@here' },
      { set: 'spot', to: 'here' },
      { change: 'n', by: 2 },
      { mark: 'counts', at: 'spot', with: 'n' },
      'rotateCW',
      'forward',
    ]);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory).toMatchObject({ a: true, b: false, counts: [[0, 0, 0], [0, 2, 0]] });
  });

  it('meets a memory objective only when the slot holds the answer', () => {
    const spec = (by: number): NodeSpec[] => [{ remember: 'n', kind: 'number' }, { change: 'n', by }, 'rotateCW', 'forward'];
    const objective: ObjectiveDefinition = { reachGoal: true, collectAll: false, memory: { n: 2 } };
    expect(go(spec(2), objective).outcome).toEqual({ status: 'success' });
    expect(go(spec(1), objective).outcome).toEqual({ status: 'incomplete' });
  });
});

describe('interpreter: building lists', () => {
  const row: WorldDefinition = {
    width: 3,
    height: 1,
    tiles: [['floor', 'floor', 'floor']],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 2, y: 0 },
    collectibles: [{ x: 1, y: 0 }],
  };

  it('adds to the end of a list, and reads how many it holds', () => {
    const spec: NodeSpec[] = [
      { remember: 'seen', kind: 'list', of: 'yesNo' },
      { remember: 'n', kind: 'number' },
      { push: 'seen', to: 'acornAhead' },
      'forward',
      { push: 'seen', to: 'acornAhead' },
      'forward',
      { set: 'n', to: 'length:seen' },
    ];
    const r = interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world: row, objective, limits: { maxSteps: 100 } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory).toEqual({ seen: [true, false], n: 2 });
    expect(r.trace.filter((e) => e.op === 'set').map((e) => e.op === 'set' && e.value)).toEqual([[true], [true, false], 2]);
  });
});

describe('days', () => {
  const spec: NodeSpec[] = [
    { remember: 'total', kind: 'number', start: 0, keep: true },
    { remember: 'today', kind: 'number', start: 0 },
    { change: 'total', by: 1 },
    { change: 'today', by: 1 },
    'forward',
  ];
  const days = (n: number) => interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective: { reachGoal: false, collectAll: false, memory: { total: n } }, limits: { maxSteps: 1000 }, days: n });

  it('runs the program once a day, keeping only the backpack overnight', () => {
    const r = days(3);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory).toEqual({ total: 3, today: 1 });
    expect(r.final.day).toBe(3);
    const nights = r.trace.filter((e) => e.op === 'night');
    expect(nights.map((e) => (e.op === 'night' ? e.day : 0))).toEqual([2, 3]);
    // Each morning the robot is back at the start, and today starts again.
    expect(nights[0]!.before.robot).toEqual({ x: 1, y: 1, facing: 'E' });
    expect(nights[0]!.after.robot).toEqual(world.robot);
    expect(nights[0]!.after.memory).toEqual({ total: 1, today: 0 });
  });

  it('stops on the day something goes wrong', () => {
    const r = interpretAll({ program: programFromSpec([...F(2)], sequentialIdFactory()), world, objective, limits: { maxSteps: 1000 }, days: 2 });
    expect(r.outcome).toEqual({ status: 'incomplete' });
    const bump = interpretAll({ program: programFromSpec(['forward', 'forward', 'forward', 'forward'], sequentialIdFactory()), world, objective, limits: { maxSteps: 1000 }, days: 2 });
    expect(bump.outcome.status).toBe('blocked');
    expect(bump.trace.some((e) => e.op === 'night')).toBe(false);
  });
});

function F(n: number): NodeSpec[] {
  return Array.from({ length: n }, () => 'forward' as const);
}

describe('records', () => {
  const fields = { number: 'number', key: 'yesNo' } as const;
  const crates = [
    { number: 1, key: false },
    { number: 2, key: true },
  ];
  const spec = (cond: string): NodeSpec[] => [
    { remember: 'crates', kind: 'list', of: 'record', shape: 'Crate', fields, start: crates },
    { remember: 'crate', kind: 'record', shape: 'Crate', fields },
    { remember: 'code', kind: 'number' },
    { forEach: 'crates', as: 'crate', do: [{ if: cond as `slot:${string}`, do: [{ set: 'code', to: 'field:crate.number' }] }] },
  ];
  const go = (s: NodeSpec[]) => interpretAll({ program: programFromSpec(s, sequentialIdFactory()), world, objective: { reachGoal: false, collectAll: false, memory: { code: 2 } }, limits: { maxSteps: 1000 } });

  it('walks a list of records, testing and reading fields by name', () => {
    const r = go(spec('slot:crate.key=yes'));
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory?.crate).toEqual({ number: 2, key: true });
  });

  it('stops with a message when a record has no such field', () => {
    const r = go([{ remember: 'crate', kind: 'record', shape: 'Crate', fields, start: { number: 1 } as never }, { remember: 'code', kind: 'number' }, { set: 'code', to: 'field:crate.key' }]);
    expect(r.outcome).toMatchObject({ status: 'error', message: 'crate has no key: every record of a shape needs all its fields' });
  });
});
