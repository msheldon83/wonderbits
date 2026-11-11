import { describe, expect, it } from 'vitest';
import { hashFor, parseRoute } from '../app/levels';
import { ContentError } from '../lessons/parse';
import { memoryStore } from '../progress/storage';
import { ProgressStore } from '../progress/store';
import { blankCreation, blankWorld } from './blank';
import { nextTitle } from './CreateScreen';
import { creationToJson, parseCreation, worldToJson } from './parse';
import { cleanTitle, CreationStore } from './store';
import type { Creation } from './types';

const issuesOf = (json: unknown): string[] => {
  try {
    parseCreation(json, 'test');
  } catch (e) {
    if (e instanceof ContentError) return e.issues;
    throw e;
  }
  return [];
};

const sample = (): Creation => ({
  schemaVersion: 1,
  id: 'c-1',
  createdAt: 10,
  updatedAt: 20,
  ...blankCreation('My island'),
  world: { ...blankWorld(4, 3), collectibles: [{ x: 1, y: 0 }], gates: [{ id: 'a', x: 2, y: 1, open: false }], switches: [{ x: 1, y: 2, toggles: ['a'] }] },
  program: ['forward', { repeat: 2, do: ['forward'] }],
});

describe('creations as stored JSON', () => {
  it('writes the board as a level file does', () => {
    const world = blankWorld(3, 2);
    world.tiles[0]![1] = 'wall';
    world.tiles[1]![2] = 'gap';
    expect(worldToJson(world).rows).toEqual(['.#.', '.._']);
  });

  it('comes back from storage the same', () => {
    const c = sample();
    expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(c))), 'test')).toEqual(c);
    const proved: Creation = { ...c, status: 'proved', proof: { solution: ['forward', 'forward', 'forward'], steps: 3, provedAt: 30 } };
    expect(parseCreation(JSON.parse(JSON.stringify(creationToJson(proved))), 'test')).toEqual(proved);
  });

  it('rejects what is not a creation, naming where', () => {
    const good = creationToJson(sample());
    expect(issuesOf(null)).toEqual(['$: expected an object']);
    expect(issuesOf({ ...good, schemaVersion: 2 })).toContain('schemaVersion: expected 1');
    expect(issuesOf({ ...good, title: '' })[0]).toMatch(/^title:/);
    expect(issuesOf({ ...good, title: 'x'.repeat(41) })[0]).toMatch(/^title:/);
    expect(issuesOf({ ...good, world: { ...(good.world as object), rows: ['.x.', '...'] } })[0]).toMatch(/^world\.rows\[0\]\[1\]/);
    expect(issuesOf({ ...good, program: ['fly away'] })[0]).toMatch(/^program\[0\]/);
    expect(issuesOf({ ...good, programming: { allowedCommands: ['teleport'] } })[0]).toMatch(/^programming\.allowedCommands/);
    expect(issuesOf({ ...good, status: 'proved' })).toContain('status: a proved creation needs its proof');
    const wide = blankWorld(17, 3);
    expect(issuesOf({ ...good, world: worldToJson(wide) }).join()).toMatch(/1 to 16 tiles/);
  });
});

describe('the creation store', () => {
  it('keeps each creation as its own document and loads them back, newest first', async () => {
    const storage = memoryStore();
    let t = 100;
    let n = 0;
    const store = new CreationStore(storage, () => t++, () => `c-${++n}`);
    await store.load();
    expect(store.getSnapshot()).toEqual({ loaded: true, creations: [] });
    const a = store.add(blankCreation('  First   island '));
    const b = store.add(blankCreation('Second'));
    expect(a.title).toBe('First island');
    expect(await storage.keys('creation:')).toEqual(['creation:c-1', 'creation:c-2']);
    store.update(a.id, { program: ['forward'] });
    expect(store.getSnapshot().creations.map((c) => c.id)).toEqual([a.id, b.id]);

    const again = new CreationStore(storage);
    await again.load();
    expect(again.getSnapshot().creations.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(again.get(a.id)?.program).toEqual(['forward']);

    store.remove(b.id);
    expect(await storage.keys('creation:')).toEqual(['creation:c-1']);
    expect(store.update('gone', { title: 'x' })).toBeUndefined();
  });

  it('notifies subscribers, and a blank name keeps the old one', async () => {
    const store = new CreationStore(memoryStore());
    await store.load();
    let calls = 0;
    store.subscribe(() => calls++);
    const c = store.add(blankCreation('Maze'));
    expect(store.update(c.id, { title: '   ' })?.title).toBe('Maze');
    expect(calls).toBe(2);
  });

  it('leaves a stored document it cannot read alone', async () => {
    const storage = memoryStore();
    await storage.set('creation:broken', { nonsense: true });
    const store = new CreationStore(storage);
    await store.load();
    expect(store.getSnapshot().creations).toEqual([]);
    expect(store.unreadable).toEqual(['creation:broken']);
    expect(await storage.get('creation:broken')).toEqual({ nonsense: true });
  });

  it('names new things apart', () => {
    expect(cleanTitle('')).toBe('My island');
    expect(nextTitle([])).toBe('My island');
    expect(nextTitle([sample(), { ...sample(), title: 'My island 2' }])).toBe('My island 3');
  });
});

describe('creation and progress share storage', () => {
  it('resetting progress keeps what the child made, and saved places are kept until then', async () => {
    const storage = memoryStore();
    const creations = new CreationStore(storage);
    const progress = new ProgressStore(storage);
    await Promise.all([creations.load(), progress.load()]);
    const c = creations.add(blankCreation('Keep me'));
    progress.saveDraft('l1', ['forward', 'rotateCW']);
    progress.log({ levelId: c.id, kind: 'creation-started' });
    expect(progress.getSnapshot().progress.levels).toEqual({});

    const later = new ProgressStore(storage);
    await later.load();
    expect(later.draft('l1')).toEqual(['forward', 'rotateCW']);
    later.clearDraft('l1');
    expect(later.draft('l1')).toBeUndefined();

    progress.saveDraft('l2', ['forward']);
    await progress.reset();
    expect(progress.draft('l2')).toBeUndefined();
    expect(progress.getSnapshot().log).toEqual([]);
    const after = new CreationStore(storage);
    await after.load();
    expect(after.get(c.id)?.title).toBe('Keep me');
  });
});

describe('creation routes', () => {
  it('round-trip', () => {
    expect(parseRoute('#/create')).toEqual({ screen: 'create' });
    expect(parseRoute('#/create/c-1')).toEqual({ screen: 'make', id: 'c-1' });
    expect(hashFor({ screen: 'create' })).toBe('#/create');
    expect(hashFor({ screen: 'make', id: 'c-1' })).toBe('#/create/c-1');
  });
});
