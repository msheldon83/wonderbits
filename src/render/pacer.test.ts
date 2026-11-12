import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pacer } from './pacer';

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

/** Whether a rest has let the demo go on, checked after the timers and promises settle. */
async function settled(p: Promise<void>, ms = 0): Promise<boolean> {
  let done = false;
  void p.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(ms);
  return done;
}

describe('Pacer', () => {
  it('rests for the time given while playing', async () => {
    const pacer = new Pacer();
    const rest = pacer.rest(500, new AbortController().signal);
    expect(await settled(rest, 499)).toBe(false);
    expect(await settled(rest, 1)).toBe(true);
  });

  it('holds while paused until it is resumed', async () => {
    const changes: boolean[] = [];
    const pacer = new Pacer((p) => changes.push(p));
    pacer.pause();
    const rest = pacer.rest(500, new AbortController().signal);
    expect(await settled(rest, 5000)).toBe(false);
    pacer.resume();
    expect(await settled(rest)).toBe(true);
    expect(changes).toEqual([true, false]);
  });

  it('a pause during a rest holds when the rest is over', async () => {
    const pacer = new Pacer();
    const rest = pacer.rest(500, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(100);
    pacer.pause();
    expect(await settled(rest, 5000)).toBe(false);
    pacer.resume();
    expect(await settled(rest)).toBe(true);
  });

  it('a step while playing only stops the demo', async () => {
    const pacer = new Pacer();
    pacer.step();
    expect(pacer.paused).toBe(true);
    expect(await settled(pacer.rest(0, new AbortController().signal), 1000)).toBe(false);
  });

  it('a step while held lets one rest through and stays paused', async () => {
    const pacer = new Pacer();
    const { signal } = new AbortController();
    pacer.pause();
    const first = pacer.rest(500, signal);
    expect(await settled(first)).toBe(false);
    pacer.step();
    expect(await settled(first)).toBe(true);
    expect(pacer.paused).toBe(true);
    expect(await settled(pacer.rest(500, signal), 5000)).toBe(false);
  });

  it('resuming forgets steps that were not used', async () => {
    const pacer = new Pacer();
    const { signal } = new AbortController();
    pacer.pause();
    pacer.step();
    pacer.step();
    pacer.resume();
    pacer.pause();
    expect(await settled(pacer.rest(0, signal), 1000)).toBe(false);
  });

  it('an abort ends a rest and a hold', async () => {
    const pacer = new Pacer();
    const ac = new AbortController();
    const rest = pacer.rest(500, ac.signal);
    pacer.pause();
    const held = pacer.rest(0, ac.signal);
    ac.abort();
    expect(await settled(rest)).toBe(true);
    expect(await settled(held)).toBe(true);
  });
});
