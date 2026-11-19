import { describe, expect, it } from 'vitest';
import type { Creation } from '../create/types';
import { memoryStore, type KeyValueStore } from '../progress/storage';
import { emptyLevelProgress, emptyProgress, type Progress } from '../progress/types';
import type { RemoteDoc } from './api';
import { isSynced, markDirty, SyncEngine, type SyncApi } from './engine';

/** A server in memory: documents with revisions, and the same conflict rule as the real one. */
function fakeServer() {
  const docs = new Map<string, RemoteDoc>();
  let rev = 0;
  let down = false;
  const pushes: string[] = [];
  const api: SyncApi = {
    async pull(since) {
      if (down) throw new Error('offline');
      const changed = [...docs.values()].filter((d) => d.rev > since).sort((a, b) => a.rev - b.rev);
      return { docs: structuredClone(changed), rev: changed.at(-1)?.rev ?? since };
    },
    async push(key, body) {
      if (down) throw new Error('offline');
      const current = docs.get(key);
      if (current && current.rev !== body.baseRev) return { conflict: structuredClone(current) };
      pushes.push(key);
      docs.set(key, { key, value: structuredClone(body.value), rev: ++rev, deleted: body.deleted === true });
      return { rev };
    },
  };
  return { api, docs, pushes, setDown: (v: boolean) => void (down = v) };
}

function device(server: ReturnType<typeof fakeServer>, now = () => 100) {
  const local = memoryStore();
  const engine = new SyncEngine(local, server.api, now);
  const pulled: string[][] = [];
  engine.onPulled = (keys) => pulled.push(keys);
  return { local, engine, store: engine.store, pulled };
}

const solved = (id: string) => ({ ...emptyLevelProgress(id), stars: { complete: true, noHints: true, budget: null }, attempts: 1, bestSteps: 3 });
const progressWith = (...ids: string[]): Progress => ({ ...emptyProgress(), levels: Object.fromEntries(ids.map((id) => [id, solved(id)])) });
const creation = (id: string, updatedAt: number, title = id) => ({ id, title, updatedAt, status: 'draft' }) as Creation;
const levelsOf = async (store: KeyValueStore) => Object.keys((await store.get<Progress>('progress'))?.levels ?? {}).sort();

describe('SyncEngine', () => {
  it('sends what changed here and brings it to another device', async () => {
    const server = fakeServer();
    const tablet = device(server);
    await tablet.store.set('progress', progressWith('one'));
    await tablet.store.set('creation:c-1', creation('c-1', 5));
    expect(tablet.engine.pending).toBe(true);
    await tablet.engine.sync();
    expect(tablet.engine.pending).toBe(false);

    const laptop = device(server);
    await laptop.engine.sync();
    expect(await levelsOf(laptop.local)).toEqual(['one']);
    expect(await laptop.local.get('creation:c-1')).toMatchObject({ id: 'c-1' });
    expect(laptop.pulled).toEqual([['progress', 'creation:c-1']]);
    expect(laptop.engine.pending).toBe(false);
  });

  it('keeps settings and the log on the device', async () => {
    const server = fakeServer();
    const tablet = device(server);
    await tablet.store.set('settings', { muted: true });
    await tablet.store.set('log', [{ t: 1 }]);
    await tablet.engine.sync();
    expect(server.docs.size).toBe(0);
    expect([isSynced('settings'), isSynced('log'), isSynced('sync:state')]).toEqual([false, false, false]);
  });

  it('joins two devices that each solved a level offline', async () => {
    const server = fakeServer();
    const tablet = device(server);
    const laptop = device(server);
    await tablet.store.set('progress', progressWith('one'));
    await laptop.store.set('progress', progressWith('two'));
    await tablet.engine.sync();
    await laptop.engine.sync();
    expect(await levelsOf(laptop.local)).toEqual(['one', 'two']);
    expect(Object.keys((server.docs.get('progress')!.value as Progress).levels).sort()).toEqual(['one', 'two']);
    await tablet.engine.sync();
    expect(await levelsOf(tablet.local)).toEqual(['one', 'two']);
  });

  it('settles: once both devices agree, nothing more is sent', async () => {
    const server = fakeServer();
    const tablet = device(server);
    const laptop = device(server);
    await tablet.store.set('progress', progressWith('one'));
    await laptop.store.set('progress', progressWith('two'));
    for (let i = 0; i < 2; i++) {
      await tablet.engine.sync();
      await laptop.engine.sync();
    }
    const sent = server.pushes.length;
    for (let i = 0; i < 3; i++) {
      await tablet.engine.sync();
      await laptop.engine.sync();
    }
    expect(server.pushes.length).toBe(sent);
  });

  it('waits out an offline spell and sends when the server is back', async () => {
    const server = fakeServer();
    const tablet = device(server);
    server.setDown(true);
    await tablet.store.set('progress', progressWith('one'));
    await expect(tablet.engine.sync()).rejects.toThrow('offline');
    expect(tablet.engine.pending).toBe(true);
    // A fresh engine on the same storage still knows what is owed.
    const restarted = new SyncEngine(tablet.local, server.api);
    server.setDown(false);
    await restarted.sync();
    expect(server.docs.has('progress')).toBe(true);
    expect(restarted.pending).toBe(false);
  });

  it('carries the newer copy of a creation, whichever device has it', async () => {
    const server = fakeServer();
    const tablet = device(server);
    const laptop = device(server);
    await tablet.store.set('creation:c-1', creation('c-1', 5, 'first'));
    await tablet.engine.sync();
    await laptop.engine.sync();
    await laptop.store.set('creation:c-1', creation('c-1', 9, 'later'));
    await tablet.store.set('creation:c-1', creation('c-1', 7, 'middle'));
    await laptop.engine.sync();
    await tablet.engine.sync();
    expect(await tablet.local.get('creation:c-1')).toMatchObject({ title: 'later' });
    expect(server.docs.get('creation:c-1')!.value).toMatchObject({ title: 'later' });
  });

  it('throws a creation away on the other device too', async () => {
    const server = fakeServer();
    const tablet = device(server, () => 50);
    const laptop = device(server);
    await tablet.store.set('creation:c-1', creation('c-1', 5));
    await tablet.engine.sync();
    await laptop.engine.sync();
    await tablet.store.delete('creation:c-1');
    await tablet.engine.sync();
    expect(server.docs.get('creation:c-1')).toMatchObject({ deleted: true, value: { deleted: true, at: 50 } });
    await laptop.engine.sync();
    expect(await laptop.local.get('creation:c-1')).toBeUndefined();
    expect(laptop.pulled.at(-1)).toEqual(['creation:c-1']);
  });

  it('keeps a creation that was changed after the other device threw it away', async () => {
    const server = fakeServer();
    const tablet = device(server, () => 50);
    const laptop = device(server);
    await tablet.store.set('creation:c-1', creation('c-1', 5));
    await tablet.engine.sync();
    await laptop.engine.sync();
    await tablet.store.delete('creation:c-1');
    await laptop.store.set('creation:c-1', creation('c-1', 80, 'kept'));
    await tablet.engine.sync();
    await laptop.engine.sync();
    expect(await laptop.local.get('creation:c-1')).toMatchObject({ title: 'kept' });
    await tablet.engine.sync();
    expect(await tablet.local.get('creation:c-1')).toMatchObject({ title: 'kept' });
  });

  it('leaves the server alone when progress is erased on one device', async () => {
    const server = fakeServer();
    const tablet = device(server);
    await tablet.store.set('progress', progressWith('one'));
    await tablet.engine.sync();
    await tablet.store.delete('progress');
    await tablet.engine.sync();
    expect(server.docs.get('progress')).toMatchObject({ deleted: false });
    expect(tablet.engine.pending).toBe(false);
  });

  it('does not lose a change made while it was sending', async () => {
    const server = fakeServer();
    const tablet = device(server);
    await tablet.store.set('drafts', { one: [] });
    const push = server.api.push;
    let first = true;
    server.api.push = async (key, body) => {
      if (first) {
        first = false;
        await tablet.store.set('drafts', { one: [], two: [] });
      }
      return push(key, body);
    };
    await tablet.engine.sync();
    // The first send carried the old copy; the engine noticed and sent again.
    expect(server.pushes).toEqual(['drafts', 'drafts']);
    expect(server.docs.get('drafts')!.value).toEqual({ one: [], two: [] });
    expect(tablet.engine.pending).toBe(false);
  });

  it('sends documents marked while no engine was running', async () => {
    const server = fakeServer();
    const local = memoryStore();
    await local.set('progress', progressWith('one'));
    await local.set('log', []);
    await markDirty(local, ['progress', 'log']);
    await new SyncEngine(local, server.api).sync();
    expect([...server.docs.keys()]).toEqual(['progress']);
  });

  it('folds calls made during a run into one more run', async () => {
    const server = fakeServer();
    const tablet = device(server);
    await tablet.store.set('progress', progressWith('one'));
    await Promise.all([tablet.engine.sync(), tablet.engine.sync(), tablet.engine.sync()]);
    expect(server.pushes).toEqual(['progress']);
  });
});
