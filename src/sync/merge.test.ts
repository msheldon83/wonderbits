import { describe, expect, it } from 'vitest';
import type { Creation } from '../create/types';
import { emptyLevelProgress, emptyProgress, type LevelProgress, type Progress } from '../progress/types';
import { isTombstone, mergeCreation, mergeDrafts, mergeLevel, mergeProgress, type Drafts, type Tombstone } from './merge';

const level = (id: string, patch: Partial<LevelProgress> = {}): LevelProgress => ({ ...emptyLevelProgress(id), ...patch });
const progress = (patch: Partial<Progress>): Progress => ({ ...emptyProgress(), ...patch });
const solved = (id: string, patch: Partial<LevelProgress> = {}) => level(id, { stars: { complete: true, noHints: true, budget: null }, attempts: 1, bestSteps: 4, ...patch });

describe('mergeLevel', () => {
  it('keeps every star earned on either device', () => {
    const a = level('l', { stars: { complete: true, noHints: false, budget: false } });
    const b = level('l', { stars: { complete: true, noHints: true, budget: null } });
    expect(mergeLevel(a, b).stars).toEqual({ complete: true, noHints: true, budget: false });
    const c = level('l', { stars: { complete: true, noHints: false, budget: true } });
    expect(mergeLevel(a, c).stars.budget).toBe(true);
    expect(mergeLevel(level('l'), level('l')).stars.budget).toBeNull();
  });

  it('takes the best steps, the most attempts and one whole prediction count', () => {
    const a = level('l', { attempts: 3, bestSteps: 7, predictions: { correct: 2, total: 2 } });
    const b = level('l', { attempts: 5, bestSteps: 5, predictions: { correct: 1, total: 4 }, hadBlockedRun: true });
    expect(mergeLevel(a, b)).toMatchObject({ attempts: 5, bestSteps: 5, hadBlockedRun: true, predictions: { correct: 1, total: 4 } });
    expect(mergeLevel(level('l', { bestSteps: null }), b).bestSteps).toBe(5);
  });
});

describe('mergeProgress', () => {
  it('joins two devices that solved different levels offline', () => {
    const tablet = progress({ levels: { one: solved('one') }, introsSeen: ['forest-mvp'], badges: ['wrench'] });
    const laptop = progress({ levels: { two: solved('two') }, introsSeen: ['forest-loops', 'forest-mvp'], badges: ['crystal-ball'] });
    const m = mergeProgress(tablet, laptop);
    expect(Object.keys(m.levels).sort()).toEqual(['one', 'two']);
    expect([...m.introsSeen].sort()).toEqual(['forest-loops', 'forest-mvp']);
    expect(m.badges).toEqual(['crystal-ball', 'wrench']);
  });

  it('gives the same answer in either order, and merging twice changes nothing', () => {
    const a = progress({ levels: { one: solved('one', { bestSteps: 6 }), two: level('two', { attempts: 2 }) }, badges: ['map'] });
    const b = progress({ levels: { one: solved('one', { attempts: 4 }), three: solved('three') }, badges: ['lightning'] });
    const ab = mergeProgress(a, b);
    const ba = mergeProgress(b, a);
    expect(ab.levels).toEqual(ba.levels);
    expect(ab.badges).toEqual(ba.badges);
    expect(mergeProgress(ab, b)).toEqual(ab);
  });

  it('leaves both inputs untouched', () => {
    const a = progress({ levels: { one: solved('one') } });
    const before = structuredClone(a);
    mergeProgress(a, progress({ levels: { one: level('one', { attempts: 9 }) } }));
    expect(a).toEqual(before);
  });
});

describe('mergeCreation', () => {
  const made = (updatedAt: number, patch: Partial<Creation> = {}) => ({ id: 'c-1', title: `at ${updatedAt}`, updatedAt, status: 'draft', ...patch }) as Creation;

  it('takes whichever copy there is', () => {
    expect(mergeCreation(undefined, made(1))).toEqual(made(1));
    expect(mergeCreation(made(1), undefined)).toEqual(made(1));
    expect(mergeCreation(undefined, undefined)).toBeUndefined();
  });

  it('takes the newer copy, and this device on a tie', () => {
    expect(mergeCreation(made(1), made(2))).toEqual(made(2));
    expect(mergeCreation(made(3), made(2))).toEqual(made(3));
    expect(mergeCreation(made(2, { title: 'here' }), made(2, { title: 'there' }))).toMatchObject({ title: 'here' });
  });

  it('counts a proof as a change', () => {
    const proved = made(1, { status: 'proved', proof: { solution: [], steps: 3, provedAt: 5 } });
    expect(mergeCreation(made(2), proved)).toBe(proved);
  });

  it('lets a later deletion win and an earlier one lose', () => {
    const gone: Tombstone = { deleted: true, at: 5 };
    expect(isTombstone(mergeCreation(made(4), gone)!)).toBe(true);
    expect(mergeCreation(made(6), gone)).toEqual(made(6));
  });
});

describe('mergeDrafts', () => {
  it('keeps the places from both devices, this device first', () => {
    const here = { one: [{ id: 'h' }] } as unknown as Drafts;
    const there = { one: [{ id: 't' }], two: [{ id: 't2' }] } as unknown as Drafts;
    expect(mergeDrafts(here, there)).toEqual({ one: [{ id: 'h' }], two: [{ id: 't2' }] });
  });
});
