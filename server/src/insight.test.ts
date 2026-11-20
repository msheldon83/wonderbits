import type { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './admin';
import { createApp } from './app';
import type { Sql } from './db';
import { cleanText, NOTES_PER_DAY, programHash, prune, pseudonym, sendDigest } from './insight';
import { memoryMailer } from './mail';
import { addChild, Browser, childOn, emptyTables, freshDatabase, signedInParent } from './testing';

const OWNER = 'owner@example.com';
let sql: Sql;
let mailer: ReturnType<typeof memoryMailer>;
let app: Hono;
let parent: Browser;
let robinId: string;
let robin: Browser;
let owner: Browser;

beforeAll(async () => {
  sql = await freshDatabase();
});
afterAll(() => sql.end());
beforeEach(async () => {
  await emptyTables(sql);
  mailer = memoryMailer();
  app = createApp({ sql, mailer, publicUrl: 'https://wonderbits.example', adminEmails: [OWNER] });
  parent = await signedInParent(app, sql, mailer, 'lee@example.com');
  robinId = await addChild(parent, 'Robin');
  robin = await childOn(app, parent, robinId);
  owner = await signedInParent(app, sql, mailer, OWNER);
  mailer.sent.length = 0;
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T0 = Date.now() - 60_000;
const visit = (n: number, patch: object = {}) => ({ id: uuid(n), levelId: 'forest-1', appVersion: 'abc123', openedAt: T0, runs: 0, hintsOpened: 0, activeMs: 0, ...patch });
const attempt = (n: number, seq: number, patch: object = {}) => ({ visitId: uuid(n), seq, at: T0 + seq * 1000, program: [{ do: 'forward' }], cards: 1, outcome: 'blocked', detail: { reason: 'wall' }, msSinceOpen: seq * 1000, ...patch });

describe('attempts and visits', () => {
  it('are stored once, however often the device sends them', async () => {
    const batch = { visits: [visit(1)], attempts: [attempt(1, 0), attempt(1, 1, { outcome: 'solved', detail: {} })] };
    expect(await robin.ok(robin.post('/api/insight/batch', batch))).toEqual({ stored: 3 });
    await robin.ok(robin.post('/api/insight/batch', batch));
    const [count] = await sql<{ v: string; a: string }[]>`select (select count(*) from level_visits) as v, (select count(*) from attempts) as a`;
    expect([Number(count!.v), Number(count!.a)]).toEqual([1, 2]);
  });

  it('take a later copy of a visit over an earlier one', async () => {
    await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1, { runs: 1 })] }));
    await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1, { runs: 4, ended: 'completed', endedAt: T0 + 9000, stars: 2, difficulty: 3, stuck: 'a-bit', hintsOpened: 2, activeMs: 9000 })] }));
    const [row] = await sql`select runs, ended, stars, difficulty, stuck, hints_opened, active_ms, app_version from level_visits`;
    expect(row).toMatchObject({ runs: 4, ended: 'completed', stars: 2, difficulty: 3, stuck: 'a-bit', hints_opened: 2, active_ms: 9000, app_version: 'abc123' });
  });

  it('cannot be written into another child’s visit', async () => {
    await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1, { runs: 1 })] }));
    const wren = await childOn(app, parent, await addChild(parent, 'Wren'));
    expect(await wren.ok(wren.post('/api/insight/batch', { visits: [visit(1, { runs: 99 })], attempts: [attempt(1, 0)] }))).toEqual({ stored: 0 });
    const [row] = await sql`select runs, child_id from level_visits`;
    expect(row).toMatchObject({ runs: 1, child_id: robinId });
  });

  it('skip what makes no sense and keep the rest', async () => {
    const batch = {
      visits: [visit(1), { id: 'nope', levelId: 'x', openedAt: T0 }, visit(2, { levelId: '' }), visit(3, { difficulty: 9, stuck: 'maybe', runs: -5, hintsOpened: 40 })],
      attempts: [attempt(1, 0), attempt(1, 1, { outcome: 'exploded' }), attempt(7, 0), attempt(1, 2, { program: { pad: 'x'.repeat(40_000) } })],
    };
    expect(await robin.ok(robin.post('/api/insight/batch', batch))).toEqual({ stored: 4 });
    const [odd] = await sql`select difficulty, stuck, runs, hints_opened from level_visits where id = ${uuid(3)}`;
    expect(odd).toMatchObject({ difficulty: null, stuck: null, runs: 0, hints_opened: 3 });
    const [big] = await sql`select program, program_hash from attempts where seq = 2`;
    expect(big).toMatchObject({ program: null, program_hash: null });
  });

  it('need a signed-in child and the grown-up’s leave', async () => {
    expect((await new Browser(app).post('/api/insight/batch', {})).status).toBe(401);
    expect((await parent.post('/api/insight/batch', {})).status).toBe(401);
    await parent.ok(parent.patch('/api/parent/me', { improve: false }));
    expect(await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1)] }), 403)).toEqual({ error: 'off' });
    expect(await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'More frogs' }), 403)).toEqual({ error: 'off' });
    expect((await robin.ok(robin.get('/api/device'))).improve).toBe(false);
    const [count] = await sql<{ n: string }[]>`select (select count(*) from level_visits) + (select count(*) from feedback) as n`;
    expect(Number(count!.n)).toBe(0);
  });

  it('are deleted with the child, and when they are too old', async () => {
    await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1), visit(2)], attempts: [attempt(1, 0), attempt(2, 0)] }));
    await sql`update level_visits set opened_at = now() - interval '13 months' where id = ${uuid(1)}`;
    expect(await prune(sql)).toBe(1);
    const [left] = await sql<{ n: string }[]>`select count(*) as n from attempts`;
    expect(Number(left!.n)).toBe(1);
    await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'More frogs' }), 201);
    const file = await parent.ok(parent.get(`/api/children/${robinId}/export`));
    expect(file.visits).toHaveLength(1);
    expect(file.attempts).toHaveLength(1);
    expect(file.feedback).toMatchObject([{ kind: 'idea', text: 'More frogs' }]);
    await parent.ok(parent.delete(`/api/children/${robinId}`));
    const [gone] = await sql<{ n: string }[]>`select (select count(*) from level_visits) + (select count(*) from attempts) + (select count(*) from feedback) as n`;
    expect(Number(gone!.n)).toBe(0);
  });
});

describe('feedback', () => {
  it('is kept with where the child was, and mailed to the owner under a made-up name', async () => {
    await robin.ok(robin.post('/api/feedback', { kind: 'confusing', text: '  I do not get   the loop card ', context: { screen: 'level', levelId: 'forest-loops-2', program: [] } }), 201);
    const [row] = await sql`select kind, text, context, child_id from feedback`;
    expect(row).toMatchObject({ kind: 'confusing', text: 'I do not get the loop card', context: { levelId: 'forest-loops-2' }, child_id: robinId });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: OWNER, subject: 'Wonderbits: one new note' });
    expect(mailer.sent[0]!.text).toContain('I do not get the loop card');
    expect(mailer.sent[0]!.text).toContain(pseudonym(robinId));
    expect(mailer.sent[0]!.text).not.toMatch(/Robin|lee@example\.com/);
  });

  it('mails the owner at most once a quarter of an hour, and catches up after', async () => {
    await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'one' }), 201);
    await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'two' }), 201);
    await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'three' }), 201);
    expect(mailer.sent).toHaveLength(1);
    const ctx = { sql, mailer, publicUrl: 'https://wonderbits.example', inviteRequired: true, adminEmails: [OWNER] };
    expect(await sendDigest(ctx)).toBe(0);
    await sql`update feedback set mailed_at = mailed_at - interval '16 minutes'`;
    expect(await sendDigest(ctx)).toBe(2);
    expect(mailer.sent[1]!.subject).toBe('Wonderbits: 2 new notes');
    expect(await sendDigest(ctx)).toBe(0);
    expect(await sendDigest({ ...ctx, adminEmails: [] })).toBe(0);
  });

  it('has addresses and phone numbers taken out, and is cut to length', () => {
    expect(cleanText('write to robin.lee@example.com or call 07700 900 123 please')).toBe('write to [removed] or call [removed] please');
    expect(cleanText('I got 12 stars on level 3')).toBe('I got 12 stars on level 3');
    expect(cleanText('x'.repeat(900))).toHaveLength(500);
    expect(() => cleanText('   ')).toThrow();
    expect(() => cleanText(42)).toThrow();
  });

  it('is refused when it is not a known kind, or there has been too much of it', async () => {
    expect((await robin.post('/api/feedback', { kind: 'rant', text: 'x' })).status).toBe(400);
    expect((await robin.post('/api/feedback', { kind: 'idea', text: '' })).status).toBe(400);
    await sql`
      insert into feedback (parent_id, child_id, kind, text, mailed_at)
      select parent_id, id, 'idea', 'x', now() from children, generate_series(1, ${NOTES_PER_DAY}) where id = ${robinId}`;
    expect(await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: 'one more' }), 429)).toEqual({ error: 'too-many-notes' });
  });

  it('can come from a grown-up, who sees and can delete all their family wrote', async () => {
    await robin.ok(robin.post('/api/feedback', { kind: 'question', text: 'Why does the robot stop?', context: { levelId: 'forest-1' } }), 201);
    await parent.ok(parent.post('/api/family/feedback', { text: 'She finds the If card hard' }), 201);
    const { feedback } = await parent.ok(parent.get('/api/family/feedback'));
    expect(feedback).toMatchObject([
      { childId: null, kind: 'idea', text: 'She finds the If card hard' },
      { childId: robinId, kind: 'question', levelId: 'forest-1', reply: null },
    ]);
    const other = await signedInParent(app, sql, mailer, 'other@example.com');
    expect((await other.ok(other.get('/api/family/feedback'))).feedback).toEqual([]);
    expect((await other.delete(`/api/family/feedback/${feedback[1].id}`)).status).toBe(404);
    await parent.ok(parent.delete(`/api/family/feedback/${feedback[1].id}`));
    expect((await parent.ok(parent.get('/api/family/feedback'))).feedback).toHaveLength(1);
    // A grown-up may write even with collection off: it is their own choice to.
    await parent.ok(parent.patch('/api/parent/me', { improve: false }));
    await parent.ok(parent.post('/api/family/feedback', { text: 'Still here' }), 201);
  });
});

describe('the owner’s page', () => {
  it('is open only to the owner', async () => {
    for (const path of ['/api/admin/levels', '/api/admin/levels/forest-1', '/api/admin/feedback', '/api/admin/export/visits.csv']) {
      expect((await parent.get(path)).status).toBe(404);
      expect((await robin.get(path)).status).toBe(401);
      expect((await owner.get(path)).status).toBe(200);
    }
    expect((await parent.post(`/api/admin/feedback/${uuid(1)}/reply`, { text: 'hi' })).status).toBe(404);
    expect((await parent.ok(parent.get('/api/parent/me'))).admin).toBe(false);
    expect((await owner.ok(owner.get('/api/parent/me'))).admin).toBe(true);
  });

  it('shows where children get stuck', async () => {
    const wrenId = await addChild(parent, 'Wren');
    const wren = await childOn(app, parent, wrenId);
    const wrong = [{ do: 'forward' }, { do: 'forward' }];
    // Robin: the same wrong program twice, then solved with a hint. Rated hard, said they were a bit stuck.
    await robin.ok(
      robin.post('/api/insight/batch', {
        visits: [visit(1, { ended: 'completed', endedAt: T0 + 5000, runs: 3, hintsOpened: 1, activeMs: 40_000, stars: 2, difficulty: 3, stuck: 'a-bit' })],
        attempts: [attempt(1, 0, { program: wrong }), attempt(1, 1, { program: wrong }), attempt(1, 2, { outcome: 'solved', detail: {}, program: [{ do: 'forward' }, { do: 'left' }] })],
      }),
    );
    // Wren: the same wrong program (keys in another order), then gave up.
    await wren.ok(
      wren.post('/api/insight/batch', {
        visits: [visit(2, { ended: 'left', endedAt: T0 + 9000, runs: 2, activeMs: 90_000 })],
        attempts: [attempt(2, 0, { program: [{ do: 'forward' }, { do: 'forward' }] }), attempt(2, 1, { program: [{ do: 'left' }], outcome: 'halted', detail: { reason: 'step-limit' } })],
      }),
    );
    await robin.ok(robin.post('/api/feedback', { kind: 'level-note', text: 'The wall was sneaky', context: { levelId: 'forest-1' } }), 201);

    const { levels } = await owner.ok(owner.get('/api/admin/levels'));
    expect(levels).toEqual([{ levelId: 'forest-1', visits: 2, children: 2, finished: 1, leftVisits: 1, medianRuns: 3, medianMs: 40_000, hintVisits: 1, difficulty: 3, ratings: 1, stuckVisits: 1, notes: 1 }]);

    const level = await owner.ok(owner.get('/api/admin/levels/forest-1'));
    expect(level.wrong[0]).toMatchObject({ runs: 3, children: 2, program: wrong, outcome: 'blocked', reason: 'wall', hash: programHash(wrong) });
    expect(level.outcomes).toContainEqual({ outcome: 'blocked', reason: 'wall', runs: 3, children: 2 });
    expect(level.outcomes).toContainEqual({ outcome: 'solved', reason: '', runs: 1, children: 1 });
    expect(level.quits).toEqual([{ outcome: 'halted', reason: 'step-limit', visits: 1, medianRuns: 2, medianMs: 90_000 }]);
    expect(level.ratings).toEqual([{ difficulty: 3, n: 1 }]);
    expect(level.stuck).toEqual([{ stuck: 'a-bit', n: 1 }]);
    expect(level.notes).toMatchObject([{ text: 'The wall was sneaky', who: pseudonym(robinId) }]);
    // Patterns, not people.
    expect(JSON.stringify([levels, level])).not.toMatch(/Robin|Wren|lee@example\.com/);
    expect(JSON.stringify([levels, level])).not.toContain(robinId);
  });

  it('lists what was written, and sends an answer to the grown-up, never the child', async () => {
    await robin.ok(robin.post('/api/feedback', { kind: 'question', text: 'Why does the robot stop?', context: { levelId: 'forest-1' } }), 201);
    await parent.ok(parent.post('/api/family/feedback', { text: 'More levels please' }), 201);
    mailer.sent.length = 0;
    const inbox = await owner.ok(owner.get('/api/admin/feedback'));
    expect(inbox.unread).toBe(2);
    expect(inbox.feedback).toMatchObject([
      { kind: 'idea', fromGrownup: true, who: pseudonym((await sql`select id from parents where email = 'lee@example.com'`)[0]!.id, 'G') },
      { kind: 'question', fromGrownup: false, who: pseudonym(robinId), context: { levelId: 'forest-1' } },
    ]);
    expect(JSON.stringify(inbox)).not.toMatch(/Robin|lee@example\.com/);
    expect((await owner.ok(owner.get('/api/admin/feedback?kind=question'))).feedback).toHaveLength(1);

    const question = inbox.feedback[1];
    await owner.ok(owner.post(`/api/admin/feedback/${question.id}/reply`, { text: 'It stops at walls. Try turning first.' }));
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'lee@example.com', subject: 'An answer for Robin from Wonderbits' });
    expect(mailer.sent[0]!.text).toContain('Why does the robot stop?');
    expect(mailer.sent[0]!.text).toContain('It stops at walls. Try turning first.');
    expect((await parent.ok(parent.get('/api/family/feedback'))).feedback[1]).toMatchObject({ reply: 'It stops at walls. Try turning first.' });

    await owner.ok(owner.post(`/api/admin/feedback/${inbox.feedback[0].id}/read`));
    const after = await owner.ok(owner.get('/api/admin/feedback?unread=1'));
    expect(after).toMatchObject({ unread: 0, feedback: [] });
  });

  it('hands everything over as CSV, under made-up names', async () => {
    await robin.ok(robin.post('/api/insight/batch', { visits: [visit(1)], attempts: [attempt(1, 0)] }));
    await robin.ok(robin.post('/api/feedback', { kind: 'idea', text: '=SUM(A1), "quoted"' }), 201);
    const visits = await (await owner.get('/api/admin/export/visits.csv')).text();
    expect(visits.split('\n')[0]).toBe('visit,child,level,app_version,opened_at,ended_at,ended,runs,hints_opened,active_ms,stars,difficulty,stuck');
    expect(visits).toContain(`${uuid(1)},${pseudonym(robinId)},forest-1,abc123,`);
    const attempts = await owner.get('/api/admin/export/attempts.csv');
    expect(attempts.headers.get('content-type')).toContain('text/csv');
    expect(await attempts.text()).toContain('blocked,wall,1,');
    const feedback = await (await owner.get('/api/admin/export/feedback.csv')).text();
    expect(feedback).toContain(`"'=SUM(A1), ""quoted"""`);
    expect(visits + feedback).not.toContain(robinId);
    expect((await owner.get('/api/admin/export/parents.csv')).status).toBe(404);
  });
});

describe('small things', () => {
  it('give the same program the same name, whatever order its keys came in', () => {
    expect(programHash([{ repeat: 2, body: [{ do: 'forward' }] }])).toBe(programHash([{ body: [{ do: 'forward' }], repeat: 2 }]));
    expect(programHash([{ do: 'forward' }])).not.toBe(programHash([{ do: 'left' }]));
  });

  it('give each child a steady made-up name', () => {
    expect(pseudonym('a')).toMatch(/^K-[0-9a-f]{6}$/);
    expect(pseudonym('a')).toBe(pseudonym('a'));
    expect(pseudonym('a')).not.toBe(pseudonym('b'));
    expect(pseudonym('a', 'G')).toMatch(/^G-/);
  });

  it('write CSV a spreadsheet can open safely', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('-1+2')).toBe("'-1+2");
    expect(csvCell(null)).toBe('');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x' }])).toBe('a,b\n1,x\n');
  });
});
