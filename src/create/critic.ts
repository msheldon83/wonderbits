/**
 * The critic: what is true about a puzzle a child made. It checks the
 * maker's own program against the puzzle's cards and limit, and searches
 * for the shortest way through with plain steps, the same search the level
 * validator runs in CI. It reports; it never proposes a change. Pure, and
 * run in the Worker so a long search cannot freeze the page.
 */
import { cardCounts, countNodes, walk } from '../ir/program';
import { GO_IDS, isBlockId, isCommandId, isGateActionId, MEMORY_CARD_IDS, type CardId, type ProgramIR } from '../ir/types';
import { missingOutcomes } from '../lessons/checks';
import { searchFlat } from '../lessons/validate';
import type { Critique, CritiqueRequest } from '../runtime/contract';
import { interpretAll } from '../runtime/interpreter';
import { CHECK_SEEDS } from '../sim/random';

type Rules = CritiqueRequest['rules'];

/** True when a program uses only the puzzle's cards and no more of them than its limit. */
/** The cards a program uses more of than the puzzle allows of that kind. */
export function overCardLimits(limits: Rules['maxPerCommand'], counts: ReadonlyMap<string, number>): CardId[] {
  return (Object.entries(limits ?? {}) as [CardId, number][]).filter(([card, most]) => (counts.get(card) ?? 0) > most).map(([card]) => card);
}

export function fitsRules(rules: Pick<Rules, 'allowedCommands' | 'allowedConditions' | 'maxInstructions' | 'maxPerCommand'>, program: ProgramIR): boolean {
  if (rules.maxInstructions !== undefined && countNodes(program) > rules.maxInstructions) return false;
  const allowed = new Set<string>(rules.allowedCommands);
  const counts = cardCounts(program);
  for (const card of counts.keys()) if (!allowed.has(card)) return false;
  if (overCardLimits(rules.maxPerCommand, counts).length > 0) return false;
  if (rules.allowedConditions) {
    const senses = new Set<string>(rules.allowedConditions);
    for (const { node } of walk(program)) if ('condition' in node && !senses.has(node.condition)) return false;
  }
  return true;
}

/** Whether a program solves the puzzle: on every roll when it is random, and with every outcome turning up. */
function solves(req: Pick<CritiqueRequest, 'world' | 'objective' | 'rules' | 'program' | 'input' | 'days'>): boolean {
  const seeds: (number | undefined)[] = req.rules.random ? [...CHECK_SEEDS] : [undefined];
  const runs = seeds.map((seed) => interpretAll({ program: req.program, world: req.world, objective: req.objective, limits: { maxSteps: 1000 }, ...(req.input && { input: req.input }), ...(req.days !== undefined && { days: req.days }), ...(seed !== undefined && { seed }) }));
  return runs.every((r) => r.outcome.status === 'success') && missingOutcomes(req.objective, runs.map((r) => r.final)).length === 0;
}

/** Cards that only put plain steps in an order. Any program of them walks a path a list of plain steps also walks. */
const orders = (card: CardId) => isCommandId(card) || isBlockId(card) || card === 'call';

/**
 * A puzzle where the search over plain steps is the whole truth: nothing
 * but the robot's own steps can change the board, and the goal is only
 * about the board. There, "no plain program solves it" means none does.
 */
function plain(req: Pick<CritiqueRequest, 'world' | 'objective' | 'rules' | 'program' | 'input' | 'days'>): boolean {
  const special = (c: CardId) => isGateActionId(c) || (MEMORY_CARD_IDS as readonly string[]).includes(c) || (GO_IDS as readonly string[]).includes(c);
  return (
    !req.objective.memory && !req.objective.covers && !req.input && req.days === undefined && !req.world.team && !req.rules.random && req.program.handlers.length === 0 && req.rules.allowedCommands.every((c) => orders(c) && !special(c))
  );
}

export function critique(req: Omit<CritiqueRequest, 'type' | 'contract' | 'requestId'>, now: () => number = Date.now): Critique {
  const fits = fitsRules(req.rules, req.program);
  const used = cardCounts(req.program);
  const overOwn = overCardLimits(req.rules.maxPerCommand, used).map((card) => ({ card, used: used.get(card) ?? 0, most: req.rules.maxPerCommand![card]! }));
  let own: Critique['own'];
  try {
    own = { fits, solves: solves(req), steps: countNodes(req.program), ...(overOwn.length > 0 && { over: overOwn }) };
  } catch {
    // A program the interpreter cannot run does not solve anything.
    own = { fits, solves: false, steps: countNodes(req.program), ...(overOwn.length > 0 && { over: overOwn }) };
  }
  const found = searchFlat({ world: req.world, objective: req.objective, programming: req.rules }, 64, now() + req.searchMillis);
  // A plain way that needs more of one card than the puzzle allows is no way for a player.
  const tally = new Map<string, number>();
  if (found.kind === 'found') for (const c of found.path) tally.set(c, (tally.get(c) ?? 0) + 1);
  const over = overCardLimits(req.rules.maxPerCommand, tally).length > 0;
  const flat: Critique['flat'] = found.kind === 'found' ? { kind: 'found', steps: found.path.length, ...(over && { overCardLimit: true }) } : found.kind === 'none' && plain(req) ? { kind: 'impossible' } : { kind: 'unknown' };
  return { own, flat };
}

export interface CriticLine {
  /** good: something that works. note: something to know. problem: something that stops the puzzle working. */
  tone: 'good' | 'note' | 'problem';
  text: string;
}

const cards = (n: number) => `${n} ${n === 1 ? 'card' : 'cards'}`;

/** The critic's report in a child's words. It says what is so, and leaves what to do about it to the maker. */
export function criticWords(c: Critique, rules: Pick<Rules, 'allowedCommands' | 'maxInstructions' | 'maxPerCommand'>, label: (card: CardId) => string = (card) => card): CriticLine[] {
  const lines: CriticLine[] = [];
  const limit = rules.maxInstructions;
  const blocks = rules.allowedCommands.filter((card) => isBlockId(card) || card === 'call');
  const block = blocks.includes('repeat') ? 'Repeat' : 'a block';

  const over = c.own.over?.[0];
  if (!c.own.fits)
    lines.push({
      tone: 'problem',
      text:
        limit !== undefined && c.own.steps > limit
          ? `Your own solution has ${cards(c.own.steps)}. Your puzzle allows ${limit}.`
          : over
            ? `Your own solution uses ${over.used} ${label(over.card)} cards. Your puzzle allows ${over.most}.`
            : 'Your own solution uses a card your puzzle does not give the player.',
    });
  else if (c.own.solves) lines.push({ tone: 'good', text: `You solved it yourself in ${cards(c.own.steps)}. Others can play it now.` });
  else lines.push({ tone: 'note', text: 'You have not solved it yourself yet. Build your solution and press Run. Once it works, others can play it.' });

  if (c.flat.kind === 'impossible') lines.push({ tone: 'problem', text: 'Nobody can solve this with these cards. I tried every way the robot can go.' });
  else if (c.flat.kind === 'unknown') lines.push({ tone: 'note', text: 'This puzzle is too big for me to try every way. Your own solution is the proof that it works.' });
  else {
    const n = c.flat.steps;
    lines.push({ tone: 'note', text: `The shortest way with plain steps takes ${cards(n)}.${limit !== undefined ? ` Your puzzle allows ${limit}.` : ''}` });
    if (c.flat.overCardLimit) {
      // The limit on one kind of card closes the plain way; whether another way is open, only a solution shows.
      lines.push({ tone: 'note', text: `But that way uses more of one card than your puzzle allows, so a player has to find another${blocks.length > 0 ? `, or use ${block}` : ''}.` });
    } else if (limit !== undefined && limit < n) {
      if (blocks.length > 0) lines.push({ tone: 'note', text: `So a player needs ${block} to fit under ${limit}.` });
      else lines.push({ tone: 'problem', text: `Nobody can solve this: no way through is shorter than ${cards(n)}.` });
    } else if (blocks.length > 0) lines.push({ tone: 'note', text: `A player can solve it without ${block}.` });
  }
  return lines;
}
