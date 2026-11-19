import { describe, expect, it } from 'vitest';
import { memoryStore, profilePrefix, scopedStore } from '../progress/storage';
import { emptyLevelProgress, emptyProgress, type Progress } from '../progress/types';
import { SyncEngine, type SyncApi } from '../sync/engine';
import { ago } from './GrownupScreen';
import { dismissGuestProgress, hasGuestProgress, importGuestProgress } from './guest';
import { parseAccountRoute } from './Root';
import { deviceName } from './session';

const solved = (id: string) => ({ ...emptyLevelProgress(id), stars: { complete: true, noHints: false, budget: null }, attempts: 2, bestSteps: 4 });
const progressWith = (...ids: string[]): Progress => ({ ...emptyProgress(), levels: Object.fromEntries(ids.map((id) => [id, solved(id)])) });

describe('account addresses', () => {
  it('are told apart from the game’s', () => {
    expect(parseAccountRoute('#/grownup')).toEqual({ screen: 'grownup' });
    expect(parseAccountRoute('#/grownup/signin/abc-DEF_1')).toEqual({ screen: 'grownup', token: 'abc-DEF_1' });
    expect(parseAccountRoute('#/who')).toEqual({ screen: 'who' });
    expect(parseAccountRoute('#/pair')).toEqual({ screen: 'pair' });
    expect(parseAccountRoute('#/privacy')).toEqual({ screen: 'privacy' });
    for (const game of ['', '#/', '#/settings', '#/level/forest-1', '#/create/c-1', '#/grownup/else']) expect(parseAccountRoute(game)).toBeNull();
  });
});

describe('progress from before sign-in', () => {
  it('is noticed only when there is some', async () => {
    const device = memoryStore();
    expect(await hasGuestProgress(device)).toBe(false);
    await device.set('progress', emptyProgress());
    expect(await hasGuestProgress(device)).toBe(false);
    await device.set('creation:c-1', { id: 'c-1' });
    expect(await hasGuestProgress(device)).toBe(true);
    await dismissGuestProgress(device);
    expect(await hasGuestProgress(device)).toBe(false);
  });

  it('joins a child’s profile without losing what they have, and is sent up next time', async () => {
    const device = memoryStore();
    await device.set('progress', progressWith('one', 'two'));
    await device.set('drafts', { three: [] });
    await device.set('creation:c-guest', { id: 'c-guest', updatedAt: 1 });
    await device.set('log', [{ t: 1, levelId: 'one', kind: 'level-opened' }]);
    const child = scopedStore(device, profilePrefix('robin'));
    await child.set('progress', progressWith('two', 'nine'));

    await importGuestProgress(device, 'robin');

    expect(Object.keys((await child.get<Progress>('progress'))!.levels).sort()).toEqual(['nine', 'one', 'two']);
    expect(await child.get('drafts')).toEqual({ three: [] });
    expect(await child.get('creation:c-guest')).toMatchObject({ id: 'c-guest' });
    expect(await child.get('log')).toHaveLength(1);
    // The device's own copy is left as it was, and the offer is not made again.
    expect(Object.keys((await device.get<Progress>('progress'))!.levels).sort()).toEqual(['one', 'two']);
    expect(await hasGuestProgress(device)).toBe(false);

    const pushed: string[] = [];
    const api: SyncApi = {
      pull: async (since) => ({ docs: [], rev: since }),
      push: async (key) => {
        pushed.push(key);
        return { rev: pushed.length };
      },
    };
    await new SyncEngine(child, api).sync();
    expect(pushed.sort()).toEqual(['creation:c-guest', 'drafts', 'progress']);
  });
});

describe('small words', () => {
  it('name a device a grown-up will recognise', () => {
    expect(deviceName('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('iPad');
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe('Mac');
    expect(deviceName('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 0)).toBe('Chromebook');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)', 5)).toBe('Android tablet');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('Windows computer');
    expect(deviceName('something else', 0)).toBe('A device');
  });

  it('say how long ago', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(ago(null, now)).toBe('not yet');
    expect(ago('2026-11-19T08:00:00Z', now)).toBe('today');
    expect(ago('2026-11-18T08:00:00Z', now)).toBe('yesterday');
    expect(ago('2026-11-14T08:00:00Z', now)).toBe('5 days ago');
  });
});
