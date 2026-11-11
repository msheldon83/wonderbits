/**
 * The level list in play order, across packs, plus hash routes. The level
 * map is the home screen; a level is #/level/<id>; settings is #/settings;
 * the card book is #/book, and one of its pages is #/book/<pack id>.
 * Creation mode is #/create, the shelf of the child's things, and one of
 * them is #/create/<id>. A puzzle its maker has solved is played at
 * #/play/<id>.
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
  /** 1-based number of its pack's island on the map: the world. */
  world: number;
}

export interface Content {
  choices: LevelChoice[];
  book: BookEntry[];
}

export function loadContent(): Content {
  const packs = loadPacks();
  return {
    choices: packs.flatMap((pack, w) => pack.levels.map((level, i) => ({ level, packId: pack.manifest.id, packTitle: pack.manifest.title, number: i + 1, world: w + 1 }))),
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

/** The map shows one island at a time; with no island named it opens on the one being played. */
export type Route = { screen: 'map'; packId?: string } | { screen: 'settings' } | { screen: 'level'; id: string } | { screen: 'book'; packId?: string } | { screen: 'create' } | { screen: 'make'; id: string } | { screen: 'play'; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'settings') return { screen: 'settings' };
  if (path === 'book') return { screen: 'book' };
  if (path === 'create') return { screen: 'create' };
  const m = /^(level|book|map|create|play)\/([^/]+)$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[2]!);
    if (m[1] === 'create') return { screen: 'make', id };
    if (m[1] === 'play') return { screen: 'play', id };
    return m[1] === 'level' ? { screen: 'level', id } : m[1] === 'map' ? { screen: 'map', packId: id } : { screen: 'book', packId: id };
  }
  return { screen: 'map' };
}

export function hashFor(route: Route): string {
  switch (route.screen) {
    case 'map':
      return route.packId === undefined ? '#/' : `#/map/${encodeURIComponent(route.packId)}`;
    case 'settings':
      return '#/settings';
    case 'level':
      return `#/level/${encodeURIComponent(route.id)}`;
    case 'create':
      return '#/create';
    case 'make':
      return `#/create/${encodeURIComponent(route.id)}`;
    case 'play':
      return `#/play/${encodeURIComponent(route.id)}`;
    case 'book':
      return route.packId === undefined ? '#/book' : `#/book/${encodeURIComponent(route.packId)}`;
  }
}
