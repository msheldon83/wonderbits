import { describe, expect, it } from 'vitest';
import { allLevels } from '../app/levels';
import { validateWorld } from '../lessons/validate';
import { nextRandom } from '../sim/random';
import type { WorldDefinition } from '../sim/types';
import { blankWorld } from './blank';
import { creationToJson, parseCreation } from './parse';
import { boardProblems, reachable } from './problems';
import { remixOf, remixTitle, skeletonOf } from './remix';
import { amendWorld, applyTool, minSize, pushWorld, redoWorld, resize, TOOLS, undoWorld, worldHistory } from './worldOps';

const at = (x: number, y: number) => ({ x, y });
/** Applies taps in order. */
const taps = (world: WorldDefinition, ...steps: [Parameters<typeof applyTool>[1], number, number][]) => steps.reduce((w, [tool, x, y]) => applyTool(w, tool, at(x, y)), world);

describe('board tools', () => {
  const blank = blankWorld(); // robot (0,2) E, flag (4,2)

  it('paints tiles, and never floods the robot or the flag', () => {
    const w = taps(blank, ['wall', 1, 1], ['gap', 2, 1]);
    expect(w.tiles[1]).toEqual(['floor', 'wall', 'gap', 'floor', 'floor']);
    expect(applyTool(w, 'wall', at(0, 2))).toBe(w);
    expect(applyTool(w, 'gap', at(4, 2))).toBe(w);
    expect(applyTool(w, 'wall', at(1, 1))).toBe(w);
    expect(blank.tiles[1]![1]).toBe('floor');
  });

  it('puts an acorn down, picks it up, and loses it under a rock', () => {
    const w = applyTool(blank, 'acorn', at(2, 2));
    expect(w.collectibles).toEqual([at(2, 2)]);
    expect(applyTool(w, 'acorn', at(2, 2)).collectibles).toEqual([]);
    expect(applyTool(w, 'wall', at(2, 2)).collectibles).toEqual([]);
    expect(applyTool(blank, 'acorn', at(0, 2))).toBe(blank);
    expect(applyTool(applyTool(blank, 'gap', at(1, 1)), 'acorn', at(1, 1)).collectibles).toEqual([]);
  });

  it('moves the flag and the robot, turns the robot, and keeps them apart', () => {
    expect(applyTool(blank, 'flag', at(3, 0)).goal).toEqual(at(3, 0));
    expect(applyTool(blank, 'flag', at(0, 2))).toBe(blank);
    expect(applyTool(blank, 'robot', at(1, 1)).robot).toEqual({ x: 1, y: 1, facing: 'E' });
    expect(applyTool(blank, 'robot', at(0, 2)).robot.facing).toBe('S');
    expect(applyTool(blank, 'robot', at(4, 2))).toBe(blank);
    const onAcorn = taps(blank, ['acorn', 3, 3], ['flag', 3, 3]);
    expect(onAcorn.collectibles).toEqual([]);
    expect(onAcorn.goal).toEqual(at(3, 3));
  });

  it('places gates and switches that always flip a gate that is there', () => {
    expect(applyTool(blank, 'switch', at(1, 1))).toBe(blank);
    let w = taps(blank, ['gate', 2, 2], ['switch', 1, 1]);
    expect(w.gates).toEqual([{ id: 'a', x: 2, y: 2, open: false }]);
    expect(w.switches).toEqual([{ x: 1, y: 1, toggles: ['a'] }]);
    expect(applyTool(w, 'gate', at(2, 2)).gates![0]!.open).toBe(true);
    // A second gate; a new switch is for the gate with none; tapping a switch moves it on.
    w = taps(w, ['gate', 3, 3], ['switch', 3, 1]);
    expect(w.switches![1]).toEqual({ x: 3, y: 1, toggles: ['b'] });
    expect(applyTool(w, 'switch', at(3, 1)).switches![1]!.toggles).toEqual(['a']);
    // Erasing a gate takes the switches left flipping nothing.
    const erased = applyTool(w, 'erase', at(2, 2));
    expect(erased.gates!.map((g) => g.id)).toEqual(['b']);
    expect(erased.switches).toEqual([{ x: 3, y: 1, toggles: ['b'] }]);
    expect(applyTool(erased, 'erase', at(3, 3))).not.toHaveProperty('gates');
    expect(applyTool(erased, 'erase', at(3, 3))).not.toHaveProperty('switches');
    expect(applyTool(blank, 'erase', at(1, 1))).toBe(blank);
  });

  it('stops at six gates', () => {
    let w = blank;
    for (let x = 0; x < 5; x++) w = taps(w, ['gate', x, 0], ['gate', x, 4]);
    expect(w.gates).toHaveLength(6);
  });

  it('ignores a tap off the board', () => {
    for (const tool of TOOLS) expect(applyTool(blank, tool, at(9, 9))).toBe(blank);
  });

  it('resizes at the right and bottom edges, down to what holds the robot and the flag', () => {
    const w = taps(blank, ['acorn', 4, 4], ['wall', 3, 4]);
    const grown = resize(w, 7, 6);
    expect([grown.width, grown.height, grown.tiles.length, grown.tiles[5]!.length]).toEqual([7, 6, 6, 7]);
    expect(grown.tiles[4]![3]).toBe('wall');
    expect(minSize(w)).toEqual({ width: 5, height: 3 });
    expect(resize(w, 4, 5)).toBe(w);
    const shrunk = resize(w, 5, 3);
    expect(shrunk.collectibles).toEqual([]);
    expect(shrunk.height).toBe(3);
    expect(resize(w, 17, 5)).toBe(w);
    expect(resize(w, 5, 5)).toBe(w);
  });

  it('keeps a mover only while its whole path suits it', () => {
    const river: WorldDefinition = { ...taps(blank, ['gap', 1, 0], ['gap', 1, 1]), movers: [{ id: 'log1', kind: 'log', path: [at(1, 0), at(1, 1)] }] };
    expect(applyTool(river, 'wall', at(3, 3)).movers).toHaveLength(1);
    expect(applyTool(river, 'floor', at(1, 1))).not.toHaveProperty('movers');
  });

  it('whatever is tapped, the board stays one the simulation can run', () => {
    let seed = 7;
    const pick = (n: number) => {
      const r = nextRandom(seed);
      seed = r.state;
      return Math.floor(r.value * n) % n;
    };
    for (let round = 0; round < 40; round++) {
      let w = blankWorld(2 + pick(5), 2 + pick(5));
      for (let i = 0; i < 60; i++) {
        w = pick(10) === 0 ? resize(w, 2 + pick(7), 2 + pick(7)) : applyTool(w, TOOLS[pick(TOOLS.length)]!, at(pick(w.width), pick(w.height)));
        const errors: string[] = [];
        validateWorld(w, { reachGoal: true, collectAll: false }, errors);
        // The one thing the tools leave to the child: a gate still waiting for its switch.
        expect(errors.filter((e) => !e.includes('has no switch'))).toEqual([]);
      }
    }
  });
});

describe('board undo', () => {
  it('undoes a whole stroke at once, and redoes it', () => {
    const blank = blankWorld();
    const first = applyTool(blank, 'wall', at(1, 1));
    const second = applyTool(first, 'wall', at(2, 1));
    let h = pushWorld(worldHistory(blank), first);
    h = amendWorld(h, second);
    expect(pushWorld(h, second)).toBe(h);
    expect(undoWorld(h).present).toBe(blank);
    expect(redoWorld(undoWorld(h)).present).toBe(second);
    expect(undoWorld(worldHistory(blank)).present).toBe(blank);
  });
});

describe('the board checker', () => {
  const blank = blankWorld();
  const goal = { reachGoal: true, collectAll: false };

  it('says nothing about a board that is fine', () => {
    expect(boardProblems(blank, goal)).toEqual([]);
  });

  it('says when the flag is walled off, and points at it', () => {
    const walled = taps(blank, ['wall', 3, 1], ['wall', 3, 2], ['wall', 3, 3], ['wall', 4, 1], ['wall', 4, 3]);
    expect(boardProblems(walled, goal)).toEqual([{ text: 'The robot cannot walk to the flag. Rocks or water are in the way.', cells: [at(4, 2)] }]);
    expect(reachable(walled, walled.robot).has('4,2')).toBe(false);
  });

  it('says when a shut gate has no switch, unless a card can open it', () => {
    const gated = applyTool(blank, 'gate', at(2, 2));
    expect(boardProblems(gated, goal)[0]!.text).toMatch(/^Gate A has no switch/);
    expect(boardProblems(gated, goal, ['openGate'])).toEqual([]);
    expect(boardProblems(applyTool(gated, 'switch', at(1, 1)), goal)).toEqual([]);
  });

  it('asks for acorns when the goal is to collect them', () => {
    const collect = { reachGoal: false, collectAll: true };
    expect(boardProblems(blank, collect)[0]!.text).toMatch(/no acorns/);
    const far = taps(blank, ['acorn', 4, 0], ['wall', 3, 0], ['wall', 4, 1]);
    expect(boardProblems(far, collect)).toEqual([{ text: 'The robot cannot walk to one of the acorns.', cells: [at(4, 0)] }]);
  });
});

describe('remix', () => {
  const levels = allLevels().map((c) => c.level);

  it('copies every level into a creation that stores and loads, and leaves the level as it was', () => {
    for (const level of levels) {
      const before = JSON.stringify(level);
      const remix = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...remixOf(level) };
      expect(remix.basedOn).toBe(level.id);
      expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(remix))), level.id)).toEqual(remix);
      // Changing the remix's board must not reach the level.
      remix.world.tiles[0]![0] = 'wall';
      remix.world.collectibles.push({ x: 0, y: 0 });
      expect(JSON.stringify(level)).toBe(before);
    }
  });

  it('carries the cards and drops the limits', () => {
    const reorder = levels.find((l) => l.programming.suppliedCards && l.programming.maxInstructions === undefined) ?? levels.find((l) => l.programming.suppliedCards)!;
    const remix = remixOf(reorder);
    for (const card of reorder.programming.suppliedCards!) expect(remix.programming.allowedCommands).toContain(card);
    expect(remix.programming).not.toHaveProperty('suppliedCards');
    expect(remix.programming).not.toHaveProperty('maxInstructions');
    expect(remix.programming).not.toHaveProperty('maxPerCommand');
  });

  it('gives a player the names and no cards', () => {
    expect(skeletonOf(['forward', { define: 'hop', do: ['forward'] }, { on: 'tick', do: ['wait'] }, { remember: 'count', kind: 'number', start: 0 }, { repeat: 2, do: ['forward'] }])).toEqual([
      { define: 'hop', do: [] },
      { on: 'tick', do: [] },
      { remember: 'count', kind: 'number', start: 0 },
    ]);
    expect(remixTitle('x'.repeat(60))).toHaveLength(40);
    expect(remixTitle('First step')).toBe('First step remix');
  });
});
