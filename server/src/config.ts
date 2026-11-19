/**
 * Everything the server needs from its surroundings, read once. Settings for
 * later steps (mail, sessions) join this as those steps arrive.
 */
export interface Config {
  databaseUrl: string;
  port: number;
  /** The built game, served beside the API so both share one origin. Unset in development. */
  staticDir: string | undefined;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Point it at any Postgres, for example postgres://wonderbits:wonderbits@localhost:5432/wonderbits');
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT is not a port number: ${env.PORT}`);
  return { databaseUrl, port, staticDir: env.STATIC_DIR || undefined };
}
