/** Live puzzles: creations the player drives with the arrow keys or by tapping tiles, with or without a clock. */
import { splitSpec } from '../ir/spec';
import { isPlayerEvent, TAP } from '../ir/types';
import type { Creation } from './types';

/** The four arrow keys, as the events their When cards wait for. */
export const KEY_EVENTS = ['key:up', 'key:down', 'key:left', 'key:right'] as const;
/** Everything a player can do that a When card may wait for: the arrow keys, and a tap on a tile. */
export const PLAYER_EVENTS = [...KEY_EVENTS, TAP] as const;

/** True when a creation is played live: it has a clock, or its maker's program has a When card for an arrow key or a tap. */
export function isLivePuzzle(creation: Pick<Creation, 'clock' | 'program'>): boolean {
  return creation.clock !== undefined || splitSpec(creation.program).handlers.some((h) => isPlayerEvent(h.event));
}
