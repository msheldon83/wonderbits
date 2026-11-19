/**
 * Children and devices. A child's profile is made by a grown-up, with their
 * consent recorded. A child can sign in only on a device the grown-up has
 * authorized, and there the PIN only tells brothers and sisters apart: a
 * nickname and PIN from any other browser open nothing.
 */
import { Hono, type Context as Request } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { Refusal, type Context } from './context';
import { asId, readJson, setSecret } from './http';
import { requireParent } from './parents';
import { hashPin, isPin, verifyPin } from './pins';
import { cleanCode, hashToken, randomCode, randomToken } from './tokens';

export const DEVICE_COOKIE = 'wb_device';
export const CHILD_COOKIE = 'wb_child';
/** The wording of the notice a grown-up agrees to. Raise it when what is stored about a child changes. */
export const CONSENT_VERSION = '2026-11';

const DEVICE_DAYS = 365;
const CHILD_SESSION_DAYS = 90;
const PAIRING_MINUTES = 10;
const MAX_CHILDREN = 8;
const MAX_DEVICES = 20;
/** Requests to be let in that may wait at once, across everyone. Past this, new ones are turned away. */
const MAX_PENDING_PAIRINGS = 500;
/** Wrong PINs allowed before the waits begin. */
const FREE_GUESSES = 3;
const LONGEST_WAIT_SECONDS = 15 * 60;

export interface Device {
  id: string;
  parentId: string;
  name: string;
}

export interface ChildSession {
  childId: string;
  parentId: string;
  deviceId: string;
  nickname: string;
}

/** The authorized device this request comes from, if it is one. */
export async function findDevice(ctx: Context, c: Request): Promise<Device | undefined> {
  const token = getCookie(c, DEVICE_COOKIE);
  if (!token) return undefined;
  const [device] = await ctx.sql<Device[]>`
    select id, parent_id as "parentId", name from devices where token_hash = ${hashToken(token)} and revoked_at is null`;
  return device;
}

export async function requireDevice(ctx: Context, c: Request): Promise<Device> {
  const device = await findDevice(ctx, c);
  if (!device) throw new Refusal(401, 'device');
  return device;
}

/** The signed-in child. Their session counts only on the device it was started on, while that device is still allowed. */
export async function requireChild(ctx: Context, c: Request): Promise<ChildSession> {
  const token = getCookie(c, CHILD_COOKIE);
  const device = getCookie(c, DEVICE_COOKIE);
  if (!token || !device) throw new Refusal(401, 'signed-out');
  const [child] = await ctx.sql<ChildSession[]>`
    select ch.id as "childId", ch.parent_id as "parentId", d.id as "deviceId", ch.nickname
    from sessions s
    join children ch on ch.id = s.child_id
    join devices d on d.id = s.device_id
    where s.token_hash = ${hashToken(token)} and s.kind = 'child' and s.expires_at > now()
      and d.token_hash = ${hashToken(device)} and d.revoked_at is null`;
  if (!child) throw new Refusal(401, 'signed-out');
  return child;
}

function cleanNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (nickname.length < 1 || nickname.length > 20) throw new Refusal(400, 'nickname');
  return nickname;
}

function cleanAvatar(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z-]{1,20}$/.test(value)) throw new Refusal(400, 'avatar');
  return value;
}

function cleanDeviceName(value: unknown, fallback = 'A device'): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return name || fallback;
}

/** Seconds a device must wait before its next guess at a child's PIN, given the wrong guesses of the last hour. */
export function waitAfter(wrongGuesses: number): number {
  if (wrongGuesses < FREE_GUESSES) return 0;
  return Math.min(30 * 2 ** (wrongGuesses - FREE_GUESSES), LONGEST_WAIT_SECONDS);
}

const isNicknameTaken = (e: unknown) => e instanceof Error && /children_family_nickname/.test(e.message);

export function familyRoutes(ctx: Context): Hono {
  const { sql } = ctx;
  const app = new Hono();

  // ----- The grown-up's side -----

  app.get('/family', async (c) => {
    const parent = await requireParent(ctx, c);
    const children = await sql`
      select id, nickname, avatar, last_active_at as "lastActiveAt", created_at as "createdAt"
      from children where parent_id = ${parent.id} order by created_at`;
    const devices = await sql`
      select id, name, last_seen_at as "lastSeenAt", created_at as "createdAt"
      from devices where parent_id = ${parent.id} and revoked_at is null order by created_at`;
    const here = await findDevice(ctx, c);
    return c.json({ children, devices, thisDeviceId: here?.parentId === parent.id ? here.id : null });
  });

  app.post('/children', async (c) => {
    const parent = await requireParent(ctx, c);
    const body = await readJson(c);
    const nickname = cleanNickname(body.nickname);
    const avatar = cleanAvatar(body.avatar);
    if (!isPin(body.pin)) throw new Refusal(400, 'pin');
    // No profile without the grown-up saying yes to what is stored.
    if (body.consent !== true) throw new Refusal(400, 'consent');
    const [count] = await sql<{ n: string }[]>`select count(*) as n from children where parent_id = ${parent.id}`;
    if (Number(count!.n) >= MAX_CHILDREN) throw new Refusal(409, 'too-many-children');
    try {
      const [child] = await sql`
        insert into children (parent_id, nickname, avatar, pin_hash, consent_version, consented_at)
        values (${parent.id}, ${nickname}, ${avatar}, ${await hashPin(body.pin)}, ${CONSENT_VERSION}, now())
        returning id, nickname, avatar`;
      return c.json(child, 201);
    } catch (e) {
      if (isNicknameTaken(e)) throw new Refusal(409, 'nickname-taken');
      throw e;
    }
  });

  app.patch('/children/:id', async (c) => {
    const parent = await requireParent(ctx, c);
    const id = asId(c.req.param('id'));
    const body = await readJson(c);
    const [before] = await sql<{ nickname: string; avatar: string }[]>`select nickname, avatar from children where id = ${id} and parent_id = ${parent.id}`;
    if (!before) throw new Refusal(404, 'not-found');
    const nickname = body.nickname === undefined ? before.nickname : cleanNickname(body.nickname);
    const avatar = body.avatar === undefined ? before.avatar : cleanAvatar(body.avatar);
    if (body.pin !== undefined && !isPin(body.pin)) throw new Refusal(400, 'pin');
    try {
      await sql`update children set nickname = ${nickname}, avatar = ${avatar} where id = ${id}`;
    } catch (e) {
      if (isNicknameTaken(e)) throw new Refusal(409, 'nickname-taken');
      throw e;
    }
    if (isPin(body.pin)) {
      await sql`update children set pin_hash = ${await hashPin(body.pin)} where id = ${id}`;
      // A new PIN is a fresh start: no waits left over, and nobody still signed in on the old one.
      await sql`delete from pin_attempts where child_id = ${id}`;
      await sql`delete from sessions where child_id = ${id}`;
    }
    return c.json({ id, nickname, avatar });
  });

  app.post('/children/:id/signout', async (c) => {
    const parent = await requireParent(ctx, c);
    const id = asId(c.req.param('id'));
    await sql`delete from sessions s using children ch where s.child_id = ch.id and ch.id = ${id} and ch.parent_id = ${parent.id}`;
    return c.json({ ok: true });
  });

  /** Everything the server holds about one child, for the grown-up to keep or simply to see. */
  app.get('/children/:id/export', async (c) => {
    const parent = await requireParent(ctx, c);
    const id = asId(c.req.param('id'));
    const [child] = await sql`
      select id, nickname, avatar, created_at as "createdAt", last_active_at as "lastActiveAt",
        consent_version as "consentVersion", consented_at as "consentedAt"
      from children where id = ${id} and parent_id = ${parent.id}`;
    if (!child) throw new Refusal(404, 'not-found');
    const documents = await sql`select key, value, updated_at as "updatedAt" from documents where child_id = ${id} and not deleted order by key`;
    const shares = await sql`
      select id, from_child_id as "fromChildId", to_child_id as "toChildId", creation, created_at as "createdAt"
      from shares where from_child_id = ${id} or to_child_id = ${id} order by created_at`;
    return c.json({ exportedAt: new Date().toISOString(), child, documents, shares });
  });

  app.delete('/children/:id', async (c) => {
    const parent = await requireParent(ctx, c);
    const id = asId(c.req.param('id'));
    const gone = await sql`delete from children where id = ${id} and parent_id = ${parent.id} returning id`;
    if (gone.length === 0) throw new Refusal(404, 'not-found');
    return c.json({ ok: true });
  });

  /** The grown-up is signed in on this very browser and says: my children may use it. */
  app.post('/devices', async (c) => {
    const parent = await requireParent(ctx, c);
    const body = await readJson(c);
    const here = await findDevice(ctx, c);
    if (here?.parentId === parent.id) return c.json({ id: here.id, name: here.name });
    const [count] = await sql<{ n: string }[]>`select count(*) as n from devices where parent_id = ${parent.id} and revoked_at is null`;
    if (Number(count!.n) >= MAX_DEVICES) throw new Refusal(409, 'too-many-devices');
    const token = randomToken();
    const [device] = await sql<{ id: string; name: string }[]>`
      insert into devices (parent_id, name, token_hash) values (${parent.id}, ${cleanDeviceName(body.name)}, ${hashToken(token)})
      returning id, name`;
    // Whoever was signed in here under another family's device is not any more.
    deleteCookie(c, CHILD_COOKIE, { path: '/' });
    setSecret(ctx, c, DEVICE_COOKIE, token, DEVICE_DAYS);
    return c.json(device, 201);
  });

  /** The grown-up types the code another device is showing. */
  app.post('/devices/approve', async (c) => {
    const parent = await requireParent(ctx, c);
    const body = await readJson(c);
    const code = typeof body.code === 'string' ? cleanCode(body.code) : '';
    const [count] = await sql<{ n: string }[]>`select count(*) as n from devices where parent_id = ${parent.id} and revoked_at is null`;
    if (Number(count!.n) >= MAX_DEVICES) throw new Refusal(409, 'too-many-devices');
    const device = await sql.begin(async (tx) => {
      const [pairing] = await tx<{ pending_token_hash: string; name: string | null }[]>`
        delete from device_pairings where code = ${code} and expires_at > now() returning pending_token_hash, name`;
      if (!pairing) throw new Refusal(400, 'code');
      const [made] = await tx<{ id: string; name: string }[]>`
        insert into devices (parent_id, name, token_hash)
        values (${parent.id}, ${cleanDeviceName(body.name, pairing.name ?? undefined)}, ${pairing.pending_token_hash})
        returning id, name`;
      return made!;
    });
    return c.json(device, 201);
  });

  /** Take a device away. Everyone signed in on it is signed out at once. */
  app.delete('/devices/:id', async (c) => {
    const parent = await requireParent(ctx, c);
    const id = asId(c.req.param('id'));
    const gone = await sql`update devices set revoked_at = now() where id = ${id} and parent_id = ${parent.id} and revoked_at is null returning id`;
    if (gone.length === 0) throw new Refusal(404, 'not-found');
    await sql`delete from sessions where device_id = ${id}`;
    return c.json({ ok: true });
  });

  // ----- The device's side -----

  /** A browser nobody has authorized asks to be let in, and gets a code to show. */
  app.post('/pair/start', async (c) => {
    const body = await readJson(c);
    if (await findDevice(ctx, c)) throw new Refusal(409, 'already-paired');
    await sql`delete from device_pairings where expires_at < now()`;
    const [pending] = await sql<{ n: string }[]>`select count(*) as n from device_pairings`;
    if (Number(pending!.n) >= MAX_PENDING_PAIRINGS) throw new Refusal(429, 'busy');
    const token = randomToken();
    const code = randomCode(6);
    const name = cleanDeviceName(body.name);
    const [pairing] = await sql<{ expiresAt: Date }[]>`
      insert into device_pairings (code, pending_token_hash, name, expires_at)
      values (${code}, ${hashToken(token)}, ${name}, now() + make_interval(mins => ${PAIRING_MINUTES}))
      returning expires_at as "expiresAt"`;
    // The device keeps the token from now on; it means nothing until a grown-up approves the code.
    setSecret(ctx, c, DEVICE_COOKIE, token, DEVICE_DAYS);
    return c.json({ code, expiresAt: pairing!.expiresAt }, 201);
  });

  /** What an authorized device may know: its family's profiles to choose from, and who is signed in. */
  app.get('/device', async (c) => {
    const device = await requireDevice(ctx, c);
    await sql`update devices set last_seen_at = now() where id = ${device.id}`;
    const children = await sql`select id, nickname, avatar from children where parent_id = ${device.parentId} order by created_at`;
    const [family] = await sql<{ siblingSharing: boolean }[]>`select sibling_sharing as "siblingSharing" from parents where id = ${device.parentId}`;
    const child = await requireChild(ctx, c).catch(() => undefined);
    return c.json({ id: device.id, name: device.name, children, childId: child?.childId ?? null, siblingSharing: family!.siblingSharing });
  });

  app.post('/child/signin', async (c) => {
    const device = await requireDevice(ctx, c);
    const body = await readJson(c);
    const childId = asId(body.childId);
    const [child] = await sql<{ id: string; pin_hash: string }[]>`select id, pin_hash from children where id = ${childId} and parent_id = ${device.parentId}`;
    if (!child) throw new Refusal(404, 'not-found');

    const [wrong] = await sql<{ n: string; wait: number | null }[]>`
      select count(*) as n, extract(epoch from now() - max(at)) as wait
      from pin_attempts where device_id = ${device.id} and child_id = ${childId} and at > now() - interval '1 hour'`;
    const mustWait = waitAfter(Number(wrong!.n)) - Number(wrong!.wait ?? 0);
    if (mustWait > 0) {
      c.header('Retry-After', String(Math.ceil(mustWait)));
      return c.json({ error: 'wait', seconds: Math.ceil(mustWait) }, 429);
    }

    if (typeof body.pin !== 'string' || !(await verifyPin(body.pin, child.pin_hash))) {
      await sql`insert into pin_attempts (device_id, child_id) values (${device.id}, ${childId})`;
      throw new Refusal(401, 'pin');
    }

    await sql`delete from pin_attempts where device_id = ${device.id} and child_id = ${childId}`;
    const token = randomToken();
    await sql`
      insert into sessions (token_hash, kind, parent_id, child_id, device_id, expires_at)
      values (${hashToken(token)}, 'child', ${device.parentId}, ${childId}, ${device.id}, now() + make_interval(days => ${CHILD_SESSION_DAYS}))`;
    await sql`update children set last_active_at = now() where id = ${childId}`;
    setSecret(ctx, c, CHILD_COOKIE, token, CHILD_SESSION_DAYS);
    return c.json({ childId });
  });

  app.post('/child/signout', async (c) => {
    const token = getCookie(c, CHILD_COOKIE);
    if (token) await sql`delete from sessions where token_hash = ${hashToken(token)} and kind = 'child'`;
    deleteCookie(c, CHILD_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return app;
}
