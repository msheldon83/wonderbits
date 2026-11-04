/**
 * Plays a precomputed trace one event at a time. DOM-free: the Player does
 * the drawing, so the timing logic is tested on its own.
 */
import type { TraceEvent } from '../runtime/contract';
import type { SimState } from '../sim/types';

export interface Player {
  /** Animate one event. Resolve when it settles or when the signal aborts. */
  playEvent(event: TraceEvent, signal: AbortSignal): Promise<void>;
  /** Snap to a state with no animation. */
  showState(state: SimState): void;
}

export type SequencerStatus = 'idle' | 'playing' | 'paused' | 'finished';

export interface SequencerListener {
  onEvent?(event: TraceEvent | null): void;
  onStatus?(status: SequencerStatus): void;
}

export class Sequencer {
  private trace: TraceEvent[] = [];
  private initial: SimState | null = null;
  private cursor = 0;
  private status: SequencerStatus = 'idle';
  private session: AbortController | null = null;
  private pauseRequested = false;

  constructor(
    private player: Player,
    private listener: SequencerListener = {},
  ) {}

  get state(): SequencerStatus {
    return this.status;
  }
  get position(): number {
    return this.cursor;
  }

  load(trace: TraceEvent[], initial: SimState): void {
    this.abort();
    this.trace = trace;
    this.initial = initial;
    this.cursor = 0;
    this.player.showState(initial);
    this.listener.onEvent?.(null);
    this.setStatus('idle');
  }

  /** Play from the cursor to the end. Resolves when playback stops for any reason. */
  async play(): Promise<void> {
    if (this.status === 'playing' || this.status === 'finished') return;
    this.pauseRequested = false;
    await this.run(Infinity);
  }

  /** Play exactly one event. */
  async step(): Promise<void> {
    if (this.status === 'playing' || this.status === 'finished') return;
    await this.run(1);
  }

  /** Stop after the current event settles. */
  pause(): void {
    if (this.status === 'playing') this.pauseRequested = true;
  }

  /** Abort immediately and return to the initial state. */
  reset(): void {
    this.abort();
    this.cursor = 0;
    if (this.initial) this.player.showState(this.initial);
    this.listener.onEvent?.(null);
    this.setStatus('idle');
  }

  private async run(count: number): Promise<void> {
    const session = new AbortController();
    this.session = session;
    this.setStatus('playing');
    let played = 0;
    while (this.cursor < this.trace.length && played < count) {
      const event = this.trace[this.cursor]!;
      this.listener.onEvent?.(event);
      await this.player.playEvent(event, session.signal);
      if (session.signal.aborted) return;
      this.cursor++;
      played++;
      if (this.pauseRequested) break;
    }
    this.session = null;
    this.pauseRequested = false;
    this.setStatus(this.cursor >= this.trace.length ? 'finished' : 'paused');
  }

  private abort(): void {
    this.session?.abort();
    this.session = null;
    this.pauseRequested = false;
  }

  private setStatus(s: SequencerStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.listener.onStatus?.(s);
  }
}
