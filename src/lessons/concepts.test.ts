import { describe, expect, it } from 'vitest';
import { cardBook, cardsTeaching, introductionBefore } from './concepts';
import type { LoadedPack } from './content';
import { parsePack } from './parse';
import type { PuzzleDefinition } from './types';
import { validatePack } from './validate';

type IntroJson = { concept: string; title?: string; explanation: string; demo: { world: unknown; before?: unknown[]; program: unknown[] } };
const intro: IntroJson = {
  concept: 'loops',
  title: 'Repeat',
  explanation: 'A Repeat card runs the cards inside it again and again.',
  demo: {
    world: { rows: ['.....'], robot: { x: 0, y: 0, facing: 'E' }, goal: { x: 4, y: 0 } },
    before: ['forward', 'forward', 'forward', 'forward'],
    program: [{ repeat: 4, do: ['forward'] }],
  },
};
const manifest = (patch: Record<string, unknown> = {}) =>
  parsePack({ schemaVersion: 1, id: 'loops', title: 'Around and around', themeId: 'forest', order: 2, concepts: ['loops'], prerequisites: ['seq'], introduction: intro, levels: ['r01'], ...patch }, 'loops/pack.json');
const seq = parsePack({ schemaVersion: 1, id: 'seq', title: 'Forest', themeId: 'forest', order: 0, concepts: ['sequencing'], levels: ['l01'] }, 'seq/pack.json');
const withPatch = (patch: (i: typeof intro) => void) => {
  const i = structuredClone(intro);
  patch(i);
  return i;
};

describe('parsePack', () => {
  it('reads concepts, prerequisites and the introduction', () => {
    const m = manifest();
    expect(m.concepts).toEqual(['loops']);
    expect(m.prerequisites).toEqual(['seq']);
    expect(m.introduction?.demo.world.width).toBe(5);
    expect(m.introduction?.demo.before).toHaveLength(4);
    expect(seq.prerequisites).toEqual([]);
    expect(seq.introduction).toBeUndefined();
  });

  it('requires at least one concept', () => {
    expect(() => manifest({ concepts: [] })).toThrow(/concepts: expected at least one concept id/);
  });

  it('reports introduction problems by path', () => {
    expect(() => manifest({ introduction: withPatch((i) => void ((i.demo.world as { rows: string[] }).rows = ['..x'])) })).toThrow(/introduction.demo.world.rows\[0\]\[2\]/);
    expect(() => manifest({ introduction: withPatch((i) => void (i.title = undefined)) })).toThrow(/introduction.title/);
  });
});

describe('validatePack', () => {
  const all = [seq, manifest()];
  it('accepts a consistent pack', () => {
    expect(validatePack(manifest(), all)).toEqual([]);
    expect(validatePack(seq, all)).toEqual([]);
  });
  it('rejects prerequisites that are missing, itself, or later on the map', () => {
    expect(validatePack(manifest({ prerequisites: ['nope'] }), all)).toEqual(['prerequisite "nope" is not a pack']);
    expect(validatePack(manifest({ prerequisites: ['loops'] }), all)).toEqual(['a pack cannot be its own prerequisite']);
    const later = manifest({ id: 'later', order: 5, prerequisites: [], concepts: ['x'], introduction: undefined });
    expect(validatePack(seq, [seq, later])).toEqual([]);
    expect(validatePack(parsePack({ ...seq, prerequisites: ['later'] }, 'seq'), [seq, later])).toEqual(['prerequisite "later" plays after this pack on the map']);
  });
  it('rejects an introduction for a concept the pack does not teach', () => {
    expect(validatePack(manifest({ concepts: ['sequencing'] }), all)).toContain('introduction is for "loops", which is not one of this pack\'s concepts');
  });
  it('proves the demo: it reaches the flag, the old way is longer, and the new card is used', () => {
    const noFlag = manifest({ introduction: withPatch((i) => void (i.demo.program = [{ repeat: 3, do: ['forward'] }])) });
    expect(validatePack(noFlag, all)).toEqual(['introduction.demo.program must reach the flag (and collect every acorn) on its board']);
    const flat = manifest({ introduction: withPatch((i) => void (i.demo.program = ['forward', 'forward', 'forward', 'forward'])) });
    expect(validatePack(flat, all)).toEqual([
      'introduction.demo.before should be the longer, old way; it has no more cards than the program',
      'introduction.demo.program never uses a repeat card, so it does not show "loops"',
    ]);
    const badBefore = manifest({ introduction: withPatch((i) => void (i.demo.before = ['forward', 'forward', 'forward', 'forward', 'forward', 'rotateCW'])) });
    expect(validatePack(badBefore, all)).toEqual(['introduction.demo.before must reach the flag on its board too, the old way']);
  });
});

describe('card book', () => {
  const level = (id: string) => ({ id }) as PuzzleDefinition;
  const packs: LoadedPack[] = [
    { manifest: seq, levels: [level('l01'), level('l02')] },
    { manifest: manifest(), levels: [level('r01')] },
  ];
  it('has one page per pack with an introduction, in map order', () => {
    const book = cardBook(packs);
    expect(book.map((e) => [e.packId, e.firstLevelId, e.introduction.title])).toEqual([['loops', 'r01', 'Repeat']]);
  });
  it("finds the introduction a pack's first level opens with, and nothing for other levels", () => {
    const book = cardBook(packs);
    expect(introductionBefore(book, 'r01')?.packId).toBe('loops');
    expect(introductionBefore(book, 'l02')).toBeUndefined();
  });
  it('knows which cards show the built concepts', () => {
    expect(cardsTeaching('loops')).toEqual(['repeat']);
    expect(cardsTeaching('conditionals')).toEqual(['if', 'ifElse', 'until']);
    expect(cardsTeaching('sequencing')).toContain('rotateCW');
    expect(cardsTeaching('functions')).toBeNull();
  });
});
