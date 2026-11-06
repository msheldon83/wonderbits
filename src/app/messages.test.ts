import { describe, expect, it } from 'vitest';
import { outcomeMessage } from './messages';

describe('outcomeMessage', () => {
  it('tells the child what an incomplete run missed', () => {
    const incomplete = { status: 'incomplete' as const };
    expect(outcomeMessage(incomplete, null).text).toMatch(/stopped before the flag/);
    expect(outcomeMessage(incomplete, null, { onGoal: false, missing: 0 }).text).toMatch(/stopped before the flag\./);
    expect(outcomeMessage(incomplete, null, { onGoal: true, missing: 1 }).text).toBe('The robot is at the flag, but it left an acorn behind. Pick up every acorn, then reach the flag.');
    expect(outcomeMessage(incomplete, null, { onGoal: false, missing: 2 }).text).toBe('The robot stopped before the flag and left 2 acorns behind.');
  });

  it('names the step for a blocked move', () => {
    expect(outcomeMessage({ status: 'blocked', nodeId: 'n', reason: 'wall' }, 3).text).toBe('Bump! Something is in the way at step 3.');
  });
});
