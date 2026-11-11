import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import { printProgram } from '../projection/printTs';
import { checksOf, missingOutcomes } from '../lessons/checks';
import type { ObjectiveDefinition, WorldDefinition } from '../sim/types';
import { CHECK_SEEDS } from '../sim/random';
import { interpretAll } from './interpreter';

const floor = (w: number, h: number, walls: [number, number][] = []): WorldDefinition => ({
  width: w,
  height: h,
  tiles: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (walls.some(([a, b]) => a === x && b === y) ? 'wall' : 'floor'))),
  robot: { x: 0, y: 0, facing: 'E' },
  goal: { x: w - 1, y: h - 1 },
  collectibles: [],
});
const run = (spec: NodeSpec[], world: WorldDefinition, objective: ObjectiveDefinition = { reachGoal: true, collectAll: false }, seed?: number) =>
  interpretAll({ program: programFromSpec(spec, sequentialIdFactory()), world, objective, limits: { maxSteps: 1000 }, ...(seed !== undefined && { seed }) });

describe('go to row and column', () => {
  it('turns and walks straight to a row or column, counted from 0', () => {
    const r = run([{ goColumn: 3 }, { goRow: 2 }], floor(4, 3));
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.robot).toEqual({ x: 3, y: 2, facing: 'S' });
    expect(r.trace.map((e) => e.op)).toEqual(['forward', 'forward', 'forward', 'face', 'forward', 'forward']);
  });

  it('reads the number from a slot', () => {
    const r = run([{ remember: 'col', kind: 'number', start: 2 }, { goColumn: 'col' }], floor(4, 1));
    expect(r.final.robot.x).toBe(2);
  });

  it('is stopped by a rock on the way', () => {
    const r = run([{ goColumn: 3 }], floor(4, 1, [[2, 0]]));
    expect(r.outcome.status).toBe('blocked');
    expect(r.final.robot.x).toBe(1);
  });

  it('refuses a row that is not on the board', () => {
    expect(run([{ goRow: 3 }], floor(4, 3)).outcome).toMatchObject({ status: 'error', message: 'There is no row 3' });
  });

  it('prints as robot calls', () => {
    const code = printProgram(programFromSpec([{ goColumn: 2 }, { goRow: 'row' }], sequentialIdFactory()));
    expect(code).toContain('robot.goToColumn(2);');
    expect(code).toContain('robot.goToRow(row);');
  });
});

describe('list items by index', () => {
  const spec = (index: number): NodeSpec[] => [
    { remember: 'route', kind: 'list', of: 'direction', start: ['E', 'S', 'W'] },
    { remember: 'way', kind: 'direction', start: 'N' },
    { set: 'way', to: `item:route@${index}` },
  ];
  it('counts from 0: item 0 is the first', () => {
    expect(run(spec(0), floor(2, 1), { reachGoal: false, collectAll: false, memory: { way: 'E' } }).outcome).toEqual({ status: 'success' });
    expect(printProgram(programFromSpec(spec(2), sequentialIdFactory()))).toContain('way = route[2];');
  });
  it('stops on an item past the end, naming the indexes there are', () => {
    expect(run(spec(3), floor(2, 1)).outcome).toMatchObject({ status: 'error', message: 'route has no item 3: its items are 0 to 2' });
  });
});

describe('a finger on the map', () => {
  it('moves a remembered place without moving the robot, and reads the board map there', () => {
    const spec: NodeSpec[] = [
      { remember: 'walls', kind: 'grid', of: 'yesNo', start: 'board:walls' },
      { remember: 'spot', kind: 'position', start: { x: 0, y: 0 } },
      { remember: 'rock', kind: 'yesNo', start: false },
      { shift: 'spot', dir: 'E' },
      { shift: 'spot', dir: 'E' },
      { set: 'rock', to: 'read:walls@spot' },
    ];
    const r = run(spec, floor(4, 2, [[2, 0]]), { reachGoal: false, collectAll: false, memory: { rock: true } });
    expect(r.outcome).toEqual({ status: 'success' });
    expect(r.final.memory?.spot).toEqual({ x: 2, y: 0 });
    expect(r.final.robot).toEqual({ x: 0, y: 0, facing: 'E' });
  });
});

describe('random sources', () => {
  const die: NodeSpec[] = [{ remember: 'roll', kind: 'number', start: 0 }, { set: 'roll', to: 'random:1-6' }];
  const objective: ObjectiveDefinition = { reachGoal: false, collectAll: false, covers: { of: 'roll', values: [1, 2, 3, 4, 5, 6] } };

  it('rolls the same with the same seed, and differently across seeds', () => {
    const rolls = CHECK_SEEDS.map((seed) => run(die, floor(2, 1), objective, seed).final.memory?.roll);
    expect(run(die, floor(2, 1), objective, 7).final.memory?.roll).toBe(rolls[6]);
    expect(new Set(rolls)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('fails a run that ends outside the outcomes, and finds outcomes no run gave', () => {
    const always6: NodeSpec[] = [{ remember: 'roll', kind: 'number', start: 0 }, { set: 'roll', to: 6 }];
    const finals = CHECK_SEEDS.map((seed) => run(always6, floor(2, 1), objective, seed).final);
    expect(missingOutcomes(objective, finals)).toEqual([1, 2, 3, 4, 5]);
    const tooBig: NodeSpec[] = [{ remember: 'roll', kind: 'number', start: 0 }, { set: 'roll', to: 'random:1-8' }];
    expect(CHECK_SEEDS.some((seed) => run(tooBig, floor(2, 1), objective, seed).outcome.status !== 'success')).toBe(true);
  });

  it('picks from a list, flips coins and picks ways', () => {
    const spec: NodeSpec[] = [
      { remember: 'prizes', kind: 'list', of: 'number', start: [2, 5] },
      { remember: 'prize', kind: 'number', start: 0 },
      { remember: 'heads', kind: 'yesNo', start: false },
      { remember: 'way', kind: 'direction', start: 'N' },
      { set: 'prize', to: 'pick:prizes' },
      { set: 'heads', to: 'coin' },
      { set: 'way', to: 'randomWay' },
    ];
    const finals = CHECK_SEEDS.map((seed) => run(spec, floor(2, 1), { reachGoal: false, collectAll: false, covers: { of: 'prize', values: [2, 5] } }, seed).final.memory!);
    expect(new Set(finals.map((m) => m.prize))).toEqual(new Set([2, 5]));
    expect(new Set(finals.map((m) => m.heads))).toEqual(new Set([true, false]));
    expect(new Set(finals.map((m) => m.way))).toEqual(new Set(['N', 'E', 'S', 'W']));
  });

  it('checks every seed on a random level, once per board otherwise', () => {
    const base = { world: floor(2, 1), objective, programming: { allowedCommands: [], starterProgram: [], allowedSources: ['random:1-6'] } };
    expect(checksOf(base)).toHaveLength(CHECK_SEEDS.length);
    expect(checksOf({ ...base, objective: { reachGoal: true, collectAll: false }, programming: { allowedCommands: [], starterProgram: [] } })).toEqual([{ world: 0 }]);
  });
});
