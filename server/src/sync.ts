/**
 * A child's documents: their progress, their saved places and each thing
 * they made. The server keeps them and numbers every change; it does not
 * read them. Two devices that changed the same document find out here (409)
 * and the app joins the two copies.
 */
import { Hono } from 'hono';
import { Refusal, type Context } from './context';
import { requireChild } from './family';
import { readJson } from './http';

/** One document, as text. Far above anything the game writes; a guard, not a budget. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;
export const MAX_CREATIONS = 200;

const CREATION_KEY = /^creation:[A-Za-z0-9_-]{1,40}$/;
export const isSyncedKey = (key: string): boolean => key === 'progress' || key === 'drafts' || CREATION_KEY.test(key);

interface Doc {
  key: string;
  value: unknown;
  rev: string;
  deleted: boolean;
}

/** Revisions are 64-bit in the database and small in practice; the app gets plain numbers. */
const shape = (d: Doc) => ({ key: d.key, value: d.value, rev: Number(d.rev), deleted: d.deleted });

export function syncRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  /** Everything changed after the revision the device last saw. */
  app.get('/', async (c) => {
    const child = await requireChild(ctx, c);
    const since = Number(c.req.query('since') ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) throw new Refusal(400, 'since');
    const docs = await sql<Doc[]>`select key, value, rev, deleted from documents where child_id = ${child.childId} and rev > ${since} order by rev`;
    await sql`update children set last_active_at = now() where id = ${child.childId} and (last_active_at is null or last_active_at < now() - interval '5 minutes')`;
    return c.json({ docs: docs.map(shape), rev: docs.length > 0 ? Number(docs.at(-1)!.rev) : since });
  });

  /** Store one document, if the device has seen the copy it is replacing. */
  app.put('/:key', async (c) => {
    const child = await requireChild(ctx, c);
    const key = c.req.param('key');
    if (!isSyncedKey(key)) throw new Refusal(400, 'key');
    const text = await c.req.text();
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) throw new Refusal(400, 'too-big');
    const body = await readJson(c);
    const baseRev = body.baseRev;
    if (typeof baseRev !== 'number' || !Number.isSafeInteger(baseRev) || baseRev < 0) throw new Refusal(400, 'baseRev');
    if (typeof body.value !== 'object' || body.value === null) throw new Refusal(400, 'value');
    const deleted = body.deleted === true;

    if (key !== 'progress' && key !== 'drafts' && !deleted) {
      const [count] = await sql<{ n: string }[]>`
        select count(*) as n from documents where child_id = ${child.childId} and key like 'creation:%' and not deleted and key <> ${key}`;
      if (Number(count!.n) >= MAX_CREATIONS) throw new Refusal(409, 'too-many-creations');
    }

    // One statement, so two devices writing at once cannot both win.
    const [stored] = await sql<{ rev: string }[]>`
      insert into documents (child_id, key, value, deleted)
      values (${child.childId}, ${key}, ${sql.json(body.value as never)}, ${deleted})
      on conflict (child_id, key) do update
        set value = excluded.value, deleted = excluded.deleted, rev = nextval('document_rev'), updated_at = now()
        where documents.rev = ${baseRev}
      returning rev`;
    if (!stored) {
      const [current] = await sql<Doc[]>`select key, value, rev, deleted from documents where child_id = ${child.childId} and key = ${key}`;
      return c.json({ error: 'conflict', doc: shape(current!) }, 409);
    }
    return c.json({ rev: Number(stored.rev) });
  });

  return app;
}
