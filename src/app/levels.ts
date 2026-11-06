/**
 * The level list in play order, across packs, plus hash routes. The level
 * map is the home screen; a level is #/level/<id>; settings is #/settings.
 */
import { loadPacks } from '../lessons/content';
import type { PuzzleDefinition } from '../lessons/types';

export interface LevelChoice {
  level: PuzzleDefinition;
  packId: string;
  packTitle: string;
  /** 1-based position within its pack, for the stepping stones. */
  number: number;
}

export function allLevels(): LevelChoice[] {
  return loadPacks().flatMap((pack) => pack.levels.map((level, i) => ({ level, packId: pack.manifest.id, packTitle: pack.manifest.title, number: i + 1 })));
}

export function nextLevelId(choices: readonly LevelChoice[], id: string): string | null {
  const index = choices.findIndex((c) => c.level.id === id);
  return index >= 0 ? (choices[index + 1]?.level.id ?? null) : null;
}

export type Route = { screen: 'map' } | { screen: 'settings' } | { screen: 'level'; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'settings') return { screen: 'settings' };
  const m = /^level\/([^/]+)$/.exec(path);
  if (m) return { screen: 'level', id: decodeURIComponent(m[1]!) };
  return { screen: 'map' };
}

export const hashFor = (route: Route): string =>
  route.screen === 'map' ? '#/' : route.screen === 'settings' ? '#/settings' : `#/level/${encodeURIComponent(route.id)}`;
