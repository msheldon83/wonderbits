/**
 * Asks the critic about a creation whenever the puzzle or its maker's
 * program changes, a moment after the last change. When the maker's
 * program solves the puzzle within its own rules, that is the proof.
 */
import { useEffect, useMemo, useState } from 'react';
import { randomIdFactory } from '../ir/ids';
import { programFromSpec, usesRandom } from '../ir/program';
import { isRandomLevel } from '../lessons/checks';
import type { ProgressStore } from '../progress/store';
import type { Critique, Runtime } from '../runtime/contract';
import { criticWords, type CriticLine } from './critic';
import type { CreationStore } from './store';
import type { Creation } from './types';

/** How long the critic may search for the shortest way before it says only what it knows. */
export const SEARCH_MILLIS = 1500;

export function useCritic(creation: Creation, runtime: Runtime | null, store: CreationStore, progress: ProgressStore): { critique: Critique | null; lines: CriticLine[]; thinking: boolean } {
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
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [runtime, world, objective, rules, program, creation.id, creation.inputScript, creation.days, store, progress]);

  return { critique, lines: critique ? criticWords(critique, rules) : [], thinking };
}
