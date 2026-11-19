/**
 * The grown-up's page: sign in with a link sent by email, then see each
 * child's progress and what they made, add a child, let devices in, and
 * keep or delete what is stored. Children never see this page's contents:
 * it needs the grown-up's own sign-in.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRuntime } from '../app/hooks';
import { loadContent, type LevelChoice } from '../app/levels';
import { BoardThumb } from '../create/BoardThumb';
import { parseCreation } from '../create/parse';
import { PlayScreen } from '../create/PlayScreen';
import { CreationStore } from '../create/store';
import type { Creation } from '../create/types';
import { memoryStore, type KeyValueStore } from '../progress/storage';
import { ProgressStore } from '../progress/store';
import { BADGE_IDS, DEFAULT_SETTINGS, type Progress } from '../progress/types';
import { api, ApiError, OfflineError, type ChildExport, type FamilyInfo, type FamilyNote, type FamilyShare, type ParentInfo } from '../sync/api';
import { Avatar, AVATARS } from './avatars';
import { dismissGuestProgress, hasGuestProgress, importGuestProgress } from './guest';
import { PrivacyNotice } from './PrivacyScreen';
import { deviceName, type AccountStore } from './session';

const words = (e: unknown, known: Record<string, string> = {}): string => {
  if (e instanceof OfflineError) return 'No internet right now. Try again in a moment.';
  if (e instanceof ApiError && known[e.code]) return known[e.code]!;
  return 'That did not work. Try again in a moment.';
};

/** "today", "yesterday", "3 days ago", or a date. */
export function ago(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'not yet';
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export interface ChildSummary {
  finished: number;
  total: number;
  stars: number;
  badges: number;
  /** Islands the child has started, in play order. */
  packs: { title: string; finished: number; total: number }[];
  creations: Creation[];
}

/** What a grown-up wants at a glance, worked out from the documents sync already stores. */
export function summarise(file: ChildExport, choices: readonly LevelChoice[]): ChildSummary {
  const progress = file.documents.find((d) => d.key === 'progress')?.value as Progress | undefined;
  const done = (id: string) => progress?.levels?.[id]?.stars.complete === true;
  const packs = new Map<string, { title: string; finished: number; total: number }>();
  let stars = 0;
  for (const c of choices) {
    const pack = packs.get(c.packId) ?? { title: c.packTitle, finished: 0, total: 0 };
    packs.set(c.packId, pack);
    pack.total++;
    if (done(c.level.id)) pack.finished++;
    const s = progress?.levels?.[c.level.id]?.stars;
    if (s) stars += (s.complete ? 1 : 0) + (s.noHints ? 1 : 0) + (s.budget === true ? 1 : 0);
  }
  const creations: Creation[] = [];
  for (const d of file.documents) {
    if (!d.key.startsWith('creation:')) continue;
    try {
      creations.push(parseCreation(d.value, d.key));
    } catch {
      // Something this build cannot read is left out of the summary; it is still in the download.
    }
  }
  const all = [...packs.values()];
  return {
    finished: all.reduce((n, p) => n + p.finished, 0),
    total: choices.length,
    stars,
    badges: (progress?.badges ?? []).filter((b) => BADGE_IDS.includes(b)).length,
    packs: all.filter((p) => p.finished > 0),
    creations: creations.sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

function download(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseShared(value: unknown): Creation | null {
  try {
    return parseCreation(value, 'share');
  } catch {
    return null;
  }
}

/** A button that asks "are you sure?" in place before doing something that cannot be undone. */
function Confirm({ label, yes, onYes }: { label: string; yes: string; onYes(): void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="btn btn-quiet" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="choice-row">
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          setAsking(false);
          onYes();
        }}
      >
        {yes}
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 id={id} className="panel-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ----- Signing in -----

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.parentStart(email, code.trim() || undefined);
      setSentTo(email.trim());
    } catch (err) {
      setProblem(words(err, { email: 'That does not look like an email address.', invite: 'That invite code is not right, or it has been used.', 'too-many-links': 'Too many links were sent to that address. Try again in an hour.' }));
    } finally {
      setBusy(false);
    }
  };
  if (sentTo)
    return (
      <section className="account-card" aria-labelledby="sent-title">
        <h1 id="sent-title" className="account-title">
          Check your email
        </h1>
        <p className="account-lead">
          A sign-in link is on its way to <strong>{sentTo}</strong>. It works once, for 15 minutes. Open it on this device.
        </p>
        <p className="account-note">Nothing after a few minutes? The first time you sign in you need an invite code, so go back and add it.</p>
        <p className="account-foot">
          <button type="button" className="btn btn-quiet" onClick={() => setSentTo(null)}>
            Back
          </button>
        </p>
      </section>
    );
  return (
    <section className="account-card" aria-labelledby="signin-title">
      <h1 id="signin-title" className="account-title">
        For the grown-up
      </h1>
      <p className="account-lead">Sign in to add your children, see how they are getting on, and keep their work safe. There is no password: we email you a link.</p>
      <form className="account-form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Your email address</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Invite code</span>
          <input type="text" autoComplete="off" autoCapitalize="characters" placeholder="Only the first time" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {problem && (
          <p className="account-problem" role="alert">
            {problem}
          </p>
        )}
        <p className="account-foot">
          <button type="submit" className="btn btn-run" disabled={busy}>
            Email me a link
          </button>
          <a className="btn btn-quiet" href="#/privacy">
            What is kept
          </a>
          <a className="btn btn-quiet" href="#/">
            Back to the game
          </a>
        </p>
      </form>
    </section>
  );
}

// ----- Adding a child -----

function AddChild({ onAdded }: { onAdded(): void }) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string>(AVATARS[0].id);
  const [pin, setPin] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api.addChild({ nickname, avatar, pin, consent });
      setOpen(false);
      setNickname('');
      setPin('');
      setConsent(false);
      onAdded();
    } catch (err) {
      setProblem(
        words(err, {
          nickname: 'A nickname needs 1 to 20 letters.',
          'nickname-taken': 'Another of your children already has that nickname.',
          pin: 'A PIN is 4 to 6 digits.',
          consent: 'Please tick the box to agree.',
          'too-many-children': 'That is as many profiles as one account can hold.',
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button type="button" className="btn btn-run" onClick={() => setOpen(true)}>
        Add a child
      </button>
    );
  return (
    <form className="account-form add-child" onSubmit={(e) => void submit(e)}>
      <label className="field">
        <span>Nickname</span>
        <input type="text" required maxLength={20} autoComplete="off" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <small>What the game calls them. Not their full name.</small>
      </label>
      <div className="field" role="group" aria-labelledby="avatar-label">
        <span id="avatar-label">Picture</span>
        <div className="avatar-row">
          {AVATARS.map((a) => (
            <button key={a.id} type="button" className={`avatar-pick ${avatar === a.id ? 'is-on' : ''}`} aria-pressed={avatar === a.id} aria-label={a.name} onClick={() => setAvatar(a.id)}>
              <Avatar id={a.id} size={48} />
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>PIN</span>
        <input type="text" inputMode="numeric" pattern="\d{4,6}" required maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <small>4 to 6 digits your child can remember. It only works on devices you let in.</small>
      </label>
      <details className="notice">
        <summary>What Wonderbits keeps about your child</summary>
        <PrivacyNotice />
      </details>
      <label className="setting">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I am this child's parent or guardian, and I agree to Wonderbits keeping what is described above.</span>
      </label>
      {problem && (
        <p className="account-problem" role="alert">
          {problem}
        </p>
      )}
      <p className="account-foot">
        <button type="submit" className="btn btn-run" disabled={busy || !consent}>
          Add {nickname.trim() || 'child'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
          Not now
        </button>
      </p>
    </form>
  );
}

// ----- One child -----

function ChildCard({ child, summary, onPlay, onChanged, onProblem }: { child: FamilyInfo['children'][number]; summary: ChildSummary | undefined; onPlay(c: Creation): void; onChanged(): void; onProblem(text: string): void }) {
  const [newPin, setNewPin] = useState<string | null>(null);
  const run = (work: () => Promise<unknown>, known?: Record<string, string>) =>
    void work()
      .then(onChanged)
      .catch((e: unknown) => onProblem(words(e, known)));
  return (
    <li className="child-card">
      <div className="child-head">
        <Avatar id={child.avatar} size={56} />
        <div className="child-name">
          <strong>{child.nickname}</strong>
          <small>Last played {ago(child.lastActiveAt)}</small>
        </div>
      </div>
      {summary ? (
        <dl className="child-stats">
          <div>
            <dt>Levels</dt>
            <dd>
              {summary.finished} of {summary.total}
            </dd>
          </div>
          <div>
            <dt>Stars</dt>
            <dd>{summary.stars}</dd>
          </div>
          <div>
            <dt>Badges</dt>
            <dd>
              {summary.badges} of {BADGE_IDS.length}
            </dd>
          </div>
          <div>
            <dt>Made</dt>
            <dd>{summary.creations.length}</dd>
          </div>
        </dl>
      ) : (
        <p className="account-note">Loading…</p>
      )}
      {summary && (summary.packs.length > 0 || summary.creations.length > 0) && (
        <details className="child-more">
          <summary>Islands and creations</summary>
          {summary.packs.length > 0 && (
            <ul className="pack-list">
              {summary.packs.map((p) => (
                <li key={p.title}>
                  <span>{p.title}</span>
                  <progress max={p.total} value={p.finished} aria-label={`${p.finished} of ${p.total} levels`} />
                  <small>
                    {p.finished} of {p.total}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {summary.creations.length > 0 && (
            <ul className="shelf">
              {summary.creations.map((c) => (
                <li key={c.id} className="shelf-item">
                  <div className="shelf-card">
                    <BoardThumb world={c.world} size={96} />
                    <span className="shelf-title">{c.title}</span>
                    <span className={`ready-tag ${c.status === 'proved' ? '' : 'is-draft'}`}>{c.status === 'proved' ? 'Solved by its maker' : 'Still being made'}</span>
                  </div>
                  {c.status === 'proved' && (
                    <button type="button" className="btn btn-quiet shelf-remove" onClick={() => onPlay(c)}>
                      Play it
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      <details className="child-more">
        <summary>Manage {child.nickname}</summary>
        <div className="manage">
          {newPin === null ? (
            <button type="button" className="btn btn-quiet" onClick={() => setNewPin('')}>
              Set a new PIN
            </button>
          ) : (
            <form
              className="choice-row"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api.updateChild(child.id, { pin: newPin }).then(() => setNewPin(null)), { pin: 'A PIN is 4 to 6 digits.' });
              }}
            >
              <input className="pin-input" type="text" inputMode="numeric" maxLength={6} autoFocus aria-label={`New PIN for ${child.nickname}`} placeholder="New PIN" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />
              <button type="submit" className="btn btn-run" disabled={newPin.length < 4}>
                Save
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setNewPin(null)}>
                Cancel
              </button>
            </form>
          )}
          <small>A new PIN signs {child.nickname} out everywhere.</small>
          <button type="button" className="btn btn-quiet" onClick={() => run(() => api.signOutChild(child.id))}>
            Sign out on every device
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => void api.exportChild(child.id).then((file) => download(`wonderbits-${child.nickname}.json`, file)).catch((e: unknown) => onProblem(words(e)))}>
            Download everything kept
          </button>
          <Confirm label={`Delete ${child.nickname}'s profile`} yes="Yes, delete it all" onYes={() => run(() => api.deleteChild(child.id))} />
          <small>Deleting removes their progress and everything they made from the server, for good.</small>
        </div>
      </details>
    </li>
  );
}

// ----- Helping improve Wonderbits -----

const NOTE_KINDS: Record<string, string> = { 'level-note': 'About a level', confusing: 'Confusing', problem: 'Something broken', idea: 'An idea', question: 'A question', stuck: 'Stuck' };

function Improve({ parent, family, notes, onParent, onChanged, onProblem }: { parent: ParentInfo; family: FamilyInfo | null; notes: FamilyNote[]; onParent(p: ParentInfo): void; onChanged(): void; onProblem(text: string): void }) {
  const { choices } = useMemo(loadContent, []);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const who = (n: FamilyNote) => (n.childId === null ? 'You' : (family?.children.find((c) => c.id === n.childId)?.nickname ?? 'A child'));
  const level = (id: string | null) => (id ? choices.find((c) => c.level.id === id)?.level.title : undefined);
  return (
    <Section id="grownup-improve" title="Help improve Wonderbits">
      <label className="setting">
        <input type="checkbox" checked={parent.improve} onChange={(e) => void api.updateParent({ improve: e.target.checked }).then(onParent).catch((err: unknown) => onProblem(words(err)))} />
        <span>Help improve Wonderbits</span>
        <small>
          Keeps what your children try on each level, how hard they say it was, and lets them write to the people who make Wonderbits. It shows us where children get stuck. Off, none of that is kept and they are not asked. <a href="#/privacy">What is kept</a>
        </small>
      </label>
      <form
        className="setting"
        onSubmit={(e) => {
          e.preventDefault();
          void api
            .sendFamilyFeedback(text)
            .then(() => {
              setText('');
              setSent(true);
              onChanged();
            })
            .catch((err: unknown) => onProblem(words(err, { 'too-many-notes': 'That is a lot for one day. Try again tomorrow.' })));
        }}
      >
        <label className="field">
          <span>Tell us what you see</span>
          <textarea rows={3} maxLength={500} placeholder="What does your child enjoy, or struggle with? Anything we should fix?" value={text} onChange={(e) => (setText(e.target.value), setSent(false))} />
        </label>
        <span className="choice-row">
          <button type="submit" className="btn btn-quiet" disabled={text.trim().length === 0}>
            Send
          </button>
          {sent && <span role="status">Sent. Thank you!</span>}
        </span>
      </form>
      {notes.length > 0 && (
        <details className="child-more" open={notes.some((n) => n.reply !== null)}>
          <summary>What your family has written ({notes.length})</summary>
          <ul className="note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <small>
                  {who(n)} · {NOTE_KINDS[n.kind] ?? n.kind}
                  {level(n.levelId) && ` · ${level(n.levelId)}`} · {ago(n.createdAt)}
                </small>
                <p>{n.text}</p>
                {n.reply && (
                  <p className="note-reply">
                    <small>Answer from Wonderbits, {ago(n.repliedAt)}</small>
                    {n.reply}
                  </p>
                )}
                <button type="button" className="btn btn-quiet shelf-remove" onClick={() => void api.deleteFeedback(n.id).then(onChanged).catch((err: unknown) => onProblem(words(err)))}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

// ----- The dashboard -----

function Dashboard({ parent, account, deviceStore, onParent }: { parent: ParentInfo; account: AccountStore; deviceStore: KeyValueStore; onParent(p: ParentInfo | null): void }) {
  const { choices } = useMemo(loadContent, []);
  const [family, setFamily] = useState<FamilyInfo | null>(null);
  const [shares, setShares] = useState<FamilyShare[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [guest, setGuest] = useState(false);
  const [playing, setPlaying] = useState<Creation | null>(null);
  const [notes, setNotes] = useState<FamilyNote[]>([]);

  const load = useCallback(async () => {
    try {
      const [f, s, n] = await Promise.all([api.family(), api.familyShares(), api.familyFeedback()]);
      setFamily(f);
      setShares(s.shares);
      setNotes(n.feedback);
      const files = await Promise.all(f.children.map((c) => api.exportChild(c.id)));
      setSummaries(Object.fromEntries(files.map((file) => [file.child.id, summarise(file, choices)])));
      // What the device knows of the family may have changed too.
      void account.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onParent(null);
      else setProblem(words(e));
    }
  }, [choices, account, onParent]);
  useEffect(() => void load(), [load]);
  useEffect(() => void hasGuestProgress(deviceStore).then(setGuest), [deviceStore]);

  const run = (work: () => Promise<unknown>, known?: Record<string, string>) => {
    setProblem(null);
    void work()
      .then(load)
      .catch((e: unknown) => setProblem(words(e, known)));
  };

  if (playing) return <Playing creation={playing} onBack={() => setPlaying(null)} />;

  const forMe = shares.filter((s) => s.toChildId === null);
  const between = shares.filter((s) => s.toChildId !== null);
  const shareCard = (s: FamilyShare) => {
    const creation = parseShared(s.creation);
    return (
      <li key={s.id} className="shelf-item">
        <div className="shelf-card">
          {creation && <BoardThumb world={creation.world} size={96} />}
          <span className="shelf-title">{creation?.title ?? 'Something made'}</span>
          <small className="share-from">
            {s.fromNickname}
            {s.toNickname ? ` to ${s.toNickname}` : ''}, {ago(s.createdAt)}
          </small>
          {s.toChildId === null && !s.seenAt && <span className="ready-tag">New</span>}
        </div>
        <span className="choice-row">
          {creation?.status === 'proved' && (
            <button
              type="button"
              className="btn btn-quiet shelf-remove"
              onClick={() => {
                if (s.toChildId === null && !s.seenAt) void api.markFamilyShareSeen(s.id).catch(() => undefined);
                setPlaying(creation);
              }}
            >
              Play it
            </button>
          )}
          <button type="button" className="btn btn-quiet shelf-remove" onClick={() => run(() => api.deleteShare(s.id))}>
            Remove
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className="settings grownup">
      {problem && (
        <p className="account-problem" role="alert">
          {problem}
        </p>
      )}

      {guest && family && family.children.length > 0 && (
        <Section id="grownup-guest" title="Progress already on this device">
          <p className="account-note">Someone played on this device before signing in. Whose stars and creations are they? They are added to that child's profile; nothing they already have is lost.</p>
          <div className="choice-row">
            {family.children.map((c) => (
              <button key={c.id} type="button" className="btn btn-quiet" onClick={() => void importGuestProgress(deviceStore, c.id).then(() => setGuest(false))}>
                <Avatar id={c.avatar} size={28} /> {c.nickname}
              </button>
            ))}
            <button type="button" className="btn btn-quiet" onClick={() => void dismissGuestProgress(deviceStore).then(() => setGuest(false))}>
              Nobody's, leave it
            </button>
          </div>
        </Section>
      )}

      <Section id="grownup-children" title="Your children">
        {family === null ? (
          <p className="account-note">Loading…</p>
        ) : family.children.length === 0 ? (
          <p className="account-note">Add a child to make their profile. Then let a device in, and they can sign in on it with their PIN.</p>
        ) : (
          <ul className="child-list">
            {family.children.map((c) => (
              <ChildCard key={c.id} child={c} summary={summaries[c.id]} onPlay={setPlaying} onChanged={() => void load()} onProblem={setProblem} />
            ))}
          </ul>
        )}
        <AddChild onAdded={() => void load()} />
      </Section>

      {forMe.length > 0 && (
        <Section id="grownup-shown" title="Shown to you">
          <ul className="shelf">{forMe.map(shareCard)}</ul>
        </Section>
      )}

      {between.length > 0 && (
        <Section id="grownup-between" title="Sent between your children">
          <ul className="shelf">{between.map(shareCard)}</ul>
        </Section>
      )}

      <Section id="grownup-devices" title="Devices">
        <p className="account-note">A child can sign in only on a device you have let in. Their PIN works nowhere else.</p>
        {family && family.devices.length > 0 && (
          <ul className="device-list">
            {family.devices.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.name}</strong>
                  {d.id === family.thisDeviceId && ' (this one)'}
                  <small>Last used {ago(d.lastSeenAt)}</small>
                </span>
                <Confirm label="Take away" yes="Yes, sign it out" onYes={() => run(() => api.removeDevice(d.id))} />
              </li>
            ))}
          </ul>
        )}
        {family && family.thisDeviceId === null && (
          <div className="setting">
            <button type="button" className="btn btn-run" onClick={() => run(() => api.allowThisDevice(deviceName()), { 'too-many-devices': 'That is as many devices as one account can hold. Take one away first.' })}>
              Let my children use this device
            </button>
            <small>Use this when you are signed in on the device they will play on.</small>
          </div>
        )}
        <form
          className="setting"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.approveDevice(code).then(() => setCode('')), { code: 'That code is not right, or it is too old. Ask for a new one on the other device.', 'too-many-devices': 'That is as many devices as one account can hold. Take one away first.' });
          }}
        >
          <span className="choice-row">
            <input className="pin-input code-input" type="text" autoComplete="off" autoCapitalize="characters" maxLength={9} aria-label="Code from the other device" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="btn btn-quiet" disabled={code.trim().length < 6}>
              Let that device in
            </button>
          </span>
          <small>On the other device, open Settings and choose "Set up this device". It shows a code to type here.</small>
        </form>
      </Section>

      <Improve parent={parent} family={family} notes={notes} onParent={onParent} onChanged={() => void load()} onProblem={setProblem} />

      <Section id="grownup-account" title="Your account">
        <p className="account-note">Signed in as {parent.email}.</p>
        <label className="setting">
          <input type="checkbox" checked={parent.siblingSharing} onChange={(e) => void api.updateParent({ siblingSharing: e.target.checked }).then(onParent).catch((err: unknown) => setProblem(words(err)))} />
          <span>Children can send creations to each other</span>
          <small>Only between your own children. You see everything they send.</small>
        </label>
        <label className="setting">
          <input type="checkbox" checked={parent.notifyByEmail} onChange={(e) => void api.updateParent({ notifyByEmail: e.target.checked }).then(onParent).catch((err: unknown) => setProblem(words(err)))} />
          <span>Email me when a child shows me something</span>
          <small>A short note, at most one every half hour.</small>
        </label>
        <div className="setting">
          <span className="choice-row">
            <button type="button" className="btn btn-quiet" onClick={() => void api.parentSignOut().then(() => onParent(null))}>
              Sign out
            </button>
            <a className="btn btn-quiet" href="#/privacy">
              What is kept
            </a>
            <a className="btn btn-quiet" href="#/">
              Back to the game
            </a>
            {parent.admin && (
              <a className="btn btn-quiet" href="#/admin">
                The owner's page
              </a>
            )}
          </span>
        </div>
        <div className="setting">
          <Confirm
            label="Delete my account"
            yes="Yes, delete everything"
            onYes={() =>
              void api
                .deleteAccount()
                .then(() => account.refresh())
                .then(() => onParent(null))
                .catch((e: unknown) => setProblem(words(e)))
            }
          />
          <small>Removes you, every child's profile, their progress and everything they made, and signs out every device. It cannot be undone.</small>
        </div>
      </Section>
    </div>
  );
}

/** A grown-up trying a child's puzzle. Nothing is recorded: the stars here are nobody's. */
function Playing({ creation, onBack }: { creation: Creation; onBack(): void }) {
  const runtime = useRuntime();
  const progress = useMemo(() => new ProgressStore(memoryStore()), []);
  useEffect(() => void progress.load(), [progress]);
  // An empty shelf of the grown-up's own: what a game would keep between plays has nowhere to go.
  const shelf = useMemo(() => new CreationStore(memoryStore()), []);
  return (
    <div className="grownup-play">
      <p className="grownup-play-bar">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          Back
        </button>
        <strong>{creation.title}</strong>
        {creation.madeBy && <span>by {creation.madeBy}</span>}
      </p>
      <PlayScreen creation={creation} store={shelf} progress={progress} runtime={runtime} settings={DEFAULT_SETTINGS} />
    </div>
  );
}

export function GrownupScreen({ account, deviceStore, token }: { account: AccountStore; deviceStore: KeyValueStore; token?: string | undefined }) {
  /** undefined while asking the server; null when signed out. */
  const [parent, setParent] = useState<ParentInfo | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const settle = (work: Promise<ParentInfo | null>) =>
      void work
        .catch((e: unknown) => {
          if (!(e instanceof ApiError && e.status === 401)) setProblem(words(e, { link: 'That link has been used or is too old. Ask for a new one.', invite: 'That invite code has been used up. Ask for another.' }));
          return null;
        })
        .then((p) => live && setParent(p));
    if (token) {
      // The link from the email: spend it, then show the page at its plain address.
      settle(
        api
          .parentFinish(token)
          .then(
            () => api.parent(),
            // A link opened twice has already done its work the first time: being signed in is what counts.
            (e: unknown) =>
              api.parent().catch(() => {
                throw e;
              }),
          )
          .finally(() => history.replaceState(null, '', '#/grownup')),
      );
    } else settle(api.parent());
    return () => {
      live = false;
    };
  }, [token]);

  if (parent === undefined)
    return (
      <p className="loading" role="status">
        Loading…
      </p>
    );
  if (parent === null)
    return (
      <div className="account-page">
        {problem && (
          <p className="account-problem" role="alert">
            {problem}
          </p>
        )}
        <SignIn />
      </div>
    );
  return <Dashboard parent={parent} account={account} deviceStore={deviceStore} onParent={setParent} />;
}
