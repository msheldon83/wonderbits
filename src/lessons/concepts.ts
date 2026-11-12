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

/** One page of the card book: a pack's introduction and where it is played. */
export interface BookEntry {
  packId: string;
  packTitle: string;
  /** The level the introduction shows before. */
  firstLevelId: string;
  introduction: ConceptIntroduction;
}

/** The card book, in map order: every pack that introduces a concept. */
export function cardBook(packs: readonly LoadedPack[]): BookEntry[] {
  return packs.flatMap(({ manifest, levels }) =>
    manifest.introduction && levels[0]
      ? [{ packId: manifest.id, packTitle: manifest.title, firstLevelId: levels[0].id, introduction: manifest.introduction }]
      : [],
  );
}

/** The introduction a level opens with: only a pack's first level has one. */
export function introductionBefore(book: readonly BookEntry[], levelId: string): BookEntry | undefined {
  return book.find((e) => e.firstLevelId === levelId);
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
