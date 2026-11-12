import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import { printProgram } from '../projection/printTs';
import { cardBook, realWordsOf, wordsOfIntroduction } from './concepts';
import { loadPacks } from './content';
import { parsePack } from './parse';
import { codeHas, wordsIn } from './realWords';
import { REAL_WORD_TEXT_MAX, validateRealWords } from './validate';

const code = (spec: Parameters<typeof programFromSpec>[0]) => printProgram(programFromSpec(spec, sequentialIdFactory()));

describe('codeHas', () => {
  const loop = code([{ repeat: 4, do: ['forward'] }]);
  it('finds a keyword as a whole word only', () => {
    expect(codeHas(loop, 'for')).toBe(true);
    expect(codeHas(code(['forward']), 'for')).toBe(false);
  });
  it('does not find an operator inside a longer one', () => {
    expect(codeHas('count += 1;', '=')).toBe(false);
    expect(codeHas('while (count !== 4) {', '=')).toBe(false);
    expect(codeHas('while (count !== 4) {', '!')).toBe(false);
    expect(codeHas('robot.on(\'tick\', () => {', '=')).toBe(false);
    expect(codeHas('let count: number = 0;', '=')).toBe(true);
    expect(codeHas('while (!robot.atFlag()) {', '!')).toBe(true);
  });
  it('finds punctuation and calls as they are printed', () => {
    expect(codeHas(loop, 'i++')).toBe(true);
    expect(codeHas(loop, 'robot.forward()')).toBe(true);
    expect(codeHas('let seen: boolean[] = [];', '[]')).toBe(true);
    expect(codeHas('heads = coinFlip();', 'random')).toBe(false);
    expect(codeHas('way = randomDirection();', 'random')).toBe(false);
  });
  it('leaves comments out', () => {
    expect(codeHas('// A new robot for the team.', 'new')).toBe(false);
    expect(codeHas('  // No steps yet.', ';')).toBe(false);
  });
});

describe('real words in the shipped packs', () => {
  const packs = loadPacks();
  const book = cardBook(packs);
  const all = realWordsOf(book);

  it('every concept brings at least one real word', () => {
    for (const entry of book) expect(entry.introduction.realWords?.length ?? 0, entry.packId).toBeGreaterThan(0);
  });

  it('a first program offers only the words of its code', () => {
    expect(wordsIn(code(['forward']), all).map((w) => w.word)).toEqual(['statement', 'call', 'main', 'import', 'function', 'return type']);
    expect(wordsIn(code([{ repeat: 2, do: ['forward'] }]), all).map((w) => w.word)).toContain('loop');
  });

  it('an introduction shows its ideas and the words its demo prints', () => {
    const ifs = book.find((e) => e.packId === 'forest-ifs')!;
    // The demo has an If and nothing else; else, while and not wait for their levels.
    expect(wordsOfIntroduction(ifs.introduction).map((w) => w.word)).toEqual(['if statement']);
    const switches = book.find((e) => e.packId === 'forest-switches')!;
    expect(wordsOfIntroduction(switches.introduction).map((w) => w.word)).toEqual(['state']);
  });
});

describe('validateRealWords', () => {
  const pack = (realWords: unknown) =>
    parsePack(
      {
        schemaVersion: 1,
        id: 'loops',
        title: 'Loops',
        themeId: 'forest',
        order: 1,
        concepts: ['loops'],
        prerequisites: [],
        levels: ['a'],
        introduction: {
          concept: 'loops',
          title: 'Repeat',
          explanation: 'Again and again.',
          realWords,
          demo: { world: { rows: ['.....'], robot: { x: 0, y: 0, facing: 'E' }, goal: { x: 4, y: 0 } }, program: [{ repeat: 4, do: ['forward'] }] },
        },
      },
      'loops',
    );

  it('accepts a word for code the demo prints, and a word for an idea', () => {
    const p = pack([{ word: 'loop', code: 'for', text: 'A loop.' }, { word: 'idea', text: 'No code.' }]);
    expect(validateRealWords(p, [], [p])).toEqual([]);
  });
  it('rejects code the pack never prints', () => {
    const p = pack([{ word: 'while loop', code: 'while', text: 'Not here.' }]);
    expect(validateRealWords(p, [], [p])).toEqual(['introduction.realWords[0]: the code "while" is never printed by this pack\'s demo or its reference solutions']);
  });
  it('rejects code another pack already explains, a repeat, and a long text', () => {
    const other = { ...pack([{ word: 'loop', code: 'for', text: 'A loop.' }]), id: 'other' };
    const p = pack([{ word: 'loop', code: 'for', text: 'x'.repeat(REAL_WORD_TEXT_MAX + 1) }, { word: 'loop', code: 'for', text: 'Again.' }]);
    expect(validateRealWords(p, [], [other, p])).toEqual([
      `introduction.realWords[0]: text is ${REAL_WORD_TEXT_MAX + 1} characters; keep it to ${REAL_WORD_TEXT_MAX}`,
      'introduction.realWords[0]: the code "for" is already explained by pack "other"',
      'introduction.realWords[1]: the word "loop" is listed twice',
      'introduction.realWords[1]: the code "for" is explained twice in this pack',
      'introduction.realWords[1]: the code "for" is already explained by pack "other"',
    ]);
  });
});
