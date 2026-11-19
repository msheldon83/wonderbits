import { describe, expect, it } from 'vitest';
import { sourceWords } from '../editor/commands';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec, slotsInUse } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import { lineOf, parseLine } from '../ir/types';
import { parseBoardRules } from '../lessons/parse';
import { printProgram } from '../projection/printTs';
import type { LiveInput } from '../runtime/contract';
import { interpretAll } from '../runtime/interpreter';
import { lineWinner, objectiveMet } from '../sim/world';
import { blankCreation, blankWorld } from './blank';
import { creationToJson } from './parse';

const ir = (spec: NodeSpec[]) => programFromSpec(spec, sequentialIdFactory());
const byProgram = { reachGoal: false, collectAll: false, byProgram: true };
const tap = (x: number, y: number): LiveInput => ({ kind: 'tap', x, y });
const live = (spec: NodeSpec[], inputs: LiveInput[], world = blankWorld(3, 3)) => interpretAll({ program: ir(spec), world, objective: byProgram, limits: { maxSteps: 400 }, live: { clock: false, inputs } });

describe('win and game over', () => {
  it('end a run where they stand', () => {
    const won = interpretAll({ program: ir(['forward', 'win', 'forward']), world: blankWorld(), objective: byProgram, limits: { maxSteps: 100 } });
    expect(won.outcome).toEqual({ status: 'success' });
    expect(won.final.robot.x).toBe(1);
    const lost = interpretAll({ program: ir(['lose', 'forward']), world: blankWorld(), objective: byProgram, limits: { maxSteps: 100 } });
    expect(lost.outcome).toMatchObject({ status: 'lost' });
    expect(lost.trace).toEqual([]);
  });

  it('are the only way a game its program decides is won', () => {
    const world = blankWorld();
    const atFlag = { robot: { ...world.goal, facing: 'E' as const }, collected: [], open: [], tick: 0 };
    expect(objectiveMet(world, { reachGoal: true, collectAll: false }, atFlag)).toBe(true);
    expect(objectiveMet(world, byProgram, atFlag)).toBe(false);
    expect(interpretAll({ program: ir(['forward']), world, objective: byProgram, limits: { maxSteps: 100 } }).outcome).toEqual({ status: 'incomplete' });
  });

  it('end a live game from a When card, and print as code', () => {
    const r = live([{ on: 'tap', do: ['win'] }], [tap(0, 0), tap(1, 1)]);
    expect(r.outcome).toEqual({ status: 'success' });
    expect(printProgram(ir(['win', 'lose']))).toMatch(/robot\.win\(\);[\s\S]*robot\.gameOver\(\);/);
  });
});

describe('a line on a grid', () => {
  const grid = (rows: number[][]) => rows;
  it('finds the piece with so many in a row, any way', () => {
    expect(lineWinner(grid([[1, 1, 1], [0, 2, 0], [2, 0, 0]]), 3)).toBe(1);
    expect(lineWinner(grid([[1, 2, 0], [0, 2, 1], [0, 2, 0]]), 3)).toBe(2);
    expect(lineWinner(grid([[1, 2, 0], [2, 1, 0], [0, 0, 1]]), 3)).toBe(1);
    expect(lineWinner(grid([[0, 0, 2], [0, 2, 0], [2, 0, 1]]), 3)).toBe(2);
    expect(lineWinner(grid([[1, 2, 1], [2, 1, 2], [2, 1, 2]]), 3)).toBe(0);
    expect(lineWinner(grid([[0, 0, 0], [0, 0, 0], [0, 0, 0]]), 3)).toBe(0);
    expect(lineWinner(grid([[1, 1, 1, 0], [0, 0, 0, 0]]), 4)).toBe(0);
    expect(lineWinner(grid([[1, 1, 1, 1], [0, 0, 0, 0]]), 4)).toBe(1);
    expect(lineWinner(undefined, 3)).toBe(0);
  });

  it('is a reading a Set card can take', () => {
    expect(parseLine(lineOf('board', 3))).toEqual({ grid: 'board', count: 3 });
    expect(parseLine('line:board@9')).toBeNull();
    expect(sourceWords('line:board@3')).toBe('the piece with 3 in a row on board');
    const spec: NodeSpec[] = [{ remember: 'board', kind: 'grid', of: 'number', start: [[1, 1, 1], [0, 0, 0], [0, 0, 0]], show: 'pieces' }, { remember: 'winner', kind: 'number', start: 0 }, { set: 'winner', to: 'line:board@3' }, { if: 'slot:winner=1', do: ['win'] }];
    expect(interpretAll({ program: ir(spec), world: blankWorld(3, 3), objective: byProgram, limits: { maxSteps: 100 } }).outcome).toEqual({ status: 'success' });
    expect(slotsInUse(ir(spec)).has('board')).toBe(true);
    expect(printProgram(ir(spec))).toContain('winner = lineOf(board, 3);');
    const made = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...blankCreation('Mine'), objective: byProgram, program: spec };
    const read = parseBoardRules(JSON.parse(JSON.stringify(creationToJson(made))), 'line', ['program']);
    expect(read.programs.program).toEqual(spec);
    expect(read.objective).toEqual(byProgram);
    expect(() => parseBoardRules({ ...creationToJson(made), program: [{ remember: 'n', kind: 'number', start: 0, show: 'pieces' }] }, 'bad', ['program'])).toThrow(/only a grid/);
  });
});
