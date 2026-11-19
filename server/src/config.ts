/**
 * Everything the server needs from its surroundings, read once.
 */
export interface Config {
  databaseUrl: string;
  port: number;
  /** The built game, served beside the API so both share one origin. Unset in development. */
  staticDir: string | undefined;
  /** Where people reach the app, with no trailing slash. Sign-in links point here. */
  publicUrl: string;
  /** An SMTP address such as smtps://user:pass@smtp.example.com. Unset, mail is printed to the log. */
  smtpUrl: string | undefined;
  mailFrom: string;
  /** While true, a grown-up needs an invite code to sign up. */
  inviteRequired: boolean;
  /** Who runs this copy: grown-up accounts with these addresses may open the owner's page. Comma-separated in ADMIN_EMAILS. */
  adminEmails: string[];
}

const isOff = (value: string | undefined) => value !== undefined && ['0', 'false', 'no', 'off'].includes(value.toLowerCase());

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Point it at any Postgres, for example postgres://wonderbits:wonderbits@localhost:5432/wonderbits');
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT is not a port number: ${env.PORT}`);
  return {
    databaseUrl,
    port,
    staticDir: env.STATIC_DIR || undefined,
    publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    smtpUrl: env.SMTP_URL || undefined,
    mailFrom: env.MAIL_FROM || 'Wonderbits <wonderbits@localhost>',
    inviteRequired: !isOff(env.INVITE_REQUIRED),
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  };
}
