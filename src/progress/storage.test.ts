import { describe, expect, it } from 'vitest';
import { memoryStore, profilePrefix, scopedStore } from './storage';

describe('scopedStore', () => {
  it('keeps two profiles and the device apart', async () => {
    const device = memoryStore();
    const ada = scopedStore(device, profilePrefix('ada'));
    const max = scopedStore(device, profilePrefix('max'));
    await device.set('progress', 'guest');
    await ada.set('progress', 'ada');
    await max.set('progress', 'max');
    expect(await device.get('progress')).toBe('guest');
    expect(await ada.get('progress')).toBe('ada');
    expect(await max.get('progress')).toBe('max');
  });

  it('lists keys without the prefix', async () => {
    const device = memoryStore();
    const ada = scopedStore(device, profilePrefix('ada'));
    await device.set('creation:guest', 1);
    await ada.set('creation:one', 1);
    await ada.set('creation:two', 2);
    await ada.set('progress', 3);
    expect((await ada.keys('creation:')).sort()).toEqual(['creation:one', 'creation:two']);
  });

  it('clears and deletes only its own keys', async () => {
    const device = memoryStore();
    const ada = scopedStore(device, profilePrefix('ada'));
    const max = scopedStore(device, profilePrefix('max'));
    await device.set('progress', 'guest');
    await ada.set('progress', 'ada');
    await ada.set('drafts', {});
    await max.set('progress', 'max');
    await ada.delete('drafts');
    expect(await ada.keys('')).toEqual(['progress']);
    await ada.clear();
    expect(await ada.keys('')).toEqual([]);
    expect(await device.get('progress')).toBe('guest');
    expect(await max.get('progress')).toBe('max');
  });
});
