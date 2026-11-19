/**
 * How two copies of a child's documents become one. A child may play on two
 * devices, either of them offline, so every rule here is built to lose no
 * work: stars and badges only accumulate, and a creation is replaced only by
 * a newer copy of itself. All pure, and safe to apply in either order.
 */
import type { Creation } from '../create/types';
import type { NodeSpec } from '../ir/spec';
import { BADGE_IDS, type LevelProgress, type Progress, type Stars } from '../progress/types';

function mergeStars(a: Stars, b: Stars): Stars {
  return {
    complete: a.complete || b.complete,
    noHints: a.noHints || b.noHints,
    // Earned on either device is earned; null only when neither has finished a budgeted level.
    budget: a.budget === true || b.budget === true ? true : a.budget === false || b.budget === false ? false : null,
  };
}

function fewest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

export function mergeLevel(a: LevelProgress, b: LevelProgress): LevelProgress {
  return {
    levelId: a.levelId,
    stars: mergeStars(a.stars, b.stars),
    attempts: Math.max(a.attempts, b.attempts),
    bestSteps: fewest(a.bestSteps, b.bestSteps),
    solvedFirstRun: a.solvedFirstRun || b.solvedFirstRun,
    hadBlockedRun: a.hadBlockedRun || b.hadBlockedRun,
    // One device's count, whole, so correct never exceeds total.
    predictions: b.predictions.total > a.predictions.total ? b.predictions : a.predictions,
  };
}

export function mergeProgress(a: Progress, b: Progress): Progress {
  const levels: Record<string, LevelProgress> = { ...a.levels };
  for (const [id, theirs] of Object.entries(b.levels)) {
    const ours = levels[id];
    levels[id] = ours ? mergeLevel(ours, theirs) : theirs;
  }
  const badges = new Set([...a.badges, ...b.badges]);
  return {
    version: a.version,
    levels,
    badges: BADGE_IDS.filter((id) => badges.has(id)),
    introsSeen: [...new Set([...a.introsSeen, ...b.introsSeen])],
  };
}

/** What is left where a creation was thrown away, so the other device throws it away too. */
export interface Tombstone {
  deleted: true;
  at: number;
}

export type CreationDoc = Creation | Tombstone;

export const isTombstone = (doc: CreationDoc): doc is Tombstone => 'deleted' in doc;

/** When a copy last changed. Proving a puzzle does not touch updatedAt, so the proof counts too. */
export function stampOf(doc: CreationDoc): number {
  return isTombstone(doc) ? doc.at : Math.max(doc.updatedAt, doc.proof?.provedAt ?? 0);
}

/** The newer copy wins whole; on a tie, this device's. */
export function mergeCreation(local: CreationDoc | undefined, remote: CreationDoc | undefined): CreationDoc | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return stampOf(remote) > stampOf(local) ? remote : local;
}

export type Drafts = Record<string, NodeSpec[]>;

/** Saved places carry no dates: the device in the child's hands wins, level by level. */
export function mergeDrafts(local: Drafts, remote: Drafts): Drafts {
  return { ...remote, ...local };
}
