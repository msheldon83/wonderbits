import { describe, expect, it } from 'vitest';
import { conditionsFor, needsOf, paletteFor, slotTests } from '../editor/palette';
import { newSlot } from '../editor/OwnNames';
import { sequentialIdFactory } from '../ir/ids';
import { applyOp, nameProblem } from '../ir/ops';
import { programFromSpec, programSpec, usesRandom } from '../ir/program';
import { skeletonOf, type NodeSpec } from '../ir/spec';
import { interpretAll } from '../runtime/interpreter';
import { validateWorld } from '../lessons/validate';
import { memoryStore } from '../progress/storage';
import { blankCreation, blankWorld } from './blank';
import { cardsForSlot, cardsGained, CREATION_CARDS, CREATION_SOURCES, inPaletteOrder, withCreationRules } from './cards';
import { applyKit, hasKit, KITS } from './kits';
import { creationToJson, parseCreation } from './parse';
import { CreationStore } from './store';
import type { Creation } from './types';
import { remixOf } from './remix';
import { allLevels } from '../app/levels';
import { isRandomLevel } from '../lessons/checks';
import { applyStroke, applyTool, canExtend, drawMover, nextCell, pathOf, removeMover, routeOf, stepMover, stepsOf, unstepMover } from './worldOps';

const ir = (spec: NodeSpec[]) => programFromSpec(spec, sequentialIdFactory());
const at = (x: number, y: number) => ({ x, y });
const whole = (c: ReturnType<typeof blankCreation>): Creation => ({ schemaVersion: 1, id: 'c-1', createdAt: 1, updatedAt: 1, ...c });

describe('names of the child\'s own', () => {
  it('holds a name to the rule, kindly', () => {
    const p = ir([{ define: 'hop', do: [] }, { remember: 'count', kind: 'number', start: 0 }]);
    expect(nameProblem(p, 'bigJump')).toBeNull();
    expect(nameProblem(p, '')).toMatch(/Type a name/);
    expect(nameProblem(p, 'Big jump')).toMatch(/starts with a small letter/);
    expect(nameProblem(p, '2fast')).toMatch(/starts with a small letter/);
    expect(nameProblem(p, 'a'.repeat(21))).toMatch(/too long/);
    expect(nameProblem(p, 'hop')).toMatch(/already something named hop/);
    expect(nameProblem(p, 'count')).toMatch(/already something named count/);
    for (const taken of ['main', 'forward', 'repeat', 'here', 'if', 'acorns']) expect(nameProblem(p, taken)).toMatch(/already uses the word/);
  });

  it('adds and removes a function, and keeps one a card still calls', () => {
    let p = applyOp(ir(['forward']), { op: 'addFunction', name: 'hop' });
    expect(programSpec(p)).toContainEqual({ define: 'hop', do: [] });
    expect(() => applyOp(p, { op: 'addFunction', name: 'hop' })).toThrow(/already something named hop/);
    expect(() => applyOp(p, { op: 'addFunction', name: 'Hop!' })).toThrow();
    p = applyOp(p, { op: 'insert', at: { parent: null, branch: 'body', index: 1 }, node: { id: 'call1', kind: 'call', name: 'hop' } });
    expect(() => applyOp(p, { op: 'removeFunction', name: 'hop' })).toThrow(/still used/);
    p = applyOp(p, { op: 'delete', id: 'call1' });
    expect(programSpec(applyOp(p, { op: 'removeFunction', name: 'hop' }))).toEqual(['forward']);
    expect(() => applyOp(p, { op: 'removeFunction', name: 'main' })).toThrow();
  });

  it('adds and removes a When card', () => {
    let p = applyOp(ir([]), { op: 'addHandler', event: 'acorn' });
    expect(programSpec(p)).toEqual([{ on: 'acorn', do: [] }]);
    expect(() => applyOp(p, { op: 'addHandler', event: 'acorn' })).toThrow(/already a When card/);
    expect(() => applyOp(p, { op: 'addHandler', event: 'earthquake' })).toThrow(/No event/);
    p = applyOp(p, { op: 'removeHandler', event: 'acorn' });
    expect(p.handlers).toEqual([]);
    expect(() => applyOp(p, { op: 'removeHandler', event: 'acorn' })).toThrow();
  });

  it('makes an empty slot of the kind asked for', () => {
    expect(newSlot('steps', 'number', false)).toEqual({ name: 'steps', kind: 'number', start: 0 });
    expect(newSlot('route', 'list:direction', false)).toEqual({ name: 'route', kind: 'list', of: 'direction', start: [] });
    expect(newSlot('total', 'number', true)).toEqual({ name: 'total', kind: 'number', start: 0, keep: true });
  });

  it('keeps the names and drops the cards for a fresh start', () => {
    expect(skeletonOf(['forward', { define: 'hop', do: ['forward'] }, { remember: 'count', kind: 'number', start: 0 }])).toEqual([{ define: 'hop', do: [] }, { remember: 'count', kind: 'number', start: 0 }]);
  });
});

describe('the palette where the child names the memory', () => {
  const open = { allowedCommands: ['forward', 'set', 'change', 'face', 'push', 'forEach', 'fly'] as const, starterProgram: [], ownNames: true };
  const rules = { ...open, allowedCommands: [...open.allowedCommands] };

  it('rests a card until the robot remembers something it can work on', () => {
    const empty = paletteFor(rules, ir([]));
    expect(empty.entries.filter((e) => !e.available).map((e) => `${e.command}: ${e.needs}`)).toEqual(['set: something to remember', 'change: a number', 'face: a direction', 'push: a list', 'forEach: a list', 'fly: a place']);
    const some = paletteFor(rules, ir([{ remember: 'count', kind: 'number', start: 0 }, { remember: 'route', kind: 'list', of: 'direction', start: [] }]));
    expect(some.entries.filter((e) => !e.available).map((e) => `${e.command}: ${e.needs}`)).toEqual(['face: a direction', 'forEach: a direction to hold each item', 'fly: a place']);
    expect(needsOf('forward', [])).toBeNull();
    // A level names its own memory: nothing rests there.
    expect(paletteFor({ ...rules, ownNames: false }, ir([])).entries.every((e) => e.available)).toBe(true);
  });

  it('offers every test of what is remembered', () => {
    const memory = ir([{ remember: 'count', kind: 'number', start: 0 }, { remember: 'found', kind: 'yesNo', start: false }, { remember: 'way', kind: 'direction', start: 'N' }, { remember: 'spot', kind: 'position', start: { x: 0, y: 0 } }, { remember: 'route', kind: 'list', of: 'number', start: [] }]).memory!;
    expect(slotTests(memory)).toHaveLength(10 + 2 + 4 + 1);
    expect(conditionsFor(rules, memory)).toContain('slot:count=7');
    expect(conditionsFor(rules, memory)).toContain('pathAhead');
    expect(conditionsFor({ ...rules, ownNames: false }, memory)).not.toContain('slot:count=7');
  });

  it('brings the cards of a part when it is added, once', () => {
    const before = ir(['forward']);
    const after = ir(['forward', { define: 'hop', do: [] }, { remember: 'count', kind: 'number', start: 0 }, { remember: 'route', kind: 'list', of: 'direction', start: [] }]);
    expect(cardsGained(before, after, ['forward'])).toEqual(['call', 'set', 'change', 'push', 'forEach']);
    expect(cardsGained(before, after, ['forward', 'set', 'call'])).toEqual(['change', 'push', 'forEach']);
    // Nothing new, nothing gained: a card switched off stays off.
    expect(cardsGained(after, after, ['forward'])).toEqual([]);
    expect(cardsForSlot({ kind: 'position' })).toEqual(['set', 'fly']);
    expect(inPaletteOrder(['set', 'forward', 'unlock', 'repeat'])).toEqual(['forward', 'repeat', 'set', 'unlock']);
    expect(new Set(CREATION_CARDS).size).toBe(CREATION_CARDS.length);
  });
});

describe('kits', () => {
  const blank = blankCreation('Mine');

  it('each adds its cards and named parts to a creation that still stores and loads', () => {
    for (const kit of KITS) {
      expect(hasKit(blank, kit)).toBe(false);
      const made = whole({ ...blank, ...applyKit(blank, kit) });
      expect(hasKit(made, kit)).toBe(true);
      for (const card of kit.cards) expect(made.programming.allowedCommands).toContain(card);
      expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(made))), kit.id)).toEqual(made);
      // The maker's program still builds, with its new parts.
      expect(() => ir(made.program)).not.toThrow();
      // Adding it again changes nothing.
      expect(applyKit(made, kit)).toEqual({ programming: made.programming, program: made.program, ...(made.days !== undefined && { days: made.days }) });
    }
  });

  it('all together make one creation, with every card a kit brings in the universe', () => {
    const all = KITS.reduce((c, kit) => ({ ...c, ...applyKit(c, kit) }), blank);
    const made = whole(all);
    expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(made))), 'all')).toEqual(made);
    expect(made.days).toBe(2);
    expect(made.programming.allowedSources).toEqual([...CREATION_SOURCES, 'acornsLeft']);
    for (const card of made.programming.allowedCommands) expect(CREATION_CARDS).toContain(card);
    expect(new Set(KITS.map((k) => k.id)).size).toBe(KITS.length);
  });

  it('keeps the maker\'s cards and leaves a taken name alone', () => {
    const mine = { ...blank, program: ['forward', { remember: 'count', kind: 'yesNo', start: true }] as NodeSpec[] };
    const counter = KITS.find((k) => k.id === 'counter')!;
    expect(applyKit(mine, counter).program).toEqual(mine.program);
    const trick = KITS.find((k) => k.id === 'trick')!;
    expect(applyKit(mine, trick).program).toEqual([{ define: 'trick', do: [] }, ...mine.program]);
  });

  it('the counter kit runs: count the steps and stop at three', () => {
    const counter = KITS.find((k) => k.id === 'counter')!;
    const made = applyKit(blank, counter);
    const program = ir([...made.program, { until: 'slot:count=3', do: ['forward', { change: 'count', by: 1 }] }, 'forward']);
    const run = interpretAll({ program, world: blankWorld(), objective: blank.objective, limits: { maxSteps: 1000 } });
    expect(run.outcome.status).toBe('success');
    expect(run.final.memory).toEqual({ count: 3 });
  });

  it('the backpack kit runs over two days and keeps what is in it', () => {
    const backpack = KITS.find((k) => k.id === 'backpack')!;
    const made = applyKit(blank, backpack);
    const program = ir([...made.program, { change: 'kept', by: 1 }, 'forward', 'forward', 'forward', 'forward']);
    const run = interpretAll({ program, world: blankWorld(), objective: blank.objective, limits: { maxSteps: 1000 }, days: made.days! });
    expect(run.outcome.status).toBe('success');
    expect(run.final.memory).toEqual({ kept: 2 });
  });
});

describe('creations made before names could be added', () => {
  it('gain the ability when they load', async () => {
    const storage = memoryStore();
    const old = whole({ ...blank(), programming: { allowedCommands: ['forward'], starterProgram: [] } });
    await storage.set('creation:c-1', creationToJson(old));
    const store = new CreationStore(storage);
    await store.load();
    expect(store.get('c-1')?.programming.ownNames).toBe(true);
    expect(store.get('c-1')?.programming.allowedSources).toEqual([...CREATION_SOURCES]);
  });
  function blank() {
    return blankCreation('Old');
  }
});

describe('plates, beetles and logs on the board', () => {
  const blank = blankWorld(); // robot (0,2), flag (4,2)

  it('puts plates down by number and picks them up', () => {
    let w = applyTool(applyTool(blank, 'plate', at(1, 1)), 'plate', at(2, 1));
    expect(w.plates).toEqual([{ id: '1', x: 1, y: 1 }, { id: '2', x: 2, y: 1 }]);
    w = applyTool(w, 'plate', at(1, 1));
    expect(w.plates).toEqual([{ id: '2', x: 2, y: 1 }]);
    // The freed number is used again.
    expect(applyTool(w, 'plate', at(3, 3)).plates!.map((p) => p.id)).toEqual(['2', '1']);
    expect(applyTool(blank, 'plate', at(0, 2))).toBe(blank);
  });

  it('turns a way out into a round, and back', () => {
    const line = [at(1, 0), at(2, 0), at(3, 0)];
    expect(pathOf(line)).toEqual([at(1, 0), at(2, 0), at(3, 0), at(2, 0)]);
    expect(routeOf(pathOf(line))).toEqual(line);
    expect(pathOf([at(1, 0)])).toEqual([at(1, 0)]);
    expect(routeOf(pathOf([at(1, 0), at(2, 0)]))).toEqual([at(1, 0), at(2, 0)]);
    const ring = [at(1, 0), at(2, 0), at(2, 1), at(1, 1)];
    expect(pathOf(ring)).toEqual(ring);
    expect(routeOf(ring)).toEqual(ring);
    const long = [at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)];
    expect(routeOf(pathOf(long))).toEqual(long);
  });

  it('draws a beetle\'s patrol with one stroke, and a second beetle with the next', () => {
    let w = applyStroke(blank, 'beetle', at(1, 0), true);
    w = applyStroke(w, 'beetle', at(2, 0), false);
    w = applyStroke(w, 'beetle', at(3, 0), false);
    expect(w.movers).toEqual([{ id: 'beetle1', kind: 'beetle', path: [at(1, 0), at(2, 0), at(3, 0), at(2, 0)] }]);
    // A stroke does not jump: a tile that is not next is ignored.
    expect(applyStroke(w, 'beetle', at(3, 4), false)).toBe(w);
    // A fresh touch elsewhere is another beetle; a fresh touch on the next tile walks the last one on.
    expect(applyStroke(w, 'beetle', at(1, 4), true).movers).toHaveLength(2);
    expect(applyStroke(w, 'beetle', at(4, 0), true).movers![0]!.path).toHaveLength(6);
    // Not on the robot, not on water, and a log only on water.
    expect(drawMover(blank, 'beetle', at(0, 2), true)).toBe(blank);
    expect(drawMover(blank, 'log', at(1, 1), true)).toBe(blank);
    const river = applyTool(applyTool(blank, 'gap', at(1, 1)), 'gap', at(1, 2));
    expect(drawMover(drawMover(river, 'log', at(1, 1), true), 'log', at(1, 2), false).movers).toEqual([{ id: 'log1', kind: 'log', path: [at(1, 1), at(1, 2)] }]);
  });

  it('erases a mover by any tile of its path, and loses a beetle the robot is put on', () => {
    let w = applyStroke(blank, 'beetle', at(1, 0), true);
    w = applyStroke(w, 'beetle', at(2, 0), false);
    expect(applyTool(w, 'erase', at(2, 0))).not.toHaveProperty('movers');
    expect(applyTool(w, 'robot', at(1, 0))).not.toHaveProperty('movers');
    expect(applyTool(w, 'robot', at(2, 0)).movers).toHaveLength(1);
  });

  it('whatever is drawn, the board stays one the simulation can run', () => {
    const tools = ['floor', 'wall', 'gap', 'plate', 'beetle', 'log', 'erase', 'robot', 'flag', 'acorn'] as const;
    let seed = 11;
    const pick = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    for (let round = 0; round < 40; round++) {
      let w = blankWorld(3 + pick(4), 3 + pick(4));
      for (let i = 0; i < 80; i++) {
        w = applyStroke(w, tools[pick(tools.length)]!, at(pick(w.width), pick(w.height)), pick(3) === 0);
        const errors: string[] = [];
        validateWorld(w, { reachGoal: true, collectAll: false }, errors);
        expect(errors).toEqual([]);
      }
    }
  });
});

describe('random values', () => {
  it('are offered on every creation: a new island, a remix, with the level\'s own sources kept', () => {
    expect(blankCreation('Mine').programming.allowedSources).toEqual([...CREATION_SOURCES]);
    expect(isRandomLevel(blankCreation('Mine'))).toBe(true);
    const bird = allLevels().find((c) => c.level.programming.allowedSources?.includes('acornsLeft'))!.level;
    const remix = remixOf(bird);
    expect(remix.programming.allowedSources).toEqual([...bird.programming.allowedSources!, ...CREATION_SOURCES.filter((s) => !bird.programming.allowedSources!.includes(s))]);
    expect(withCreationRules(withCreationRules({ allowedCommands: ['forward'], starterProgram: [] })).allowedSources).toEqual([...CREATION_SOURCES]);
  });

  it('make a program random only once a card takes one', () => {
    const slot: NodeSpec = { remember: 'roll', kind: 'number', start: 0 };
    expect(usesRandom(ir([slot, { set: 'roll', to: 3 }, 'forward']))).toBe(false);
    expect(usesRandom(ir([slot, { repeat: 2, do: [{ set: 'roll', to: 'random:1-6' }] }]))).toBe(true);
    expect(usesRandom(ir([{ remember: 'heads', kind: 'yesNo', start: false }, { define: 'flip', do: [{ set: 'heads', to: 'coin' }] }]))).toBe(true);
  });

  it('a roll runs, the same for the same seed', () => {
    const program = ir([{ remember: 'roll', kind: 'number', start: 0 }, { set: 'roll', to: 'random:1-6' }, 'forward', 'forward', 'forward', 'forward']);
    const run = (seed: number) => interpretAll({ program, world: blankWorld(), objective: { reachGoal: true, collectAll: false }, limits: { maxSteps: 1000 }, seed });
    expect(run(5).outcome.status).toBe('success');
    expect(run(5).final.memory).toEqual(run(5).final.memory);
    const rolls = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) => (run(seed).final.memory as { roll: number }).roll));
    expect([...rolls].every((r) => r >= 1 && r <= 6)).toBe(true);
    expect(rolls.size).toBeGreaterThan(2);
  });
});

describe('a mover\'s steps', () => {
  const blank = blankWorld();
  const placed = applyStroke(blank, 'beetle', at(1, 0), true);
  const beetle = (w: typeof blank) => w.movers![0]!;

  it('are added one at a time, by direction, and taken back', () => {
    expect(stepsOf(beetle(placed))).toEqual([]);
    let w = stepMover(placed, 'beetle1', 'E');
    w = stepMover(w, 'beetle1', 'E');
    w = stepMover(w, 'beetle1', 'S');
    expect(stepsOf(beetle(w))).toEqual(['E', 'E', 'S']);
    expect(beetle(w).path).toEqual([at(1, 0), at(2, 0), at(3, 0), at(3, 1), at(3, 0), at(2, 0)]);
    w = unstepMover(w, 'beetle1');
    expect(stepsOf(beetle(w))).toEqual(['E', 'E']);
    expect(unstepMover(placed, 'beetle1')).toBe(placed);
    expect(stepMover(placed, 'nobody', 'E')).toBe(placed);
  });

  it('cannot step off the board, onto the wrong ground, or back over its own path', () => {
    expect(canExtend(placed, beetle(placed), nextCell(beetle(placed), 'N'))).toBe(false);
    expect(stepMover(placed, 'beetle1', 'N')).toBe(placed);
    const wet = applyTool(placed, 'gap', at(2, 0));
    expect(stepMover(wet, 'beetle1', 'E')).toBe(wet);
    const out = stepMover(placed, 'beetle1', 'E');
    expect(stepMover(out, 'beetle1', 'W')).toBe(out);
  });

  it('is removed by name', () => {
    expect(removeMover(placed, 'beetle1')).not.toHaveProperty('movers');
    expect(removeMover(placed, 'nobody')).toEqual(placed);
  });
});
