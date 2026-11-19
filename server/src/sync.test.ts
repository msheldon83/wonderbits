import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Sql } from './db';
import { memoryMailer } from './mail';
import { SHARES_PER_DAY } from './shares';
import { isSyncedKey, MAX_DOCUMENT_BYTES } from './sync';
import { addChild, Browser, childOn, emptyTables, freshDatabase, signedInParent } from './testing';

let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;
let parent: Browser;
let robinId: string;
let wrenId: string;
let robin: Browser;
let wren: Browser;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await emptyTables(sql);
  mailer = memoryMailer();
  app = createApp({ sql, mailer, publicUrl: 'https://wonderbits.example' });
  parent = await signedInParent(app, sql, mailer, 'lee@example.com');
  robinId = await addChild(parent, 'Robin');
  wrenId = await addChild(parent, 'Wren');
  robin = await childOn(app, parent, robinId);
  wren = await childOn(app, parent, wrenId);
  mailer.sent.length = 0;
});

describe('sync', () => {
  it('stores a document and gives it back to another device', async () => {
    const { rev } = await robin.ok(robin.put('/api/sync/progress', { baseRev: 0, value: { version: 1, levels: {} } }));
    expect(rev).toBeGreaterThan(0);
    const laptop = await childOn(app, parent, robinId);
    expect(await laptop.ok(laptop.get('/api/sync?since=0'))).toEqual({ docs: [{ key: 'progress', value: { version: 1, levels: {} }, rev, deleted: false }], rev });
    expect(await laptop.ok(laptop.get(`/api/sync?since=${rev}`))).toEqual({ docs: [], rev });
  });

  it('tells a device that is behind, and takes the write once it has caught up', async () => {
    const first = await robin.ok(robin.put('/api/sync/progress', { baseRev: 0, value: { n: 1 } }));
    const laptop = await childOn(app, parent, robinId);
    const stale = await laptop.ok(laptop.put('/api/sync/progress', { baseRev: 0, value: { n: 2 } }), 409);
    expect(stale).toEqual({ error: 'conflict', doc: { key: 'progress', value: { n: 1 }, rev: first.rev, deleted: false } });
    const second = await laptop.ok(laptop.put('/api/sync/progress', { baseRev: first.rev, value: { n: 3 } }));
    expect(second.rev).toBeGreaterThan(first.rev);
    expect((await robin.put('/api/sync/progress', { baseRev: first.rev, value: { n: 4 } })).status).toBe(409);
  });

  it('keeps each child’s documents to that child', async () => {
    await robin.ok(robin.put('/api/sync/creation:c-abc', { baseRev: 0, value: { id: 'c-abc', title: 'Robin’s island' } }));
    expect((await wren.ok(wren.get('/api/sync'))).docs).toEqual([]);
    // The same key under another child is another document.
    await wren.ok(wren.put('/api/sync/creation:c-abc', { baseRev: 0, value: { id: 'c-abc', title: 'Wren’s island' } }));
    expect((await robin.ok(robin.get('/api/sync'))).docs[0].value.title).toBe('Robin’s island');
  });

  it('remembers that a creation was thrown away', async () => {
    const made = await robin.ok(robin.put('/api/sync/creation:c-abc', { baseRev: 0, value: { id: 'c-abc' } }));
    const gone = await robin.ok(robin.put('/api/sync/creation:c-abc', { baseRev: made.rev, value: { deleted: true, at: 5 }, deleted: true }));
    const { docs } = await robin.ok(robin.get(`/api/sync?since=${made.rev}`));
    expect(docs).toEqual([{ key: 'creation:c-abc', value: { deleted: true, at: 5 }, rev: gone.rev, deleted: true }]);
  });

  it('needs a signed-in child, a known kind of document and a sane size', async () => {
    expect((await new Browser(app).get('/api/sync')).status).toBe(401);
    expect((await parent.get('/api/sync')).status).toBe(401);
    expect(await robin.ok(robin.put('/api/sync/log', { baseRev: 0, value: [] }), 400)).toEqual({ error: 'key' });
    expect(await robin.ok(robin.put('/api/sync/settings', { baseRev: 0, value: {} }), 400)).toEqual({ error: 'key' });
    expect((await robin.put('/api/sync/progress', { value: {} })).status).toBe(400);
    expect((await robin.put('/api/sync/progress', { baseRev: 0, value: 'text' })).status).toBe(400);
    expect(await robin.ok(robin.put('/api/sync/progress', { baseRev: 0, value: { pad: 'x'.repeat(MAX_DOCUMENT_BYTES) } }), 400)).toEqual({ error: 'too-big' });
    expect((await robin.get('/api/sync?since=-1')).status).toBe(400);
  });

  it('knows which documents travel', () => {
    expect(['progress', 'drafts', 'creation:c-1a2b'].every(isSyncedKey)).toBe(true);
    expect(['log', 'settings', 'creation:', 'creation:a/b', 'sync:state'].some(isSyncedKey)).toBe(false);
  });
});

describe('family sharing', () => {
  const proved = { id: 'c-abc', title: 'Bridge', status: 'proved' };

  it('sends a solved puzzle to a brother or sister', async () => {
    await robin.ok(robin.post('/api/shares', { to: wrenId, creation: proved }), 201);
    const { shares } = await wren.ok(wren.get('/api/shares'));
    expect(shares).toMatchObject([{ creation: proved, fromNickname: 'Robin', fromAvatar: 'fox', seenAt: null }]);
    expect((await robin.ok(robin.get('/api/shares'))).shares).toEqual([]);
    await wren.ok(wren.post(`/api/shares/${shares[0].id}/seen`));
    expect((await wren.ok(wren.get('/api/shares'))).shares[0].seenAt).not.toBeNull();
    expect(mailer.sent).toHaveLength(0);
  });

  it('never leaves the family', async () => {
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    const strangerId = await addChild(other, 'Sparrow');
    expect(await robin.ok(robin.post('/api/shares', { to: strangerId, creation: proved }), 404)).toEqual({ error: 'not-found' });
    const [count] = await sql<{ n: string }[]>`select count(*) as n from shares`;
    expect(Number(count!.n)).toBe(0);
    // And the other family's grown-up sees nothing of this one's.
    await robin.ok(robin.post('/api/shares', { to: 'grownup', creation: proved }), 201);
    expect((await other.ok(other.get('/api/family/shares'))).shares).toEqual([]);
  });

  it('refuses a draft, oneself, and nonsense', async () => {
    expect(await robin.ok(robin.post('/api/shares', { to: wrenId, creation: { ...proved, status: 'draft' } }), 400)).toEqual({ error: 'not-proved' });
    expect((await robin.post('/api/shares', { to: robinId, creation: proved })).status).toBe(400);
    expect((await robin.post('/api/shares', { to: wrenId, creation: 'a string' })).status).toBe(400);
    expect((await robin.post('/api/shares', { to: 'everyone', creation: proved })).status).toBe(404);
    expect((await parent.post('/api/shares', { to: wrenId, creation: proved })).status).toBe(401);
  });

  it('shows the grown-up a creation, with one short mail', async () => {
    await robin.ok(robin.post('/api/shares', { to: 'grownup', creation: { id: 'c-1', title: 'Half done', status: 'draft' } }), 201);
    await robin.ok(robin.post('/api/shares', { to: 'grownup', creation: proved }), 201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'lee@example.com', subject: 'Robin made something in Wonderbits' });
    expect(mailer.sent[0]!.text).toContain('https://wonderbits.example/#/grownup');
    expect(mailer.sent[0]!.text).not.toContain('Half done');
    const { shares } = await parent.ok(parent.get('/api/family/shares'));
    expect(shares).toMatchObject([
      { creation: proved, fromNickname: 'Robin', toChildId: null },
      { creation: { title: 'Half done' }, fromNickname: 'Robin', toChildId: null },
    ]);
    await parent.ok(parent.post(`/api/family/shares/${shares[0].id}/seen`));
    expect((await parent.ok(parent.get('/api/family/shares'))).shares[0].seenAt).not.toBeNull();
  });

  it('sends no mail when the grown-up turned it off', async () => {
    await parent.ok(parent.patch('/api/parent/me', { notifyByEmail: false }));
    await robin.ok(robin.post('/api/shares', { to: 'grownup', creation: proved }), 201);
    expect(mailer.sent).toHaveLength(0);
  });

  it('lets the grown-up see, remove and switch off sharing between children', async () => {
    await robin.ok(robin.post('/api/shares', { to: wrenId, creation: proved }), 201);
    const { shares } = await parent.ok(parent.get('/api/family/shares'));
    expect(shares).toMatchObject([{ fromNickname: 'Robin', toNickname: 'Wren' }]);
    await parent.ok(parent.delete(`/api/family/shares/${shares[0].id}`));
    expect((await wren.ok(wren.get('/api/shares'))).shares).toEqual([]);
    await parent.ok(parent.patch('/api/parent/me', { siblingSharing: false }));
    expect(await robin.ok(robin.post('/api/shares', { to: wrenId, creation: proved }), 403)).toEqual({ error: 'sharing-off' });
    await robin.ok(robin.post('/api/shares', { to: 'grownup', creation: proved }), 201);
  });

  it('stops a child sending more than a day’s worth', async () => {
    await sql`
      insert into shares (parent_id, from_child_id, to_child_id, creation)
      select parent_id, id, ${wrenId}, '{}' from children, generate_series(1, ${SHARES_PER_DAY}) where id = ${robinId}`;
    expect(await robin.ok(robin.post('/api/shares', { to: wrenId, creation: proved }), 429)).toEqual({ error: 'too-many-shares' });
  });
});
