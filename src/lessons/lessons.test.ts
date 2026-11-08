import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromCommands, programFromSpec } from '../ir/program';
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
    expect(p.hints[2]).toMatchObject({ path: [] });
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
    expect(validatePuzzle(debugTwoWrong).errors.join('\n')).toMatch(/exactly one card/);
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
    expect(fill.edit).toEqual({ op: 'insert', at: { parent: null, branch: 'body', index: 0 }, node: { id: 'h1', kind: 'forward' } });
  });

  it('only points when the slot already holds the right card, and asks for room when full', () => {
    const done = programFromCommands(['forward'], sequentialIdFactory('s'));
    expect(hintEffect(level, 2, done, ids, false)).toEqual({ text: 'Here is the first step.', nodeId: 's1' });
    const wrong = programFromCommands(['rotateCW'], sequentialIdFactory('s'));
    expect(hintEffect(level, 2, wrong, ids, true).edit).toBeUndefined();
    expect(hintEffect(level, 2, wrong, ids, true).text).toMatch(/make room/);
  });
});

describe('hintEffect with blocks', () => {
  const loopLevel = (over: (j: Json) => void = () => {}) =>
    parsed((j) => {
      j.world.rows = ['......'];
      j.world.goal = { x: 4, y: 0 };
      j.programming.allowedCommands = ['forward', 'repeat'];
      j.programming.maxInstructions = 3;
      j.referenceSolution = [{ repeat: 4, do: ['forward'] }];
      j.hints[2] = { kind: 'fill', path: [0], slot: 0, command: 'forward', text: 'A Forward goes inside the Repeat.' };
      j.stars.budget = 2;
      over(j);
    });
  const level = loopLevel();
  const ids = sequentialIdFactory('h');

  it('validates a fill inside a block against the reference solution', () => {
    expect(validatePuzzle(level).errors).toEqual([]);
    const wrong = loopLevel((j) => (j.hints[2] = { kind: 'fill', path: [0], slot: 0, command: 'rotateCW', text: 't' }));
    expect(validatePuzzle(wrong).errors.join('\n')).toMatch(/fills slot 0 with rotateCW, but the reference solution has forward/);
    const missing = loopLevel((j) => (j.hints[2] = { kind: 'fill', path: [1], slot: 0, command: 'forward', text: 't' }));
    expect(validatePuzzle(missing).errors.join('\n')).toMatch(/path \[1\], which the reference solution does not have/);
  });

  it('points at the card when the block is not built yet, and fills inside it once it is', () => {
    const empty = programFromCommands([], sequentialIdFactory());
    expect(hintEffect(level, 2, empty, ids, false)).toEqual({ text: 'A Forward goes inside the Repeat.', command: 'forward' });
    const withRepeat = programFromSpec([{ repeat: 2, do: [] }], sequentialIdFactory('s'));
    const fill = hintEffect(level, 2, withRepeat, ids, false);
    expect(fill.edit).toEqual({ op: 'insert', at: { parent: 's1', branch: 'body', index: 0 }, node: { id: 'h1', kind: 'forward' } });
  });

  it('scaffolds a block with the solution\'s count but an empty body', () => {
    const blockLevel = parsed((j) => {
      j.world.rows = ['......'];
      j.world.goal = { x: 4, y: 0 };
      j.programming.allowedCommands = ['forward', 'repeat'];
      j.referenceSolution = [{ repeat: 4, do: ['forward'] }];
      j.hints[2] = { kind: 'fill', slot: 0, command: 'repeat', text: 'Start with a Repeat.' };
    });
    const fill = hintEffect(blockLevel, 2, programFromCommands([], sequentialIdFactory()), sequentialIdFactory('h'), false);
    expect(fill.edit).toEqual({ op: 'insert', at: { parent: null, branch: 'body', index: 0 }, node: { id: 'h1', kind: 'repeat', count: 4, body: [] } });
  });
});

describe('validate: blocks', () => {
  const loops = (over: (j: Json) => void = () => {}) =>
    parsed((j) => {
      j.world.rows = ['......'];
      j.world.goal = { x: 5, y: 0 };
      j.programming.allowedCommands = ['forward', 'repeat'];
      j.programming.maxInstructions = 3;
      j.referenceSolution = [{ repeat: 5, do: ['forward'] }];
      j.hints[2] = { kind: 'fill', slot: 0, command: 'repeat', text: 't' };
      j.stars.budget = 2;
      over(j);
    });

  it('accepts a loop level whose budget the reference proves, and reports the flat minimum', () => {
    const r = validatePuzzle(loops());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.minInstructions).toBe(5);
  });

  it('warns when blocks are optional and rejects a budget nothing proves', () => {
    expect(validatePuzzle(loops((j) => (j.programming.maxInstructions = 6))).warnings.join('\n')).toMatch(/blocks are optional/);
    expect(validatePuzzle(loops((j) => (j.stars.budget = 1))).errors.join('\n')).toMatch(/nothing proves/);
  });

  it('rejects cards, conditions and nesting the level does not allow', () => {
    const r = validatePuzzle(
      loops((j) => {
        j.programming.allowedCommands = ['forward', 'repeat', 'until'];
        j.programming.allowedConditions = ['atFlag'];
        j.programming.maxNestingDepth = 1;
        j.referenceSolution = [{ until: 'blockedAhead', do: [{ repeat: 2, do: ['forward'] }] }];
      }),
    );
    expect(r.errors.join('\n')).toMatch(/senses blockedAhead/);
    expect(r.errors.join('\n')).toMatch(/nests 2 deep/);
    const disallowed = validatePuzzle(loops((j) => (j.referenceSolution = [{ if: 'atFlag', do: ['forward'] }, 'forward'])));
    expect(disallowed.errors.join('\n')).toMatch(/referenceSolution\[0\] uses if/);
  });

  it('checks debug and reorder promises on nested programs', () => {
    const debug = loops((j) => {
      j.curriculum.activity = 'debug';
      j.programming.starterProgram = [{ repeat: 2, do: ['forward'] }];
      j.hints[1] = { kind: 'step', path: [], index: 0, text: 'Count again.' };
    });
    expect(validatePuzzle(debug).errors).toEqual([]);
    const shape = loops((j) => {
      j.curriculum.activity = 'debug';
      j.programming.starterProgram = ['forward'];
    });
    expect(validatePuzzle(shape).errors.join('\n')).toMatch(/exactly one card/);
    const reorder = loops((j) => {
      j.curriculum.activity = 'reorder';
      j.programming.suppliedCards = ['repeat', 'forward'];
    });
    expect(validatePuzzle(reorder).errors).toEqual([]);
    const stepHint = loops((j) => {
      j.curriculum.activity = 'debug';
      j.programming.starterProgram = [{ repeat: 2, do: ['forward'] }];
      j.hints[1] = { kind: 'step', path: [0], index: 1, text: 'x' };
    });
    expect(validatePuzzle(stepHint).errors.join('\n')).toMatch(/points at step 2, but that part of the starter program has 1 steps/);
  });

  it('parses block specs and reports bad ones by path', () => {
    expect(() => parsed((j) => (j.referenceSolution = [{ repeat: 1, do: [] }]))).toThrow(/referenceSolution\[0\]\.repeat/);
    expect(() => parsed((j) => (j.referenceSolution = [{ loop: 3, do: [] }]))).toThrow(/needs "repeat", "if", "until", "call" or "define"/);
    expect(() => parsed((j) => (j.referenceSolution = [{ if: 'sunny', do: [] }]))).toThrow(/referenceSolution\[0\]\.if: unknown condition/);
    expect(() => parsed((j) => (j.hints[2] = { kind: 'fill', path: ['else'], slot: 0, command: 'forward', text: 't' }))).toThrow(/"else" must follow a card index/);
  });
});

describe('validate: functions', () => {
  /** Two Forwards named Twice, called once from the program. */
  const fns = (over: (j: Json) => void = () => {}) =>
    parsed((j) => {
      j.curriculum.concept = 'functions';
      j.programming.allowedCommands = ['forward', 'call'];
      j.programming.starterProgram = [{ define: 'twice', do: [] }];
      j.referenceSolution = [{ call: 'twice' }, { define: 'twice', do: ['forward', 'forward'] }];
      j.hints[1] = { kind: 'card', command: 'call', text: 'Use Twice.' };
      j.hints[2] = { kind: 'fill', path: ['twice'], slot: 0, command: 'forward', text: 'Twice starts with a Forward.' };
      j.stars.budget = 3;
      over(j);
    });

  it('accepts a level whose reference solution calls the function it fills in', () => {
    const r = validatePuzzle(fns());
    expect(r.errors).toEqual([]);
    expect(r.minInstructions).toBe(2);
  });

  it('requires the starter and the solution to define the same functions', () => {
    expect(validatePuzzle(fns((j) => (j.programming.starterProgram = []))).errors.join('\n')).toMatch(/must define the same functions/);
    expect(validatePuzzle(fns((j) => (j.programming.allowedCommands = ['forward']))).errors.join('\n')).toMatch(/call is not allowed/);
  });

  it('rejects calls to missing functions, calls inside functions, and a solution that never calls', () => {
    const missing = fns((j) => (j.referenceSolution = [{ call: 'jump' }, { define: 'twice', do: ['forward', 'forward'] }]));
    expect(validatePuzzle(missing).errors.join('\n')).toMatch(/calls jump, which it does not define/);
    const nested = fns((j) => (j.referenceSolution = ['forward', 'forward', { define: 'twice', do: [{ call: 'twice' }] }]));
    expect(validatePuzzle(nested).errors.join('\n')).toMatch(/cannot use a function yet/);
    expect(validatePuzzle(nested).errors.join('\n')).toMatch(/never calls its function/);
  });

  it('lets a reorder level start with its functions, empty', () => {
    const reorder = fns((j) => {
      j.curriculum.activity = 'reorder';
      j.programming.suppliedCards = ['call', 'forward', 'forward'];
    });
    expect(validatePuzzle(reorder).errors).toEqual([]);
  });

  it('parses names and defines, and reports bad ones by path', () => {
    expect(() => fns((j) => (j.referenceSolution = [{ call: 'Hop' }]))).toThrow(/referenceSolution\[0\]\.call: expected a function name/);
    expect(() => fns((j) => (j.referenceSolution = [{ call: 'main' }]))).toThrow(/expected a function name/);
    expect(() => fns((j) => (j.referenceSolution = [{ repeat: 2, do: [{ define: 'x', do: [] }] }]))).toThrow(/only be defined at the top/);
    expect(() => fns((j) => (j.programming.starterProgram = [{ define: 'twice', do: [] }, { define: 'twice', do: [] }]))).toThrow(/defined twice/);
    expect(() => fns((j) => (j.hints[2].path = ['twice', 'hop']))).toThrow(/hints\[2\]\.path\[1\]/);
  });

  it('checks hint paths into a function', () => {
    const r = validatePuzzle(fns((j) => (j.hints[2] = { kind: 'fill', path: ['hop'], slot: 0, command: 'forward', text: 'x' })));
    expect(r.errors.join('\n')).toMatch(/follows path \["hop"\]/);
  });

  it('fills a card inside the function, or a call to it in the program', () => {
    const level = fns();
    const program = programFromSpec(level.programming.starterProgram, sequentialIdFactory('s'));
    const fill = hintEffect(level, 2, program, sequentialIdFactory('h'), false);
    expect(fill.edit).toMatchObject({ op: 'insert', at: { parent: 'fn:twice', branch: 'body', index: 0 }, node: { kind: 'forward' } });
    const callLevel = fns((j) => (j.hints[2] = { kind: 'fill', path: [], slot: 0, command: 'call', text: 'Use Twice.' }));
    expect(validatePuzzle(callLevel).errors).toEqual([]);
    const call = hintEffect(callLevel, 2, program, sequentialIdFactory('h'), false);
    expect(call.edit).toMatchObject({ op: 'insert', at: { parent: null, index: 0 }, node: { kind: 'call', name: 'twice' } });
  });
});

describe('validate: switches, gates and the model activity', () => {
  /** A gate between the robot and the flag, its switch on the way: . S G . */
  const gated = (over: (j: Json) => void = () => {}) =>
    parsed((j) => {
      j.curriculum.concept = 'worldState';
      j.world.gates = [{ id: 'a', x: 2, y: 0 }];
      j.world.switches = [{ x: 1, y: 0, toggles: ['a'] }];
      j.world.goal = { x: 3, y: 0 };
      j.programming.maxInstructions = 3;
      j.referenceSolution = ['forward', 'forward', 'forward'];
      j.stars.budget = 3;
      over(j);
    });

  it('reads gates and switches, with gates shut unless they say open', () => {
    const p = gated((j) => j.world.gates.push({ id: 'b', x: 0, y: 0, open: true }));
    expect(p.world.gates).toEqual([
      { id: 'a', x: 2, y: 0, open: false },
      { id: 'b', x: 0, y: 0, open: true },
    ]);
    expect(p.world.switches).toEqual([{ x: 1, y: 0, toggles: ['a'] }]);
    expect(validatePuzzle(gated()).errors).toEqual([]);
  });

  it('reports bad gates and switches by path', () => {
    expect(() => gated((j) => (j.world.gates[0].id = 'Gate'))).toThrow(/world\.gates\[0\]\.id: expected one lower case letter/);
    expect(() => gated((j) => (j.world.switches[0].toggles = [1]))).toThrow(/world\.switches\[0\]\.toggles\[0\]/);
  });

  it('checks that switches flip real gates, gates have switches, and nothing shares a tile', () => {
    const errs = (over: (j: Json) => void) => validatePuzzle(gated(over)).errors.join('\n');
    expect(errs((j) => (j.world.switches[0].toggles = ['b']))).toMatch(/flips gate b, which is not on the board/);
    expect(errs((j) => (j.world.switches[0].toggles = ['b']))).toMatch(/gate a has no switch/);
    expect(errs((j) => (j.world.gates[0].x = 3))).toMatch(/gate a at 3,0 shares a tile with the goal/);
    expect(errs((j) => (j.world.switches[0].x = 0))).toMatch(/shares a tile with the robot/);
    expect(errs((j) => (j.world.switches[0].toggles = []))).toMatch(/must flip at least one gate/);
  });

  it('proves a shut gate with no switch on the way is not solvable', () => {
    const r = validatePuzzle(gated((j) => (j.world.switches = [{ x: 0, y: 0, toggles: ['a'] }])));
    expect(r.errors.join('\n')).toMatch(/does not solve/);
  });

  it('asks a model level for memory card fields that the board has', () => {
    const model = (ask: unknown) =>
      gated((j) => {
        j.curriculum.activity = 'model';
        j.programming.starterProgram = ['forward', 'forward', 'forward'];
        j.prediction = { askTile: false, askMemory: ask };
      });
    expect(validatePuzzle(model(['gate:a', 'facing'])).errors).toEqual([]);
    expect(validatePuzzle(model([])).errors.join('\n')).toMatch(/at least one memory card field/);
    expect(validatePuzzle(model(['gate:b'])).errors.join('\n')).toMatch(/asks for gate:b, which this board's memory card does not have/);
    expect(validatePuzzle(model(['acorns'])).errors.join('\n')).toMatch(/asks for acorns/);
    expect(() => model(['color'])).toThrow(/prediction\.askMemory\[0\]/);
  });
});

describe('prediction', () => {
  it('is correct only on the tile the robot ends up on', () => {
    expect(predictionCorrect({ cell: { x: 2, y: 0 } }, { x: 2, y: 0 })).toBe(true);
    expect(predictionCorrect({ cell: { x: 1, y: 0 } }, { x: 2, y: 0 })).toBe(false);
  });
});
