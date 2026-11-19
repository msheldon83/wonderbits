/**
 * Playing a puzzle someone made on this device. The player gets the cards
 * and the limit its maker set, starts from an empty program, and earns a
 * star for solving it and another for using no more cards than its maker.
 */
import { useCallback, useMemo, useState } from 'react';
import { Star } from '../app/icons';
import { hashFor } from '../app/levels';
import { PlaySurface, type Solved } from '../app/PlaySurface';
import { skeletonOf } from '../ir/spec';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings, Stars } from '../progress/types';
import type { Runtime } from '../runtime/contract';
import { playableOf, playerGame } from './CreationScreen';
import { keptOf } from './live';
import type { CreationStore } from './store';
import type { ProgramIR } from '../ir/types';
import type { SimState } from '../sim/types';
import { goalWords } from './goal';
import type { Creation } from './types';

/** Where a made puzzle's stars are kept: a new proof is a new puzzle, so its stars start again. */
export const playKeyOf = (creation: Creation): string => `made:${creation.id}:${creation.proof?.provedAt ?? 0}`;

export function PlayScreen({ creation, store, progress, runtime, settings }: { creation: Creation; store: CreationStore; progress: ProgressStore; runtime: Runtime | null; settings: Settings }) {
  const [stars, setStars] = useState<Stars | null>(null);
  const key = playKeyOf(creation);
  const makerSteps = creation.proof?.steps;
  const game = creation.kind === 'game';
  // A puzzle's player opens with the names its maker's solution uses (its functions, When cards and memory), all empty. A game's player gets the game, whole, and only plays.
  const level = useMemo(() => {
    if (game) return { ...playerGame(creation), id: key };
    const base = playableOf(creation, `${goalWords(creation)} Tap an instruction to add it to your program.`);
    return { ...base, id: key, programming: { ...base.programming, starterProgram: skeletonOf(creation.proof?.solution ?? []) } };
  }, [creation, key, game]);
  const record = useCallback((event: EventInput) => progress.log(event), [progress]);
  /** A game's backpack is the game's, whoever plays it: what it kept is there next time. */
  const onLiveEnd = useCallback(
    (final: SimState, program: ProgramIR) => {
      const kept = keptOf(program, final.memory);
      if (Object.keys(kept).length > 0) store.update(creation.id, { saved: { ...store.get(creation.id)?.saved, ...kept } });
    },
    [store, creation.id],
  );
  const onSolved = useCallback(({ steps }: Solved) => setStars(progress.complete({ levelId: key, usedHints: false, steps, budget: game ? undefined : makerSteps })), [progress, key, makerSteps, game]);

  return (
    <PlaySurface
      level={level}
      runtime={runtime}
      settings={settings}
      record={record}
      onSolved={onSolved}
      lockNames
      {...(game && { initialProgram: creation.proof?.solution ?? creation.program, saved: creation.saved ?? {}, onLiveEnd })}
      completion={({ restart, winner }) =>
        stars && (
          <div className="dialog-backdrop" role="presentation">
            <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="done-title">
              <h2 id="done-title" className="dialog-title">
                {winner ?? (game ? `You won ${creation.title}!` : `You solved ${creation.title}!`)}
              </h2>
              <ul className="star-row" aria-label="Stars">
                <li className="star-slot is-earned">
                  <Star earned size={44} />
                  <span>{winner ? 'Played to a win' : game ? 'Won it' : 'Solved it'}</span>
                </li>
                {makerSteps !== undefined && !game && (
                  <li className={`star-slot ${stars.budget ? 'is-earned' : ''}`}>
                    <Star earned={stars.budget === true} size={44} />
                    <span>
                      {makerSteps} {makerSteps === 1 ? 'card' : 'cards'} or fewer, like its maker
                    </span>
                    <span className="visually-hidden">{stars.budget ? ', earned' : ', not yet'}</span>
                  </li>
                )}
              </ul>
              <div className="dialog-actions">
                <button type="button" className="btn btn-quiet" autoFocus onClick={restart}>
                  Play again
                </button>
                <a className="btn btn-quiet" href={hashFor({ screen: 'map' })}>
                  Map
                </a>
              </div>
            </section>
          </div>
        )
      }
    />
  );
}
