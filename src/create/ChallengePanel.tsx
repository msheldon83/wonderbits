/**
 * The rules of a puzzle, for its maker: the goal, the cards a player gets,
 * how many cards at most, how many days, and what the critic says about
 * it all. It sits beside the board and the maker's own program, in the
 * Mechanics step. A puzzle is offered to others only once its maker's
 * program solves it under these rules; the critic checks that here, and a
 * solving run checks it too.
 */
import { useEffect, useMemo, useState } from 'react';
import { cardLabel } from '../editor/commands';
import { randomIdFactory } from '../ir/ids';
import { programFromSpec, usesRandom } from '../ir/program';
import { countSpec } from '../ir/spec';
import type { CardId } from '../ir/types';
import { isRandomLevel } from '../lessons/checks';
import type { ProgressStore } from '../progress/store';
import type { Critique, Runtime } from '../runtime/contract';
import { criticWords } from './critic';
import type { CreationStore } from './store';
import type { Creation } from './types';

export const LIMIT_MAX = 40;
/** How long the critic may search for the shortest way before it says only what it knows. */
export const SEARCH_MILLIS = 1500;

type Goal = 'flag' | 'acorns' | 'both';
const GOALS: { id: Goal; label: string; reachGoal: boolean; collectAll: boolean }[] = [
  { id: 'flag', label: 'Reach the flag', reachGoal: true, collectAll: false },
  { id: 'acorns', label: 'Collect every acorn', reachGoal: false, collectAll: true },
  { id: 'both', label: 'Both', reachGoal: true, collectAll: true },
];

export interface ChallengePanelProps {
  creation: Creation;
  /** Every card this creation may offer: free play's, and the cards of the level it came from. */
  universe: readonly CardId[];
  store: CreationStore;
  progress: ProgressStore;
  runtime: Runtime | null;
  /** Open the kits: more cards for this creation. */
  onAddCards(): void;
}

export function ChallengePanel({ creation, universe, store, progress, runtime, onAddCards }: ChallengePanelProps) {
  const { world, objective, programming, program } = creation;
  const [critique, setCritique] = useState<Critique | null>(null);
  const [thinking, setThinking] = useState(true);
  const rules = useMemo(
    () => ({
      allowedCommands: programming.allowedCommands,
      ...(programming.allowedConditions && { allowedConditions: programming.allowedConditions }),
      ...(programming.maxInstructions !== undefined && { maxInstructions: programming.maxInstructions }),
      random: isRandomLevel({ objective, programming }),
    }),
    [objective, programming],
  );

  // Ask the critic whenever the puzzle or the maker's program changes, a moment after the last change.
  useEffect(() => {
    if (!runtime) return;
    let stale = false;
    setThinking(true);
    const timer = setTimeout(() => {
      let ir;
      try {
        ir = programFromSpec(program, randomIdFactory());
      } catch {
        ir = programFromSpec([], randomIdFactory());
      }
      // Every creation offers random values; the puzzle is random only when the maker's program takes one.
      void runtime.critique({ world, objective, rules: { ...rules, random: rules.random && usesRandom(ir) }, program: ir, ...(creation.inputScript && { input: creation.inputScript }), ...(creation.days !== undefined && { days: creation.days }), searchMillis: SEARCH_MILLIS }).then((c) => {
        if (stale) return;
        setCritique(c);
        setThinking(false);
        if (!c) return;
        progress.log({ levelId: creation.id, kind: 'critic-spoke', ownSolves: c.own.fits && c.own.solves, flat: c.flat.kind === 'found' ? String(c.flat.steps) : c.flat.kind });
        if (c.own.fits && c.own.solves) store.prove(creation.id, program, c.own.steps);
      });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [runtime, world, objective, rules, program, creation.id, creation.inputScript, creation.days, store, progress]);

  const setRules = (patch: Partial<Creation['programming']>, goal?: (typeof GOALS)[number]) => {
    const next = { ...programming, ...patch };
    if (patch.maxInstructions === undefined && 'maxInstructions' in patch) delete next.maxInstructions;
    const nextObjective = goal ? { ...objective, reachGoal: goal.reachGoal, collectAll: goal.collectAll } : objective;
    store.update(creation.id, { programming: next, objective: nextObjective });
    progress.log({ levelId: creation.id, kind: 'puzzle-set', goal: nextObjective.reachGoal ? (nextObjective.collectAll ? 'both' : 'flag') : 'acorns', cards: next.allowedCommands.length, limit: next.maxInstructions ?? null });
  };
  const goal = GOALS.find((g) => g.reachGoal === objective.reachGoal && g.collectAll === objective.collectAll);
  const limit = programming.maxInstructions;
  const toggleCard = (card: CardId) => {
    const on = programming.allowedCommands.includes(card);
    if (on && programming.allowedCommands.length === 1) return;
    // Keep the cards in the order the palette shows them.
    setRules({ allowedCommands: universe.filter((c) => (c === card ? !on : programming.allowedCommands.includes(c))) });
  };
  /** Where a limit starts when the maker first sets one: the size of their own program, or the shortest plain way, or ten. */
  const firstLimit = Math.min(LIMIT_MAX, countSpec(program) > 0 ? countSpec(program) : critique?.flat.kind === 'found' && critique.flat.steps > 0 ? critique.flat.steps : 10);
  const lines = critique ? criticWords(critique, rules) : [];

  return (
    <div className="rules-panel">
        <section className="tools-panel critic" aria-labelledby="critic-title" aria-busy={thinking}>
          <h2 id="critic-title" className="panel-title">
            The critic says
          </h2>
          {lines.length === 0 ? (
            <p className="tool-note">{thinking ? 'Trying your puzzle…' : 'The critic could not check this puzzle.'}</p>
          ) : (
            <ul className={`critic-lines ${thinking ? 'is-thinking' : ''}`}>
              {lines.map((l) => (
                <li key={l.text} className={`critic-line tone-${l.tone}`}>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="tools-panel" aria-labelledby="goal-title">
          <h2 id="goal-title" className="panel-title">
            The goal
          </h2>
          <div className="choice-row">
            {GOALS.filter((g) => g.reachGoal || !world.team).map((g) => (
              <button key={g.id} type="button" className={`btn btn-choice ${goal?.id === g.id ? 'is-on' : ''}`} aria-pressed={goal?.id === g.id} onClick={() => setRules({}, g)}>
                {g.label}
              </button>
            ))}
          </div>
        </section>
        <section className="tools-panel" aria-labelledby="cards-title">
          <h2 id="cards-title" className="panel-title">
            Cards a player gets
          </h2>
          <div className="choice-row">
            {universe.map((card) => {
              const on = programming.allowedCommands.includes(card);
              return (
                <button key={card} type="button" className={`btn btn-choice ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleCard(card)}>
                  {cardLabel(card)}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn-quiet btn-create rules-add" onClick={onAddCards}>
            Add more cards
          </button>
        </section>
        <section className="tools-panel" aria-labelledby="limit-title">
          <h2 id="limit-title" className="panel-title">
            How many cards
          </h2>
          <div className="choice-row">
            <button type="button" className={`btn btn-choice ${limit === undefined ? 'is-on' : ''}`} aria-pressed={limit === undefined} onClick={() => setRules({ maxInstructions: undefined })}>
              As many as they like
            </button>
            <div className="size-stepper" role="group" aria-label="Most cards a player may use">
              <span className="size-label">At most</span>
              <button type="button" className="btn btn-icon" disabled={limit !== undefined && limit <= 1} aria-label="One card fewer" onClick={() => setRules({ maxInstructions: Math.max(1, (limit ?? firstLimit + 1) - 1) })}>
                −
              </button>
              <span className="size-value" aria-live="polite">
                {limit ?? '∞'}
              </span>
              <button type="button" className="btn btn-icon" disabled={limit !== undefined && limit >= LIMIT_MAX} aria-label="One card more" onClick={() => setRules({ maxInstructions: Math.min(LIMIT_MAX, limit === undefined ? firstLimit : limit + 1) })}>
                +
              </button>
            </div>
          </div>
        </section>
        {creation.days !== undefined && (
          <section className="tools-panel" aria-labelledby="days-title">
            <h2 id="days-title" className="panel-title">
              How many days
            </h2>
            <div className="choice-row">
              <div className="size-stepper" role="group" aria-label="Days the program runs">
                <span className="size-label">Days</span>
                <button type="button" className="btn btn-icon" disabled={creation.days <= 2} aria-label="One day fewer" onClick={() => store.update(creation.id, { days: creation.days! - 1 })}>
                  −
                </button>
                <span className="size-value" aria-live="polite">
                  {creation.days}
                </span>
                <button type="button" className="btn btn-icon" disabled={creation.days >= 5} aria-label="One day more" onClick={() => store.update(creation.id, { days: creation.days! + 1 })}>
                  +
                </button>
              </div>
            </div>
            <p className="tool-note">The program runs once a day. Only what is in the backpack is kept overnight, and the last day must reach the goal.</p>
          </section>
        )}
    </div>
  );
}
