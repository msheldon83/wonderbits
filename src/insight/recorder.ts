/**
 * Feedback loops, on the device. While a signed-in child plays a level, this
 * keeps a record of the visit (how long, how many runs, how it ended) and of
 * each run inside it (the program as it was, and what happened). The records
 * wait in the child's own storage and are sent in batches when the server
 * can be reached; nothing the child does waits for that.
 *
 * It exists only when the grown-up has left "Help improve Wonderbits" on.
 * With nobody signed in, or in a build without accounts, there is no
 * Insight at all and nothing is recorded.
 */
import type { NodeSpec } from '../ir/spec';
import type { KeyValueStore } from '../progress/storage';
import type { RunOutcome } from '../runtime/contract';

const OUTBOX_KEY = 'insight:outbox';
/** Runs kept waiting on a device that cannot reach the server. Beyond this the oldest are dropped. */
export const MAX_WAITING_ATTEMPTS = 500;
const MAX_WAITING_VISITS = 200;
/** Enough for one request; the rest goes with the next. */
const BATCH_VISITS = 100;
const BATCH_ATTEMPTS = 300;
/** A pause longer than this is the child being away, not thinking: it does not count as time on the level. */
const LONGEST_THINK_MS = 60_000;
/** When to ask "Is this one tricky?": this many runs that did not solve it, or this long at it. */
export const STUCK_RUNS = 5;
export const STUCK_MS = 4 * 60_000;

export type AttemptOutcome = 'solved' | 'blocked' | 'halted' | 'missed';
export type Difficulty = 1 | 2 | 3;
export type StuckAnswer = 'fine' | 'a-bit' | 'very';
export type FeedbackKind = 'level-note' | 'confusing' | 'problem' | 'idea' | 'question' | 'stuck';

export interface VisitRecord {
  id: string;
  levelId: string;
  appVersion: string;
  openedAt: number;
  endedAt?: number;
  ended?: 'completed' | 'left';
  runs: number;
  hintsOpened: number;
  activeMs: number;
  stars?: number;
  difficulty?: Difficulty;
  stuck?: StuckAnswer;
}

export interface AttemptRecord {
  visitId: string;
  seq: number;
  at: number;
  program: NodeSpec[];
  cards: number;
  outcome: AttemptOutcome;
  detail: Record<string, unknown>;
  msSinceOpen: number;
  editsSinceLastRun: number;
  hintRung: number;
  predictionCorrect?: boolean;
}

interface Outbox {
  visits: Record<string, VisitRecord>;
  attempts: AttemptRecord[];
}

export interface InsightApi {
  /** Rejects with `{ code: 'off' }` when the grown-up has turned collection off. */
  batch(batch: { visits: VisitRecord[]; attempts: AttemptRecord[] }): Promise<unknown>;
  feedback(kind: FeedbackKind, text: string, context: Record<string, unknown>): Promise<unknown>;
}

/** A finished run, as the play surface reports it. */
export interface RunReport {
  program: NodeSpec[];
  cards: number;
  outcome: RunOutcome;
  /** A random level's program worked on the board shown, and then failed a check: a roll it did not survive, or an outcome it never gave. */
  check?: 'roll' | 'unseen';
}

/** How a run ended, in the four words the server keeps, with the particulars beside it. */
export function outcomeOf(report: Pick<RunReport, 'outcome' | 'check'>): { outcome: AttemptOutcome; detail: Record<string, unknown> } {
  const o = report.outcome;
  if (report.check) return { outcome: 'missed', detail: { status: report.check } };
  if (o.status === 'success') return { outcome: 'solved', detail: {} };
  if (o.status === 'blocked') return { outcome: 'blocked', detail: { reason: o.reason } };
  if (o.status === 'halted') return { outcome: 'halted', detail: { reason: o.reason } };
  return { outcome: 'missed', detail: { status: o.status } };
}

const countCards = (spec: readonly NodeSpec[]): number => JSON.stringify(spec).split('{').length - 1;

export class Insight {
  private outbox: Outbox = { visits: {}, attempts: [] };
  private ready: Promise<void>;
  private off = false;
  private flushing: Promise<void> | null = null;
  /** Counts changes to each visit, to notice one made while it was being sent. */
  private changes = new Map<string, number>();
  /** The visit under way, for attaching to feedback written during it. */
  current: Visit | null = null;
  /** Called when something new is waiting to be sent, so the owner can decide when. */
  onWaiting: () => void = () => {};

  constructor(
    private store: KeyValueStore,
    private api: InsightApi,
    readonly appVersion: string,
    readonly now: () => number = Date.now,
    readonly newId: () => string = () => crypto.randomUUID(),
  ) {
    this.ready = store.get<Outbox>(OUTBOX_KEY).then((saved) => {
      if (saved) this.outbox = { visits: { ...saved.visits, ...this.outbox.visits }, attempts: [...saved.attempts, ...this.outbox.attempts] };
    });
  }

  /** The child opened a level. */
  open(levelId: string): Visit {
    const visit = new Visit(this, levelId);
    this.current = visit;
    return visit;
  }

  /** @internal A visit changed: keep the newest copy for sending. */
  putVisit(record: VisitRecord): void {
    if (this.off) return;
    this.outbox.visits[record.id] = { ...record };
    this.changes.set(record.id, (this.changes.get(record.id) ?? 0) + 1);
    const ids = Object.keys(this.outbox.visits);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_WAITING_VISITS))) delete this.outbox.visits[id];
    void this.save();
    this.onWaiting();
  }

  /** @internal Nothing happened on a visit: forget it. */
  dropVisit(id: string): void {
    delete this.outbox.visits[id];
    this.outbox.attempts = this.outbox.attempts.filter((a) => a.visitId !== id);
    void this.save();
  }

  /** @internal */
  putAttempt(record: AttemptRecord): void {
    if (this.off) return;
    this.outbox.attempts.push(record);
    if (this.outbox.attempts.length > MAX_WAITING_ATTEMPTS) this.outbox.attempts.splice(0, this.outbox.attempts.length - MAX_WAITING_ATTEMPTS);
    void this.save();
  }

  private async save(): Promise<void> {
    await this.ready;
    await this.store.set(OUTBOX_KEY, this.outbox);
  }

  /** How much is waiting to be sent. */
  get waiting(): number {
    return Object.keys(this.outbox.visits).length + this.outbox.attempts.length;
  }

  /** Send what is waiting. Rejects if the server cannot be reached; what was not sent stays for next time. */
  flush(): Promise<void> {
    this.flushing ??= this.send().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async send(): Promise<void> {
    await this.ready;
    while (!this.off && this.waiting > 0) {
      const visits = Object.values(this.outbox.visits).slice(0, BATCH_VISITS);
      const attempts = this.outbox.attempts.slice(0, BATCH_ATTEMPTS);
      const before = new Map(visits.map((v) => [v.id, this.changes.get(v.id) ?? 0]));
      try {
        await this.api.batch({ visits, attempts });
      } catch (e) {
        if ((e as { code?: string }).code !== 'off') throw e;
        // The grown-up turned it off: stop, and keep nothing.
        this.off = true;
        this.outbox = { visits: {}, attempts: [] };
        await this.store.delete(OUTBOX_KEY);
        return;
      }
      const sent = new Set(attempts);
      this.outbox.attempts = this.outbox.attempts.filter((a) => !sent.has(a));
      // A visit still under way is sent again when it next changes; one that changed mid-send stays.
      for (const v of visits) if ((this.changes.get(v.id) ?? 0) === before.get(v.id)) delete this.outbox.visits[v.id];
      await this.store.set(OUTBOX_KEY, this.outbox);
    }
  }

  /** Something the child wrote. Sent at once, with where they were. Rejects if it could not be sent. */
  async sendFeedback(kind: FeedbackKind, text: string, where: { screen?: string; levelId?: string } = {}): Promise<void> {
    const visit = this.current;
    const onLevel = visit !== null && (where.levelId === undefined || where.levelId === visit.record.levelId);
    await this.api.feedback(kind, text, {
      ...where,
      appVersion: this.appVersion,
      ...(onLevel && { levelId: visit.record.levelId, visitId: visit.record.id, runs: visit.record.runs, ...(visit.program && { program: visit.program }) }),
    });
  }
}

/** One time a child opened a level. */
export class Visit {
  readonly record: VisitRecord;
  /** The program as it stands, for attaching to feedback. */
  program: NodeSpec[] | null = null;
  private seq = 0;
  private edits = 0;
  private failed = 0;
  private lastActive: number;
  private prediction: boolean | undefined;
  private asked = false;
  private touched = false;

  constructor(
    private insight: Insight,
    levelId: string,
  ) {
    const at = insight.now();
    this.lastActive = at;
    this.record = { id: insight.newId(), levelId, appVersion: insight.appVersion, openedAt: at, runs: 0, hintsOpened: 0, activeMs: 0 };
  }

  /** Something was done: count the time since the last thing, unless it was a long pause. */
  private tick(): number {
    const at = this.insight.now();
    this.record.activeMs += Math.min(Math.max(at - this.lastActive, 0), LONGEST_THINK_MS);
    this.lastActive = at;
    this.touched = true;
    return at;
  }

  private put(): void {
    this.insight.putVisit(this.record);
  }

  /** The program changed. */
  edited(program: NodeSpec[]): void {
    this.tick();
    this.edits++;
    this.program = program;
  }

  hint(rung: number): void {
    this.tick();
    this.record.hintsOpened = Math.max(this.record.hintsOpened, Math.min(rung + 1, 3));
    this.put();
  }

  /** The child said where the robot would end up, before the run. */
  predicted(correct: boolean): void {
    this.prediction = correct;
  }

  /** A run ended. */
  attempt(report: RunReport): void {
    const at = this.tick();
    const { outcome, detail } = outcomeOf(report);
    this.program = report.program;
    this.record.runs++;
    if (outcome !== 'solved') this.failed++;
    this.insight.putAttempt({
      visitId: this.record.id,
      seq: this.seq++,
      at,
      program: report.program,
      cards: report.cards || countCards(report.program),
      outcome,
      detail,
      msSinceOpen: at - this.record.openedAt,
      editsSinceLastRun: this.edits,
      hintRung: this.record.hintsOpened,
      ...(this.prediction !== undefined && { predictionCorrect: this.prediction }),
    });
    this.edits = 0;
    this.prediction = undefined;
    this.put();
  }

  complete(stars: number): void {
    this.record.ended = 'completed';
    this.record.endedAt = this.insight.now();
    this.record.stars = stars;
    this.put();
  }

  /** The child went elsewhere without finishing. A visit where nothing was done is not worth keeping. */
  leave(): void {
    if (this.insight.current === this) this.insight.current = null;
    if (this.record.ended) return;
    if (!this.touched) {
      this.insight.dropVisit(this.record.id);
      return;
    }
    this.record.ended = 'left';
    this.record.endedAt = this.insight.now();
    this.put();
  }

  rate(difficulty: Difficulty): void {
    this.record.difficulty = difficulty;
    this.put();
  }

  /** True once, when it is time to ask "Is this one tricky?". */
  get shouldAskIfStuck(): boolean {
    if (this.asked || this.record.ended) return false;
    return this.failed >= STUCK_RUNS || (this.failed > 0 && this.record.activeMs >= STUCK_MS);
  }

  /** The question was shown; it is not shown again on this visit. */
  askedIfStuck(): void {
    this.asked = true;
  }

  stuck(answer: StuckAnswer): void {
    this.record.stuck = answer;
    this.put();
  }
}
