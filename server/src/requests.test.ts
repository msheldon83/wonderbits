import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Sql } from './db';
import { memoryMailer } from './mail';
import { notifyOfRequests, pruneRequests, REQUESTS_PER_HOUR } from './requests';
import { Browser, emptyTables, freshDatabase, signedInParent } from './testing';

const OWNER = 'owner@example.com';
let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;
let owner: Browser;
let visitor: Browser;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await emptyTables(sql);
  mailer = memoryMailer();
  app = createApp({ sql, mailer, publicUrl: 'https://wonderbits.example', adminEmails: [OWNER] });
  owner = await signedInParent(app, sql, mailer, OWNER);
  visitor = new Browser(app);
  mailer.sent.length = 0;
});

const ask = (email: unknown, note?: unknown) => visitor.post('/api/access/request', { email, note });
const waiting = async () => (await owner.ok(owner.get('/api/admin/requests'))).requests.filter((r: { decision: string | null }) => r.decision === null);

describe('asking for an invite', () => {
  it('reaches the owner, and mails nobody but the owner', async () => {
    expect(await visitor.ok(ask('  Lee@Example.com ', '  A colleague,   two children  '))).toEqual({ ok: true });
    expect(await waiting()).toMatchObject([{ email: 'lee@example.com', note: 'A colleague, two children', decision: null }]);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: OWNER, subject: 'Wonderbits: someone asked for an invite' });
    expect(mailer.sent[0]!.text).toContain('https://wonderbits.example/#/admin');
    // The address is not in the mail: it is read on the owner's page.
    expect(mailer.sent[0]!.text).not.toContain('lee@example.com');
  });

  it('asked twice is one request, with the newer note', async () => {
    await visitor.ok(ask('lee@example.com', 'first'));
    await visitor.ok(ask('lee@example.com', 'second'));
    expect(await waiting()).toMatchObject([{ email: 'lee@example.com', note: 'second' }]);
  });

  it('says the same thing for an address that already has an account, and keeps nothing', async () => {
    expect(await visitor.ok(ask(OWNER, 'me again'))).toEqual({ ok: true });
    expect(await waiting()).toEqual([]);
    expect(mailer.sent).toHaveLength(0);
  });

  it('is refused for something that is not an address, and keeps a note short and clean', async () => {
    for (const bad of ['', 'nope', 42]) expect((await ask(bad)).status).toBe(400);
    await visitor.ok(ask('lee@example.com', `call me on 07700 900 123 ${'x'.repeat(400)}`));
    const [request] = await waiting();
    expect(request.note).toContain('[removed]');
    expect(request.note.length).toBeLessThanOrEqual(200);
    await visitor.ok(ask('nonote@example.com'));
    expect((await waiting()).find((r: { email: string }) => r.email === 'nonote@example.com').note).toBeNull();
  });

  it('is turned away when too many have asked in an hour', async () => {
    await sql`insert into access_requests (email, mailed_at) select 'bulk' || n || '@example.com', now() from generate_series(1, ${REQUESTS_PER_HOUR}) n`;
    expect(await visitor.ok(ask('lee@example.com'), 429)).toEqual({ error: 'busy' });
  });

  it('tells the owner at most once a quarter of an hour', async () => {
    await visitor.ok(ask('one@example.com'));
    await visitor.ok(ask('two@example.com'));
    await visitor.ok(ask('three@example.com'));
    expect(mailer.sent).toHaveLength(1);
    const ctx = { sql, mailer, publicUrl: 'https://wonderbits.example', inviteRequired: true, adminEmails: [OWNER] };
    expect(await notifyOfRequests(ctx)).toBe(0);
    await sql`update access_requests set mailed_at = mailed_at - interval '16 minutes'`;
    expect(await notifyOfRequests(ctx)).toBe(2);
    expect(mailer.sent[1]!.subject).toBe('Wonderbits: 2 people asked for an invite');
  });
});

describe('the owner answering', () => {
  it('approves: an invite for one family is made and its link mailed to them', async () => {
    await visitor.ok(ask('lee@example.com', 'a colleague'));
    mailer.sent.length = 0;
    const [request] = await waiting();
    const done = await owner.ok(owner.post(`/api/admin/requests/${request.id}/approve`));
    expect(done).toMatchObject({ ok: true, mailed: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'lee@example.com', subject: 'Your invite to Wonderbits' });
    const link = /https:\/\/wonderbits\.example\/#\/grownup\/invite\/([A-Z0-9-]+)/.exec(mailer.sent[0]!.text)!;
    expect(link[1]!.replace('-', '')).toBe(done.code);

    const { invites } = await owner.ok(owner.get('/api/admin/invites'));
    expect(invites.find((i: { code: string }) => i.code === done.code)).toMatchObject({ maxUses: 1, uses: 0, note: 'asked: lee@example.com' });
    // The invite works, once.
    await visitor.ok(visitor.post('/api/parent/start', { email: 'lee@example.com', inviteCode: link[1] }));
    const token = /\/#\/grownup\/signin\/(\S+)/.exec(mailer.sent.at(-1)!.text)![1]!;
    await visitor.ok(visitor.post('/api/parent/finish', { token }));
    expect((await new Browser(app).post('/api/parent/start', { email: 'other@example.com', inviteCode: done.code })).status).toBe(400);

    expect(await waiting()).toEqual([]);
    expect((await owner.post(`/api/admin/requests/${request.id}/approve`)).status).toBe(404);
  });

  it('declines without mailing anyone, and asking again does not reopen it', async () => {
    await visitor.ok(ask('lee@example.com'));
    mailer.sent.length = 0;
    const [request] = await waiting();
    await owner.ok(owner.post(`/api/admin/requests/${request.id}/decline`));
    expect(mailer.sent).toHaveLength(0);
    await visitor.ok(ask('lee@example.com', 'please'));
    expect(await waiting()).toEqual([]);
    const { requests } = await owner.ok(owner.get('/api/admin/requests'));
    expect(requests).toMatchObject([{ email: 'lee@example.com', decision: 'declined' }]);
  });

  it('is the owner’s alone', async () => {
    await visitor.ok(ask('lee@example.com'));
    const [request] = await waiting();
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    expect((await other.get('/api/admin/requests')).status).toBe(404);
    expect((await other.post(`/api/admin/requests/${request.id}/approve`)).status).toBe(404);
    expect((await visitor.get('/api/admin/requests')).status).toBe(401);
    expect(await waiting()).toHaveLength(1);
  });

  it('forgets an answered request after a month, and keeps one still waiting', async () => {
    await visitor.ok(ask('old@example.com'));
    await visitor.ok(ask('waiting@example.com'));
    const [old] = await waiting();
    await owner.ok(owner.post(`/api/admin/requests/${old.id}/decline`));
    await sql`update access_requests set decided_at = now() - interval '31 days', created_at = now() - interval '40 days' where decision is not null`;
    await sql`update access_requests set created_at = now() - interval '40 days' where decision is null`;
    expect(await pruneRequests(sql)).toBe(1);
    const [left] = await sql<{ email: string }[]>`select email from access_requests`;
    expect(left!.email).toBe('waiting@example.com');
  });
});
