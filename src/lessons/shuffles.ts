/** Shuffled levels: every version of a level's board. Pure. */
import type { WorldDefinition } from '../sim/types';
import type { PuzzleDefinition } from './types';

/** Every version of a level's board: the main one, then its shuffles. */
export const worldsOf = (puzzle: Pick<PuzzleDefinition, 'world' | 'shuffles'>): WorldDefinition[] => [puzzle.world, ...(puzzle.shuffles ?? [])];
