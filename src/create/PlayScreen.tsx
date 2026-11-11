/**
 * Playing a puzzle someone made on this device. The player gets the cards
 * and the limit its maker set, starts from an empty program, and earns a
 * star for solving it and another for using no more cards than its maker.
 */
import { useCallback, useMemo, useState } from 'react';
import { Star } from '../app/icons';
import { hashFor } from '../app/levels';
import { PlaySurface, type Solved } from '../app/PlaySurface';
import type { ProgressStore } from '../progress/store';
import type { EventInput, Settings, Stars } from '../progress/types';
import type { Runtime } from '../runtime/contract';
import { playableOf } from './CreationScreen';
import type { Creation } from './types';

/** Where a made puzzle's stars are kept: a new proof is a new puzzle, so its stars start again. */
export const playKeyOf = (creation: Creation): string => `made:${creation.id}:${creation.proof?.provedAt ?? 0}`;

/** What the player is asked to do, from the goal its maker chose. */
export function goalWords(creation: Pick<Creation, 'objective'>): string {
  const { reachGoal, collectAll } = creation.objective;
  if (reachGoal && collectAll) return 'Collect every acorn, then get the robot to the flag.';
  if (collectAll) return 'Collect every acorn.';
  return 'Help the robot reach the flag.';
}

export function PlayScreen({ creation, progress, runtime, settings }: { creation: Creation; progress: ProgressStore; runtime: Runtime | null; settings: Settings }) {
  const [stars, setStars] = useState<Stars | null>(null);
  const key = playKeyOf(creation);
  const makerSteps = creation.proof?.steps;
  const level = useMemo(() => ({ ...playableOf(creation, `${goalWords(creation)} Tap an instruction to add it to your program.`), id: key }), [creation, key]);
  const record = useCallback((event: EventInput) => progress.log(event), [progress]);
  const onSolved = useCallback(({ steps }: Solved) => setStars(progress.complete({ levelId: key, usedHints: false, steps, budget: makerSteps })), [progress, key, makerSteps]);

  return (
    <PlaySurface
      level={level}
      runtime={runtime}
      settings={settings}
      record={record}
      onSolved={onSolved}
      completion={({ restart }) =>
        stars && (
          <div className="dialog-backdrop" role="presentation">
            <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="done-title">
              <h2 id="done-title" className="dialog-title">
                You solved {creation.title}!
              </h2>
              <ul className="star-row" aria-label="Stars">
                <li className="star-slot is-earned">
                  <Star earned size={44} />
                  <span>Solved it</span>
                </li>
                {makerSteps !== undefined && (
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
