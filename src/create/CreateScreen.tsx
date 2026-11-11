/**
 * Create: the shelf of everything the child has made, and the ways to
 * start something new. It is always open; a quiet line points at the next
 * island to play, and nothing here is locked.
 */
import { useState } from 'react';
import { hashFor, type LevelChoice } from '../app/levels';
import type { ProgressStore } from '../progress/store';
import { blankCreation } from './blank';
import { remixOf } from './remix';
import { BoardThumb } from './BoardThumb';
import type { CreationStore } from './store';
import type { Creation } from './types';
import type { PuzzleDefinition } from '../lessons/types';

/** "My island", "My island 2", … : the first name not on the shelf yet. */
export function nextTitle(creations: readonly Creation[], base = 'My island'): string {
  const taken = new Set(creations.map((c) => c.title));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function CreateScreen({ creations, store, progress, choices, onGoTo }: { creations: readonly Creation[]; store: CreationStore; progress: ProgressStore; choices: readonly LevelChoice[]; onGoTo(hash: string): void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  /** The nudge: the island of the first level not finished yet. */
  const next = choices.find((c) => !progress.levelProgress(c.level.id).stars.complete);
  const [picking, setPicking] = useState(false);
  /** Levels the child has finished: those are the ones they may change. */
  const finished = choices.filter((c) => progress.levelProgress(c.level.id).stars.complete);
  const startRemix = (level: PuzzleDefinition) => {
    const made = store.add(remixOf(level));
    progress.log({ levelId: made.id, kind: 'creation-started', basedOn: level.id });
    onGoTo(hashFor({ screen: 'make', id: made.id }));
  };
  const startBlank = () => {
    const made = store.add(blankCreation(nextTitle(creations)));
    progress.log({ levelId: made.id, kind: 'creation-started' });
    onGoTo(hashFor({ screen: 'make', id: made.id }));
  };
  return (
    <div className="create">
      <section className="create-group" aria-labelledby="create-new">
        <h2 id="create-new" className="panel-title">
          Make something new
        </h2>
        <div className="create-starts">
          <button type="button" className="create-start" onClick={startBlank}>
            <span className="create-start-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="create-start-words">
              <strong>An empty island</strong>
              <small>Start with a robot, a flag and every tile yours to place.</small>
            </span>
          </button>
          <button type="button" className="create-start" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
            <span className="create-start-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34">
                <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M14.2 9.4C15.2 7.6 16.4 7 17 7h3M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="create-start-words">
              <strong>Change a level</strong>
              <small>Take a level you finished and make it yours.</small>
            </span>
          </button>
        </div>
        {picking &&
          (finished.length === 0 ? (
            <p className="create-empty">Finish a level first. Then you can change it here.</p>
          ) : (
            <ul className="shelf remix-list" aria-label="Levels you finished">
              {finished.map((c) => (
                <li key={c.level.id} className="shelf-item">
                  <button type="button" className="shelf-card" onClick={() => startRemix(c.level)}>
                    <BoardThumb world={c.level.world} size={96} />
                    <span className="shelf-title">{c.level.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="create-group" aria-labelledby="create-shelf">
        <h2 id="create-shelf" className="panel-title">
          My things
        </h2>
        {creations.length === 0 ? (
          <p className="create-empty">Nothing here yet. What you make is kept on this shelf.</p>
        ) : (
          <ul className="shelf">
            {creations.map((c) => (
              <li key={c.id} className="shelf-item">
                <a className="shelf-card" href={hashFor({ screen: 'make', id: c.id })}>
                  <BoardThumb world={c.world} />
                  <span className="shelf-title">{c.title}</span>
                </a>
                {removing === c.id ? (
                  <span className="choice-row">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        store.remove(c.id);
                        progress.log({ levelId: c.id, kind: 'creation-removed' });
                        setRemoving(null);
                      }}
                    >
                      Yes, throw it away
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setRemoving(null)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-quiet shelf-remove" onClick={() => setRemoving(c.id)} aria-label={`Throw away ${c.title}`}>
                    Throw away
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {next && (
        <p className="create-nudge">
          Next island: <strong>{next.packTitle}</strong>
          <a className="btn btn-quiet" href={hashFor({ screen: 'level', id: next.level.id })}>
            Play it
          </a>
        </p>
      )}
    </div>
  );
}
