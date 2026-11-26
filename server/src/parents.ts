/**
 * Grown-up accounts. A parent has an email address and nothing else: no
 * password. To sign in they ask for a link, which works once and for fifteen
 * minutes. While the app is invite-only, a new parent also needs an invite
 * code, which is spent when their account is made.
 */
import { Hono, type Context as Request } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { Refusal, type Context } from './context';
import { readJson, setSecret } from './http';
import { cleanCode, hashToken, randomToken } from './tokens';

export const PARENT_COOKIE = 'wb_parent';
const LINK_MINUTES = 15;
const SESSION_DAYS = 30;
/** Sign-in links one address may be sent in an hour. */
const LINKS_PER_HOUR = 5;

export interface Parent {
  id: string;
  email: string;
  notifyByEmail: boolean;
  siblingSharing: boolean;
  /** "Help improve Wonderbits": what children try and write may be kept for the people who run this copy. */
  improve: boolean;
}

/** Loose on purpose: the link arriving is the real check. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) throw new Refusal(400, 'email');
  return email;
}

/** The signed-in parent, or a 401. */
export async function requireParent(ctx: Context, c: Request): Promise<Parent> {
  const token = getCookie(c, PARENT_COOKIE);
  if (!token) throw new Refusal(401, 'signed-out');
  const [parent] = await ctx.sql<Parent[]>`
    select p.id, p.email, p.notify_by_email as "notifyByEmail", p.sibling_sharing as "siblingSharing", p.improve
    from sessions s join parents p on p.id = s.parent_id
    where s.token_hash = ${hashToken(token)} and s.kind = 'parent' and s.expires_at > now()`;
  if (!parent) throw new Refusal(401, 'signed-out');
  return parent;
}

export function parentRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /**
   * Ask for a sign-in link. With an invite code this is a sign-up, and a bad
   * code is refused. Without one the answer is always the same, so nobody
   * can learn from it whether an address has an account.
   */
  app.post('/start', async (c) => {
    const body = await readJson(c);
    const email = cleanEmail(body.email);
    const typedCode = typeof body.inviteCode === 'string' ? cleanCode(body.inviteCode) : '';

    const [existing] = await sql<{ id: string }[]>`select id from parents where email = ${email}`;
    let inviteCode: string | null = null;
    if (!existing) {
      if (ctx.inviteRequired) {
        if (!typedCode) return c.json({ ok: true });
        const [invite] = await sql<{ code: string }[]>`select code from invites where code = ${typedCode} and uses < max_uses and stopped_at is null`;
        if (!invite) throw new Refusal(400, 'invite');
        inviteCode = invite.code;
      }
    }

    const [recent] = await sql<{ n: string }[]>`select count(*) as n from login_tokens where email = ${email} and created_at > now() - interval '1 hour'`;
    if (Number(recent!.n) >= LINKS_PER_HOUR) throw new Refusal(429, 'too-many-links');

    const token = randomToken();
    await sql`
      insert into login_tokens (token_hash, email, invite_code, expires_at)
      values (${hashToken(token)}, ${email}, ${inviteCode}, now() + make_interval(mins => ${LINK_MINUTES}))`;
    await ctx.mailer.send({
      to: email,
      subject: 'Your Wonderbits sign-in link',
      text: [
        'Open this link to sign in to Wonderbits as the grown-up:',
        '',
        `${ctx.publicUrl}/#/grownup/signin/${token}`,
        '',
        `It works once, for ${LINK_MINUTES} minutes. If you did not ask for it, you can ignore this message.`,
      ].join('\n'),
    });
    return c.json({ ok: true });
  });

  /** Spend a sign-in link. The app posts the token, so a mail scanner that only opens the link uses nothing up. */
  app.post('/finish', async (c) => {
    const body = await readJson(c);
    if (typeof body.token !== 'string' || body.token.length === 0) throw new Refusal(400, 'link');

    const session = randomToken();
    const email = await sql.begin(async (tx) => {
      const [link] = await tx<{ email: string; invite_code: string | null }[]>`
        update login_tokens set used_at = now()
        where token_hash = ${hashToken(body.token as string)} and used_at is null and expires_at > now()
        returning email, invite_code`;
      if (!link) throw new Refusal(400, 'link');

      let [parent] = await tx<{ id: string }[]>`select id from parents where email = ${link.email}`;
      if (!parent) {
        if (ctx.inviteRequired) {
          // The invite may have been spent by someone else, or stopped, since the link was sent.
          const spent = link.invite_code === null ? [] : await tx`update invites set uses = uses + 1 where code = ${link.invite_code} and uses < max_uses and stopped_at is null returning code`;
          if (spent.length === 0) throw new Refusal(400, 'invite');
        }
        [parent] = await tx<{ id: string }[]>`insert into parents (email) values (${link.email}) returning id`;
      }
      await tx`delete from sessions where expires_at < now()`;
      await tx`
        insert into sessions (token_hash, kind, parent_id, expires_at)
        values (${hashToken(session)}, 'parent', ${parent!.id}, now() + make_interval(days => ${SESSION_DAYS}))`;
      return link.email;
    });

    setSecret(ctx, c, PARENT_COOKIE, session, SESSION_DAYS);
    return c.json({ email });
  });

  app.get('/me', async (c) => {
    const parent = await requireParent(ctx, c);
    return c.json({ email: parent.email, notifyByEmail: parent.notifyByEmail, siblingSharing: parent.siblingSharing, improve: parent.improve, admin: ctx.adminEmails.includes(parent.email) });
  });

  app.patch('/me', async (c) => {
    const parent = await requireParent(ctx, c);
    const body = await readJson(c);
    const notify = typeof body.notifyByEmail === 'boolean' ? body.notifyByEmail : parent.notifyByEmail;
    const sharing = typeof body.siblingSharing === 'boolean' ? body.siblingSharing : parent.siblingSharing;
    const improve = typeof body.improve === 'boolean' ? body.improve : parent.improve;
    await sql`update parents set notify_by_email = ${notify}, sibling_sharing = ${sharing}, improve = ${improve} where id = ${parent.id}`;
    return c.json({ email: parent.email, notifyByEmail: notify, siblingSharing: sharing, improve, admin: ctx.adminEmails.includes(parent.email) });
  });

  /** The whole account: the parent, every child, everything they made, every device. Gone at once. */
  app.delete('/me', async (c) => {
    const parent = await requireParent(ctx, c);
    await sql`delete from login_tokens where email = ${parent.email}`;
    await sql`delete from parents where id = ${parent.id}`;
    deleteCookie(c, PARENT_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.post('/signout', async (c) => {
    const token = getCookie(c, PARENT_COOKIE);
    if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
    deleteCookie(c, PARENT_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return app;
}
