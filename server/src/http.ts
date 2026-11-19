/** Small things every group of routes needs: reading a body, checking an id, setting a cookie. */
import type { Context as Request } from 'hono';
import { setCookie } from 'hono/cookie';
import { Refusal, type Context } from './context';

export async function readJson(c: Request): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Refusal(400, 'body');
  return body as Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from an address or a body. Anything that is not one is simply not found. */
export function asId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Refusal(404, 'not-found');
  return value;
}

/** A cookie scripts cannot read, sent only to this site, and only over https when the site is. */
export function setSecret(ctx: Context, c: Request, name: string, value: string, days: number): void {
  setCookie(c, name, value, { httpOnly: true, secure: ctx.publicUrl.startsWith('https://'), sameSite: 'Lax', path: '/', maxAge: days * 24 * 60 * 60 });
}
