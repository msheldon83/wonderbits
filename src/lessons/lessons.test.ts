import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromCommands } from '../ir/program';
import { hintEffect } from './hints';
import { ContentError, parsePuzzle } from './parse';
import { predictionCorrect } from './prediction';
import type { PuzzleDefinition } from './types';
import { validatePuzzle } from './validate';

// Loosely typed on purpose: the tests bend the JSON to see the parser complain.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = (): Json => ({
  schemaVersion: 1,
  id: 'x',
  title: 'X',
  themeId: 'forest',
  world: { rows: ['....'], robot: { x: 0, y: 0, facing: 'E' }, goal: { x: 2, y: 0 }, collectibles: [] },
  objective: { reachGoal: true, collectAll: false },
  curriculum: { concept: 'sequencing', activity: 'build' },
  programming: { allowedCommands: ['forward'], maxInstructions: 3, starterProgram: [] },
  hints: [
    { kind: 'region', cells: [{ x: 2, y: 0 }], text: 'Look at the flag.' },
    { kind: 'card', command: 'forward', text: 'Forward moves one tile.' },
    { kind: 'fill', slot: 0, command: 'forward', text: 'Here is the first step.' },
  ],
  referenceSolution: ['forward', 'forward'],
  stars: { noHints: true, budget: 2 },
});

const parsed = (over: (j: Json) => void = () => {}): PuzzleDefinition => {
  const j = base();
  over(j);
  return parsePuzzle(j, 'test');
};

describe('parse: hints and prediction', () => {
  it('parses the three rungs and optional prediction settings', () => {
    const p = parsed((j) => (j.prediction = { askTile: true }));
    expect(p.hints.map((h) => h.kind)).toEqual(['region', 'card', 'fill']);
    expect(p.prediction).toEqual({ askTile: true });
  });

  it('reports a missing rung and an unknown kind by path', () => {
    expect(() => parsed((j) => (j.hints = j.hints.slice(0, 2)))).toThrow(/hints: expected exactly three/);
    expect(() => parsed((j) => (j.hints[1].kind = 'nudge'))).toThrow(ContentError);
    expect(() => parsed((j) => (j.hints[1].kind = 'nudge'))).toThrow(/hints\[1\]\.kind/);
  });
});

describe('validate: hints and activities', () => {
  it('accepts a sound build level', () => {
    expect(validatePuzzle(parsed()).errors).toEqual([]);
  });

  it('rejects hint targets that are off the board, disallowed, or wrong for the solution', () => {
    const off = parsed((j) => (j.hints[0] = { kind: 'region', cells: [{ x: 9, y: 9 }], text: 't' }));
    expect(validatePuzzle(off).errors).toEqual([expect.stringContaining('off the board')]);
    const wrongFill = parsed((j) => (j.hints[2] = { kind: 'fill', slot: 0, command: 'rotateCW', text: 't' }));
    expect(validatePuzzle(wrongFill).errors.join('\n')).toMatch(/fills slot 0 with rotateCW/);
    const badOrder = parsed((j) => (j.hints[0] = { kind: 'card', command: 'forward', text: 't' }));
    expect(validatePuzzle(badOrder).errors.join('\n')).toMatch(/hints\[0\] must orient/);
  });

  it('checks each activity\'s promises', () => {
    const run = parsed((j) => {
      j.curriculum.activity = 'run';
      j.programming.starterProgram = ['forward'];
    });
    expect(validatePuzzle(run).errors.join('\n')).toMatch(/must already solve/);
    expect(validatePuzzle(run).errors.join('\n')).toMatch(/must set prediction/);

    const reorder = parsed((j) => {
      j.curriculum.activity = 'reorder';
      j.programming.suppliedCards = ['forward'];
    });
    expect(validatePuzzle(reorder).errors.join('\n')).toMatch(/exactly the cards/);

    const debug = parsed((j) => {
      j.curriculum.activity = 'debug';
      j.programming.allowedCommands = ['forward', 'rotateCW'];
      j.programming.starterProgram = ['forward', 'rotateCW'];
      j.hints[1] = { kind: 'step', index: 1, text: 'This one is wrong.' };
    });
    expect(validatePuzzle(debug).errors).toEqual([]);

    const debugTwoWrong = parsed((j) => {
      j.curriculum.activity = 'debug';
      j.programming.allowedCommands = ['forward', 'rotateCW'];
      j.programming.starterProgram = ['rotateCW', 'rotateCW'];
    });
    expect(validatePuzzle(debugTwoWrong).errors.join('\n')).toMatch(/exactly one instruction/);
  });
});

describe('hintEffect', () => {
  const level = parsed();
  const ids = sequentialIdFactory('h');

  it('highlights a region, then a card, then fills the slot', () => {
    const empty = programFromCommands([], sequentialIdFactory());
    expect(hintEffect(level, 0, empty, ids, false)).toEqual({ text: 'Look at the flag.', cells: [{ x: 2, y: 0 }] });
    expect(hintEffect(level, 1, empty, ids, false)).toEqual({ text: 'Forward moves one tile.', command: 'forward' });
    const fill = hintEffect(level, 2, empty, ids, false);
    expect(fill.edit).toEqual({ op: 'insert', slot: 0, node: { id: 'h1', kind: 'forward' } });
  });

  it('only points when the slot already holds the right card, and asks for room when full', () => {
    const done = programFromCommands(['forward'], sequentialIdFactory('s'));
    expect(hintEffect(level, 2, done, ids, false)).toEqual({ text: 'Here is the first step.', nodeId: 's1' });
    const wrong = programFromCommands(['rotateCW'], sequentialIdFactory('s'));
    expect(hintEffect(level, 2, wrong, ids, true).edit).toBeUndefined();
    expect(hintEffect(level, 2, wrong, ids, true).text).toMatch(/make room/);
  });
});

describe('prediction', () => {
  it('is correct only on the tile the robot ends up on', () => {
    expect(predictionCorrect({ cell: { x: 2, y: 0 } }, { x: 2, y: 0 })).toBe(true);
    expect(predictionCorrect({ cell: { x: 1, y: 0 } }, { x: 2, y: 0 })).toBe(false);
  });
});
