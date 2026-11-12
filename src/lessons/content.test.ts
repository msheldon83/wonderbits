/** CI gate: every shipped level parses and proves itself solvable. */
import { describe, expect, it } from 'vitest';
import { loadPacks } from './content';
import { validatePack, validatePuzzle, validateRealWords } from './validate';

const packs = loadPacks();

describe('content packs', () => {
  it('has at least one pack', () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  it('has unique pack ids', () => {
    const ids = packs.map((p) => p.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const { manifest, levels } of packs) {
    describe(`pack ${manifest.id}`, () => {
      it('declares its concepts, prerequisites and introduction consistently', () => {
        expect(validatePack(manifest, packs.map((p) => p.manifest))).toEqual([]);
      });
      it('names real words for code the child will see', () => {
        expect(validateRealWords(manifest, levels, packs.map((p) => p.manifest))).toEqual([]);
      });
      it('has unique level ids', () => {
        const ids = levels.map((l) => l.id);
        expect(new Set(ids).size).toBe(ids.length);
      });
      for (const level of levels) {
        it(`level ${level.id} is valid and solvable`, () => {
          const report = validatePuzzle(level);
          expect(report.errors).toEqual([]);
        });
      }
    });
  }
});
