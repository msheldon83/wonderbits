/**
 * Every run a level checks before it counts as solved: each version of the
 * board and, on a random level, many seeds of the robot's random generator.
 * Pure.
 */
import { parseRandom, type Value } from '../ir/types';
import { CHECK_SEEDS } from '../sim/random';
import type { ObjectiveDefinition, SimState } from '../sim/types';
import { coveredValue } from '../sim/world';
import { worldsOf } from './shuffles';
import type { PuzzleDefinition } from './types';

/** A level where the robot rolls: it offers a random source or asks for outcomes. */
export function isRandomLevel(puzzle: Pick<PuzzleDefinition, 'objective' | 'programming'>): boolean {
  return puzzle.objective.covers !== undefined || (puzzle.programming.allowedSources ?? []).some((s) => parseRandom(s) !== null);
}

/** One run to check: a version of the board, and a seed when the level is random. */
export interface Check {
  world: number;
  seed?: number;
}

/** Every run to check: each board, times each seed on a random level. */
export function checksOf(puzzle: Pick<PuzzleDefinition, 'world' | 'shuffles' | 'objective' | 'programming'>): Check[] {
  const worlds = worldsOf(puzzle).map((_, i) => i);
  if (!isRandomLevel(puzzle)) return worlds.map((world) => ({ world }));
  return worlds.flatMap((world) => CHECK_SEEDS.map((seed) => ({ world, seed })));
}

/** The outcomes a random level asks for that no run ended on. Empty when all turned up. */
export function missingOutcomes(objective: ObjectiveDefinition, finals: readonly SimState[]): Value[] {
  if (!objective.covers) return [];
  const { of, values } = objective.covers;
  const seen = new Set(finals.map((s) => JSON.stringify(coveredValue(of, s))));
  return values.filter((v) => !seen.has(JSON.stringify(v)));
}
