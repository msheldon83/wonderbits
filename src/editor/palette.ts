/**
 * What the palette offers for a level, given the program so far. Pure, so the
 * constraints are tested without the DOM.
 *
 * A level constrains the palette three ways: the cards it allows, a cap on
 * total cards, and per-card quotas. On reorder (Parsons) levels the quotas
 * come from the supplied cards: each card can be used exactly once. Blocks
 * count like any other card, and so does everything inside them.
 */
import { cardCounts, countNodes, functionNames, memoryOf } from '../ir/program';
import { BASIC_CONDITIONS, DEFAULT_CONDITION, negate, negationOf, type BlockId, type CardId, type ConditionId, type MemorySlot, type ProgramIR } from '../ir/types';
import type { PuzzleDefinition } from '../lessons/types';

export type Programming = PuzzleDefinition['programming'];

export interface PaletteEntry {
  command: CardId;
  /** For a call: the function it runs. The palette has one call card per function. */
  name?: string;
  /** Cards of this kind still available, or null when the level sets no quota. */
  remaining: number | null;
  /** False when the quota or the total budget is used up, or the card has nothing to work on. */
  available: boolean;
  /** Creation mode: what the robot must remember before this card can be used, such as "a number". */
  needs?: string;
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

  const names = functionNames(program);
  const entries = programming.allowedCommands.flatMap((command): PaletteEntry[] => {
    const quota = quotas?.[command];
    let entry: Omit<PaletteEntry, 'name'>;
    if (quotas && quota === undefined) {
      // Reorder levels hand out a fixed set of cards; anything else stays hidden.
      if (programming.suppliedCards) return [];
      entry = { command, remaining: null, available: !full };
    } else {
      const remaining = quota === undefined ? null : Math.max(0, quota - (counts.get(command) ?? 0));
      entry = { command, remaining, available: !full && remaining !== 0 };
    }
    // One call card per function, sharing the call quota.
    if (command === 'call') return names.map((name) => ({ ...entry, name }));
    // Where the child names the memory, a card that works on a slot waits until there is one.
    const needs = programming.ownNames ? needsOf(command, memoryOf(program)) : null;
    return [needs ? { ...entry, available: false, needs } : entry];
  });

  return { entries, used, max, full };
}

/** What a memory card needs the robot to remember before it can be placed, or null when it has it. */
export function needsOf(command: CardId, memory: readonly MemorySlot[]): string | null {
  const has = (...kinds: string[]) => memory.some((m) => kinds.includes(m.kind));
  switch (command) {
    case 'set':
      return has('number', 'yesNo', 'direction', 'position') ? null : 'something to remember';
    case 'change':
    case 'unlock':
      return has('number') ? null : 'a number';
    case 'face':
      return has('direction') ? null : 'a direction';
    case 'push':
      return has('list') ? null : 'a list';
    case 'forEach': {
      const lists = memory.filter((m) => m.kind === 'list');
      if (lists.length === 0) return 'a list';
      return lists.some((l) => memory.some((m) => m.kind === (l.of ?? 'number'))) ? null : `a ${WORDS[lists[0]!.of ?? 'number'] ?? 'slot'} to hold each item`;
    }
    case 'mark':
      return has('grid') ? null : 'a grid';
    case 'fly':
    case 'shift':
      return has('position') ? null : 'a place';
    default:
      return null;
  }
}
const WORDS: Record<string, string> = { number: 'number', yesNo: 'yes/no', direction: 'direction' };

/** Every test of what the program remembers: a number against 0 to 9, a yes/no, a direction, a place against here. */
export function slotTests(memory: readonly MemorySlot[]): ConditionId[] {
  return memory.flatMap((m): ConditionId[] => {
    if (m.kind === 'number') return Array.from({ length: 10 }, (_, n): ConditionId => `slot:${m.name}=${n}`);
    if (m.kind === 'yesNo') return [`slot:${m.name}=yes`, `slot:${m.name}=no`];
    if (m.kind === 'direction') return (['N', 'E', 'S', 'W'] as const).map((d): ConditionId => `slot:${m.name}=${d}`);
    if (m.kind === 'position') return [`slot:${m.name}=here`];
    return [];
  });
}

/** Checks that already have their opposite on the list: path and blocked ahead, and a yes or no test. The rest gain a `not`. */
const hasNoOpposite = (c: ConditionId): boolean => c !== 'pathAhead' && c !== 'blockedAhead' && !c.endsWith('=yes') && !c.endsWith('=no') && negationOf(c) === null;

/** The conditions a level's If and Repeat until may choose from. Where the child names the memory, every test of it is offered too. */
export function conditionsFor(programming: Programming, memory: readonly MemorySlot[] = []): readonly ConditionId[] {
  const listed = programming.allowedConditions ?? BASIC_CONDITIONS;
  if (!programming.ownNames) return listed;
  const plain = [...new Set([...listed, ...slotTests(memory)])];
  return [...plain, ...plain.filter(hasNoOpposite).map(negate)];
}

/** The condition a fresh block starts with: a loop waits for the flag, an If looks at the way ahead. */
export function defaultCondition(kind: BlockId, programming: Programming): ConditionId {
  const allowed = conditionsFor(programming);
  const preferred: ConditionId[] = kind === 'until' ? ['atFlag', 'blockedAhead', 'acornAhead', 'pathAhead'] : ['blockedAhead', 'pathAhead', 'acornAhead', 'atFlag'];
  return preferred.find((c) => allowed.includes(c)) ?? allowed[0] ?? DEFAULT_CONDITION;
}
