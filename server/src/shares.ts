/**
 * Sharing inside one family. A child can send something they made to a
 * brother or sister, or show it to their grown-up. Nothing goes further: the
 * recipient is always a profile under the same parent, and what travels is
 * the creation alone, with no message. The grown-up sees every share.
 */
import { Hono } from 'hono';
import { Refusal, type Context } from './context';
import { requireChild } from './family';
import { asId, readJson } from './http';
import { requireParent } from './parents';
import { MAX_DOCUMENT_BYTES } from './sync';

/** Shares one child may send in a day. */
export const SHARES_PER_DAY = 20;
/** At most one "something is waiting" mail to a grown-up in this many minutes. */
const MAIL_GAP_MINUTES = 30;

export function shareRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /** Send a creation: `to` is a brother or sister's id, or "grownup". */
  app.post('/shares', async (c) => {
    const child = await requireChild(ctx, c);
    const text = await c.req.text();
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw new Refusal(400, 'too-big');
    const body = await readJson(c);
    const creation = body.creation as Record<string, unknown> | null;
    if (typeof creation !== 'object' || creation === null || typeof creation.id !== 'string' || typeof creation.title !== 'string') throw new Refusal(400, 'creation');
    const toGrownup = body.to === 'grownup';

    const [parent] = await sql<{ email: string; notifyByEmail: boolean; siblingSharing: boolean }[]>`
      select email, notify_by_email as "notifyByEmail", sibling_sharing as "siblingSharing" from parents where id = ${child.parentId}`;
    let toChildId: string | null = null;
    if (!toGrownup) {
      toChildId = asId(body.to);
      if (!parent!.siblingSharing) throw new Refusal(403, 'sharing-off');
      if (toChildId === child.childId) throw new Refusal(400, 'to');
      // The whole rule of family sharing: the other child has the same grown-up.
      const [sibling] = await sql`select id from children where id = ${toChildId} and parent_id = ${child.parentId}`;
      if (!sibling) throw new Refusal(404, 'not-found');
      // A brother or sister is sent only a puzzle its maker has solved.
      if (creation.status !== 'proved') throw new Refusal(400, 'not-proved');
    }

    const [today] = await sql<{ n: string }[]>`select count(*) as n from shares where from_child_id = ${child.childId} and created_at > now() - interval '1 day'`;
    if (Number(today!.n) >= SHARES_PER_DAY) throw new Refusal(429, 'too-many-shares');

    const [mailed] = await sql`
      select 1 from shares where parent_id = ${child.parentId} and to_child_id is null and created_at > now() - make_interval(mins => ${MAIL_GAP_MINUTES}) limit 1`;
    const [share] = await sql<{ id: string }[]>`
      insert into shares (parent_id, from_child_id, to_child_id, creation)
      values (${child.parentId}, ${child.childId}, ${toChildId}, ${sql.json(creation as never)})
      returning id`;

    if (toGrownup && parent!.notifyByEmail && !mailed) {
      // The mail says only that something is waiting. A failure to send must not lose the share.
      await ctx.mailer
        .send({
          to: parent!.email,
          subject: `${child.nickname} made something in Wonderbits`,
          text: [`${child.nickname} wants to show you something they made in Wonderbits.`, '', `Sign in to see it: ${ctx.publicUrl}/#/grownup`, '', 'You can turn these messages off there.'].join('\n'),
        })
        .catch((e: unknown) => console.error('share mail failed', e));
    }
    return c.json({ id: share!.id }, 201);
  });

  /** What brothers and sisters have sent this child. */
  app.get('/shares', async (c) => {
    const child = await requireChild(ctx, c);
    const shares = await sql`
      select s.id, s.creation, s.created_at as "createdAt", s.seen_at as "seenAt", f.nickname as "fromNickname", f.avatar as "fromAvatar"
      from shares s join children f on f.id = s.from_child_id
      where s.to_child_id = ${child.childId} order by s.created_at desc limit 100`;
    return c.json({ shares });
  });

  app.post('/shares/:id/seen', async (c) => {
    const child = await requireChild(ctx, c);
    await sql`update shares set seen_at = now() where id = ${asId(c.req.param('id'))} and to_child_id = ${child.childId} and seen_at is null`;
    return c.json({ ok: true });
  });

  /** Everything shared in the family, for the grown-up. */
  app.get('/family/shares', async (c) => {
    const parent = await requireParent(ctx, c);
    const shares = await sql`
      select s.id, s.creation, s.created_at as "createdAt", s.seen_at as "seenAt",
        f.id as "fromChildId", f.nickname as "fromNickname", f.avatar as "fromAvatar",
        t.id as "toChildId", t.nickname as "toNickname"
      from shares s join children f on f.id = s.from_child_id left join children t on t.id = s.to_child_id
      where s.parent_id = ${parent.id} order by s.created_at desc limit 200`;
    return c.json({ shares });
  });

  app.post('/family/shares/:id/seen', async (c) => {
    const parent = await requireParent(ctx, c);
    await sql`update shares set seen_at = now() where id = ${asId(c.req.param('id'))} and parent_id = ${parent.id} and to_child_id is null and seen_at is null`;
    return c.json({ ok: true });
  });

  app.delete('/family/shares/:id', async (c) => {
    const parent = await requireParent(ctx, c);
    const gone = await sql`delete from shares where id = ${asId(c.req.param('id'))} and parent_id = ${parent.id} returning id`;
    if (gone.length === 0) throw new Refusal(404, 'not-found');
    return c.json({ ok: true });
  });

  return app;
}
