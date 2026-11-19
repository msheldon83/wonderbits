import { describe, expect, it } from 'vitest';
import type { NodeSpec } from '../ir/spec';
import { memoryStore } from '../progress/storage';
import { Insight, MAX_WAITING_ATTEMPTS, outcomeOf, STUCK_MS, STUCK_RUNS, type AttemptRecord, type InsightApi, type VisitRecord } from './recorder';

const forward = [{ do: 'forward' }] as unknown as NodeSpec[];
const turn = [{ do: 'left' }] as unknown as NodeSpec[];
const blocked = { status: 'blocked', nodeId: 'n1', reason: 'wall' } as never;
const solved = { status: 'success' } as never;

function setup(store = memoryStore()) {
  const clock = { t: 1000 };
  let ids = 0;
  const server = { visits: new Map<string, VisitRecord>(), attempts: [] as AttemptRecord[], notes: [] as { kind: string; text: string; context: Record<string, unknown> }[], batches: 0, down: false, off: false };
  const api: InsightApi = {
    async batch({ visits, attempts }) {
      if (server.down) throw new Error('offline');
      if (server.off) throw Object.assign(new Error('off'), { code: 'off' });
      server.batches++;
      for (const v of visits) server.visits.set(v.id, structuredClone(v));
      server.attempts.push(...structuredClone(attempts));
    },
    async feedback(kind, text, context) {
      if (server.down) throw new Error('offline');
      server.notes.push({ kind, text, context });
    },
  };
  const insight = new Insight(store, api, 'v1', () => clock.t, () => `visit-${++ids}`);
  return { insight, server, clock, store };
}

describe('a visit', () => {
  it('records each run with the program as it was and how it ended', async () => {
    const { insight, server, clock } = setup();
    const visit = insight.open('forest-1');
    clock.t += 5000;
    visit.edited(forward);
    clock.t += 3000;
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    clock.t += 4000;
    visit.hint(0);
    visit.edited(turn);
    visit.edited(turn);
    visit.predicted(true);
    clock.t += 2000;
    visit.attempt({ program: turn, cards: 1, outcome: solved });
    visit.complete(2);
    visit.rate(3);
    await insight.flush();

    expect(server.attempts).toMatchObject([
      { visitId: 'visit-1', seq: 0, program: forward, outcome: 'blocked', detail: { reason: 'wall' }, msSinceOpen: 8000, editsSinceLastRun: 1, hintRung: 0 },
      { visitId: 'visit-1', seq: 1, program: turn, outcome: 'solved', detail: {}, msSinceOpen: 14_000, editsSinceLastRun: 2, hintRung: 1, predictionCorrect: true },
    ]);
    expect(server.attempts[0]).not.toHaveProperty('predictionCorrect');
    expect(server.visits.get('visit-1')).toMatchObject({ levelId: 'forest-1', appVersion: 'v1', openedAt: 1000, ended: 'completed', runs: 2, hintsOpened: 1, activeMs: 14_000, stars: 2, difficulty: 3 });
    expect(insight.waiting).toBe(0);
  });

  it('does not count a long pause as time on the level', () => {
    const { insight, clock } = setup();
    const visit = insight.open('forest-1');
    clock.t += 30 * 60_000;
    visit.edited(forward);
    expect(visit.record.activeMs).toBe(60_000);
  });

  it('that is left keeps its last run, the reason for quitting', async () => {
    const { insight, server, clock } = setup();
    const visit = insight.open('forest-1');
    clock.t += 1000;
    visit.attempt({ program: forward, cards: 1, outcome: { status: 'halted', reason: 'step-limit' } });
    visit.leave();
    await insight.flush();
    expect(server.visits.get('visit-1')).toMatchObject({ ended: 'left', runs: 1 });
    expect(server.attempts.at(-1)).toMatchObject({ outcome: 'halted', detail: { reason: 'step-limit' } });
    expect(insight.current).toBeNull();
  });

  it('where nothing was done is not kept', async () => {
    const { insight, server } = setup();
    insight.open('forest-1').leave();
    await insight.flush();
    expect(server.batches).toBe(0);
    expect(insight.waiting).toBe(0);
  });

  it('asks whether the child is stuck once: after five failed runs, or four minutes with one', () => {
    const { insight, clock } = setup();
    const visit = insight.open('forest-1');
    for (let i = 0; i < STUCK_RUNS - 1; i++) visit.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(visit.shouldAskIfStuck).toBe(false);
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(visit.shouldAskIfStuck).toBe(true);
    visit.askedIfStuck();
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(visit.shouldAskIfStuck).toBe(false);
    visit.stuck('very');
    expect(visit.record.stuck).toBe('very');

    const slow = insight.open('forest-2');
    for (let i = 0; i < STUCK_MS / 30_000; i++) {
      clock.t += 30_000;
      slow.edited(forward);
    }
    // Thinking for a long time without having run anything is not being stuck yet.
    expect(slow.shouldAskIfStuck).toBe(false);
    slow.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(slow.shouldAskIfStuck).toBe(true);
    slow.complete(1);
    expect(slow.shouldAskIfStuck).toBe(false);
  });
});

describe('the outbox', () => {
  it('waits out an offline spell, and survives a restart', async () => {
    const first = setup();
    first.server.down = true;
    const visit = first.insight.open('forest-1');
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    await expect(first.insight.flush()).rejects.toThrow('offline');
    expect(first.insight.waiting).toBe(2);
    await new Promise((r) => setTimeout(r));

    const second = setup(first.store);
    await second.insight.flush();
    expect(second.server.attempts).toHaveLength(1);
    expect(second.server.visits.size).toBe(1);
    expect(second.insight.waiting).toBe(0);
  });

  it('sends a visit again when it changes after being sent', async () => {
    const { insight, server } = setup();
    const visit = insight.open('forest-1');
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    await insight.flush();
    expect(server.visits.get('visit-1')).toMatchObject({ runs: 1 });
    expect(server.visits.get('visit-1')).not.toHaveProperty('ended');
    visit.attempt({ program: turn, cards: 1, outcome: solved });
    visit.complete(3);
    await insight.flush();
    expect(server.visits.get('visit-1')).toMatchObject({ runs: 2, ended: 'completed' });
    expect(server.attempts.map((a) => a.seq)).toEqual([0, 1]);
  });

  it('drops the oldest runs rather than grow without end', () => {
    const { insight, server } = setup();
    server.down = true;
    const visit = insight.open('forest-1');
    for (let i = 0; i < MAX_WAITING_ATTEMPTS + 20; i++) visit.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(insight.waiting).toBe(MAX_WAITING_ATTEMPTS + 1);
  });

  it('stops and keeps nothing once the grown-up turns it off', async () => {
    const { insight, server, store } = setup();
    server.off = true;
    const visit = insight.open('forest-1');
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    await insight.flush();
    expect(insight.waiting).toBe(0);
    expect(await store.get('insight:outbox')).toBeUndefined();
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    expect(insight.waiting).toBe(0);
  });
});

describe('feedback', () => {
  it('goes with where the child was and what was in front of them', async () => {
    const { insight, server } = setup();
    const visit = insight.open('forest-1');
    visit.edited(forward);
    visit.attempt({ program: forward, cards: 1, outcome: blocked });
    await insight.sendFeedback('confusing', 'What does this card do?', { screen: 'level', levelId: 'forest-1' });
    expect(server.notes).toEqual([{ kind: 'confusing', text: 'What does this card do?', context: { screen: 'level', levelId: 'forest-1', appVersion: 'v1', visitId: 'visit-1', runs: 1, program: forward } }]);
    visit.leave();
    await insight.sendFeedback('idea', 'More frogs', { screen: 'map' });
    expect(server.notes[1]!.context).toEqual({ screen: 'map', appVersion: 'v1' });
  });

  it('says so when it could not be sent', async () => {
    const { insight, server } = setup();
    server.down = true;
    await expect(insight.sendFeedback('idea', 'More frogs')).rejects.toThrow();
  });
});

describe('outcomeOf', () => {
  it('puts every way a run can end into four words', () => {
    expect(outcomeOf({ outcome: solved })).toEqual({ outcome: 'solved', detail: {} });
    expect(outcomeOf({ outcome: blocked })).toEqual({ outcome: 'blocked', detail: { reason: 'wall' } });
    expect(outcomeOf({ outcome: { status: 'halted', reason: 'forever' } })).toEqual({ outcome: 'halted', detail: { reason: 'forever' } });
    expect(outcomeOf({ outcome: { status: 'incomplete' } })).toEqual({ outcome: 'missed', detail: { status: 'incomplete' } });
    expect(outcomeOf({ outcome: { status: 'lost', nodeId: 'n' } as never })).toEqual({ outcome: 'missed', detail: { status: 'lost' } });
    expect(outcomeOf({ outcome: solved, check: 'roll' })).toEqual({ outcome: 'missed', detail: { status: 'roll' } });
  });
});
