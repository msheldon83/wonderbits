/**
 * What the palette offers for a level, given the program so far. Pure, so the
 * constraints are tested without the DOM.
 *
 * A level constrains the palette three ways: the cards it allows, a cap on
 * total cards, and per-card quotas. On reorder (Parsons) levels the quotas
 * come from the supplied cards: each card can be used exactly once. Blocks
 * count like any other card, and so does everything inside them.
 */
import { cardCounts, countNodes } from '../ir/program';
import { CONDITION_IDS, DEFAULT_CONDITION, type BlockId, type CardId, type ConditionId, type ProgramIR } from '../ir/types';
import type { PuzzleDefinition } from '../lessons/types';

export type Programming = PuzzleDefinition['programming'];

export interface PaletteEntry {
  command: CardId;
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
export function quotasFor(programming: Programming): Partial<Record<CardId, number>> | null {
  if (programming.suppliedCards) {
    const quotas: Partial<Record<CardId, number>> = {};
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
  const counts = cardCounts(program);

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

/** The conditions a level's If and Repeat until may choose from. */
export function conditionsFor(programming: Programming): readonly ConditionId[] {
  return programming.allowedConditions ?? CONDITION_IDS;
}

/** The condition a fresh block starts with: a loop waits for the flag, an If looks at the way ahead. */
export function defaultCondition(kind: BlockId, programming: Programming): ConditionId {
  const allowed = conditionsFor(programming);
  const preferred: ConditionId[] = kind === 'until' ? ['atFlag', 'blockedAhead', 'acornAhead', 'pathAhead'] : ['blockedAhead', 'pathAhead', 'acornAhead', 'atFlag'];
  return preferred.find((c) => allowed.includes(c)) ?? allowed[0] ?? DEFAULT_CONDITION;
}
