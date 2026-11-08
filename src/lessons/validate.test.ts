import { describe, expect, it } from 'vitest';
import { ContentError, parsePuzzle } from './parse';
import { shortestSolution, validatePuzzle } from './validate';

const base = {
  schemaVersion: 1,
  id: 'test',
  title: 'Test',
  themeId: 'forest',
  world: {
    rows: ['..#.', '....', '._..'],
    robot: { x: 0, y: 1, facing: 'E' },
    goal: { x: 3, y: 1 },
    collectibles: [],
  },
  objective: { reachGoal: true, collectAll: false },
  curriculum: { concept: 'sequencing', activity: 'build' },
  programming: { allowedCommands: ['forward'], maxInstructions: 4, starterProgram: ['forward'] },
  hints: [
    { kind: 'region', cells: [{ x: 3, y: 1 }], text: 'Look at the flag.' },
    { kind: 'card', command: 'forward', text: 'Forward moves one tile.' },
    { kind: 'fill', slot: 1, command: 'forward', text: 'Another Forward goes here.' },
  ],
  referenceSolution: ['forward', 'forward', 'forward'],
  stars: { noHints: true, budget: 3 },
};
const withPatch = (patch: (j: typeof base) => void) => {
  const j = structuredClone(base);
  patch(j);
  return j;
};

describe('parsePuzzle', () => {
  it('parses rows into tiles', () => {
    const p = parsePuzzle(base, 'test.json');
    expect(p.world.width).toBe(4);
    expect(p.world.tiles[0]).toEqual(['floor', 'floor', 'wall', 'floor']);
    expect(p.world.tiles[2]![1]).toBe('gap');
  });

  it('reports every problem with its path', () => {
    const bad = withPatch((j) => {
      j.world.rows = ['..x.', '...'];
      (j.world.robot as { facing: string }).facing = 'up';
      (j.programming.allowedCommands as string[]) = ['jump'];
    });
    try {
      parsePuzzle(bad, 'bad.json');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      const issues = (e as ContentError).issues.join('\n');
      expect(issues).toMatch(/world.rows\[0\]\[2\]: unknown tile "x"/);
      expect(issues).toMatch(/world.rows\[1\]: expected a string of length 4/);
      expect(issues).toMatch(/world.robot.facing/);
      expect(issues).toMatch(/programming.allowedCommands\[0\]: unknown card "jump"/);
    }
  });
});

describe('validatePuzzle', () => {
  it('accepts a valid level and finds its minimum', () => {
    const r = validatePuzzle(parsePuzzle(base, 't'));
    expect(r).toEqual({ errors: [], warnings: [], minInstructions: 3 });
  });

  it('rejects a reference solution that fails', () => {
    const r = validatePuzzle(parsePuzzle(withPatch((j) => (j.referenceSolution = ['forward'])), 't'));
    expect(r.errors.join()).toMatch(/does not solve/);
  });

  it('rejects budgets below the minimum and disallowed commands', () => {
    const r = validatePuzzle(
      parsePuzzle(
        withPatch((j) => {
          j.programming.maxInstructions = 2;
          j.stars.budget = 2;
          j.programming.starterProgram = ['rotateCW'];
        }),
        't',
      ),
    );
    expect(r.errors.join('\n')).toMatch(/maxInstructions 2 is below the minimum solution of 3/);
    expect(r.errors.join('\n')).toMatch(/stars.budget 2/);
    expect(r.errors.join('\n')).toMatch(/starterProgram\[0\] uses rotateCW/);
  });

  it('finds routes that need rotation around walls and gaps', () => {
    const p = parsePuzzle(
      withPatch((j) => {
        j.world.rows = ['....', '.#..', '.#..'];
        j.world.robot = { x: 0, y: 2, facing: 'E' };
        j.world.goal = { x: 2, y: 2 };
        j.programming.allowedCommands = ['forward', 'rotateCW', 'rotateCCW'];
        j.programming.maxInstructions = 10;
        j.programming.starterProgram = [];
        j.referenceSolution = ['rotateCCW', 'forward', 'forward', 'rotateCW', 'forward', 'forward', 'rotateCW', 'forward', 'forward'];
        j.stars.budget = 9;
      }),
      't',
    );
    expect(shortestSolution(p)).toHaveLength(9);
    expect(validatePuzzle(p).errors).toEqual([]);
  });

  it('reports an unsolvable board', () => {
    const r = validatePuzzle(
      parsePuzzle(
        withPatch((j) => {
          j.world.rows = ['..#.', '..#.', '..#.'];
        }),
        't',
      ),
    );
    expect(r.minInstructions).toBeNull();
    expect(r.errors.join()).toMatch(/no solution/);
  });
});
