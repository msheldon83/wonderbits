/**
 * Asking for an invite. A grown-up who has no code can leave their email
 * address and a line about who they are. The owner sees the request on
 * their page and approves or declines it. Approving makes an invite for one
 * family and mails its link to the person who asked.
 *
 * Nothing is mailed to the address when the request is made, so the form
 * cannot be used to send mail to strangers; the only mail it causes without
 * the owner's say-so goes to the owner, and at most one every quarter hour.
 */
import { Hono } from 'hono';
import { requireAdmin } from './admin';
import { Refusal, type Context } from './context';
import type { Sql } from './db';
import { asId, readJson } from './http';
import { cleanText, DIGEST_MINUTES } from './insight';
import { randomCode, showCode } from './tokens';

const NOTE_MAX = 200;
/** Requests taken in an hour, from everyone together, and the most that may wait at once. Beyond these the form says to try later. */
export const REQUESTS_PER_HOUR = 30;
export const REQUESTS_WAITING_MAX = 300;
/** An answered request is kept this long, then deleted. */
export const KEEP_ANSWERED_DAYS = 30;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Deletes requests answered more than a month ago. Returns how many. */
export async function pruneRequests(sql: Sql): Promise<number> {
  const gone = await sql`delete from access_requests where decided_at < now() - make_interval(days => ${KEEP_ANSWERED_DAYS}) returning id`;
  return gone.length;
}

/** Tell the owner that people are waiting. At most one mail in DIGEST_MINUTES. Returns how many requests it covered. */
export async function notifyOfRequests(ctx: Context): Promise<number> {
  if (ctx.adminEmails.length === 0) return 0;
  const { sql } = ctx;
  const [recent] = await sql`select 1 from access_requests where mailed_at > now() - make_interval(mins => ${DIGEST_MINUTES}) limit 1`;
  if (recent) return 0;
  const fresh = await sql`update access_requests set mailed_at = now() where mailed_at is null and decision is null returning id`;
  if (fresh.length === 0) return 0;
  const subject = fresh.length === 1 ? 'Wonderbits: someone asked for an invite' : `Wonderbits: ${fresh.length} people asked for an invite`;
  for (const to of ctx.adminEmails) {
    await ctx.mailer
      .send({ to, subject, text: `${subject.replace('Wonderbits: ', '')}.\n\nApprove or decline: ${ctx.publicUrl}/#/admin` })
      .catch((e: unknown) => console.error('request mail failed', e));
  }
  return fresh.length;
}

/** Open to anyone: the form on the sign-in screen. */
export function requestRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  app.post('/request', async (c) => {
    const body = await readJson(c);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !EMAIL.test(email)) throw new Refusal(400, 'email');
    const note = typeof body.note === 'string' && body.note.trim().length > 0 ? cleanText(body.note).slice(0, NOTE_MAX) : null;

    // Someone who already has an account needs no invite. The answer is the same, so nothing is learned about the address.
    const [known] = await sql`select 1 from parents where email = ${email}`;
    if (known) return c.json({ ok: true });

    const [load] = await sql<{ hour: string; waiting: string }[]>`
      select count(*) filter (where created_at > now() - interval '1 hour') as hour, count(*) filter (where decision is null) as waiting
      from access_requests`;
    if (Number(load!.hour) >= REQUESTS_PER_HOUR || Number(load!.waiting) >= REQUESTS_WAITING_MAX) throw new Refusal(429, 'busy');

    // Asking twice changes the note and nothing else. A request already answered stays answered.
    await sql`
      insert into access_requests (email, note) values (${email}, ${note})
      on conflict (email) do update set note = excluded.note where access_requests.decision is null`;
    await notifyOfRequests(ctx);
    return c.json({ ok: true });
  });

  return app;
}

/** The owner's side, mounted under /api/admin. */
export function requestAdminRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /** Who is waiting, oldest first, and the last few answered. Unlike the rest of the owner's page this shows addresses: they were given to the owner on purpose. */
  app.get('/requests', async (c) => {
    await requireAdmin(ctx, c);
    await pruneRequests(sql);
    const requests = await sql`
      select id, email, note, created_at as "createdAt", decision, decided_at as "decidedAt"
      from access_requests
      order by (decision is null) desc, case when decision is null then created_at end, decided_at desc
      limit 200`;
    return c.json({ requests });
  });

  /** Yes: make an invite for one family and mail them its link. */
  app.post('/requests/:id/approve', async (c) => {
    await requireAdmin(ctx, c);
    const id = asId(c.req.param('id'));
    const approved = await sql.begin(async (tx) => {
      const [request] = await tx<{ email: string }[]>`select email from access_requests where id = ${id} and decision is null for update`;
      if (!request) throw new Refusal(404, 'not-found');
      const code = randomCode();
      await tx`insert into invites (code, max_uses, note) values (${code}, 1, ${`asked: ${request.email}`.slice(0, 60)})`;
      await tx`update access_requests set decision = 'approved', decided_at = now(), invite_code = ${code} where id = ${id}`;
      return { email: request.email, code };
    });
    const link = `${ctx.publicUrl}/#/grownup/invite/${showCode(approved.code)}`;
    let mailed = true;
    await ctx.mailer
      .send({
        to: approved.email,
        subject: 'Your invite to Wonderbits',
        text: ['You asked for an invite to Wonderbits, and here it is.', '', `Open this link to sign up: ${link}`, '', `Or go to ${ctx.publicUrl}/#/grownup and enter the code ${showCode(approved.code)}.`, '', 'It is good for one family. If you did not ask for this, you can ignore this message.'].join('\n'),
      })
      .catch((e: unknown) => {
        console.error('invite mail failed', e);
        mailed = false;
      });
    // If the mail could not be sent the owner is told, and has the code to pass on another way.
    return c.json({ ok: true, mailed, code: approved.code });
  });

  /** No. Nothing is mailed. */
  app.post('/requests/:id/decline', async (c) => {
    await requireAdmin(ctx, c);
    const done = await sql`update access_requests set decision = 'declined', decided_at = now() where id = ${asId(c.req.param('id'))} and decision is null returning id`;
    if (done.length === 0) throw new Refusal(404, 'not-found');
    return c.json({ ok: true });
  });

  return app;
}
