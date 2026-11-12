/**
 * Paces a demo that plays by itself: a rest between steps while it plays,
 * and a hold for as long as it is paused. DOM-free, so the timing is tested
 * on its own.
 */
export class Pacer {
  private held = false;
  private credits = 0;
  private wake: (() => void) | null = null;

  constructor(private onChange: (paused: boolean) => void = () => undefined) {}

  get paused(): boolean {
    return this.held;
  }

  /** Hold at the next rest. */
  pause(): void {
    this.set(true);
  }

  /** Let the demo run on by itself. */
  resume(): void {
    this.credits = 0;
    this.set(false);
    this.wake?.();
  }

  /**
   * One step by hand. While the demo is playing this only stops it, so
   * nothing moves that the child did not ask for; while it is held, it lets
   * exactly one rest through.
   */
  step(): void {
    if (!this.held) return this.set(true);
    this.credits++;
    this.wake?.();
  }

  /**
   * Rest for `ms` while playing, then hold for as long as the demo is
   * paused. Resolves when the demo may go on, or when the signal aborts.
   */
  async rest(ms: number, signal: AbortSignal): Promise<void> {
    if (!this.held && ms > 0) await this.sleep(ms, signal);
    while (this.held && !signal.aborted) {
      if (this.credits > 0) {
        this.credits--;
        return;
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          signal.removeEventListener('abort', done);
          this.wake = null;
          resolve();
        };
        this.wake = done;
        signal.addEventListener('abort', done, { once: true });
      });
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const done = () => {
        signal.removeEventListener('abort', done);
        clearTimeout(t);
        resolve();
      };
      const t = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
    });
  }

  private set(paused: boolean): void {
    if (paused === this.held) return;
    this.held = paused;
    this.onChange(paused);
  }
}
