/**
 * Feedback loops. Two things arrive here from a signed-in child whose
 * grown-up has left "Help improve Wonderbits" on: a record of each level
 * visit and each run inside it, and anything the child chooses to write.
 * A grown-up can write too, sees everything their children wrote, and can
 * delete it. The people who run this copy read it on the owner's page
 * (admin.ts), where no nickname or address is ever shown.
 */
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { Refusal, type Context } from './context';
import type { Sql } from './db';
import { requireChild } from './family';
import { asId, readJson } from './http';
import { requireParent } from './parents';

export const FEEDBACK_KINDS = ['level-note', 'confusing', 'problem', 'idea', 'question', 'stuck'] as const;
export const TEXT_MAX = 500;
/** Far more than a long session with a note on every level: only there to stop a runaway. */
export const NOTES_PER_DAY = 100;
const PARENT_NOTES_PER_DAY = 20;
const MAX_BATCH_VISITS = 100;
const MAX_BATCH_ATTEMPTS = 300;
const MAX_BATCH_BYTES = 1024 * 1024;
const MAX_PROGRAM_BYTES = 32 * 1024;
const MAX_CONTEXT_BYTES = 32 * 1024;
/** Visits and their attempts are kept this long, then deleted. */
export const KEEP_MONTHS = 12;
/** At most one mail to the owner in this many minutes, however much arrives. */
export const DIGEST_MINUTES = 15;

const OUTCOMES = ['solved', 'blocked', 'halted', 'missed'];
const STUCK = ['fine', 'a-bit', 'very'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The same value whatever order its keys were written in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

/** A short name for a program: two children who built the same thing get the same one. */
export const programHash = (program: unknown): string => createHash('sha256').update(canonical(program)).digest('hex').slice(0, 16);

/**
 * A made-up name for whoever wrote or played, for the owner's page: steady,
 * so one child's visits can be told from another's, and no use for finding
 * out who they are.
 */
export const pseudonym = (id: string, letter: 'K' | 'G' = 'K'): string => `${letter}-${createHash('sha256').update(`wonderbits:${id}`).digest('hex').slice(0, 6)}`;

/**
 * What a child typed, made safe to keep: trimmed, cut to length, and with
 * anything that looks like an email address or a phone number taken out.
 */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') throw new Refusal(400, 'text');
  const text = value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXT_MAX)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[removed]')
    .replace(/\+?\d(?:[\s().-]?\d){6,}/g, '[removed]');
  if (text.length === 0) throw new Refusal(400, 'text');
  return text;
}

const int = (value: unknown, max: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), max) : 0);
const when = (value: unknown): Date | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value) : null);
const HOUR_MS = 60 * 60 * 1000;

function cleanContext(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Buffer.byteLength(JSON.stringify(value)) > MAX_CONTEXT_BYTES ? {} : (value as Record<string, unknown>);
}

async function improveIsOn(sql: Sql, parentId: string): Promise<boolean> {
  const [parent] = await sql<{ improve: boolean }[]>`select improve from parents where id = ${parentId}`;
  return parent?.improve === true;
}

/** Deletes visits (and with them their attempts) older than the keeping time. Returns how many. */
export async function prune(sql: Sql): Promise<number> {
  const gone = await sql`delete from level_visits where opened_at < now() - make_interval(months => ${KEEP_MONTHS}) returning id`;
  return gone.length;
}

/**
 * Tell the owner what has arrived. Sends nothing if nothing is new, if no
 * owner is named, or if a mail went out within the last DIGEST_MINUTES.
 * Returns how many notes the mail covered.
 */
export async function sendDigest(ctx: Context): Promise<number> {
  if (ctx.adminEmails.length === 0) return 0;
  const { sql } = ctx;
  const [recent] = await sql`select 1 from feedback where mailed_at > now() - make_interval(mins => ${DIGEST_MINUTES}) limit 1`;
  if (recent) return 0;
  const fresh = await sql<{ id: string; kind: string; text: string; child_id: string | null; parent_id: string; level: string | null }[]>`
    update feedback set mailed_at = now() where mailed_at is null
    returning id, kind, text, child_id, parent_id, context->>'levelId' as level`;
  if (fresh.length === 0) return 0;
  const lines = fresh.map((f) => `${f.child_id ? pseudonym(f.child_id) : pseudonym(f.parent_id, 'G')}  [${f.kind}${f.level ? `, ${f.level}` : ''}]\n${f.text}`);
  const subject = fresh.length === 1 ? 'Wonderbits: one new note' : `Wonderbits: ${fresh.length} new notes`;
  for (const to of ctx.adminEmails) {
    await ctx.mailer
      .send({ to, subject, text: [...lines, `Read and answer them: ${ctx.publicUrl}/#/admin`].join('\n\n') })
      .catch((e: unknown) => console.error('digest mail failed', e));
  }
  return fresh.length;
}

export function insightRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /** Visits and attempts from a child's device. Safe to send twice. */
  app.post('/insight/batch', async (c) => {
    const child = await requireChild(ctx, c);
    if (Buffer.byteLength(await c.req.text()) > MAX_BATCH_BYTES) throw new Refusal(400, 'too-big');
    const body = await readJson(c);
    // The grown-up turned it off: the device is told, and stops collecting.
    if (!(await improveIsOn(sql, child.parentId))) throw new Refusal(403, 'off');
    const visits = Array.isArray(body.visits) ? body.visits.slice(0, MAX_BATCH_VISITS) : [];
    const attempts = Array.isArray(body.attempts) ? body.attempts.slice(0, MAX_BATCH_ATTEMPTS) : [];
    const now = Date.now();
    let stored = 0;

    for (const v of visits as Record<string, unknown>[]) {
      const opened = when(v?.openedAt);
      if (typeof v?.id !== 'string' || !UUID.test(v.id) || typeof v.levelId !== 'string' || v.levelId.length < 1 || v.levelId.length > 80 || !opened) continue;
      // A device's clock can be wrong; a visit from the future is pulled back to now.
      const openedAt = opened.getTime() > now + HOUR_MS ? new Date(now) : opened;
      const ended = v.ended === 'completed' || v.ended === 'left' ? v.ended : null;
      const difficulty = v.difficulty === 1 || v.difficulty === 2 || v.difficulty === 3 ? v.difficulty : null;
      const stuck = typeof v.stuck === 'string' && STUCK.includes(v.stuck) ? v.stuck : null;
      const stars = typeof v.stars === 'number' ? int(v.stars, 3) : null;
      // A later copy of a visit replaces an earlier one, but only its owner's.
      const done = await sql`
        insert into level_visits (id, child_id, level_id, app_version, opened_at, ended_at, ended, runs, hints_opened, active_ms, stars, difficulty, stuck)
        values (${v.id}, ${child.childId}, ${v.levelId}, ${typeof v.appVersion === 'string' ? v.appVersion.slice(0, 40) : ''}, ${openedAt}, ${when(v.endedAt)}, ${ended},
          ${int(v.runs, 100_000)}, ${int(v.hintsOpened, 3)}, ${int(v.activeMs, 24 * HOUR_MS)}, ${stars}, ${difficulty}, ${stuck})
        on conflict (id) do update set
          ended_at = excluded.ended_at, ended = excluded.ended, runs = excluded.runs, hints_opened = excluded.hints_opened, active_ms = excluded.active_ms,
          stars = excluded.stars, difficulty = excluded.difficulty, stuck = excluded.stuck, stored_at = now()
          where level_visits.child_id = excluded.child_id
        returning id`;
      stored += done.length;
    }

    for (const a of attempts as Record<string, unknown>[]) {
      const at = when(a?.at);
      if (typeof a?.visitId !== 'string' || !UUID.test(a.visitId) || typeof a.outcome !== 'string' || !OUTCOMES.includes(a.outcome) || !at) continue;
      const fits = a.program !== undefined && a.program !== null && Buffer.byteLength(JSON.stringify(a.program)) <= MAX_PROGRAM_BYTES;
      // Stored only into a visit this child owns; a second copy of the same run is ignored.
      const done = await sql`
        insert into attempts (visit_id, seq, at, program, program_hash, cards, outcome, detail, ms_since_open, edits_since_last_run, hint_rung, prediction_correct)
        select v.id, ${int(a.seq, 100_000)}, ${at}, ${fits ? sql.json(a.program as never) : null}, ${fits ? programHash(a.program) : null}, ${int(a.cards, 10_000)},
          ${a.outcome}, ${sql.json(cleanContext(a.detail) as never)}, ${int(a.msSinceOpen, 24 * HOUR_MS)}, ${int(a.editsSinceLastRun, 100_000)}, ${int(a.hintRung, 3)},
          ${typeof a.predictionCorrect === 'boolean' ? a.predictionCorrect : null}
        from level_visits v where v.id = ${a.visitId} and v.child_id = ${child.childId}
        on conflict (visit_id, seq) do nothing
        returning seq`;
      stored += done.length;
    }
    return c.json({ stored });
  });

  /** A child writes to the people who make Wonderbits. */
  app.post('/feedback', async (c) => {
    const child = await requireChild(ctx, c);
    const body = await readJson(c);
    if (!(await improveIsOn(sql, child.parentId))) throw new Refusal(403, 'off');
    if (typeof body.kind !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(body.kind)) throw new Refusal(400, 'kind');
    const text = cleanText(body.text);
    const [today] = await sql<{ n: string }[]>`select count(*) as n from feedback where child_id = ${child.childId} and created_at > now() - interval '1 day'`;
    if (Number(today!.n) >= NOTES_PER_DAY) throw new Refusal(429, 'too-many-notes');
    const [made] = await sql<{ id: string }[]>`
      insert into feedback (parent_id, child_id, kind, text, context)
      values (${child.parentId}, ${child.childId}, ${body.kind}, ${text}, ${sql.json(cleanContext(body.context) as never)})
      returning id`;
    await sendDigest(ctx);
    return c.json({ id: made!.id }, 201);
  });

  /** A grown-up writes: what they see their child struggle with, or anything else. */
  app.post('/family/feedback', async (c) => {
    const parent = await requireParent(ctx, c);
    const body = await readJson(c);
    const kind = body.kind === 'question' || body.kind === 'problem' ? body.kind : 'idea';
    const text = cleanText(body.text);
    const [today] = await sql<{ n: string }[]>`select count(*) as n from feedback where parent_id = ${parent.id} and child_id is null and created_at > now() - interval '1 day'`;
    if (Number(today!.n) >= PARENT_NOTES_PER_DAY) throw new Refusal(429, 'too-many-notes');
    const [made] = await sql<{ id: string }[]>`
      insert into feedback (parent_id, kind, text, context) values (${parent.id}, ${kind}, ${text}, ${sql.json({ screen: 'grownup' })})
      returning id`;
    await sendDigest(ctx);
    return c.json({ id: made!.id }, 201);
  });

  /** Everything this family has written, and any answers. */
  app.get('/family/feedback', async (c) => {
    const parent = await requireParent(ctx, c);
    const feedback = await sql`
      select f.id, f.child_id as "childId", f.kind, f.text, f.context->>'levelId' as "levelId", f.created_at as "createdAt", f.reply, f.replied_at as "repliedAt"
      from feedback f where f.parent_id = ${parent.id} order by f.created_at desc limit 300`;
    return c.json({ feedback });
  });

  app.delete('/family/feedback/:id', async (c) => {
    const parent = await requireParent(ctx, c);
    const gone = await sql`delete from feedback where id = ${asId(c.req.param('id'))} and parent_id = ${parent.id} returning id`;
    if (gone.length === 0) throw new Refusal(404, 'not-found');
    return c.json({ ok: true });
  });

  return app;
}
