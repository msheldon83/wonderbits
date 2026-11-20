/** The server's entry point: migrate, then listen. */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { readConfig } from './config';
import { connect, migrate } from './db';
import { DIGEST_MINUTES, prune, sendDigest } from './insight';
import { consoleMailer, smtpMailer } from './mail';

const config = readConfig();
const sql = connect(config.databaseUrl);
const applied = await migrate(sql);
if (applied.length > 0) console.log(`Applied migrations: ${applied.join(', ')}`);

const mailer = config.smtpUrl ? smtpMailer(config.smtpUrl, config.mailFrom) : consoleMailer;
const settings = { sql, mailer, publicUrl: config.publicUrl, inviteRequired: config.inviteRequired, adminEmails: config.adminEmails };
const app = createApp({ ...settings, staticDir: config.staticDir });

const pruned = await prune(sql);
if (pruned > 0) console.log(`Deleted ${pruned} level visits past their keeping time.`);
if (config.adminEmails.length === 0) console.log('ADMIN_EMAILS is not set: nobody can open the owner\'s page, and feedback is not mailed.');
// Feedback that arrived during a quiet spell after the last mail is sent on from here.
const digest = setInterval(() => void sendDigest(settings).catch((e: unknown) => console.error(e)), (DIGEST_MINUTES * 60 * 1000) / 3);
if (!config.smtpUrl) console.log('SMTP_URL is not set: sign-in links are printed here instead of mailed.');

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Wonderbits server listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(digest);
    server.close(() => void sql.end().then(() => process.exit(0)));
  });
}
