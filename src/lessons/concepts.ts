/**
 * The concept graph and the card book. Packs declare the concepts they teach,
 * the packs that come first, and a show-first introduction. This module reads
 * those declarations; nothing about a concept is hardcoded in the app.
 */
import { COMMAND_IDS, type CardId } from '../ir/types';
import type { LoadedPack } from './content';
import { printProgram } from '../projection/printTs';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import { codeHas } from './realWords';
import type { ConceptIntroduction, RealWord } from './types';

/** The cards that show a concept, for the validator. Concepts without cards yet return null. */
export function cardsTeaching(concept: string): readonly CardId[] | null {
  switch (concept) {
    case 'sequencing':
      return COMMAND_IDS;
    case 'loops':
      return ['repeat'];
    case 'conditionals':
      return ['if', 'ifElse', 'until'];
    case 'functions':
      return ['call'];
    case 'variables':
      return ['set', 'change'];
    case 'lists':
      return ['forEach', 'push'];
    default:
      return null;
  }
}

/** One page of the card book: a teaching card and where it is played. */
export interface BookEntry {
  /** Names the page in its address and in the saved list of cards seen: the pack id for a pack's introduction, pack and level for a later card. */
  id: string;
  packId: string;
  packTitle: string;
  /** The level the card shows before: the pack's first for its introduction. */
  levelId: string;
  /** The title of that level, on a later card only: its page opens when the child reaches it. */
  levelTitle?: string;
  introduction: ConceptIntroduction;
}

/** The card book, in map order: every pack's introduction, each followed by the pack's later cards in play order. */
export function cardBook(packs: readonly LoadedPack[]): BookEntry[] {
  return packs.flatMap(({ manifest, levels }) => {
    const pack = { packId: manifest.id, packTitle: manifest.title };
    const later = levels.flatMap((level) =>
      (manifest.cards ?? []).filter((c) => c.beforeLevel === level.id).map((c): BookEntry => ({ ...pack, id: `${manifest.id}:${level.id}`, levelId: level.id, levelTitle: level.title, introduction: c })),
    );
    return [...(manifest.introduction && levels[0] ? [{ ...pack, id: manifest.id, levelId: levels[0].id, introduction: manifest.introduction }] : []), ...later];
  });
}

/** The teaching card a level opens with: a pack's first level, and any later level that brings a card of its own. */
export function introductionBefore(book: readonly BookEntry[], levelId: string): BookEntry | undefined {
  return book.find((e) => e.levelId === levelId);
}

/**
 * The real words an introduction shows under its demo: the ideas, and the
 * words whose code the demo prints. Words for code that first appears in a
 * later level wait for that level's code panel.
 */
export function wordsOfIntroduction(introduction: ConceptIntroduction): RealWord[] {
  const { program, world } = introduction.demo;
  const source = printProgram(programFromSpec(program, sequentialIdFactory()), world.team ? { team: world.team } : {});
  return (introduction.realWords ?? []).filter((w) => w.code === undefined || codeHas(source, w.code));
}

/** Every real word of the pages given, in map order: what the code panel may offer. */
export function realWordsOf(book: readonly BookEntry[]): RealWord[] {
  return book.flatMap((e) => e.introduction.realWords ?? []);
}
