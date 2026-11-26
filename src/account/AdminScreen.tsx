/**
 * The owner's page: where children get stuck, the wrong answers they share,
 * and what they and their grown-ups wrote. Only the people who run this copy
 * can open it (the server checks). Children appear under made-up names such
 * as K-3fa9c1; there is no nickname or address anywhere on it.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { loadContent } from '../app/levels';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import { printProgram } from '../projection/printTs';
import { api, ApiError, OfflineError, type AccessRequest, type AdminFeedback, type AdminInvite, type AdminLevel, type AdminLevelDetail } from '../sync/api';
import { ago, Confirm } from './GrownupScreen';

const pct = (part: number, whole: number): string => (whole === 0 ? '–' : `${Math.round((100 * part) / whole)}%`);
const mins = (ms: number | null): string => (ms === null ? '–' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 60_000).toFixed(1)}m`);
const oneDp = (n: number | null): string => (n === null ? '–' : n.toFixed(1));

/** A program a child ran, as the code the game would show for it. */
export function programCode(spec: unknown): string {
  try {
    const code = printProgram(programFromSpec(spec as NodeSpec[], sequentialIdFactory()));
    // The two header lines are the same for every program.
    return code
      .split('\n')
      .slice(2)
      .join('\n')
      .replace(/ *\/\/ @node \S+/g, '')
      .trim();
  } catch {
    return JSON.stringify(spec, null, 2);
  }
}

const OUTCOME_WORDS: Record<string, string> = {
  solved: 'Solved it',
  blocked: 'Blocked',
  halted: 'Stopped: ran too long',
  missed: 'Finished without reaching the goal',
  'no-run': 'Never pressed Run',
};
const REASON_WORDS: Record<string, string> = {
  incomplete: 'ended somewhere else',
  lost: 'game over',
  error: 'asked for something impossible',
  roll: 'failed on another roll',
  unseen: 'never gave one of the outcomes',
  'step-limit': 'too many steps',
  'time-limit': 'took too long',
  forever: 'a loop that never ends',
};
export const outcomeWords = (outcome: string, reason: string): string => `${OUTCOME_WORDS[outcome] ?? outcome}${reason ? ` (${REASON_WORDS[reason] ?? reason})` : ''}`;

const KIND_WORDS: Record<string, string> = { 'level-note': 'About a level', confusing: 'Confusing', problem: 'Broken', idea: 'Idea', question: 'Question', stuck: 'Stuck' };

type SortKey = 'order' | 'children' | 'finished' | 'left' | 'runs' | 'time' | 'hints' | 'difficulty' | 'stuck' | 'notes';

/** The number a column sorts by. Shares are of visits, so a level two children tried once each is not drowned by one tried forty times. */
export function sortValue(l: AdminLevel, key: SortKey): number {
  switch (key) {
    case 'children':
      return l.children;
    case 'finished':
      return l.children === 0 ? 0 : l.finished / l.children;
    case 'left':
      return l.visits === 0 ? 0 : l.leftVisits / l.visits;
    case 'runs':
      return l.medianRuns ?? 0;
    case 'time':
      return l.medianMs ?? 0;
    case 'hints':
      return l.visits === 0 ? 0 : l.hintVisits / l.visits;
    case 'difficulty':
      return l.difficulty ?? 0;
    case 'stuck':
      return l.visits === 0 ? 0 : l.stuckVisits / l.visits;
    case 'notes':
      return l.notes;
    case 'order':
      return 0;
  }
}

function useLevelNames() {
  return useMemo(() => {
    const { choices } = loadContent();
    const names = new Map(choices.map((c, i) => [c.level.id, { title: c.level.title, pack: c.packTitle, number: c.number, order: i }]));
    return (id: string) => names.get(id) ?? { title: id, pack: 'Not in this build', number: 0, order: Number.MAX_SAFE_INTEGER };
  }, []);
}

function LevelDetail({ levelId, name, onBack }: { levelId: string; name: { title: string; pack: string; number: number }; onBack(): void }) {
  const [detail, setDetail] = useState<AdminLevelDetail | null>(null);
  useEffect(() => void api.adminLevel(levelId).then(setDetail), [levelId]);
  const runs = detail?.outcomes.reduce((n, o) => n + o.runs, 0) ?? 0;
  return (
    <div className="settings grownup admin">
      <p className="grownup-play-bar">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          All levels
        </button>
        <strong>
          {name.pack} {name.number > 0 && `· ${name.number}`} · {name.title}
        </strong>
      </p>
      {!detail ? (
        <p className="account-note">Loading…</p>
      ) : (
        <>
          <section className="settings-group" aria-labelledby="admin-wrong">
            <h2 id="admin-wrong" className="panel-title">
              Wrong answers children share
            </h2>
            {detail.wrong.length === 0 ? (
              <p className="account-note">No failed runs recorded on this level.</p>
            ) : (
              <ul className="wrong-list">
                {detail.wrong.map((w) => (
                  <li key={w.hash}>
                    <p>
                      <strong>
                        {w.children} {w.children === 1 ? 'child' : 'children'}
                      </strong>
                      , {w.runs} {w.runs === 1 ? 'run' : 'runs'}: {outcomeWords(w.outcome, w.reason)}
                    </p>
                    <pre className="admin-code">{programCode(w.program)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="settings-group" aria-labelledby="admin-outcomes">
            <h2 id="admin-outcomes" className="panel-title">
              How runs ended
            </h2>
            <table className="admin-table">
              <tbody>
                {detail.outcomes.map((o) => (
                  <tr key={`${o.outcome}:${o.reason}`}>
                    <th scope="row">{outcomeWords(o.outcome, o.reason)}</th>
                    <td>{pct(o.runs, runs)}</td>
                    <td>
                      {o.runs} {o.runs === 1 ? 'run' : 'runs'}
                    </td>
                    <td>
                      {o.children} {o.children === 1 ? 'child' : 'children'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="settings-group" aria-labelledby="admin-quits">
            <h2 id="admin-quits" className="panel-title">
              Where children gave up
            </h2>
            {detail.quits.length === 0 ? (
              <p className="account-note">Nobody has left this level unfinished.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Their last run</th>
                    <th scope="col">Visits</th>
                    <th scope="col">Runs before leaving</th>
                    <th scope="col">Time on it</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.quits.map((q) => (
                    <tr key={`${q.outcome}:${q.reason}`}>
                      <th scope="row">{outcomeWords(q.outcome, q.reason)}</th>
                      <td>{q.visits}</td>
                      <td>{oneDp(q.medianRuns)}</td>
                      <td>{mins(q.medianMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="settings-group" aria-labelledby="admin-said">
            <h2 id="admin-said" className="panel-title">
              What children said
            </h2>
            <p className="account-note">
              Difficulty: {[1, 2, 3].map((d) => `${['Easy', 'Just right', 'Hard'][d - 1]} ${detail.ratings.find((r) => r.difficulty === d)?.n ?? 0}`).join(' · ')}. Asked "Is this one tricky?":{' '}
              {(['fine', 'a-bit', 'very'] as const).map((s) => `${{ fine: 'fine', 'a-bit': 'a bit', very: 'very' }[s]} ${detail.stuck.find((r) => r.stuck === s)?.n ?? 0}`).join(' · ')}.
            </p>
            {detail.notes.length === 0 ? (
              <p className="account-note">Nothing written about this level yet.</p>
            ) : (
              <ul className="note-list">
                {detail.notes.map((n) => (
                  <li key={n.id}>
                    <small>
                      {n.who} · {KIND_WORDS[n.kind] ?? n.kind} · {ago(n.createdAt)}
                    </small>
                    <p>{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Inbox() {
  const nameOf = useLevelNames();
  const [filter, setFilter] = useState<'all' | 'unread' | 'question'>('unread');
  const [inbox, setInbox] = useState<{ unread: number; feedback: AdminFeedback[] } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(() => void api.adminFeedback({ unread: filter === 'unread', ...(filter === 'question' && { kind: 'question' }) }).then(setInbox), [filter]);
  useEffect(load, [load]);
  const act = (work: Promise<unknown>) =>
    void work.then(load, (e: unknown) => setProblem(e instanceof OfflineError ? 'No internet right now.' : 'That did not work. Try again in a moment.'));
  return (
    <section className="settings-group" aria-labelledby="admin-inbox">
      <h2 id="admin-inbox" className="panel-title">
        Inbox {inbox && inbox.unread > 0 && <span className="count-dot">{inbox.unread}</span>}
      </h2>
      <div className="choice-row" role="group" aria-label="Which notes to show">
        {(['unread', 'question', 'all'] as const).map((f) => (
          <button key={f} type="button" className={`btn btn-choice ${filter === f ? 'is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {{ unread: 'Unread', question: 'Questions', all: 'Everything' }[f]}
          </button>
        ))}
      </div>
      {problem && (
        <p className="account-problem" role="alert">
          {problem}
        </p>
      )}
      {!inbox ? (
        <p className="account-note">Loading…</p>
      ) : inbox.feedback.length === 0 ? (
        <p className="account-note">Nothing here.</p>
      ) : (
        <ul className="note-list">
          {inbox.feedback.map((f) => {
            const level = typeof f.context.levelId === 'string' ? nameOf(f.context.levelId) : null;
            return (
              <li key={f.id} className={f.readAt ? '' : 'is-unread'}>
                <small>
                  {f.who} ({f.fromGrownup ? 'a grown-up' : 'a child'}) · {KIND_WORDS[f.kind] ?? f.kind}
                  {level && ` · ${level.pack} · ${level.title}`} · {ago(f.createdAt)}
                </small>
                <p>{f.text}</p>
                {Array.isArray(f.context.program) && (
                  <details className="child-more">
                    <summary>The program in front of them{typeof f.context.runs === 'number' && `, after ${f.context.runs} runs`}</summary>
                    <pre className="admin-code">{programCode(f.context.program)}</pre>
                  </details>
                )}
                {f.reply ? (
                  <p className="note-reply">
                    <small>Your answer, sent to their grown-up {ago(f.repliedAt)}</small>
                    {f.reply}
                  </p>
                ) : (
                  <form
                    className="note-answer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(api.adminReply(f.id, drafts[f.id] ?? ''));
                    }}
                  >
                    <textarea rows={2} maxLength={500} aria-label={`Answer ${f.who}`} placeholder="Write an answer. It goes to their grown-up, by email and on their page." value={drafts[f.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [f.id]: e.target.value })} />
                    <span className="choice-row">
                      <button type="submit" className="btn btn-quiet" disabled={(drafts[f.id] ?? '').trim().length === 0}>
                        Send answer
                      </button>
                      {!f.readAt && (
                        <button type="button" className="btn btn-quiet" onClick={() => act(api.adminMarkRead(f.id))}>
                          Mark as read
                        </button>
                      )}
                    </span>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A code as people read it: in fours, ABCD-EFGH. */
export const showInvite = (code: string): string => code.replace(/(.{4})(?=.)/g, '$1-');

/** The link to send someone: it opens the grown-up's sign-in with the code filled in. Built from this page's own address, so it is right on any host. */
export const inviteLink = (code: string, page: string = location.href): string => `${page.split('#')[0]}#/grownup/invite/${showInvite(code)}`;

/** Why an invite no longer works, or null while it does. */
export const inviteOver = (i: AdminInvite): 'Stopped' | 'Used up' | null => (i.stoppedAt ? 'Stopped' : i.uses >= i.maxUses ? 'Used up' : null);

/**
 * Invites: who may sign up. A code is good for a number of families; anyone
 * who has it, or its link, can use it until it runs out or is stopped. The
 * list shows how much of each is used, never by whom.
 */
/** People asking for an invite. Approving makes one for a single family and mails them its link. */
function Requests({ onApproved }: { onApproved(): void }) {
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const load = useCallback(() => void api.adminRequests().then((r) => setRequests(r.requests)), []);
  useEffect(load, [load]);
  if (!requests || requests.length === 0) return null;
  const waiting = requests.filter((r) => r.decision === null);
  const answered = requests.filter((r) => r.decision !== null);
  const fail = () => setSaid('That did not work. Try again in a moment.');
  return (
    <div className="requests">
      <h3 className="requests-title">
        Asking for an invite {waiting.length > 0 && <span className="count-dot">{waiting.length}</span>}
      </h3>
      {said && (
        <p className="account-note" role="status">
          {said}
        </p>
      )}
      {waiting.length === 0 ? (
        <p className="account-note">Nobody is waiting.</p>
      ) : (
        <ul className="invite-list">
          {waiting.map((r) => (
            <li key={r.id}>
              <span className="invite-about">
                <strong>{r.email}</strong>
                <small>
                  {r.note ? `${r.note} · ` : ''}asked {ago(r.createdAt)}
                </small>
              </span>
              <span className="choice-row">
                <button
                  type="button"
                  className="btn btn-run"
                  onClick={() =>
                    void api.adminApproveRequest(r.id).then((done) => {
                      setSaid(done.mailed ? `An invite has been mailed to ${r.email}.` : `The mail to ${r.email} could not be sent. Their invite is ${showInvite(done.code)}: pass it on yourself.`);
                      load();
                      onApproved();
                    }, fail)
                  }
                >
                  Approve
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => void api.adminDeclineRequest(r.id).then(load, fail)}>
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {answered.length > 0 && (
        <details className="child-more">
          <summary>Answered in the last month ({answered.length})</summary>
          <ul className="invite-list">
            {answered.map((r) => (
              <li key={r.id} className="is-over">
                <span className="invite-about">
                  <strong>{r.email}</strong>
                  <small>
                    {r.decision === 'approved' ? 'Approved' : 'Declined'} {ago(r.decidedAt)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Invites() {
  const [invites, setInvites] = useState<AdminInvite[] | null>(null);
  const [uses, setUses] = useState('1');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  /** The code whose link was just copied, or is being shown to copy by hand. */
  const [copied, setCopied] = useState<{ code: string; byHand: boolean } | null>(null);
  const load = useCallback(() => void api.adminInvites().then((r) => setInvites(r.invites)), []);
  useEffect(load, [load]);
  const fail = (e: unknown) =>
    setProblem(e instanceof OfflineError ? 'No internet right now.' : e instanceof ApiError && e.code === 'too-many-invites' ? 'That is a lot of live invites. Stop some you no longer need first.' : 'That did not work. Try again in a moment.');
  const make = (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    void api.adminMakeInvite(Number(uses) || 1, note).then(() => {
      setNote('');
      setUses('1');
      load();
    }, fail);
  };
  const copy = (code: string) => {
    // The clipboard is not always allowed (an old browser, a page not served securely): then show the link to copy by hand.
    void (navigator.clipboard?.writeText(inviteLink(code)) ?? Promise.reject(new Error('no clipboard'))).then(
      () => setCopied({ code, byHand: false }),
      () => setCopied({ code, byHand: true }),
    );
  };
  return (
    <section className="settings-group" aria-labelledby="admin-invites">
      <h2 id="admin-invites" className="panel-title">
        Invites
      </h2>
      <p className="account-note">A grown-up needs an invite to sign up. Anyone who has a code or its link can use it until it runs out or you stop it.</p>
      <Requests onApproved={load} />
      <form className="invite-form" onSubmit={make}>
        <label className="field field-small">
          <span>How many families</span>
          <input type="number" min={1} max={500} required value={uses} onChange={(e) => setUses(e.target.value)} />
        </label>
        <label className="field">
          <span>Who it is for</span>
          <input type="text" maxLength={60} placeholder="A note for you, such as: work colleagues" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-run">
          Make invite
        </button>
      </form>
      {problem && (
        <p className="account-problem" role="alert">
          {problem}
        </p>
      )}
      {!invites ? (
        <p className="account-note">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="account-note">No invites yet.</p>
      ) : (
        <ul className="invite-list">
          {invites.map((i) => {
            const over = inviteOver(i);
            return (
              <li key={i.code} className={over ? 'is-over' : ''}>
                <span className="invite-about">
                  <span className="invite-code">{showInvite(i.code)}</span>
                  <small>
                    {i.uses} of {i.maxUses} used{i.note ? ` · ${i.note}` : ''} · made {ago(i.createdAt)}
                    {over && ` · ${over}`}
                  </small>
                </span>
                {!over && (
                  <span className="choice-row">
                    <button type="button" className="btn btn-quiet" onClick={() => copy(i.code)}>
                      {copied?.code === i.code && !copied.byHand ? 'Copied' : 'Copy link'}
                    </button>
                    <Confirm label="Stop" yes="Yes, stop it" onYes={() => void api.adminStopInvite(i.code).then(load, fail)} />
                  </span>
                )}
                {!over && copied?.code === i.code && copied.byHand && <input className="invite-link" readOnly aria-label={`Link for invite ${showInvite(i.code)}`} value={inviteLink(i.code)} autoFocus onFocus={(e) => e.target.select()} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AdminScreen() {
  const nameOf = useLevelNames();
  const [levels, setLevels] = useState<AdminLevel[] | null>(null);
  const [refused, setRefused] = useState<'signed-out' | 'not-owner' | 'offline' | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: 'left', down: true });
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void api.adminLevels().then(
      (r) => setLevels(r.levels),
      (e: unknown) => setRefused(e instanceof ApiError && e.status === 401 ? 'signed-out' : e instanceof ApiError ? 'not-owner' : 'offline'),
    );
  }, []);

  if (refused)
    return (
      <div className="account-page">
        <section className="account-card">
          <h1 className="account-title">The owner's page</h1>
          <p className="account-lead">
            {refused === 'signed-out' ? 'Sign in as the grown-up first, with the address that runs this copy of Wonderbits.' : refused === 'not-owner' ? 'This page is for the people who run this copy of Wonderbits.' : 'No internet right now. Try again in a moment.'}
          </p>
          <p className="account-foot">
            <a className="btn btn-quiet" href="#/grownup">
              For the grown-up
            </a>
            <a className="btn btn-quiet" href="#/">
              Back to the game
            </a>
          </p>
        </section>
      </div>
    );
  if (!levels)
    return (
      <p className="loading" role="status">
        Loading…
      </p>
    );
  if (open) return <LevelDetail levelId={open} name={nameOf(open)} onBack={() => setOpen(null)} />;

  const sorted = [...levels].sort((a, b) => {
    const byOrder = nameOf(a.levelId).order - nameOf(b.levelId).order;
    if (sort.key === 'order') return sort.down ? -byOrder : byOrder;
    return (sort.down ? -1 : 1) * (sortValue(a, sort.key) - sortValue(b, sort.key)) || byOrder;
  });
  const column = (key: SortKey, label: string, title: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.down ? 'descending' : 'ascending') : 'none'} title={title}>
      <button type="button" className="link-button" onClick={() => setSort({ key, down: sort.key === key ? !sort.down : key !== 'order' })}>
        {label}
        {sort.key === key && (sort.down ? ' ↓' : ' ↑')}
      </button>
    </th>
  );
  return (
    <div className="settings grownup admin">
      <Invites />
      <Inbox />
      <section className="settings-group" aria-labelledby="admin-levels">
        <h2 id="admin-levels" className="panel-title">
          Levels
        </h2>
        {levels.length === 0 ? (
          <p className="account-note">Nothing recorded yet. Numbers appear here once signed-in children have played.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table admin-levels">
              <thead>
                <tr>
                  {column('order', 'Level', 'In play order')}
                  {column('children', 'Children', 'Children who opened it and did something')}
                  {column('finished', 'Finished', 'Share of those children who finished it')}
                  {column('left', 'Left', 'Share of visits that ended without finishing')}
                  {column('runs', 'Runs', 'Typical number of runs in a visit that finished it')}
                  {column('time', 'Time', 'Typical time on it in a visit that finished it')}
                  {column('hints', 'Hints', 'Share of visits where a hint was opened')}
                  {column('difficulty', 'Felt', 'Average rating: 1 easy, 2 just right, 3 hard')}
                  {column('stuck', 'Stuck', 'Share of visits where the child said it was tricky')}
                  {column('notes', 'Notes', 'Things written about it')}
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const name = nameOf(l.levelId);
                  return (
                    <tr key={l.levelId}>
                      <th scope="row">
                        <button type="button" className="link-button" onClick={() => setOpen(l.levelId)}>
                          {name.pack} {name.number > 0 && `· ${name.number}`} · {name.title}
                        </button>
                      </th>
                      <td>{l.children}</td>
                      <td>{pct(l.finished, l.children)}</td>
                      <td>{pct(l.leftVisits, l.visits)}</td>
                      <td>{oneDp(l.medianRuns)}</td>
                      <td>{mins(l.medianMs)}</td>
                      <td>{pct(l.hintVisits, l.visits)}</td>
                      <td>
                        {oneDp(l.difficulty)}
                        {l.ratings > 0 && <small> ({l.ratings})</small>}
                      </td>
                      <td>{pct(l.stuckVisits, l.visits)}</td>
                      <td>{l.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="account-note">With only a few children, one child moves these numbers a lot. Open a level to see what they actually tried.</p>
      </section>
      <section className="settings-group" aria-labelledby="admin-download">
        <h2 id="admin-download" className="panel-title">
          Download
        </h2>
        <p className="account-note">Everything recorded, as CSV. Children appear under the same made-up names as here.</p>
        <span className="choice-row">
          {(['visits', 'attempts', 'feedback'] as const).map((what) => (
            <a key={what} className="btn btn-quiet" href={`${import.meta.env.BASE_URL}api/admin/export/${what}.csv`} download>
              {what[0]!.toUpperCase() + what.slice(1)}
            </a>
          ))}
          <a className="btn btn-quiet" href="#/grownup">
            For the grown-up
          </a>
        </span>
      </section>
    </div>
  );
}
