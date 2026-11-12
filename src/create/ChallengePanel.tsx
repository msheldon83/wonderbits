/**
 * Puzzle mode: the maker sets the challenge (the goal, the cards a player
 * gets, how many cards at most) and the critic says what is true about it.
 * A puzzle is offered to others only once its maker's own program solves
 * it under these limits; the critic checks that here, and Play checks it
 * whenever a run succeeds.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMotion } from '../app/hooks';
import { cardLabel } from '../editor/commands';
import { randomIdFactory } from '../ir/ids';
import { programFromSpec, usesRandom } from '../ir/program';
import { countSpec } from '../ir/spec';
import type { CardId } from '../ir/types';
import { isRandomLevel } from '../lessons/checks';
import type { ProgressStore } from '../progress/store';
import type { Settings } from '../progress/types';
import { Board } from '../render/Board';
import { themeFor } from '../render/themes';
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

const noControllers = () => {};

export interface ChallengePanelProps {
  creation: Creation;
  /** Every card this creation may offer: free play's, and the cards of the level it came from. */
  universe: readonly CardId[];
  store: CreationStore;
  progress: ProgressStore;
  runtime: Runtime | null;
  settings: Settings;
}

export function ChallengePanel({ creation, universe, store, progress, runtime, settings }: ChallengePanelProps) {
  const { world, objective, programming, program } = creation;
  const [critique, setCritique] = useState<Critique | null>(null);
  const [thinking, setThinking] = useState(true);
  const motion = useMotion(1, settings.reducedMotion);
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
  const lines = critique ? criticWords(critique, rules) : [];
  const proved = creation.status === 'proved';

  return (
    <main className="app-main challenge-main">
      <div className="lesson-banner">
        <p className={`message tone-${proved ? 'success' : 'info'}`} role="status" aria-live="polite">
          {proved ? 'Others can play this puzzle now. It is on the map, under Made here.' : 'Set the challenge here. Then solve it yourself in Play, and others can play it.'}
        </p>
      </div>
      <div className="stage-col">
        <Board world={world} theme={themeFor('forest')} motion={motion} label="Your island" onControllers={noControllers} hideIndicator hideGoal={!objective.reachGoal} />
      </div>
      <div className="side-col">
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
              <button type="button" className="btn btn-icon" disabled={limit !== undefined && limit <= 1} aria-label="One card fewer" onClick={() => setRules({ maxInstructions: Math.max(1, (limit ?? Math.max(1, countSpec(program)) + 1) - 1) })}>
                −
              </button>
              <span className="size-value" aria-live="polite">
                {limit ?? '∞'}
              </span>
              <button type="button" className="btn btn-icon" disabled={limit !== undefined && limit >= LIMIT_MAX} aria-label="One card more" onClick={() => setRules({ maxInstructions: Math.min(LIMIT_MAX, limit === undefined ? Math.max(1, countSpec(program)) : limit + 1) })}>
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
      </div>
    </main>
  );
}
