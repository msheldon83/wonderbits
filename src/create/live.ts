/** Live puzzles: creations the player drives with the arrow keys or by tapping tiles, with or without a clock. */
import { splitSpec } from '../ir/spec';
import { isPlayerEvent, TAP, type ProgramIR, type Value } from '../ir/types';
import type { Creation } from './types';

/** The four arrow keys, as the events their When cards wait for. */
export const KEY_EVENTS = ['key:up', 'key:down', 'key:left', 'key:right'] as const;
/** Everything a player can do that a When card may wait for: the arrow keys, and a tap on a tile. */
export const PLAYER_EVENTS = [...KEY_EVENTS, TAP] as const;

/** True when a creation is played live: it has a clock, or its maker's program has a When card for an arrow key or a tap. */
export function isLivePuzzle(creation: Pick<Creation, 'clock' | 'program'> & Partial<Pick<Creation, 'kind'>>): boolean {
  return creation.kind === 'game' || creation.clock !== undefined || splitSpec(creation.program).handlers.some((h) => isPlayerEvent(h.event));
}

/** A program with its kept memory starting from what was saved: a game's backpack, there again next time. */
export function withSaved(program: ProgramIR, saved: Readonly<Record<string, Value>> | undefined): ProgramIR {
  if (!saved || !program.memory) return program;
  return { ...program, memory: program.memory.map((m) => (m.keep && saved[m.name] !== undefined ? { ...m, start: saved[m.name]! } : m)) };
}

/** What a game's kept memory holds at the end of a play, by name: what goes in the backpack. */
export function keptOf(program: ProgramIR, memory: Readonly<Record<string, Value>> | undefined): Record<string, Value> {
  return Object.fromEntries((program.memory ?? []).flatMap((m) => (m.keep && memory?.[m.name] !== undefined ? [[m.name, memory[m.name]!]] : [])));
}
