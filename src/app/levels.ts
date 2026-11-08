/**
 * The level list in play order, across packs, plus hash routes. The level
 * map is the home screen; a level is #/level/<id>; settings is #/settings;
 * the card book is #/book, and one of its pages is #/book/<pack id>.
 */
import { cardBook, type BookEntry } from '../lessons/concepts';
import { loadPacks } from '../lessons/content';
import type { PuzzleDefinition } from '../lessons/types';

export interface LevelChoice {
  level: PuzzleDefinition;
  packId: string;
  packTitle: string;
  /** 1-based position within its pack, for the stepping stones. */
  number: number;
}

export interface Content {
  choices: LevelChoice[];
  book: BookEntry[];
}

export function loadContent(): Content {
  const packs = loadPacks();
  return {
    choices: packs.flatMap((pack) => pack.levels.map((level, i) => ({ level, packId: pack.manifest.id, packTitle: pack.manifest.title, number: i + 1 }))),
    book: cardBook(packs),
  };
}

export function allLevels(): LevelChoice[] {
  return loadContent().choices;
}

export function nextLevelId(choices: readonly LevelChoice[], id: string): string | null {
  const index = choices.findIndex((c) => c.level.id === id);
  return index >= 0 ? (choices[index + 1]?.level.id ?? null) : null;
}

export type Route = { screen: 'map' } | { screen: 'settings' } | { screen: 'level'; id: string } | { screen: 'book'; packId?: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'settings') return { screen: 'settings' };
  if (path === 'book') return { screen: 'book' };
  const m = /^(level|book)\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[2]!);
    return m[1] === 'level' ? { screen: 'level', id } : { screen: 'book', packId: id };
  }
  return { screen: 'map' };
}

export function hashFor(route: Route): string {
  switch (route.screen) {
    case 'map':
      return '#/';
    case 'settings':
      return '#/settings';
    case 'level':
      return `#/level/${encodeURIComponent(route.id)}`;
    case 'book':
      return route.packId === undefined ? '#/book' : `#/book/${encodeURIComponent(route.packId)}`;
  }
}
