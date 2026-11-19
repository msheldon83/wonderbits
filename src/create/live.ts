/** Live puzzles: creations the player drives with the arrow keys, with or without a clock. */
import { splitSpec } from '../ir/spec';
import type { Creation } from './types';

/** The four arrow keys, as the events their When cards wait for. */
export const KEY_EVENTS = ['key:up', 'key:down', 'key:left', 'key:right'] as const;

/** True when a creation is played live: it has a clock, or its maker's program has a When card for an arrow key. */
export function isLivePuzzle(creation: Pick<Creation, 'clock' | 'program'>): boolean {
  return creation.clock !== undefined || splitSpec(creation.program).handlers.some((h) => h.event.startsWith('key:'));
}
