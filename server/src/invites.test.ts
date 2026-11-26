import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INVITE_MAX_USES } from './admin';
import { createApp } from './app';
import type { Sql } from './db';
import { memoryMailer } from './mail';
import { Browser, emptyTables, freshDatabase, signedInParent } from './testing';

const OWNER = 'owner@example.com';
let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;
let owner: Browser;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await emptyTables(sql);
  mailer = memoryMailer();
  app = createApp({ sql, mailer, adminEmails: [OWNER] });
  owner = await signedInParent(app, sql, mailer, OWNER);
  // The invite the owner signed up with is not part of these tests.
  await sql`delete from invites`;
});

const linkToken = () => /\/#\/grownup\/signin\/(\S+)/.exec(mailer.sent.at(-1)!.text)![1]!;
const start = (b: Browser, email: string, inviteCode: string) => b.post('/api/parent/start', { email, inviteCode });

describe('invites on the owner’s page', () => {
  it('are made by the owner, and listed with how much is used', async () => {
    const made = await owner.ok(owner.post('/api/admin/invites', { uses: 3, note: '  work   colleagues ' }), 201);
    expect(made).toMatchObject({ note: 'work colleagues', maxUses: 3, uses: 0, stoppedAt: null });
    expect(made.code).toMatch(/^[A-Z2-9]{8}$/);

    const family = new Browser(app);
    await family.ok(start(family, 'lee@example.com', made.code));
    await family.ok(family.post('/api/parent/finish', { token: linkToken() }));
    const { invites } = await owner.ok(owner.get('/api/admin/invites'));
    expect(invites).toMatchObject([{ code: made.code, uses: 1, maxUses: 3, note: 'work colleagues' }]);
    // How many, never who.
    expect(JSON.stringify(invites)).not.toContain('lee@example.com');
  });

  it('are the owner’s alone', async () => {
    const made = await owner.ok(owner.post('/api/admin/invites', { uses: 2 }), 201);
    const other = new Browser(app);
    await other.ok(start(other, 'lee@example.com', made.code));
    await other.ok(other.post('/api/parent/finish', { token: linkToken() }));
    expect((await other.get('/api/admin/invites')).status).toBe(404);
    expect((await other.post('/api/admin/invites', { uses: 1 })).status).toBe(404);
    expect((await other.post(`/api/admin/invites/${made.code}/stop`)).status).toBe(404);
    expect((await new Browser(app).get('/api/admin/invites')).status).toBe(401);
  });

  it('keep the number of families and the note within bounds', async () => {
    const huge = await owner.ok(owner.post('/api/admin/invites', { uses: 1_000_000, note: 'x'.repeat(200) }), 201);
    expect(huge.maxUses).toBe(INVITE_MAX_USES);
    expect(huge.note).toHaveLength(60);
    expect((await owner.ok(owner.post('/api/admin/invites', { uses: -4 }), 201)).maxUses).toBe(1);
    expect((await owner.ok(owner.post('/api/admin/invites', { uses: 'lots' }), 201)).maxUses).toBe(1);
    expect((await owner.ok(owner.post('/api/admin/invites', {}), 201)).note).toBeNull();
  });

  it('stop working once stopped, even for a link asked for before the stop', async () => {
    const { code } = await owner.ok(owner.post('/api/admin/invites', { uses: 5 }), 201);
    const early = new Browser(app);
    await early.ok(start(early, 'early@example.com', code));
    const pending = linkToken();
    const before = new Browser(app);
    await before.ok(start(before, 'joined@example.com', code));
    await before.ok(before.post('/api/parent/finish', { token: linkToken() }));

    // Typed with the dash and in lower case, as it is shown.
    await owner.ok(owner.post(`/api/admin/invites/${code.slice(0, 4).toLowerCase()}-${code.slice(4)}/stop`));
    expect((await owner.ok(owner.get('/api/admin/invites'))).invites[0].stoppedAt).not.toBeNull();

    const late = new Browser(app);
    expect(await late.ok(start(late, 'late@example.com', code), 400)).toEqual({ error: 'invite' });
    expect(await early.ok(early.post('/api/parent/finish', { token: pending }), 400)).toEqual({ error: 'invite' });
    const [count] = await sql<{ n: string }[]>`select count(*) as n from parents`;
    expect(Number(count!.n)).toBe(2);

    // The family that joined with it is untouched: they sign in again with no code.
    mailer.sent.length = 0;
    await before.ok(before.post('/api/parent/start', { email: 'joined@example.com' }));
    expect(mailer.sent).toHaveLength(1);
    await before.ok(before.post('/api/parent/finish', { token: linkToken() }));
  });

  it('say so when a code to stop does not exist', async () => {
    expect((await owner.post('/api/admin/invites/NOPENOPE/stop')).status).toBe(404);
  });
});
