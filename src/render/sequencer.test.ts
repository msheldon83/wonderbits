import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '../runtime/contract';
import type { SimState } from '../sim/types';
import { Sequencer, type Player, type SequencerStatus } from './sequencer';

const state = (x: number): SimState => ({ robot: { x, y: 0, facing: 'E' }, collected: [], open: [], tick: 0 });
const trace: TraceEvent[] = [0, 1, 2].map((i) => ({
  index: i,
  nodeId: `n${i + 1}`,
  op: 'forward',
  before: state(i),
  after: state(i + 1),
  result: { kind: 'ok' },
}));

/** A player whose animations finish only when the test says so. */
function manualPlayer() {
  const shown: number[] = [];
  const played: string[] = [];
  let release: (() => void) | null = null;
  const player: Player = {
    playEvent(event, signal) {
      played.push(event.nodeId);
      return new Promise<void>((resolve) => {
        release = resolve;
        signal.addEventListener('abort', () => resolve());
      });
    },
    showState: (s) => shown.push(s.robot.x),
  };
  const finishCurrent = async () => {
    const r = release;
    release = null;
    r?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { player, shown, played, finishCurrent };
}

describe('Sequencer', () => {
  it('stop aborts playback without redrawing the board', async () => {
    const m = manualPlayer();
    const seq = new Sequencer(m.player);
    seq.load(trace, state(0));
    const shownBefore = m.shown.length;
    const playing = seq.play();
    seq.stop();
    await playing;
    expect(seq.state).toBe('idle');
    expect(seq.position).toBe(0);
    expect(m.shown.length).toBe(shownBefore);
  });

  it('plays every event in order and finishes', async () => {
    const m = manualPlayer();
    const statuses: SequencerStatus[] = [];
    const events: (string | null)[] = [];
    const played: string[] = [];
    const seq = new Sequencer(m.player, { onStatus: (s) => statuses.push(s), onEvent: (e) => events.push(e?.nodeId ?? null), onPlayed: (e) => played.push(e.nodeId) });
    seq.load(trace, state(0));
    const done = seq.play();
    await m.finishCurrent();
    expect(played).toEqual(['n1']);
    for (let i = 0; i < 2; i++) await m.finishCurrent();
    await done;
    expect(played).toEqual(['n1', 'n2', 'n3']);
    expect(m.played).toEqual(['n1', 'n2', 'n3']);
    expect(seq.state).toBe('finished');
    expect(statuses).toEqual(['playing', 'finished']);
    expect(events).toEqual([null, 'n1', 'n2', 'n3']);
  });

  it('never starts event n+1 before event n settles', async () => {
    const m = manualPlayer();
    const seq = new Sequencer(m.player);
    seq.load(trace, state(0));
    void seq.play();
    await new Promise((r) => setTimeout(r, 5));
    expect(m.played).toEqual(['n1']);
    await m.finishCurrent();
    expect(m.played).toEqual(['n1', 'n2']);
  });

  it('steps one event at a time', async () => {
    const m = manualPlayer();
    const seq = new Sequencer(m.player);
    seq.load(trace, state(0));
    const s1 = seq.step();
    await m.finishCurrent();
    await s1;
    expect(seq.state).toBe('paused');
    expect(seq.position).toBe(1);
    const s2 = seq.step();
    await m.finishCurrent();
    await s2;
    expect(m.played).toEqual(['n1', 'n2']);
  });

  it('pauses after the current event and resumes', async () => {
    const m = manualPlayer();
    const seq = new Sequencer(m.player);
    seq.load(trace, state(0));
    const p = seq.play();
    seq.pause();
    await m.finishCurrent();
    await p;
    expect(seq.state).toBe('paused');
    expect(seq.position).toBe(1);
    const p2 = seq.play();
    await m.finishCurrent();
    await m.finishCurrent();
    await p2;
    expect(seq.state).toBe('finished');
  });

  it('reset aborts mid-animation and snaps to the initial state', async () => {
    const m = manualPlayer();
    const seq = new Sequencer(m.player);
    seq.load(trace, state(0));
    const p = seq.play();
    await m.finishCurrent();
    seq.reset();
    await p;
    expect(seq.state).toBe('idle');
    expect(seq.position).toBe(0);
    expect(m.shown.at(-1)).toBe(0);
    expect(m.played).toEqual(['n1', 'n2']);
  });

  it('seek goes back to an earlier step without animating, and plays on from there', async () => {
    const m = manualPlayer();
    const events: (string | null)[] = [];
    const seq = new Sequencer(m.player, { onEvent: (e) => events.push(e?.nodeId ?? null) });
    seq.load(trace, state(0));
    const playing = seq.play();
    await m.finishCurrent();
    await m.finishCurrent();
    await m.finishCurrent();
    await playing;
    expect(seq.state).toBe('finished');

    seq.seek(1);
    expect(seq.state).toBe('paused');
    expect(seq.position).toBe(1);
    expect(m.shown.at(-1)).toBe(1);
    expect(events.at(-1)).toBe('n1');

    const stepping = seq.step();
    await m.finishCurrent();
    await stepping;
    expect(seq.position).toBe(2);
    expect(m.played.at(-1)).toBe('n2');

    seq.seek(0);
    expect(seq.state).toBe('idle');
    expect(m.shown.at(-1)).toBe(0);
    expect(events.at(-1)).toBeNull();
    seq.seek(99);
    expect(seq.state).toBe('finished');
    expect(seq.position).toBe(3);
  });
});
