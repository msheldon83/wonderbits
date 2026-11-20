import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Sql } from './db';
import { CONSENT_VERSION, waitAfter } from './family';
import { memoryMailer } from './mail';
import { hashPin, verifyPin } from './pins';
import { addChild, Browser, childOn, emptyTables, freshDatabase, pairedDevice, signedInParent } from './testing';

let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;
let parent: Browser;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await emptyTables(sql);
  mailer = memoryMailer();
  app = createApp({ sql, mailer });
  parent = await signedInParent(app, sql, mailer, 'lee@example.com');
});

describe('a child profile', () => {
  it('is made by a signed-in grown-up who consents', async () => {
    const id = await addChild(parent, '  Robin  ');
    const family = await parent.ok(parent.get('/api/family'));
    expect(family.children).toMatchObject([{ id, nickname: 'Robin', avatar: 'fox', lastActiveAt: null }]);
    const [row] = await sql`select consent_version, consented_at, pin_hash from children where id = ${id}`;
    expect(row!.consent_version).toBe(CONSENT_VERSION);
    expect(row!.consented_at).toBeInstanceOf(Date);
    expect(row!.pin_hash).not.toContain('1234');
  });

  it('is refused without consent, a sign-in, or sound details', async () => {
    const good = { nickname: 'Robin', avatar: 'fox', pin: '1234', consent: true };
    const bad = async (patch: object, error: string) => expect(await parent.ok(parent.post('/api/children', { ...good, ...patch }), 400)).toEqual({ error });
    await bad({ consent: false }, 'consent');
    await bad({ consent: 'yes' }, 'consent');
    await bad({ pin: '123' }, 'pin');
    await bad({ pin: '12345678' }, 'pin');
    await bad({ pin: 'abcd' }, 'pin');
    await bad({ nickname: '   ' }, 'nickname');
    await bad({ nickname: 'x'.repeat(21) }, 'nickname');
    await bad({ avatar: '<img>' }, 'avatar');
    expect((await new Browser(app).post('/api/children', good)).status).toBe(401);
  });

  it('cannot share a nickname with a brother or sister', async () => {
    await addChild(parent, 'Robin');
    expect(await parent.ok(parent.post('/api/children', { nickname: 'robin', avatar: 'owl', pin: '4321', consent: true }), 409)).toEqual({ error: 'nickname-taken' });
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    await addChild(other, 'Robin');
  });

  it('belongs to its own grown-up only', async () => {
    const id = await addChild(parent, 'Robin');
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    expect((await other.patch(`/api/children/${id}`, { nickname: 'Mine' })).status).toBe(404);
    expect((await other.get(`/api/children/${id}/export`)).status).toBe(404);
    expect((await other.delete(`/api/children/${id}`)).status).toBe(404);
    expect((await other.delete('/api/children/not-an-id')).status).toBe(404);
    expect((await parent.ok(parent.get('/api/family'))).children).toHaveLength(1);
  });

  it('can be renamed, exported and deleted with everything under it', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await childOn(app, parent, id);
    await device.ok(device.put('/api/sync/progress', { baseRev: 0, value: { version: 1 } }));
    await parent.ok(parent.patch(`/api/children/${id}`, { nickname: 'Wren', avatar: 'owl' }));
    const file = await parent.ok(parent.get(`/api/children/${id}/export`));
    expect(file.child).toMatchObject({ nickname: 'Wren', avatar: 'owl', consentVersion: CONSENT_VERSION });
    expect(file.documents).toMatchObject([{ key: 'progress', value: { version: 1 } }]);
    await parent.ok(parent.delete(`/api/children/${id}`));
    const [left] = await sql<{ n: string }[]>`select (select count(*) from documents) + (select count(*) from sessions where kind = 'child') as n`;
    expect(Number(left!.n)).toBe(0);
    expect((await device.get('/api/sync')).status).toBe(401);
  });
});

describe('a device', () => {
  it('is let in when the grown-up types its code', async () => {
    const id = await addChild(parent, 'Robin');
    const device = new Browser(app);
    expect((await device.get('/api/device')).status).toBe(401);
    const { code } = await device.ok(device.post('/api/pair/start', { name: 'Kitchen tablet' }), 201);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect((await device.get('/api/device')).status).toBe(401);
    await parent.ok(parent.post('/api/devices/approve', { code: code.toLowerCase() }), 201);
    const seen = await device.ok(device.get('/api/device'));
    expect(seen).toMatchObject({ name: 'Kitchen tablet', children: [{ id, nickname: 'Robin', avatar: 'fox' }], childId: null });
    expect(JSON.stringify(seen)).not.toContain('lee@example.com');
  });

  it('is let in by a code once, and not by an old or wrong one', async () => {
    const device = new Browser(app);
    const { code } = await device.ok(device.post('/api/pair/start', {}), 201);
    expect(await parent.ok(parent.post('/api/devices/approve', { code: 'AAAAAA' }), 400)).toEqual({ error: 'code' });
    await sql`update device_pairings set expires_at = now() - interval '1 second'`;
    expect((await parent.post('/api/devices/approve', { code })).status).toBe(400);
    const again = await device.ok(device.post('/api/pair/start', {}), 201);
    await parent.ok(parent.post('/api/devices/approve', { code: again.code }), 201);
    expect((await parent.post('/api/devices/approve', { code: again.code })).status).toBe(400);
    expect((await new Browser(app).post('/api/devices/approve', { code })).status).toBe(401);
  });

  it('can be the grown-up’s own browser', async () => {
    const made = await parent.ok(parent.post('/api/devices', { name: 'Laptop' }), 201);
    expect(await parent.ok(parent.post('/api/devices', { name: 'Laptop' }))).toMatchObject({ id: made.id });
    const family = await parent.ok(parent.get('/api/family'));
    expect(family.devices).toHaveLength(1);
    expect(family.thisDeviceId).toBe(made.id);
  });

  it('signs everyone out when the grown-up takes it away', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await childOn(app, parent, id);
    const { devices } = await parent.ok(parent.get('/api/family'));
    await parent.ok(parent.delete(`/api/devices/${devices[0].id}`));
    expect((await device.get('/api/sync')).status).toBe(401);
    expect((await device.get('/api/device')).status).toBe(401);
    expect((await device.post('/api/child/signin', { childId: id, pin: '1234' })).status).toBe(401);
    expect((await parent.ok(parent.get('/api/family'))).devices).toHaveLength(0);
  });

  it('cannot be taken away by another family', async () => {
    await pairedDevice(app, parent);
    const { devices } = await parent.ok(parent.get('/api/family'));
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    expect((await other.delete(`/api/devices/${devices[0].id}`)).status).toBe(404);
  });
});

describe('a child signing in', () => {
  it('needs an authorized device as well as the PIN', async () => {
    const id = await addChild(parent, 'Robin');
    // The right child and the right PIN, from a browser nobody let in.
    const stranger = new Browser(app);
    expect(await stranger.ok(stranger.post('/api/child/signin', { childId: id, pin: '1234' }), 401)).toEqual({ error: 'device' });
    // Asking to be let in is not being let in.
    await stranger.post('/api/pair/start', {});
    expect((await stranger.post('/api/child/signin', { childId: id, pin: '1234' })).status).toBe(401);
    // Nor is another family's device.
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    const theirs = await pairedDevice(app, other);
    expect((await theirs.post('/api/child/signin', { childId: id, pin: '1234' })).status).toBe(404);
  });

  it('works on an authorized device with the right PIN', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await pairedDevice(app, parent);
    expect(await device.ok(device.post('/api/child/signin', { childId: id, pin: '0000' }), 401)).toEqual({ error: 'pin' });
    await device.ok(device.post('/api/child/signin', { childId: id, pin: '1234' }));
    expect((await device.ok(device.get('/api/device'))).childId).toBe(id);
    expect((await parent.ok(parent.get('/api/family'))).children[0].lastActiveAt).not.toBeNull();
    await device.ok(device.post('/api/child/signout'));
    expect((await device.ok(device.get('/api/device'))).childId).toBeNull();
    expect((await device.get('/api/sync')).status).toBe(401);
  });

  it('counts only on the device it happened on', async () => {
    const id = await addChild(parent, 'Robin');
    const tablet = await childOn(app, parent, id);
    const laptop = await pairedDevice(app, parent, 'Laptop');
    // The child's cookie, carried to another of the family's devices, is not a session there.
    laptop.cookies.set('wb_child', tablet.cookies.get('wb_child')!);
    expect((await laptop.get('/api/sync')).status).toBe(401);
  });

  it('cannot reach anything of the grown-up’s', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await childOn(app, parent, id);
    expect((await device.get('/api/family')).status).toBe(401);
    expect((await device.get('/api/parent/me')).status).toBe(401);
    expect((await device.patch(`/api/children/${id}`, { pin: '9999' })).status).toBe(401);
    expect((await device.delete(`/api/children/${id}`)).status).toBe(401);
  });

  it('is slowed after three wrong PINs, and freed by a new PIN from the grown-up', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await pairedDevice(app, parent);
    for (let i = 0; i < 3; i++) expect((await device.post('/api/child/signin', { childId: id, pin: '0000' })).status).toBe(401);
    const held = await device.post('/api/child/signin', { childId: id, pin: '1234' });
    expect(held.status).toBe(429);
    expect(held.headers.get('retry-after')).toBe('30');
    expect(await held.json()).toMatchObject({ error: 'wait' });
    // A second device of the family is not held up by the first.
    const second = await pairedDevice(app, parent, 'Laptop');
    await second.ok(second.post('/api/child/signin', { childId: id, pin: '1234' }));
    // After the wait, the right PIN works.
    await sql`update pin_attempts set at = at - interval '31 seconds'`;
    await device.ok(device.post('/api/child/signin', { childId: id, pin: '1234' }));
    // A reset signs the child out everywhere and clears the count.
    await parent.ok(parent.patch(`/api/children/${id}`, { pin: '777777' }));
    expect((await second.get('/api/sync')).status).toBe(401);
    expect((await device.post('/api/child/signin', { childId: id, pin: '1234' })).status).toBe(401);
    await device.ok(device.post('/api/child/signin', { childId: id, pin: '777777' }));
  });

  it('waits longer each time, up to a quarter of an hour', () => {
    expect([0, 2, 3, 4, 5, 8, 20].map(waitAfter)).toEqual([0, 0, 30, 60, 120, 900, 900]);
  });
});

describe('the account', () => {
  it('keeps the grown-up’s choices', async () => {
    expect(await parent.ok(parent.patch('/api/parent/me', { notifyByEmail: false }))).toMatchObject({ notifyByEmail: false, siblingSharing: true });
    expect(await parent.ok(parent.get('/api/parent/me'))).toMatchObject({ notifyByEmail: false, siblingSharing: true });
  });

  it('is deleted whole', async () => {
    const id = await addChild(parent, 'Robin');
    const device = await childOn(app, parent, id);
    await device.ok(device.put('/api/sync/progress', { baseRev: 0, value: {} }));
    await parent.ok(parent.delete('/api/parent/me'));
    const [left] = await sql<{ n: string }[]>`
      select (select count(*) from parents) + (select count(*) from children) + (select count(*) from devices)
        + (select count(*) from documents) + (select count(*) from sessions) + (select count(*) from login_tokens) as n`;
    expect(Number(left!.n)).toBe(0);
    expect((await parent.get('/api/parent/me')).status).toBe(401);
    expect((await device.get('/api/device')).status).toBe(401);
  });
});

describe('PINs', () => {
  it('are stored salted, and checked', async () => {
    const a = await hashPin('1234');
    expect(a).not.toBe(await hashPin('1234'));
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('1235', a)).toBe(false);
    expect(await verifyPin('1234', 'nonsense')).toBe(false);
  });
});
