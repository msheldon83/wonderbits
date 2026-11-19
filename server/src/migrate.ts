/** `npm run migrate`: bring the database up to date and say what changed. */
import { readConfig } from './config';
import { connect, migrate } from './db';

const sql = connect(readConfig().databaseUrl);
try {
  const applied = await migrate(sql);
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Nothing to apply.');
} finally {
  await sql.end();
}
