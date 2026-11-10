/**
 * The robot's random number generator. A small seeded generator
 * (mulberry32): the same seed always gives the same rolls, so every run can
 * be replayed and tested, and a new seed each run makes each run different.
 * Pure: it takes a state and returns the next one.
 */

/** One draw: a number in [0, 1) and the generator's next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** A whole number from low to high, both included, and the next state. */
export function randomInt(state: number, low: number, high: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: low + Math.floor(r.value * (high - low + 1)), state: r.state };
}

/** The seeds every check runs a random program with: enough that every roll a level cares about comes up. */
export const CHECK_SEEDS: readonly number[] = Array.from({ length: 48 }, (_, i) => i + 1);
