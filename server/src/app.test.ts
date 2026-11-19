import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { readConfig } from './config';
import { connect, migrate, type Sql } from './db';
import { freshDatabase } from './testing';

let sql: Sql;
beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());

describe('migrations', () => {
  it('build every table in the plan', async () => {
    const rows = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'children',
      'device_pairings',
      'devices',
      'documents',
      'invites',
      'login_tokens',
      'parents',
      'pin_attempts',
      'schema_migrations',
      'sessions',
      'shares',
    ]);
  });

  it('apply once only', async () => {
    expect(await migrate(sql)).toEqual([]);
  });

  it('remove everything under a parent when the parent goes', async () => {
    const [parent] = await sql<{ id: string }[]>`insert into parents (email) values ('grownup@example.com') returning id`;
    const [child] = await sql<{ id: string }[]>`
      insert into children (parent_id, nickname, avatar, pin_hash, consent_version, consented_at)
      values (${parent!.id}, 'Robin', 'fox', 'x', '1', now()) returning id`;
    await sql`insert into documents (child_id, key, value) values (${child!.id}, 'progress', '{}')`;
    await sql`insert into shares (parent_id, from_child_id, creation) values (${parent!.id}, ${child!.id}, '{}')`;
    await sql`delete from parents where id = ${parent!.id}`;
    const [left] = await sql<{ n: number }[]>`select (select count(*) from children) + (select count(*) from documents) + (select count(*) from shares) as n`;
    expect(Number(left!.n)).toBe(0);
  });

  it('refuse two children with one nickname in a family, whatever the capitals', async () => {
    const [parent] = await sql<{ id: string }[]>`insert into parents (email) values ('two@example.com') returning id`;
    const add = (nickname: string) => sql`
      insert into children (parent_id, nickname, avatar, pin_hash, consent_version, consented_at)
      values (${parent!.id}, ${nickname}, 'fox', 'x', '1', now())`;
    await add('Robin');
    await expect(add('robin')).rejects.toThrow(/children_family_nickname/);
  });
});

describe('the app', () => {
  it('says it is well when the database answers', async () => {
    const res = await createApp({ sql }).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('says it is not when the database is gone', async () => {
    const dead = connect('postgres://nobody:nothing@127.0.0.1:1/none');
    const res = await createApp({ sql: dead }).request('/api/health');
    expect(res.status).toBe(503);
    await dead.end();
  });

  it('answers an unknown api address with 404, not a page', async () => {
    const res = await createApp({ sql }).request('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it('serves the built game from the same origin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wonderbits-static-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Wonderbits</title>');
    const app = createApp({ sql, staticDir: dir });
    const page = await app.request('/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Wonderbits');
    expect((await app.request('/api/health')).status).toBe(200);
  });
});

describe('readConfig', () => {
  it('needs a database and a real port', () => {
    expect(() => readConfig({})).toThrow(/DATABASE_URL/);
    expect(() => readConfig({ DATABASE_URL: 'postgres://x', PORT: 'eighty' })).toThrow(/PORT/);
    expect(readConfig({ DATABASE_URL: 'postgres://x' })).toEqual({ databaseUrl: 'postgres://x', port: 8080, staticDir: undefined });
  });
});
