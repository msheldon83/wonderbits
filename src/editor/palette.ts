/**
 * What the palette offers for a level, given the program so far. Pure, so the
 * constraints are tested without the DOM.
 *
 * A level constrains the palette three ways: the commands it allows, a cap on
 * total steps, and per-command quotas. On reorder (Parsons) levels the quotas
 * come from the supplied cards: each card can be used exactly once.
 */
import { countNodes, mainBody } from '../ir/program';
import type { CommandId, ProgramIR } from '../ir/types';
import type { PuzzleDefinition } from '../lessons/types';

export type Programming = PuzzleDefinition['programming'];

export interface PaletteEntry {
  command: CommandId;
  /** Cards of this kind still available, or null when the level sets no quota. */
  remaining: number | null;
  /** False when the quota or the total budget is used up. */
  available: boolean;
}

export interface PaletteState {
  entries: PaletteEntry[];
  used: number;
  /** The total step budget, if the level sets one or supplies cards. */
  max: number | undefined;
  full: boolean;
}

/** Per-command quotas for a level, or null when it has none. */
export function quotasFor(programming: Programming): Partial<Record<CommandId, number>> | null {
  if (programming.suppliedCards) {
    const quotas: Partial<Record<CommandId, number>> = {};
    for (const c of programming.suppliedCards) quotas[c] = (quotas[c] ?? 0) + 1;
    return quotas;
  }
  return programming.maxPerCommand ?? null;
}

export function paletteFor(programming: Programming, program: ProgramIR): PaletteState {
  const used = countNodes(program);
  const max = programming.maxInstructions ?? (programming.suppliedCards ? programming.suppliedCards.length : undefined);
  const full = max !== undefined && used >= max;
  const quotas = quotasFor(programming);
  const counts = new Map<CommandId, number>();
  for (const node of mainBody(program)) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);

  const entries = programming.allowedCommands.flatMap((command): PaletteEntry[] => {
    const quota = quotas?.[command];
    if (quotas && quota === undefined) {
      // Reorder levels hand out a fixed set of cards; anything else stays hidden.
      if (programming.suppliedCards) return [];
      return [{ command, remaining: null, available: !full }];
    }
    const remaining = quota === undefined ? null : Math.max(0, quota - (counts.get(command) ?? 0));
    return [{ command, remaining, available: !full && remaining !== 0 }];
  });

  return { entries, used, max, full };
}
