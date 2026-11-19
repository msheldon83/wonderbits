/**
 * The database: a connection pool, and the migrations that bring any Postgres
 * up to the schema this code expects. Migrations are plain SQL files, applied
 * once each, in name order.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

export type Sql = postgres.Sql;

export function connect(databaseUrl: string): Sql {
  // Notices are chatter ("relation already exists, skipping"); errors still throw.
  return postgres(databaseUrl, { onnotice: () => {} });
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
/** Any fixed number: two servers starting together take turns migrating. */
const MIGRATION_LOCK = 7_423_001;

/** Applies every migration not yet applied, and returns their names. */
export async function migrate(sql: Sql, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    const applied: string[] = [];
    for (const name of files) {
      if (done.has(name)) continue;
      await tx.unsafe(await readFile(`${dir}/${name}`, 'utf8'));
      await tx`insert into schema_migrations (name) values (${name})`;
      applied.push(name);
    }
    return applied;
  });
}
