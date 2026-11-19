/**
 * The HTTP app. Everything the server answers lives under /api; when a built
 * copy of the game is given, it is served from the same origin so sign-in
 * cookies need no cross-site allowances.
 */
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { Refusal, type Context } from './context';
import type { Sql } from './db';
import { consoleMailer, type Mailer } from './mail';
import { parentRoutes } from './parents';

export interface AppOptions {
  sql: Sql;
  staticDir?: string | undefined;
  mailer?: Mailer;
  publicUrl?: string;
  inviteRequired?: boolean;
}

export function createApp({ sql, staticDir, mailer = consoleMailer, publicUrl = 'http://localhost:8080', inviteRequired = true }: AppOptions): Hono {
  const ctx: Context = { sql, mailer, publicUrl, inviteRequired };
  const app = new Hono();

  // A form on another site cannot post here with a parent's cookie.
  app.use('/api/*', csrf());
  // Nothing under /api is the same for two people, so nothing may be kept by a cache.
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.get('/api/health', async (c) => {
    try {
      await sql`select 1`;
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, error: 'database' }, 503);
    }
  });

  app.route('/api/parent', parentRoutes(ctx));

  // An address under /api that nothing answers is a mistake, never a page of the game.
  app.all('/api/*', (c) => c.json({ error: 'not-found' }, 404));

  app.onError((err, c) => {
    if (err instanceof Refusal) return c.json({ error: err.code }, err.status);
    if (err instanceof HTTPException) return c.json({ error: err.status === 403 ? 'forbidden' : 'request' }, err.status);
    console.error(err);
    return c.json({ error: 'server' }, 500);
  });

  if (staticDir) app.use('*', serveStatic({ root: staticDir }));

  return app;
}
