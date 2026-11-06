/**
 * Badges reward mastery behaviours across levels. Pure: computed from the
 * level definitions, the progress and the observation log, never stored as
 * the source of truth.
 */
import type { PuzzleDefinition } from '../lessons/types';
import type { BadgeId, ObservationEvent, Progress } from './types';

export function computeBadges(levels: readonly PuzzleDefinition[], progress: Progress, log: readonly ObservationEvent[]): BadgeId[] {
  const badges: BadgeId[] = [];
  const of = (id: string) => progress.levels[id];

  // Crystal ball: three correct predictions in a row.
  let streak = 0;
  let best = 0;
  for (const e of log) {
    if (e.kind !== 'prediction-made') continue;
    streak = e.correct ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  if (best >= 3) badges.push('crystal-ball');

  // Wrench: repaired a wrong instruction on the first run.
  if (levels.some((l) => l.curriculum.activity === 'debug' && of(l.id)?.solvedFirstRun)) badges.push('wrench');

  // Compass: five levels in a row with no facing errors (no run ended blocked).
  let clean = 0;
  for (const l of levels) {
    const p = of(l.id);
    clean = p?.stars.complete && !p.hadBlockedRun ? clean + 1 : 0;
    if (clean >= 5) {
      badges.push('compass');
      break;
    }
  }

  // Lightning: three budget stars.
  if (levels.filter((l) => of(l.id)?.stars.budget).length >= 3) badges.push('lightning');

  // Map: solved the transfer (predict) level with no hints.
  if (levels.some((l) => l.curriculum.activity === 'predict' && of(l.id)?.stars.noHints)) badges.push('map');

  // Trophy: every star on offer across the set.
  const allStars = levels.length > 0 && levels.every((l) => {
    const p = of(l.id);
    return p?.stars.complete && p.stars.noHints && (l.stars.budget === undefined || p.stars.budget);
  });
  if (allStars) badges.push('trophy');

  return badges;
}
