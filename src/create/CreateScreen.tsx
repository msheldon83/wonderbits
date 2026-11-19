/**
 * Create: the shelf of everything the child has made, and the ways to
 * start something new. It is always open; a quiet line points at the next
 * island to play, and nothing here is locked.
 */
import { useMemo, useState } from 'react';
import type { Sharing } from '../app/App';
import { Avatar } from '../account/avatars';
import { hashFor, type LevelChoice } from '../app/levels';
import type { ProgressStore } from '../progress/store';
import { blankCreation } from './blank';
import { parseCreation } from './parse';
import { remixOf } from './remix';
import { gameFrom, loadStarters, type Starter } from './starters';
import { BoardThumb } from './BoardThumb';
import type { CreationStore } from './store';
import { SIZE_DEFAULT, SIZE_MAX, SIZE_MIN, type Creation } from './types';
import { blankWorld } from './blank';
import type { PuzzleDefinition } from '../lessons/types';

/** Sizes to start from. The steppers reach every size between the smallest and the largest. */
export const SIZE_PRESETS = [
  { label: 'Small', width: 5, height: 5 },
  { label: 'Medium', width: 7, height: 6 },
  { label: 'Large', width: 10, height: 8 },
] as const;

/** "My island", "My island 2", … : the first name not on the shelf yet. */
export function nextTitle(creations: readonly Creation[], base = 'My island'): string {
  const taken = new Set(creations.map((c) => c.title));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** What a brother or sister sent, read into a creation; null if this build cannot read it. */
function sharedCreation(value: unknown): Creation | null {
  try {
    return parseCreation(value, 'share');
  } catch {
    return null;
  }
}

export function CreateScreen({ creations, store, progress, choices, onGoTo, sharing }: { creations: readonly Creation[]; store: CreationStore; progress: ProgressStore; choices: readonly LevelChoice[]; onGoTo(hash: string): void; sharing?: Sharing | undefined }) {
  const [removing, setRemoving] = useState<string | null>(null);
  /** The creation being shared, and how the last send went. */
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sent, setSent] = useState<{ to: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const shared = sharingId ? creations.find((c) => c.id === sharingId) : undefined;
  const send = (creation: Creation, to: string, name: string) => {
    if (!sharing) return;
    setSending(true);
    setSent(null);
    void sharing
      .send(to, creation)
      .then(
        () => setSent({ to: name, ok: true }),
        () => setSent({ to: name, ok: false }),
      )
      .finally(() => setSending(false));
  };
  /** Keep something a brother or sister sent: it joins the shelf as a copy, with their name on it. */
  const keep = (shareId: string, from: string, creation: Creation) => {
    const { schemaVersion: _v, id: _id, createdAt: _c, updatedAt: _u, ...rest } = creation;
    const made = store.add({ ...rest, madeBy: creation.madeBy ?? from });
    progress.log({ levelId: made.id, kind: 'creation-started' });
    sharing?.settle(shareId);
  };
  const inbox = (sharing?.inbox ?? []).map((s) => ({ share: s, creation: sharedCreation(s.creation) }));
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
  const starters = useMemo(loadStarters, []);
  const startGame = (starter: Starter) => {
    const made = store.add(gameFrom(starter, nextTitle(creations, starter.title)));
    progress.log({ levelId: made.id, kind: 'creation-started', basedOn: `starter:${starter.id}` });
    onGoTo(hashFor({ screen: 'make', id: made.id }));
  };
  /** Choosing the size of a new island: null until the child asks for one. */
  const [sizing, setSizing] = useState<{ width: number; height: number } | null>(null);
  const startBlank = (width: number, height: number) => {
    const made = store.add(blankCreation(nextTitle(creations), width, height));
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
          <button type="button" className="create-start" aria-haspopup="dialog" onClick={() => setSizing({ ...SIZE_DEFAULT })}>
            <span className="create-start-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="create-start-words">
              <strong>An empty island</strong>
              <small>Pick its size, then start with a robot, a flag and every tile yours to place.</small>
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

      <section className="create-group" aria-labelledby="create-games">
        <h2 id="create-games" className="panel-title">
          The Workshop: start from a game
        </h2>
        <p className="create-empty">Each is a small whole game. Play it, then open it up and change how it works.</p>
        <div className="create-starts">
          {starters.map((s) => (
            <button key={s.id} type="button" className="create-start starter-game" onClick={() => startGame(s)}>
              <span className="starter-thumb">
                <BoardThumb world={s.world} size={72} />
              </span>
              <span className="create-start-words">
                <strong>{s.title}</strong>
                <small>{s.blurb}</small>
                <small className="starter-family">{s.family === 'real-time' ? 'Played with the arrow keys, against the clock' : 'Played by tapping, in turns'}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {inbox.length > 0 && (
        <section className="create-group" aria-labelledby="create-inbox">
          <h2 id="create-inbox" className="panel-title">
            From my family
          </h2>
          <ul className="shelf">
            {inbox.map(({ share, creation }) => (
              <li key={share.id} className="shelf-item">
                <div className="shelf-card">
                  {creation && <BoardThumb world={creation.world} />}
                  <span className="shelf-title">{creation?.title ?? 'Something new'}</span>
                  <span className="share-from">
                    <Avatar id={share.fromAvatar} size={24} /> From {share.fromNickname}
                  </span>
                </div>
                <span className="choice-row">
                  {creation && (
                    <button type="button" className="btn btn-run shelf-remove" onClick={() => keep(share.id, share.fromNickname, creation)}>
                      Keep it
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet shelf-remove" onClick={() => sharing?.settle(share.id)}>
                    No thanks
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  {c.kind === 'game' && <span className="ready-tag is-draft">Game</span>}
                  {c.status === 'proved' && <span className="ready-tag">Ready to play</span>}
                </a>
                {sharing && removing !== c.id && (
                  <button
                    type="button"
                    className="btn btn-quiet shelf-remove"
                    aria-haspopup="dialog"
                    onClick={() => {
                      setSent(null);
                      setSharingId(c.id);
                    }}
                    aria-label={`Share ${c.title}`}
                  >
                    Share
                  </button>
                )}
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

      {sharing && shared && (
        <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setSharingId(null)}>
          <section className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <h2 id="share-title" className="dialog-title">
              Share {shared.title}
            </h2>
            <div className="share-preview">
              <BoardThumb world={shared.world} size={120} />
            </div>
            {sent?.ok ? (
              <p className="share-result" role="status">
                Sent to {sent.to}!
              </p>
            ) : (
              <>
                <div className="share-targets">
                  <button type="button" className="share-target" disabled={sending} onClick={() => send(shared, 'grownup', 'your grown-up')}>
                    <span className="avatar share-grownup" aria-hidden="true">
                      ★
                    </span>
                    <span>Show my grown-up</span>
                  </button>
                  {shared.status === 'proved' &&
                    sharing.siblings.map((sib) => (
                      <button key={sib.id} type="button" className="share-target" disabled={sending} onClick={() => send(shared, sib.id, sib.nickname)}>
                        <Avatar id={sib.avatar} size={56} />
                        <span>Send to {sib.nickname}</span>
                      </button>
                    ))}
                </div>
                {shared.status !== 'proved' && sharing.siblings.length > 0 && <p className="tool-note">Solve it yourself first. Then you can send it to {sharing.siblings.map((sib) => sib.nickname).join(' or ')} to play.</p>}
                {sent && !sent.ok && (
                  <p className="account-problem" role="alert">
                    That did not send. Check the internet and try again. If you have shared a lot today, try tomorrow.
                  </p>
                )}
              </>
            )}
            <div className="dialog-actions">
              <button type="button" className="btn btn-quiet" autoFocus onClick={() => setSharingId(null)}>
                {sent?.ok ? 'Done' : 'Not now'}
              </button>
            </div>
          </section>
        </div>
      )}

      {sizing && (
        <div className="dialog-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && setSizing(null)}>
          <section className="dialog size-dialog" role="dialog" aria-modal="true" aria-labelledby="size-title">
            <h2 id="size-title" className="dialog-title">
              How big is your island?
            </h2>
            <div className="size-presets" role="group" aria-label="Sizes to start from">
              {SIZE_PRESETS.map((p) => (
                <button key={p.label} type="button" className={`btn btn-choice ${sizing.width === p.width && sizing.height === p.height ? 'is-on' : ''}`} aria-pressed={sizing.width === p.width && sizing.height === p.height} onClick={() => setSizing({ width: p.width, height: p.height })}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="size-preview">
              <BoardThumb world={blankWorld(sizing.width, sizing.height)} size={168} />
            </div>
            <div className="size-row">
              {(['width', 'height'] as const).map((side) => (
                <div key={side} className="size-stepper" role="group" aria-label={side === 'width' ? 'Tiles wide' : 'Tiles tall'}>
                  <span className="size-label">{side === 'width' ? 'Wide' : 'Tall'}</span>
                  <button type="button" className="btn btn-icon" disabled={sizing[side] <= SIZE_MIN} aria-label={`${side === 'width' ? 'Wide' : 'Tall'}: one less`} onClick={() => setSizing({ ...sizing, [side]: sizing[side] - 1 })}>
                    −
                  </button>
                  <span className="size-value" aria-live="polite">
                    {sizing[side]}
                  </span>
                  <button type="button" className="btn btn-icon" disabled={sizing[side] >= SIZE_MAX} aria-label={`${side === 'width' ? 'Wide' : 'Tall'}: one more`} onClick={() => setSizing({ ...sizing, [side]: sizing[side] + 1 })}>
                    +
                  </button>
                </div>
              ))}
            </div>
            <p className="tool-note">
              From {SIZE_MIN} to {SIZE_MAX} tiles each way. You can change it later, on the Board step.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-run" autoFocus onClick={() => startBlank(sizing.width, sizing.height)}>
                Make it
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setSizing(null)}>
                Not now
              </button>
            </div>
          </section>
        </div>
      )}

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
