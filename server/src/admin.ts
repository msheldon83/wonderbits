/**
 * The owner's page: where children get stuck, and what they and their
 * grown-ups wrote. Open only to a signed-in grown-up whose address is in
 * ADMIN_EMAILS. It shows patterns, not people: every child appears under a
 * made-up name, and no nickname or email address leaves these routes. An
 * answer to a question is sent by the server to the family's grown-up; the
 * owner never sees where it went.
 */
import { Hono, type Context as Request } from 'hono';
import { Refusal, type Context } from './context';
import { asId, readJson } from './http';
import { cleanText, pseudonym } from './insight';
import { requireParent, type Parent } from './parents';

export const isAdmin = (ctx: Context, email: string): boolean => ctx.adminEmails.includes(email.toLowerCase());

export async function requireAdmin(ctx: Context, c: Request): Promise<Parent> {
  const parent = await requireParent(ctx, c);
  // To anyone else these addresses do not exist.
  if (!isAdmin(ctx, parent.email)) throw new Refusal(404, 'not-found');
  return parent;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** One CSV cell: quoted when it must be, and never starting a formula in a spreadsheet. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (columns: readonly string[], rows: readonly Record<string, unknown>[]): string =>
  [columns.join(','), ...rows.map((r) => columns.map((col) => csvCell(r[col])).join(','))].join('\n') + '\n';

export function adminRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /** Every level anyone has opened, with the numbers that show where children get stuck. */
  app.get('/levels', async (c) => {
    await requireAdmin(ctx, c);
    const rows = await sql`
      select v.level_id as "levelId",
        count(*) as visits,
        count(distinct v.child_id) as children,
        count(distinct v.child_id) filter (where v.ended = 'completed') as finished,
        count(*) filter (where v.ended = 'left') as "leftVisits",
        percentile_cont(0.5) within group (order by v.runs) filter (where v.ended = 'completed') as "medianRuns",
        percentile_cont(0.5) within group (order by v.active_ms) filter (where v.ended = 'completed') as "medianMs",
        count(*) filter (where v.hints_opened > 0) as "hintVisits",
        avg(v.difficulty) as difficulty,
        count(v.difficulty) as ratings,
        count(*) filter (where v.stuck in ('a-bit', 'very')) as "stuckVisits",
        (select count(*) from feedback f where f.context->>'levelId' = v.level_id) as notes
      from level_visits v group by v.level_id order by v.level_id`;
    return c.json({
      levels: rows.map((r) => ({
        levelId: r.levelId as string,
        visits: Number(r.visits),
        children: Number(r.children),
        finished: Number(r.finished),
        leftVisits: Number(r.leftVisits),
        medianRuns: num(r.medianRuns),
        medianMs: num(r.medianMs),
        hintVisits: Number(r.hintVisits),
        difficulty: num(r.difficulty),
        ratings: Number(r.ratings),
        stuckVisits: Number(r.stuckVisits),
        notes: Number(r.notes),
      })),
    });
  });

  /** One level, up close: how runs ended, the wrong answers children share, why they gave up, and what they wrote. */
  app.get('/levels/:levelId', async (c) => {
    await requireAdmin(ctx, c);
    const levelId = c.req.param('levelId');
    const outcomes = await sql`
      select a.outcome, coalesce(a.detail->>'reason', a.detail->>'status', '') as reason, count(*) as runs, count(distinct v.child_id) as children
      from attempts a join level_visits v on v.id = a.visit_id
      where v.level_id = ${levelId} group by 1, 2 order by runs desc`;
    // The same wrong program, built by more than one child, is a misconception worth a look.
    const wrong = await sql`
      select a.program_hash as hash, count(*) as runs, count(distinct v.child_id) as children,
        (array_agg(a.program order by a.at))[1] as program,
        mode() within group (order by a.outcome) as outcome,
        mode() within group (order by coalesce(a.detail->>'reason', a.detail->>'status', '')) as reason
      from attempts a join level_visits v on v.id = a.visit_id
      where v.level_id = ${levelId} and a.outcome <> 'solved' and a.program_hash is not null
      group by a.program_hash order by children desc, runs desc limit 12`;
    // Where a child gave up: the last thing they tried before leaving.
    const quits = await sql`
      select last.outcome, coalesce(last.detail->>'reason', last.detail->>'status', '') as reason, count(*) as visits,
        percentile_cont(0.5) within group (order by v.runs) as "medianRuns",
        percentile_cont(0.5) within group (order by v.active_ms) as "medianMs"
      from level_visits v
      left join lateral (select a.outcome, a.detail from attempts a where a.visit_id = v.id order by a.seq desc limit 1) last on true
      where v.level_id = ${levelId} and v.ended = 'left'
      group by 1, 2 order by visits desc`;
    const ratings = await sql`select difficulty, count(*) as n from level_visits where level_id = ${levelId} and difficulty is not null group by 1 order by 1`;
    const stuck = await sql`select stuck, count(*) as n from level_visits where level_id = ${levelId} and stuck is not null group by 1`;
    const notes = await sql<{ id: string; child_id: string | null; parent_id: string }[]>`
      select id, child_id, parent_id, kind, text, created_at as "createdAt", read_at as "readAt", reply
      from feedback where context->>'levelId' = ${levelId} order by created_at desc limit 100`;
    return c.json({
      levelId,
      outcomes: outcomes.map((o) => ({ outcome: o.outcome, reason: o.reason, runs: Number(o.runs), children: Number(o.children) })),
      wrong: wrong.map((w) => ({ hash: w.hash, runs: Number(w.runs), children: Number(w.children), program: w.program, outcome: w.outcome, reason: w.reason })),
      quits: quits.map((q) => ({ outcome: q.outcome ?? 'no-run', reason: q.reason, visits: Number(q.visits), medianRuns: num(q.medianRuns), medianMs: num(q.medianMs) })),
      ratings: ratings.map((r) => ({ difficulty: Number(r.difficulty), n: Number(r.n) })),
      stuck: stuck.map((s) => ({ stuck: s.stuck, n: Number(s.n) })),
      notes: notes.map(({ child_id, parent_id, ...n }) => ({ ...n, who: child_id ? pseudonym(child_id) : pseudonym(parent_id, 'G') })),
    });
  });

  /** Everything written, newest first. */
  app.get('/feedback', async (c) => {
    await requireAdmin(ctx, c);
    const unread = c.req.query('unread') === '1';
    const kind = c.req.query('kind') ?? '';
    const rows = await sql<{ id: string; child_id: string | null; parent_id: string }[]>`
      select id, child_id, parent_id, kind, text, context, created_at as "createdAt", read_at as "readAt", reply, replied_at as "repliedAt"
      from feedback
      where (${!unread} or read_at is null) and (${kind === ''} or kind = ${kind})
      order by created_at desc limit 300`;
    const [count] = await sql<{ n: string }[]>`select count(*) as n from feedback where read_at is null`;
    return c.json({
      unread: Number(count!.n),
      feedback: rows.map(({ child_id, parent_id, ...f }) => ({ ...f, who: child_id ? pseudonym(child_id) : pseudonym(parent_id, 'G'), fromGrownup: child_id === null })),
    });
  });

  app.post('/feedback/:id/read', async (c) => {
    await requireAdmin(ctx, c);
    await sql`update feedback set read_at = now() where id = ${asId(c.req.param('id'))} and read_at is null`;
    return c.json({ ok: true });
  });

  /** Answer a note. The answer goes to the family's grown-up, by mail and on their page; never straight to a child. */
  app.post('/feedback/:id/reply', async (c) => {
    await requireAdmin(ctx, c);
    const body = await readJson(c);
    const reply = cleanText(body.text);
    const [note] = await sql<{ email: string; text: string; nickname: string | null }[]>`
      update feedback f set reply = ${reply}, replied_at = now(), read_at = coalesce(f.read_at, now())
      from parents p
      where f.id = ${asId(c.req.param('id'))} and p.id = f.parent_id
      returning p.email, f.text, (select nickname from children where id = f.child_id) as nickname`;
    if (!note) throw new Refusal(404, 'not-found');
    await ctx.mailer
      .send({
        to: note.email,
        subject: note.nickname ? `An answer for ${note.nickname} from Wonderbits` : 'An answer from Wonderbits',
        text: [note.nickname ? `${note.nickname} wrote to us from Wonderbits:` : 'You wrote to us from Wonderbits:', '', `  ${note.text}`, '', 'Our answer:', '', `  ${reply}`, '', `It is also on your page: ${ctx.publicUrl}/#/grownup`].join('\n'),
      })
      .catch((e: unknown) => console.error('reply mail failed', e));
    return c.json({ ok: true });
  });

  /** Everything, as CSV, for analysis elsewhere. Children appear under their made-up names. */
  app.get('/export/:what', async (c) => {
    await requireAdmin(ctx, c);
    const what = c.req.param('what').replace(/\.csv$/, '');
    let csv: string;
    if (what === 'visits') {
      const rows = await sql<{ child_id: string }[]>`
        select id as visit, child_id, level_id as level, app_version, opened_at, ended_at, ended, runs, hints_opened, active_ms, stars, difficulty, stuck
        from level_visits order by opened_at`;
      csv = toCsv(
        ['visit', 'child', 'level', 'app_version', 'opened_at', 'ended_at', 'ended', 'runs', 'hints_opened', 'active_ms', 'stars', 'difficulty', 'stuck'],
        rows.map((r) => ({ ...r, child: pseudonym(r.child_id) })),
      );
    } else if (what === 'attempts') {
      const rows = await sql<{ child_id: string }[]>`
        select a.visit_id as visit, v.child_id, v.level_id as level, a.seq, a.at, a.outcome, coalesce(a.detail->>'reason', a.detail->>'status', '') as reason,
          a.cards, a.ms_since_open, a.edits_since_last_run, a.hint_rung, a.prediction_correct, a.program_hash, a.program
        from attempts a join level_visits v on v.id = a.visit_id order by a.at`;
      csv = toCsv(
        ['visit', 'child', 'level', 'seq', 'at', 'outcome', 'reason', 'cards', 'ms_since_open', 'edits_since_last_run', 'hint_rung', 'prediction_correct', 'program_hash', 'program'],
        rows.map((r) => ({ ...r, child: pseudonym(r.child_id) })),
      );
    } else if (what === 'feedback') {
      const rows = await sql<{ child_id: string | null; parent_id: string }[]>`
        select id, child_id, parent_id, kind, context->>'levelId' as level, text, created_at, reply, replied_at from feedback order by created_at`;
      csv = toCsv(
        ['id', 'who', 'kind', 'level', 'text', 'created_at', 'reply', 'replied_at'],
        rows.map((r) => ({ ...r, who: r.child_id ? pseudonym(r.child_id) : pseudonym(r.parent_id, 'G') })),
      );
    } else throw new Refusal(404, 'not-found');
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wonderbits-${what}.csv"` });
  });

  return app;
}
