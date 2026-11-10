import type { RunOutcome } from '../runtime/contract';

export type Tone = 'info' | 'success' | 'problem';

/** Why an incomplete run fell short. */
export interface Shortfall {
  onGoal: boolean;
  /** Collectibles still on the board when the run ended. */
  missing: number;
  /** Memory slots that do not yet hold the answer the level asks for. */
  memory?: string[];
  /** A random level's run that ended outside the outcomes asked for, in words. */
  outside?: string;
}

const acorns = (n: number) => (n === 1 ? 'an acorn' : `${n} acorns`);

/** One short sentence per outcome, in words a nine-year-old reads easily. */
export function outcomeMessage(outcome: RunOutcome, stepNumber: number | null, shortfall?: Shortfall): { tone: Tone; text: string } {
  const at = stepNumber ? ` at step ${stepNumber}` : '';
  switch (outcome.status) {
    case 'success':
      return { tone: 'success', text: 'You did it! The robot reached the flag.' };
    case 'incomplete':
      if (shortfall?.outside) return { tone: 'problem', text: shortfall.outside };
      if (shortfall?.memory?.length) {
        return { tone: 'problem', text: `The robot finished, but ${shortfall.memory.join(' and ')} ${shortfall.memory.length > 1 ? 'do' : 'does'} not hold the answer yet. Look at the memory card.` };
      }
      if (shortfall?.onGoal && shortfall.missing > 0) {
        return { tone: 'problem', text: `The robot is at the flag, but it left ${acorns(shortfall.missing)} behind. Pick up every acorn, then reach the flag.` };
      }
      if (shortfall && shortfall.missing > 0) {
        return { tone: 'problem', text: `The robot stopped before the flag and left ${acorns(shortfall.missing)} behind.` };
      }
      return { tone: 'problem', text: 'The robot stopped before the flag. Does it need more steps?' };
    case 'blocked':
      switch (outcome.reason) {
        case 'wall':
          return { tone: 'problem', text: `Bump! Something is in the way${at}.` };
        case 'gap':
          return { tone: 'problem', text: `Splash! There is water${at}, and no log to stand on.` };
        case 'edge':
          return { tone: 'problem', text: `The robot cannot leave the island${at}.` };
        case 'gate':
          return { tone: 'problem', text: `Clunk! The gate is shut${at}. What opens it?` };
        case 'beetle':
          return { tone: 'problem', text: `A beetle got in the way${at}. Can the robot wait for it to pass?` };
      }
      break;
    case 'halted':
      if (outcome.reason === 'forever') {
        return { tone: 'problem', text: 'That loop would go round forever: the robot kept ending up in the same spot. It stopped. Does the loop need a Forward inside?' };
      }
      return { tone: 'problem', text: 'That program ran too long, so the robot stopped.' };
    case 'error':
      return { tone: 'problem', text: 'Something went wrong. Press Reset and try again.' };
  }
}
