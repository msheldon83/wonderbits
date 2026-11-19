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
      expect(r.outcome).toEqual({ status: 'success' });
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
    expect(play(['0,0', '0,1', '1,0', '1,1', '2,2', '2,1']).final.memory!.winner).toBe(2);
  });

  it('minesweeper: a mine ends it, numbers count the mines around, and tiles start covered', () => {
    const s = starters.find((x) => x.id === 'minesweeper')!;
    const play = (inputs: ReturnType<typeof readInputs>) => interpretAll({ program: ir(s.program), world: s.world, objective: s.objective, limits: { maxSteps: 600 }, live: { clock: false, inputs }, seed: s.replay.seed });
    const start = play([]);
    const mines = start.final.memory!.mines as boolean[][];
    const count = mines.flat().filter(Boolean).length;
    expect(start.final.memory!.left).toBe(25 - count);
    expect(gridOverlays(ir(s.program).memory, start.final).every((o) => o.kind === 'cover')).toBe(true);
    const my = mines.findIndex((row) => row.includes(true));
    const mx = mines[my]!.indexOf(true);
    expect(play([{ kind: 'tap', x: mx, y: my }]).outcome).toMatchObject({ status: 'lost' });
    // Every uncovered number is the count of mines touching that tile.
    const won = play(s.replay.inputs);
    const shown = won.final.memory!.shown as number[][];
    shown.forEach((row, y) => row.forEach((v, x) => {
      if (mines[y]![x]) return expect(v).toBe(9);
      let around = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && mines[y + dy]?.[x + dx]) around++;
      expect(v).toBe(around);
    }));
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

describe('a beetle that chases', async () => {
  const { advance, initialState, moverPlace } = await import('../sim/world');
  const { setChase, canExtend } = await import('./worldOps');
  const { applyStroke, applyTool } = await import('./worldOps');
  const { parseBoardRules: parse } = await import('../lessons/parse');
  const { worldToJson } = await import('./parse');
  const at = (x: number, y: number) => ({ x, y });
  /** A 5 by 5 island, the robot at the left of the middle row, a beetle in the far corner that chases. */
  const world = setChase(applyStroke(blankWorld(), 'beetle', at(4, 0), true), 'beetle1', true);
  const beetle = world.movers![0]!;

  it('is a beetle with no round, that starts where it stood', () => {
    expect(beetle).toEqual({ id: 'beetle1', kind: 'beetle', path: [at(4, 0)], chase: 2 });
    expect(initialState(world).chasers).toEqual({ beetle1: at(4, 0) });
    expect(canExtend(world, beetle, at(3, 0))).toBe(false);
    expect(setChase(world, 'beetle1', false).movers![0]).toEqual({ id: 'beetle1', kind: 'beetle', path: [at(4, 0)] });
    expect(setChase(world, 'nobody', true)).toBe(world);
    expect(initialState(blankWorld())).not.toHaveProperty('chasers');
  });

  it('steps toward the robot every other tick, and catches it', () => {
    let state = initialState(world);
    const seen: string[] = [];
    let caught = false;
    for (let i = 0; i < 20 && !caught; i++) {
      const t = advance(world, state);
      state = t.state;
      seen.push(`${moverPlace(beetle, state).x},${moverPlace(beetle, state).y}`);
      caught = t.kind === 'hazard';
    }
    // It stands on odd ticks and steps on even ones: six steps from (4,0) to the robot at (0,2).
    expect(seen.slice(0, 4)).toEqual(['4,0', '4,1', '4,1', '4,2']);
    expect(caught).toBe(true);
    expect(state.tick).toBe(12);
  });

  it('goes round a rock, and stands when there is no way', () => {
    const walled = [at(3, 0), at(3, 1), at(4, 1)].reduce((w, c) => applyTool(w, 'wall', c), world);
    let state = initialState(walled);
    for (let i = 0; i < 6; i++) state = advance(walled, state).state;
    expect(state.chasers).toEqual({ beetle1: at(4, 0) });
    const gap = applyTool(walled, 'floor', at(3, 0));
    state = initialState(gap);
    for (let i = 0; i < 2; i++) state = advance(gap, state).state;
    expect(state.chasers).toEqual({ beetle1: at(3, 0) });
  });

  it('is read from a file, and only a beetle can chase', () => {
    const json = { world: worldToJson(world), objective: { reachGoal: true, collectAll: false }, programming: { allowedCommands: ['forward'] } };
    expect(parse(JSON.parse(JSON.stringify(json)), 'chase').world.movers![0]!.chase).toBe(2);
    const log = { ...json, world: { ...json.world, movers: [{ id: 'log1', kind: 'log', path: [at(0, 0)], chase: 2 }] } };
    expect(() => parse(log, 'bad')).toThrow(/only a beetle can chase/);
  });
});
