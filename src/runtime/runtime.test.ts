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
