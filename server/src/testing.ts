/**
 * For tests: a real Postgres, emptied and migrated afresh. Set
 * TEST_DATABASE_URL to use another database; never point it at one you care
 * about, because everything in its public schema is dropped.
 */
import { connect, migrate, type Sql } from './db';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://wonderbits:wonderbits@localhost:5432/wonderbits_test';

export async function freshDatabase(): Promise<Sql> {
  const sql = connect(TEST_DATABASE_URL);
  await sql.unsafe('drop schema public cascade; create schema public');
  await migrate(sql);
  return sql;
}
