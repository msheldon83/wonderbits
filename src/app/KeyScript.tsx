/**
 * The key script on an input level: the presses the player will make, in
 * order, after the program. The one playing now lights up and the ones
 * already played fade, so the child can follow which When card is running.
 */
import { useRef } from 'react';
import type { Key } from '../ir/types';
import type { TraceEvent } from '../runtime/contract';

const ARROW: Record<Key, string> = { up: '↑', down: '↓', left: '←', right: '→' };
const WORD: Record<Key, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' };

export function KeyScript({ keys, event, played = false }: { keys: readonly Key[]; event: TraceEvent | null; played?: boolean }) {
  /** The press playing now: set by its press event, kept while its When card's cards play, cleared on a fresh start. */
  const lastPress = useRef<number | null>(null);
  if (event?.op === 'press') lastPress.current = event.press;
  else if (!event) lastPress.current = null;
  const last = lastPress.current;
  return (
    <section className="key-script" aria-label={`Key presses, in order: ${keys.map((k) => WORD[k]).join(', ')}`}>
      <h2 className="key-script-title">Keys</h2>
      {keys.map((k, i) => (
        <span key={i} className={`key-cap ${last === i ? 'is-active' : ''} ${played || (last !== null && i < last) ? 'is-done' : ''}`} aria-hidden="true">
          {ARROW[k]}
        </span>
      ))}
    </section>
  );
}
