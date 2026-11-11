/**
 * Real words: what programmers call the things the child builds with cards.
 * Each pack's introduction lists the words its concept brings, most of them
 * tied to a piece of the TypeScript the cards print as. This module finds
 * which of those pieces a printed program holds, so the code panel can offer
 * exactly the words for the code on screen.
 */
import type { RealWord } from './types';

const OPERATOR = /[=+\-<>!]/;
const WORD = /\w/;

/** Two characters that would run together into a longer name or a longer operator. */
function joins(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return (WORD.test(a) && WORD.test(b)) || (OPERATOR.test(a) && OPERATOR.test(b));
}

/**
 * True when a program's code holds this piece of code as a whole: `for` is
 * not found inside `forward`, nor `=` inside `+=` or `!==`. Comments are not
 * code, so they are left out.
 */
export function codeHas(source: string, code: string): boolean {
  if (code === '') return false;
  return source.split('\n').some((raw) => {
    const line = raw.replace(/\/\/.*$/, '');
    for (let at = line.indexOf(code); at >= 0; at = line.indexOf(code, at + 1)) {
      if (!joins(line[at - 1], code[0]) && !joins(code[code.length - 1], line[at + code.length])) return true;
    }
    return false;
  });
}

/** The words whose code this program holds, in the order given. Words without code name an idea, not a line, and are left out. */
export function wordsIn(source: string, words: readonly RealWord[]): RealWord[] {
  return words.filter((w) => w.code !== undefined && codeHas(source, w.code));
}
