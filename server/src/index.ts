/** The server's entry point: migrate, then listen. */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { readConfig } from './config';
import { connect, migrate } from './db';

const config = readConfig();
const sql = connect(config.databaseUrl);
const applied = await migrate(sql);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const server = serve({ fetch: createApp({ sql, staticDir: config.staticDir }).fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Wonderbits server listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void sql.end().then(() => process.exit(0)));
  });
}
