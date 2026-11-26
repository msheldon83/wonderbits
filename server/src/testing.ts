/**
 * For tests: a real Postgres, emptied and migrated afresh, and browsers that
 * keep their cookies. Set TEST_DATABASE_URL to use another database; never
 * point it at one you care about, because everything in its public schema is
 * dropped.
 */
import type { Hono } from 'hono';
import { expect } from 'vitest';
import { connect, migrate, type Sql } from './db';
import type { Mail } from './mail';
import { randomCode } from './tokens';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://wonderbits:wonderbits@localhost:5432/wonderbits_test';

export async function freshDatabase(): Promise<Sql> {
  const sql = connect(TEST_DATABASE_URL);
  await sql.unsafe('drop schema public cascade; create schema public');
  await migrate(sql);
  return sql;
}

export const emptyTables = (sql: Sql) => sql`truncate parents, invites, login_tokens, device_pairings, access_requests cascade`;

/** One browser: it remembers the cookies it is given, as a real one would. */
export class Browser {
  readonly cookies = new Map<string, string>();

  constructor(private app: Hono) {}

  async send(method: string, path: string, body?: unknown): Promise<Response> {
    // A real browser names the page it is on with every request that changes something.
    const headers: Record<string, string> = method === 'GET' ? {} : { Origin: 'http://localhost' };
    if (this.cookies.size > 0) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await this.app.request(path, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, value] = pair!.split('=');
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name!);
      else this.cookies.set(name!, value!);
    }
    return res;
  }

  get = (path: string) => this.send('GET', path);
  post = (path: string, body: unknown = {}) => this.send('POST', path, body);
  put = (path: string, body: unknown) => this.send('PUT', path, body);
  patch = (path: string, body: unknown) => this.send('PATCH', path, body);
  delete = (path: string) => this.send('DELETE', path);

  /** The answer's JSON, having checked the status. */
  async ok<T = any>(res: Promise<Response>, status = 200): Promise<T> {
    const r = await res;
    const text = await r.text();
    expect(`${r.status} ${text}`).toMatch(new RegExp(`^${status} `));
    return JSON.parse(text) as T;
  }
}

/** A grown-up, signed up with a fresh invite and signed in on a browser of their own. */
export async function signedInParent(app: Hono, sql: Sql, mailer: { sent: Mail[] }, email: string): Promise<Browser> {
  const browser = new Browser(app);
  const code = randomCode();
  await sql`insert into invites (code) values (${code})`;
  await browser.ok(browser.post('/api/parent/start', { email, inviteCode: code }));
  const token = /\/#\/grownup\/signin\/(\S+)/.exec(mailer.sent.at(-1)!.text)![1]!;
  await browser.ok(browser.post('/api/parent/finish', { token }));
  return browser;
}

export async function addChild(parent: Browser, nickname: string, pin = '1234'): Promise<string> {
  const child = await parent.ok<{ id: string }>(parent.post('/api/children', { nickname, avatar: 'fox', pin, consent: true }), 201);
  return child.id;
}

/** A second browser, let in by the grown-up typing its code. */
export async function pairedDevice(app: Hono, parent: Browser, name = 'Tablet'): Promise<Browser> {
  const device = new Browser(app);
  const { code } = await device.ok<{ code: string }>(device.post('/api/pair/start', { name }), 201);
  await parent.ok(parent.post('/api/devices/approve', { code }), 201);
  return device;
}

/** A paired device with a child signed in on it. */
export async function childOn(app: Hono, parent: Browser, childId: string, pin = '1234'): Promise<Browser> {
  const device = await pairedDevice(app, parent);
  await device.ok(device.post('/api/child/signin', { childId, pin }));
  return device;
}
