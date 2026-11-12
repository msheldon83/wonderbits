/**
 * The cards of creation mode: every card a creation may offer, in the
 * order the palette shows them, and the cards that come with a part the
 * child adds to their program.
 */
import { functionNames, memoryOf } from '../ir/program';
import type { CardId, MemorySlot, ProgramIR, Source } from '../ir/types';
import type { Creation } from './types';

/** Every card a creation may offer a player. Unlock, Mark and Move the finger need parts a child cannot make yet. */
export const CREATION_CARDS: readonly CardId[] = ['forward', 'rotateCW', 'rotateCCW', 'wait', 'repeat', 'if', 'ifElse', 'until', 'call', 'set', 'change', 'face', 'push', 'forEach', 'fly', 'goRow', 'goColumn', 'openGate', 'closeGate'];

/** Random values every creation's Set card offers: a small roll, a die, a digit, a coin and a random way. */
export const CREATION_SOURCES: readonly Source[] = ['random:1-3', 'random:1-6', 'random:0-9', 'coin', 'randomWay'];

/** A creation's rules with creation mode's own on: names of the child's own, and the random values. */
export function withCreationRules(programming: Creation['programming']): Creation['programming'] {
  return { ...programming, allowedSources: [...new Set([...(programming.allowedSources ?? []), ...CREATION_SOURCES])], ownNames: true };
}

/** The cards that work on a slot of this kind. */
export function cardsForSlot(slot: Pick<MemorySlot, 'kind' | 'fields'>): CardId[] {
  switch (slot.kind) {
    case 'number':
      return ['set', 'change'];
    case 'yesNo':
      return ['set'];
    case 'direction':
      return ['set', 'face'];
    case 'position':
      return ['set', 'fly'];
    case 'list':
      return ['push', 'forEach'];
    case 'record':
      // Set fills its parts; Add works on a part that is a number.
      return Object.values(slot.fields ?? {}).includes('number') ? ['set', 'change'] : ['set'];
    default:
      return [];
  }
}

/** A program's named parts, as keys: its functions and its slots with their kinds. */
const partsOf = (program: ProgramIR): Map<string, CardId[]> =>
  new Map<string, CardId[]>([...functionNames(program).map((n): [string, CardId[]] => [`fn:${n}`, ['call']]), ...memoryOf(program).map((m): [string, CardId[]] => [`slot:${m.name}:${m.kind}`, cardsForSlot(m)])]);

/**
 * The cards a creation gains when its maker adds parts to the program: a
 * new function brings its call card, a new number brings Set and Add, and
 * so on. Only what is new counts, so a card the maker switched off stays
 * off until they add something that needs it again.
 */
export function cardsGained(before: ProgramIR, after: ProgramIR, allowed: readonly CardId[]): CardId[] {
  const had = partsOf(before);
  const gained = [...partsOf(after)].filter(([key]) => !had.has(key)).flatMap(([, cards]) => cards);
  return [...new Set(gained)].filter((c) => !allowed.includes(c));
}

/** Cards in the palette's order, whatever order they were added in. */
export function inPaletteOrder(cards: readonly CardId[]): CardId[] {
  const known = CREATION_CARDS.filter((c) => cards.includes(c));
  return [...known, ...cards.filter((c) => !known.includes(c))];
}
