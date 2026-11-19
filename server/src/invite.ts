/**
 * `npm run invite`: make an invite code to give to a grown-up.
 *
 *   npm run invite                       one code, good for one family
 *   npm run invite -- --uses 5           one code, good for five families
 *   npm run invite -- --note "the Lees"  with a reminder of who it was for
 */
import { parseArgs } from 'node:util';
import { readConfig } from './config';
import { connect, migrate } from './db';
import { randomCode, showCode } from './tokens';

const { values } = parseArgs({ options: { uses: { type: 'string', default: '1' }, note: { type: 'string' } } });
const uses = Number(values.uses);
if (!Number.isInteger(uses) || uses < 1) throw new Error(`--uses must be a whole number, 1 or more: ${values.uses}`);

const sql = connect(readConfig().databaseUrl);
try {
  await migrate(sql);
  const code = randomCode();
  await sql`insert into invites (code, max_uses, note) values (${code}, ${uses}, ${values.note ?? null})`;
  console.log(`${showCode(code)}  (good for ${uses} ${uses === 1 ? 'family' : 'families'})`);
} finally {
  await sql.end();
}
