/** A puzzle's goal and rules in words: for the player's first line, and for the maker's summary. */
import type { Creation } from './types';

/** What the player is asked to do, from the goal its maker chose. */
export function goalWords(creation: Pick<Creation, 'objective'>): string {
  const { reachGoal, collectAll } = creation.objective;
  if (reachGoal && collectAll) return 'Collect every acorn, then get the robot to the flag.';
  if (collectAll) return 'Collect every acorn.';
  return 'Help the robot reach the flag.';
}

/** The rules in a few words, for the switch beside the maker's program: "reach the flag, 8 cards at most, 2 days". */
export function rulesWords(creation: Pick<Creation, 'objective' | 'programming' | 'days'>): string {
  const { reachGoal, collectAll } = creation.objective;
  const goal = reachGoal && collectAll ? 'acorns and flag' : collectAll ? 'every acorn' : reachGoal ? 'reach the flag' : 'its own goal';
  const limit = creation.programming.maxInstructions;
  return [goal, ...(limit !== undefined ? [`${limit} ${limit === 1 ? 'card' : 'cards'} at most`] : []), ...(creation.days !== undefined ? [`${creation.days} days`] : [])].join(', ');
}
