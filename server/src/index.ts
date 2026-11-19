/** The server's entry point: migrate, then listen. */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { readConfig } from './config';
import { connect, migrate } from './db';
import { consoleMailer, smtpMailer } from './mail';

const config = readConfig();
const sql = connect(config.databaseUrl);
const applied = await migrate(sql);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = createApp({
  sql,
  staticDir: config.staticDir,
  mailer: config.smtpUrl ? smtpMailer(config.smtpUrl, config.mailFrom) : consoleMailer,
  publicUrl: config.publicUrl,
  inviteRequired: config.inviteRequired,
});
if (!config.smtpUrl) console.log('SMTP_URL is not set: sign-in links are printed here instead of mailed.');

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Wonderbits server listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void sql.end().then(() => process.exit(0)));
  });
}
