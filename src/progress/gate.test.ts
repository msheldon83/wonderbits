import { describe, expect, it } from 'vitest';
import { whatYouLearn } from '../app/WelcomeScreen';
import { loadPacks } from '../lessons/content';
import type { PuzzleDefinition } from '../lessons/types';
import { memoryStore } from './storage';
import { ProgressStore } from './store';

const levels = ['a1', 'a2', 'b1', 'b2'].map((id) => ({ id, stars: {}, curriculum: { activity: 'build' } }) as unknown as PuzzleDefinition);

async function store(open: string[] | null) {
  const s = new ProgressStore(memoryStore());
  s.setLevels(levels);
  s.setOpenLevels(open);
  await s.load();
  return s;
}
const solve = (s: ProgressStore, levelId: string) => s.complete({ levelId, usedHints: false, steps: 1, budget: undefined });

describe('levels that wait for an account', () => {
  it('are none, unless some are named as open', async () => {
    const s = await store(null);
    expect(levels.map((l) => s.needsAccount(l.id))).toEqual([false, false, false, false]);
    expect(levels.every((l) => s.isUnlocked(l.id))).toBe(true);
  });

  it('are closed whatever else is true: the grown-up’s setting, or a star already earned', async () => {
    const s = await store(['a1', 'a2']);
    // "Open every level" is on by default, and opens the open island only.
    expect(levels.map((l) => s.isUnlocked(l.id))).toEqual([true, true, false, false]);
    expect(levels.map((l) => s.needsAccount(l.id))).toEqual([false, false, true, true]);
    solve(s, 'a2');
    solve(s, 'b1');
    expect(s.isUnlocked('b1')).toBe(false);
    expect(s.isUnlocked('b2')).toBe(false);
    // The star is kept for when someone signs in.
    expect(s.levelProgress('b1').stars.complete).toBe(true);
  });

  it('leave the open levels to the usual order', async () => {
    const s = await store(['a1', 'a2']);
    s.updateSettings({ openAllLevels: false });
    expect(s.isUnlocked('a1')).toBe(true);
    expect(s.isUnlocked('a2')).toBe(false);
    solve(s, 'a1');
    expect(s.isUnlocked('a2')).toBe(true);
    expect(s.isUnlocked('b1')).toBe(false);
  });

  it('open again when the limit is lifted', async () => {
    const s = await store(['a1']);
    expect(s.isUnlocked('b2')).toBe(false);
    s.setOpenLevels(null);
    expect(s.isUnlocked('b2')).toBe(true);
  });
});

describe('what the welcome screen says you will learn', () => {
  it('follows the islands, in order, each idea once', () => {
    const packs = [
      { manifest: { title: 'Forest', concepts: ['sequencing'] } },
      { manifest: { title: 'Forest trails', concepts: ['sequencing'] } },
      { manifest: { title: 'Around and around', concepts: ['loops'] } },
      { manifest: { title: 'Brand new island', concepts: ['something-new'] } },
    ] as never;
    expect(whatYouLearn(packs)).toEqual(['Putting steps in the right order', 'Repeating, without writing it twice', 'Brand new island']);
  });

  it('has words for every idea the real islands teach', () => {
    const packs = loadPacks();
    const titles = new Set(packs.map((p) => p.manifest.title));
    // An island falling back to its own title means a concept was added without words for it.
    expect(whatYouLearn(packs).filter((words) => titles.has(words))).toEqual([]);
  });
});
