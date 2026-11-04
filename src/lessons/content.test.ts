/** CI gate: every shipped level parses and proves itself solvable. */
import { describe, expect, it } from 'vitest';
import { loadPacks } from './content';
import { validatePuzzle } from './validate';

const packs = loadPacks();

describe('content packs', () => {
  it('has at least one pack', () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  for (const { manifest, levels } of packs) {
    describe(`pack ${manifest.id}`, () => {
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
