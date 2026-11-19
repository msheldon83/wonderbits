import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Sql } from './db';
import { memoryMailer } from './mail';
import { freshDatabase } from './testing';
import { cleanCode, hashToken, randomCode, showCode } from './tokens';

let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await sql`truncate parents, invites, login_tokens cascade`;
  mailer = memoryMailer();
  app = createApp({ sql, mailer, publicUrl: 'https://wonderbits.example' });
});

const post = (path: string, body: unknown, cookie?: string) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });

async function invite(maxUses = 1): Promise<string> {
  const code = randomCode();
  await sql`insert into invites (code, max_uses) values (${code}, ${maxUses})`;
  return code;
}

/** The token in the newest mail. */
const linkToken = () => /\/#\/grownup\/signin\/(\S+)/.exec(mailer.sent.at(-1)!.text)![1]!;

/** Sign up or in, and return the session cookie. */
async function signIn(email: string, inviteCode?: string): Promise<string> {
  expect((await post('/api/parent/start', { email, inviteCode })).status).toBe(200);
  const res = await post('/api/parent/finish', { token: linkToken() });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

describe('signing up', () => {
  it('takes an invite and a link from the mail', async () => {
    const code = await invite();
    const cookie = await signIn('  Grownup@Example.com ', showCode(code).toLowerCase());
    expect(mailer.sent[0]!.to).toBe('grownup@example.com');
    const me = await app.request('/api/parent/me', { headers: { Cookie: cookie } });
    expect(await me.json()).toEqual({ email: 'grownup@example.com', notifyByEmail: true, siblingSharing: true, improve: true, admin: false });
    const [spent] = await sql<{ uses: number }[]>`select uses from invites where code = ${code}`;
    expect(spent!.uses).toBe(1);
  });

  it('sets a cookie scripts cannot read, sent only over https', async () => {
    await post('/api/parent/start', { email: 'a@example.com', inviteCode: await invite() });
    const res = await post('/api/parent/finish', { token: linkToken() });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses a code that does not exist', async () => {
    const res = await post('/api/parent/start', { email: 'a@example.com', inviteCode: 'NOPE-NOPE' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invite' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('refuses a code that is used up', async () => {
    const code = await invite();
    await signIn('first@example.com', code);
    expect((await post('/api/parent/start', { email: 'second@example.com', inviteCode: code })).status).toBe(400);
  });

  it('lets only one of two people racing for the last use in', async () => {
    const code = await invite();
    await post('/api/parent/start', { email: 'first@example.com', inviteCode: code });
    const first = linkToken();
    await post('/api/parent/start', { email: 'second@example.com', inviteCode: code });
    const second = linkToken();
    expect((await post('/api/parent/finish', { token: first })).status).toBe(200);
    const late = await post('/api/parent/finish', { token: second });
    expect(late.status).toBe(400);
    expect(await late.json()).toEqual({ error: 'invite' });
    const [count] = await sql<{ n: string }[]>`select count(*) as n from parents`;
    expect(Number(count!.n)).toBe(1);
  });

  it('shares a code among as many families as it allows', async () => {
    const code = await invite(2);
    await signIn('first@example.com', code);
    await signIn('second@example.com', code);
    expect((await post('/api/parent/start', { email: 'third@example.com', inviteCode: code })).status).toBe(400);
  });

  it('needs no invite when the server is open', async () => {
    app = createApp({ sql, mailer, inviteRequired: false });
    await signIn('anyone@example.com');
  });

  it('refuses something that is not an email address', async () => {
    for (const email of ['', 'nope', 'a@b', 'two words@example.com', 42]) {
      expect((await post('/api/parent/start', { email, inviteCode: 'X' })).status).toBe(400);
    }
    expect((await app.request('/api/parent/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' })).status).toBe(400);
  });
});

describe('signing in', () => {
  it('needs no invite the second time', async () => {
    const first = await signIn('grownup@example.com', await invite());
    const second = await signIn('grownup@example.com');
    expect(second).not.toBe(first);
    const [count] = await sql<{ n: string }[]>`select count(*) as n from parents`;
    expect(Number(count!.n)).toBe(1);
  });

  it('says the same thing whether or not the address has an account, and mails only if it has', async () => {
    const res = await post('/api/parent/start', { email: 'stranger@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(0);
  });

  it('accepts a link once', async () => {
    await post('/api/parent/start', { email: 'a@example.com', inviteCode: await invite() });
    const token = linkToken();
    expect((await post('/api/parent/finish', { token })).status).toBe(200);
    const again = await post('/api/parent/finish', { token });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'link' });
  });

  it('refuses a link that is too old, or made up', async () => {
    await post('/api/parent/start', { email: 'a@example.com', inviteCode: await invite() });
    await sql`update login_tokens set expires_at = now() - interval '1 second'`;
    expect((await post('/api/parent/finish', { token: linkToken() })).status).toBe(400);
    expect((await post('/api/parent/finish', { token: 'made-up' })).status).toBe(400);
    expect((await post('/api/parent/finish', {})).status).toBe(400);
  });

  it('keeps only a hash of the link and of the session', async () => {
    const cookie = await signIn('a@example.com', await invite());
    const token = linkToken();
    const session = cookie.split('=')[1]!;
    const [link] = await sql<{ token_hash: string }[]>`select token_hash from login_tokens`;
    const [stored] = await sql<{ token_hash: string }[]>`select token_hash from sessions`;
    expect(link!.token_hash).toBe(hashToken(token));
    expect(stored!.token_hash).toBe(hashToken(session));
  });

  it('stops sending links to one address after five in an hour', async () => {
    await signIn('a@example.com', await invite());
    for (let i = 0; i < 4; i++) expect((await post('/api/parent/start', { email: 'a@example.com' })).status).toBe(200);
    const res = await post('/api/parent/start', { email: 'a@example.com' });
    expect(res.status).toBe(429);
    expect(mailer.sent).toHaveLength(5);
  });
});

describe('a session', () => {
  it('is needed to see the account', async () => {
    expect((await app.request('/api/parent/me')).status).toBe(401);
    expect((await app.request('/api/parent/me', { headers: { Cookie: 'wb_parent=made-up' } })).status).toBe(401);
  });

  it('ends on sign-out, and when it is too old', async () => {
    const cookie = await signIn('a@example.com', await invite());
    const other = await signIn('a@example.com');
    expect((await post('/api/parent/signout', {}, cookie)).status).toBe(200);
    expect((await app.request('/api/parent/me', { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await app.request('/api/parent/me', { headers: { Cookie: other } })).status).toBe(200);
    await sql`update sessions set expires_at = now() - interval '1 second'`;
    expect((await app.request('/api/parent/me', { headers: { Cookie: other } })).status).toBe(401);
  });

  it('cannot be started by a form on another site', async () => {
    const res = await app.request('/api/parent/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://elsewhere.example' },
      body: 'x=1',
    });
    expect(res.status).toBe(403);
  });
});

describe('codes', () => {
  it('are easy to read and forgiving to type', () => {
    const code = randomCode();
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(showCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(cleanCode(' abcd-efgh ')).toBe('ABCDEFGH');
  });
});
