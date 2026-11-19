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

describe('the starter games', async () => {
  const { loadStarters, gameFrom, parseStarter, readInputs } = await import('./starters');
  const { critique } = await import('./critic');
  const { parseCreation } = await import('./parse');
  const { isLivePuzzle, keptOf, withSaved } = await import('./live');
  const { gridOverlays } = await import('../render/overlays');
  const { validateWorld } = await import('../lessons/validate');
  const starters = loadStarters();

  it('are there, real-time first', () => {
    expect(starters.map((s) => s.id)).toEqual(expect.arrayContaining(['crossing', 'noughts', 'minesweeper']));
    expect(starters[0]!.family).toBe('real-time');
    expect(new Set(starters.map((s) => s.id)).size).toBe(starters.length);
  });

  for (const s of starters) {
    it(`${s.title}: its recorded play wins it`, () => {
      const errors: string[] = [];
      validateWorld(s.world, s.objective, errors);
      expect(errors).toEqual([]);
      const r = interpretAll({ program: ir(s.program), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: s.clock !== undefined, inputs: s.replay.inputs }, seed: s.replay.seed });
      expect(r.outcome).toMatchObject({ status: 'success' });
      // Every input was needed: the play does not go on after the win.
      const shorter = interpretAll({ program: ir(s.program), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: s.clock !== undefined, inputs: s.replay.inputs.slice(0, -1) }, seed: s.replay.seed });
      expect(shorter.outcome.status).not.toBe('success');
    });

    it(`${s.title}: becomes a child's game that stores, loads, and is proved by its play`, () => {
      const game = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...gameFrom(s, s.title) };
      expect(game.kind).toBe('game');
      expect(game.basedOn).toBe(`starter:${s.id}`);
      expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(game))), s.id)).toEqual(game);
      expect(isLivePuzzle(game)).toBe(true);
      const c = critique({ world: game.world, objective: game.objective, rules: { allowedCommands: game.programming.allowedCommands, random: false }, program: ir(game.program), live: { clock: game.clock !== undefined, inputs: game.replay!.inputs, seed: game.replay!.seed }, searchMillis: 100 });
      expect(c.own.solves).toBe(true);
      // Changing the starter must not reach the game made from it.
      game.world.tiles[0]![0] = 'wall';
      expect(s.world.tiles[0]![0]).toBe('floor');
    });
  }

  it('noughts and crosses: a full board with no line is game over, and a taken tile is not played', () => {
    const s = starters.find((x) => x.id === 'noughts')!;
    const play = (taps: string[]) => interpretAll({ program: ir(s.program), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: false, inputs: readInputs(taps, []) }, seed: 1 });
    // X O X / X O O / O X X : nobody has three.
    expect(play(['0,0', '1,0', '2,0', '1,1', '0,1', '2,1', '1,2', '0,2', '2,2']).outcome).toMatchObject({ status: 'lost' });
    const twice = play(['0,0', '0,0', '1,1']);
    expect(twice.final.memory!.board).toEqual([[1, 0, 0], [0, 2, 0], [0, 0, 0]]);
    expect(gridOverlays(ir(s.program).memory, twice.final)).toEqual([{ cell: { x: 0, y: 0 }, kind: 'cross' }, { cell: { x: 1, y: 1 }, kind: 'nought' }]);
    // Noughts can win too.
    expect(play(['0,0', '0,1', '1,0', '1,1', '2,2', '2,1']).outcome).toEqual({ status: 'success', player: 2 });
    expect(play(['0,0', '0,1', '1,0', '1,1', '2,0']).outcome).toEqual({ status: 'success', player: 1 });
  });

  it('minesweeper: a mine ends it, numbers count the mines around, and an empty tile opens the tiles round it', () => {
    const s = starters.find((x) => x.id === 'minesweeper')!;
    const play = (inputs: ReturnType<typeof readInputs>) => interpretAll({ program: ir(s.program), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: false, inputs }, seed: s.replay.seed });
    const start = play([]);
    const mines = start.final.memory!.mines as boolean[][];
    expect(start.final.memory!.hidden).toBe(mines.flat().filter(Boolean).length);
    expect(gridOverlays(ir(s.program).memory, start.final).every((o) => o.kind === 'cover')).toBe(true);
    const my = mines.findIndex((row) => row.includes(true));
    const mx = mines[my]!.indexOf(true);
    expect(play([{ kind: 'tap', x: mx, y: my }]).outcome).toMatchObject({ status: 'lost' });
    // One tap on an empty tile opens a whole patch, edged with numbers.
    const around = (x: number, y: number) => {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && mines[y + dy]?.[x + dx]) n++;
      return n;
    };
    let ex = -1;
    let ey = -1;
    mines.forEach((row, y) => row.forEach((m, x) => {
      if (!m && around(x, y) === 0 && ex < 0) [ex, ey] = [x, y];
    }));
    const patch = play([{ kind: 'tap', x: ex, y: ey }]).final.memory!.shown as number[][];
    expect(patch.flat().filter((v) => v !== 9).length).toBeGreaterThan(1);
    // Every uncovered number is the count of mines touching that tile, and no mine is ever uncovered.
    const won = play(s.replay.inputs);
    (won.final.memory!.shown as number[][]).forEach((row, y) => row.forEach((v, x) => expect(v).toBe(mines[y]![x] ? 9 : around(x, y))));
    // Far fewer taps than tiles: the patches did the rest.
    expect(s.replay.inputs.length).toBeLessThan(25 - mines.flat().filter(Boolean).length);
  });

  it('crossing: the beetle ends it, and plays is kept in the backpack', () => {
    const s = starters.find((x) => x.id === 'crossing')!;
    const program = ir(s.program);
    const first = interpretAll({ program, world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: true, inputs: s.replay.inputs }, seed: 1 });
    expect(keptOf(program, first.final.memory)).toEqual({ plays: 1 });
    const second = interpretAll({ program: withSaved(program, { plays: 1 }), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: true, inputs: s.replay.inputs }, seed: 1 });
    expect(second.final.memory!.plays).toBe(2);
    expect(withSaved(program, undefined)).toBe(program);
    // Standing on the road until a beetle comes ends the game.
    const waits = readInputs(['up', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.'], []);
    expect(interpretAll({ program, world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: true, inputs: waits }, seed: 1 }).outcome).toMatchObject({ status: 'blocked', reason: 'beetle' });
  });

  it('a starter file that is wrong says where', () => {
    const good = { id: 'x', title: 'X', blurb: 'b', how: 'h', family: 'turn-based', world: { rows: ['..'], robot: { x: 0, y: 0, facing: 'E' }, goal: { x: 1, y: 0 }, collectibles: [] }, objective: { reachGoal: true, collectAll: false }, programming: { allowedCommands: ['forward'] }, program: [], tries: ['t'], replay: { inputs: ['up', '.', '1,0'], seed: 1 } };
    expect(parseStarter(good, 'x').replay.inputs).toEqual([{ kind: 'key', key: 'up' }, { kind: 'tick' }, { kind: 'tap', x: 1, y: 0 }]);
    expect(() => parseStarter({ ...good, family: 'card' }, 'x')).toThrow(/family/);
    expect(() => parseStarter({ ...good, tries: [] }, 'x')).toThrow(/tries/);
    expect(() => parseStarter({ ...good, replay: { inputs: ['jump'], seed: 1 } }, 'x')).toThrow(/replay\.inputs\[0\]/);
    expect(() => parseStarter({ ...good, clock: 3 }, 'x')).toThrow(/clock/);
  });
});

describe('a beetle the program moves', async () => {
  const { initialState, moverPlace, steerMover } = await import('../sim/world');
  const { setSteered, canExtend, applyStroke, applyTool } = await import('./worldOps');
  const { parseBoardRules: parse } = await import('../lessons/parse');
  const { worldToJson } = await import('./parse');
  const { chase, flee, wander, steer, stepsFrom } = await import('../library/steer');
  const at = (x: number, y: number) => ({ x, y });
  /** A 5 by 5 island, the robot at the left of the middle row, a beetle in the far corner that the program moves. */
  const world = setSteered(applyStroke(blankWorld(), 'beetle', at(4, 0), true), 'beetle1', true);
  const beetle = world.movers![0]!;
  const open = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < 5 && c.y < 5;

  it('is a beetle with no round, that starts where it stood', () => {
    expect(beetle).toEqual({ id: 'beetle1', kind: 'beetle', path: [at(4, 0)], steered: true });
    expect(initialState(world).chasers).toEqual({ beetle1: at(4, 0) });
    expect(canExtend(world, beetle, at(3, 0))).toBe(false);
    expect(setSteered(world, 'beetle1', false).movers![0]).toEqual({ id: 'beetle1', kind: 'beetle', path: [at(4, 0)] });
    expect(setSteered(world, 'nobody', true)).toBe(world);
    expect(initialState(blankWorld())).not.toHaveProperty('chasers');
  });

  it('stays where it is until a card moves it', async () => {
    const { advance } = await import('../sim/world');
    let state = initialState(world);
    for (let i = 0; i < 5; i++) state = advance(world, state).state;
    expect(moverPlace(beetle, state)).toEqual(at(4, 0));
  });

  it('chases by the shortest way, round a rock, and stands when there is no way', () => {
    expect(chase(at(4, 0), at(0, 2), open)).toEqual(at(4, 1));
    const blocked = (c: { x: number; y: number }) => open(c) && !(c.x === 3 && c.y <= 1) && !(c.x === 4 && c.y === 1);
    expect(chase(at(4, 0), at(0, 2), blocked)).toEqual(at(4, 0));
    const gap = (c: { x: number; y: number }) => open(c) && !(c.x === 3 && c.y === 1) && !(c.x === 4 && c.y === 1);
    expect(chase(at(4, 0), at(0, 2), gap)).toEqual(at(3, 0));
    expect(stepsFrom(at(0, 0), open).get('4,4')).toBe(8);
    expect(chase(at(2, 2), at(2, 2), open)).toEqual(at(2, 2));
  });

  it('flees to the tile farthest from the robot, and wanders by the roll', () => {
    // Any tile beside it that is farther from the robot will do: here, the first of them.
    expect(stepsFrom(at(0, 2), open).get(`${flee(at(1, 2), at(0, 2), open).x},${flee(at(1, 2), at(0, 2), open).y}`)).toBe(2);
    expect(flee(at(4, 4), at(0, 0), open)).toEqual(at(4, 4));
    expect(wander(at(0, 0), open, 0)).toEqual(at(1, 0));
    expect(wander(at(0, 0), open, 0.99)).toEqual(at(0, 1));
    expect(wander(at(0, 0), () => false, 0.5)).toEqual(at(0, 0));
  });

  it('makes its best move as often as its skill says', () => {
    const best = chase(at(4, 0), at(0, 2), open);
    // A hard beetle never wanders; an easy one makes its best move only when its luck is under a third.
    expect(steer('chase', 'hard', at(4, 0), at(0, 2), open, 0.99, 0)).toEqual(best);
    expect(steer('chase', 'easy', at(4, 0), at(0, 2), open, 0.2, 0)).toEqual(best);
    expect(steer('chase', 'easy', at(4, 0), at(0, 2), open, 0.5, 0)).toEqual(wander(at(4, 0), open, 0));
    expect(steer('chase', 'medium', at(4, 0), at(0, 2), open, 0.5, 0)).toEqual(best);
    expect(steer('wander', 'hard', at(4, 0), at(0, 2), open, 0, 0.99)).toEqual(wander(at(4, 0), open, 0.99));
    // Over many moves an easy chaser gets there more slowly than a hard one.
    const arrive = (skill: 'easy' | 'hard') => {
      let state: ReturnType<typeof initialState> = { ...initialState(world), rng: 5 };
      let moves = 0;
      while (moves < 400 && (moverPlace(beetle, state).x !== 0 || moverPlace(beetle, state).y !== 2)) {
        state = steerMover(world, state, 'beetle1', 'chase', skill);
        moves++;
      }
      return moves;
    };
    expect(arrive('hard')).toBe(6);
    expect(arrive('easy')).toBeGreaterThan(6);
  });

  it('is moved by a card in the Every tick card, every so many ticks, and catches the robot', () => {
    const spec: NodeSpec[] = [{ on: 'tick', do: [{ steer: 'beetle1', how: 'chase', skill: 'hard', every: 2 }] }];
    const ticks = (n: number): LiveInput[] => Array.from({ length: n }, () => ({ kind: 'tick' }));
    const r = interpretAll({ program: ir(spec), world, objective: { reachGoal: true, collectAll: false }, limits: { maxSteps: 400 }, live: { clock: true, inputs: ticks(20) }, seed: 1 });
    expect(r.outcome).toMatchObject({ status: 'blocked', reason: 'beetle' });
    // Six steps away, one step every other tick: caught on tick 12.
    expect(r.final.tick).toBe(12);
    expect(r.trace.filter((e) => e.op === 'steer')).toHaveLength(6);
    expect(printProgram(ir(spec))).toContain("steer('beetle1', 'chase', { skill: 'hard', every: 2 });");
    // The same seed moves an easy beetle the same way.
    const easy: NodeSpec[] = [{ on: 'tick', do: [{ steer: 'beetle1', how: 'chase', skill: 'easy', every: 1 }] }];
    const run = (seed: number) => interpretAll({ program: ir(easy), world, objective: { reachGoal: true, collectAll: false }, limits: { maxSteps: 400 }, live: { clock: true, inputs: ticks(6) }, seed }).final.chasers;
    expect(run(3)).toEqual(run(3));
  });

  it('says so when there is no beetle for the card to move', () => {
    const r = interpretAll({ program: ir([{ on: 'tick', do: [{ steer: 'beetle9', how: 'chase', skill: 'hard', every: 1 }] }]), world, objective: { reachGoal: true, collectAll: false }, limits: { maxSteps: 400 }, live: { clock: true, inputs: [{ kind: 'tick' }] }, seed: 1 });
    expect(r.outcome).toMatchObject({ status: 'error' });
  });

  it('is read from a file, and only a beetle can be the program\'s', () => {
    const json = { world: worldToJson(world), objective: { reachGoal: true, collectAll: false }, programming: { allowedCommands: ['forward'] } };
    expect(parse(JSON.parse(JSON.stringify(json)), 'steered').world.movers![0]!.steered).toBe(true);
    const log = { ...json, world: { ...json.world, movers: [{ id: 'log1', kind: 'log', path: [at(0, 0)], steered: true }] } };
    expect(() => parse(log, 'bad')).toThrow(/only a beetle/);
    void applyTool;
  });
});
