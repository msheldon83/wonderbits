/**
 * The "Every tick" strip under the board on timed levels: one row per log or
 * beetle, spelling out its own round of moves, tick by tick. A pause shows
 * as a dot, so a slow log reads as ↓ • ↓ • and a fast one as ↓ ↓ ↓. The
 * move the next tick will make is ringed; while a tick plays, the moves
 * being made light up together, so the child sees every mover answer the
 * same tick in its own way.
 */
import type { TraceEvent } from '../runtime/contract';
import type { SimState, WorldDefinition } from '../sim/types';
import { moverLabel, moversOf, moverSteps, type MoverStep } from '../sim/world';

const GLYPH: Record<MoverStep, string> = { up: '↑', down: '↓', left: '←', right: '→', stay: '•' };
const WORD: Record<MoverStep, string> = { up: 'up', down: 'down', left: 'left', right: 'right', stay: 'stays' };

export function TickRules({ world, state, event }: { world: WorldDefinition; state: SimState; event: TraceEvent | null }) {
  const movers = moversOf(world);
  if (movers.length === 0) return null;
  /** While a tick plays, the moves being made; otherwise the moves the next tick will make. */
  const playing = event?.op === 'tick';
  const tick = playing ? event.before.tick : state.tick;
  return (
    <section className={`tick-rules ${playing ? 'is-ticking' : ''}`} aria-label="What moves on every tick">
      <h2 className="tick-rules-title">
        Every tick
        <span className="tick-count" aria-live="polite">
          tick {state.tick}
        </span>
      </h2>
      <ul className="tick-rows">
        {movers.map((m) => {
          const steps = moverSteps(m);
          const at = tick % steps.length;
          return (
            <li key={m.id} className={`tick-row kind-${m.kind}`}>
              <span className="tick-name">{moverLabel(world, m)}</span>
              <span className="tick-steps" aria-label={`${moverLabel(world, m)}: ${steps.map((s) => WORD[s]).join(', ')}, then round again. ${playing ? 'Moving' : 'Next'}: ${WORD[steps[at]!]}.`}>
                {steps.map((s, i) => (
                  <span key={i} className={`tick-step ${s === 'stay' ? 'is-stay' : ''} ${i === at ? (playing ? 'is-now' : 'is-next') : ''}`} aria-hidden="true">
                    {GLYPH[s]}
                  </span>
                ))}
                <span className="tick-again" aria-hidden="true">
                  ↺
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
