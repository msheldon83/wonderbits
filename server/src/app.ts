/**
 * The HTTP app. Everything the server answers lives under /api; when a built
 * copy of the game is given, it is served from the same origin so sign-in
 * cookies need no cross-site allowances.
 */
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Sql } from './db';

export interface AppOptions {
  sql: Sql;
  staticDir?: string | undefined;
}

export function createApp({ sql, staticDir }: AppOptions): Hono {
  const app = new Hono();

  app.get('/api/health', async (c) => {
    try {
      await sql`select 1`;
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, error: 'database' }, 503);
    }
  });

  // An address under /api that nothing answers is a mistake, never a page of the game.
  app.all('/api/*', (c) => c.json({ error: 'not-found' }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'server' }, 500);
  });

  if (staticDir) app.use('*', serveStatic({ root: staticDir }));

  return app;
}
