import { describe, expect, it } from 'vitest';
import type { PuzzleDefinition } from '../lessons/types';
import { computeBadges } from './badges';
import { memoryStore } from './storage';
import { ProgressStore } from './store';
import { emptyLevelProgress, emptyProgress, type ObservationEvent, type Progress } from './types';

const level = (id: string, activity: PuzzleDefinition['curriculum']['activity'] = 'build', budget?: number): PuzzleDefinition =>
  ({ id, curriculum: { concept: 'c', activity }, stars: { noHints: true, ...(budget !== undefined && { budget }) } }) as PuzzleDefinition;

const levels = [level('l1'), level('l2', 'debug'), level('l3', 'build', 3), level('l4', 'build', 4), level('l5', 'predict'), level('l6', 'build', 2)];

const withLevel = (p: Progress, id: string, patch: Partial<ReturnType<typeof emptyLevelProgress>>): Progress => ({
  ...p,
  levels: { ...p.levels, [id]: { ...emptyLevelProgress(id), ...patch } },
});
const done = (noHints = true, budget: boolean | null = null) => ({ stars: { complete: true, noHints, budget } });

describe('computeBadges', () => {
  it('awards nothing on an empty history', () => {
    expect(computeBadges(levels, emptyProgress(), [])).toEqual([]);
  });

  it('gives the crystal ball for three correct predictions in a row', () => {
    const ev = (correct: boolean): ObservationEvent => ({ t: 0, levelId: 'l1', kind: 'prediction-made', cell: { x: 0, y: 0 }, correct });
    expect(computeBadges(levels, emptyProgress(), [ev(true), ev(true), ev(false), ev(true)])).toEqual([]);
    expect(computeBadges(levels, emptyProgress(), [ev(true), ev(false), ev(true), ev(true), ev(true)])).toEqual(['crystal-ball']);
  });

  it('gives the wrench, lightning, map and compass for their behaviours', () => {
    let p = emptyProgress();
    p = withLevel(p, 'l2', { ...done(), solvedFirstRun: true });
    expect(computeBadges(levels, p, [])).toEqual(['wrench']);
    p = withLevel(p, 'l3', done(true, true));
    p = withLevel(p, 'l4', done(true, true));
    p = withLevel(p, 'l6', done(true, true));
    expect(computeBadges(levels, p, [])).toContain('lightning');
    p = withLevel(p, 'l5', done(true));
    expect(computeBadges(levels, p, [])).toContain('map');
    p = withLevel(p, 'l1', done());
    p = withLevel(p, 'l4', { ...done(true, true), hadBlockedRun: true });
    expect(computeBadges(levels, p, [])).not.toContain('compass');
    p = withLevel(p, 'l4', done(true, true));
    expect(computeBadges(levels, p, [])).toContain('compass');
    expect(computeBadges(levels, p, [])).toContain('trophy');
  });
});

describe('ProgressStore', () => {
  const make = async () => {
    const storage = memoryStore();
    let t = 1000;
    const store = new ProgressStore(storage, () => t++);
    store.setLevels(levels);
    await store.load();
    return { store, storage };
  };

  it('unlocks levels in order, or all of them when the adult says so', async () => {
    const { store } = await make();
    expect(store.isUnlocked('l1')).toBe(true);
    expect(store.isUnlocked('l2')).toBe(false);
    store.complete({ levelId: 'l1', usedHints: false, steps: 2, budget: undefined });
    expect(store.isUnlocked('l2')).toBe(true);
    expect(store.isUnlocked('l3')).toBe(false);
    store.updateSettings({ openAllLevels: true });
    expect(store.isUnlocked('l6')).toBe(true);
  });

  it('counts attempts, blocked runs and predictions from the log', async () => {
    const { store } = await make();
    store.record({ levelId: 'l1', kind: 'run-started', steps: 1 });
    store.record({ levelId: 'l1', kind: 'trace-halted', nodeId: 'n1', reason: 'wall' });
    store.record({ levelId: 'l1', kind: 'prediction-made', cell: { x: 1, y: 0 }, correct: true });
    const p = store.levelProgress('l1');
    expect(p.attempts).toBe(1);
    expect(p.hadBlockedRun).toBe(true);
    expect(p.predictions).toEqual({ correct: 1, total: 1 });
  });

  it('drops an open-and-leave pair that did nothing', async () => {
    const { store } = await make();
    store.record({ levelId: 'l1', kind: 'level-opened' });
    store.record({ levelId: 'l1', kind: 'level-abandoned' });
    expect(store.getSnapshot().log).toEqual([]);
    store.record({ levelId: 'l1', kind: 'level-opened' });
    store.record({ levelId: 'l1', kind: 'card-placed', command: 'forward', slot: 0 });
    store.record({ levelId: 'l1', kind: 'level-abandoned' });
    expect(store.getSnapshot().log.map((e) => e.kind)).toEqual(['level-opened', 'card-placed', 'level-abandoned']);
  });

  it('awards stars that only accumulate, and remembers a first-run solve', async () => {
    const { store } = await make();
    store.record({ levelId: 'l3', kind: 'run-started', steps: 4 });
    expect(store.complete({ levelId: 'l3', usedHints: true, steps: 4, budget: 3 })).toEqual({ complete: true, noHints: false, budget: false });
    expect(store.levelProgress('l3').solvedFirstRun).toBe(true);
    store.record({ levelId: 'l3', kind: 'run-started', steps: 3 });
    expect(store.complete({ levelId: 'l3', usedHints: false, steps: 3, budget: 3 })).toEqual({ complete: true, noHints: true, budget: true });
    store.record({ levelId: 'l3', kind: 'run-started', steps: 5 });
    expect(store.complete({ levelId: 'l3', usedHints: true, steps: 5, budget: 3 })).toEqual({ complete: true, noHints: true, budget: true });
    expect(store.levelProgress('l3').bestSteps).toBe(3);
    expect(store.getSnapshot().progress.badges).toEqual([]);
  });

  it('writes through to storage and survives a reload, and exports everything', async () => {
    const { store, storage } = await make();
    store.complete({ levelId: 'l1', usedHints: false, steps: 2, budget: undefined });
    store.updateSettings({ muted: true });
    const again = new ProgressStore(storage);
    again.setLevels(levels);
    await again.load();
    expect(again.levelProgress('l1').stars.complete).toBe(true);
    expect(again.getSnapshot().settings.muted).toBe(true);
    expect(again.getSnapshot().log.map((e) => e.kind)).toEqual(['level-completed']);
    const file = again.exportFile();
    expect(file.progress.levels.l1).toBeDefined();
    expect(file.log).toHaveLength(1);
    await again.reset();
    expect(again.levelProgress('l1').stars.complete).toBe(false);
    expect(again.getSnapshot().settings.muted).toBe(true);
  });
});
