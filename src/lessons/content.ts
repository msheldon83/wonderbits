/**
 * Loads every pack under content/packs at build time. Content is data, not
 * code: adding a level is adding a JSON file and listing it in pack.json.
 */
import { parsePack, parsePuzzle } from './parse';
import type { PackManifest, PuzzleDefinition } from './types';

const packFiles = import.meta.glob('/content/packs/*/pack.json', { eager: true, import: 'default' });
const levelFiles = import.meta.glob('/content/packs/*/levels/*.json', { eager: true, import: 'default' });

export interface LoadedPack {
  manifest: PackManifest;
  levels: PuzzleDefinition[];
}

export function loadPacks(): LoadedPack[] {
  return Object.entries(packFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, json]) => {
      const dir = path.slice(0, -'pack.json'.length);
      const manifest = parsePack(json, path);
      const levels = manifest.levels.map((id) => {
        const levelPath = `${dir}levels/${id}.json`;
        if (!(levelPath in levelFiles)) throw new Error(`${path}: level "${id}" has no file ${levelPath}`);
        const level = parsePuzzle(levelFiles[levelPath], levelPath);
        if (level.id !== id) throw new Error(`${levelPath}: id "${level.id}" does not match its file name`);
        return level;
      });
      return { manifest, levels };
    });
}
