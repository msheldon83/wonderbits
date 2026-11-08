/**
 * A pack's introduction: show before tell. The robot plays the demo program
 * on a tiny board, over and over, while its cards light up and the same
 * program is printed as code beside them. One sentence in kid terms sits
 * underneath. Shown before a pack's first level, and again from the card
 * book whenever the child wants.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodePanel } from '../editor/CodePanel';
import { Editor } from '../editor/Editor';
import { randomIdFactory } from '../ir/ids';
import { programFromSpec } from '../ir/program';
import { cardsOfSpec } from '../ir/spec';
import type { CardId, NodeId } from '../ir/types';
import type { BookEntry } from '../lessons/concepts';
import type { ProgressStore } from '../progress/store';
import type { Settings } from '../progress/types';
import { Board } from '../render/Board';
import type { BoardController } from '../render/controller';
import { Sequencer } from '../render/sequencer';
import { themeFor } from '../render/themes';
import { DEFAULT_LIMITS, type Runtime, type TraceEvent } from '../runtime/contract';
import { initialState } from '../sim/world';
import { useMotion } from './hooks';
import { hashFor } from './levels';

/** Pauses between runs, so the eye can rest on the end and the start. */
const BEFORE_RUN_MS = 700;
const AFTER_RUN_MS = 1100;
const FOLD_MS = 650;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', done);
      clearTimeout(t);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

export interface ConceptIntroProps {
  entry: BookEntry;
  runtime: Runtime | null;
  store: ProgressStore;
  settings: Settings;
  /** Opened from the card book, not before the pack's first level. */
  replay: boolean;
  /** "Let's go" before a level; "Back to the card book" on a replay. */
  onDone(): void;
}

export function ConceptIntro({ entry, runtime, store, settings, replay, onDone }: ConceptIntroProps) {
  const { introduction, packId, packTitle, firstLevelId } = entry;
  const { demo } = introduction;
  const theme = themeFor('forest');
  const motion = useMotion(1, settings.reducedMotion);
  const newId = useMemo(() => randomIdFactory(), []);
  /** The old way first, when there is one, then the new way. */
  const stages = useMemo(() => {
    const specs = demo.before ? [demo.before, demo.program] : [demo.program];
    return specs.map((spec) => programFromSpec(spec, newId));
  }, [demo, newId]);
  const [stage, setStage] = useState(0);
  const [folding, setFolding] = useState(false);
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);
  const [activeEvent, setActiveEvent] = useState<TraceEvent | null>(null);
  const [round, setRound] = useState(0);
  const sequencer = useRef<Sequencer | null>(null);
  const [ready, setReady] = useState(false);
  const program = stages[stage] ?? stages[0]!;
  const cards = useMemo(() => [...new Set([...cardsOfSpec(demo.program), ...cardsOfSpec(demo.before ?? [])])] as CardId[], [demo]);
  const programming = useMemo(() => ({ allowedCommands: cards, starterProgram: [] }), [cards]);

  useEffect(() => {
    store.record({ levelId: firstLevelId, kind: 'intro-shown', packId, replay });
  }, [store, firstLevelId, packId, replay]);

  const onControllers = useCallback((cs: BoardController[] | null) => {
    const c = cs?.[0] ?? null;
    sequencer.current = c
      ? new Sequencer(c, {
          onEvent: (e) => {
            setActiveNode(e?.nodeId ?? null);
            setActiveEvent(e);
          },
        })
      : null;
    setReady(c !== null);
  }, []);

  // The demo loop: each stage runs, rests, and on to the next; then round again.
  useEffect(() => {
    const seq = sequencer.current;
    if (!ready || !seq || !runtime) return;
    const ac = new AbortController();
    const { signal } = ac;
    const objective = { reachGoal: true, collectAll: demo.world.collectibles.length > 0 };
    void (async () => {
      const results = await Promise.all(stages.map((p) => runtime.run({ program: p, world: demo.world, objective, limits: DEFAULT_LIMITS })));
      while (!signal.aborted) {
        for (let i = 0; i < stages.length && !signal.aborted; i++) {
          setStage(i);
          setFolding(false);
          seq.load(results[i]!.trace, initialState(demo.world));
          await wait(BEFORE_RUN_MS, signal);
          if (signal.aborted) return;
          await seq.play();
          await wait(AFTER_RUN_MS, signal);
          if (stages.length > 1 && i < stages.length - 1) {
            setFolding(true);
            await wait(FOLD_MS, signal);
          }
        }
      }
    })();
    return () => {
      ac.abort();
      // The board may be unmounting with us, so stop without redrawing it.
      seq.stop();
    };
  }, [ready, runtime, stages, demo.world, round]);

  const caption = stages.length > 1 ? (stage === 0 && !folding ? 'The old way' : `With ${introduction.title}`) : null;
  const label = `A ${demo.world.width} by ${demo.world.height} island where the robot shows ${introduction.title}.`;

  return (
    <main className="intro" aria-labelledby="intro-title">
      <section className="intro-card">
        <p className="intro-kicker">{replay ? 'From the card book' : 'A new card'}</p>
        <h2 id="intro-title" className="intro-title">
          {introduction.title}
        </h2>
        <div className={`intro-demo ${folding ? 'is-folding' : ''}`}>
          <div className="intro-board">
            <Board world={demo.world} theme={theme} motion={motion} label={label} onControllers={onControllers} maxScale={1.3} />
            {caption && (
              <p className="intro-caption" role="status" aria-live="polite">
                {caption}
              </p>
            )}
          </div>
          <div className="intro-program">
            <Editor
              key={stage}
              program={program}
              programming={programming}
              locked
              readOnly
              activeNodeId={activeNode}
              activeEvent={activeEvent}
              errorNodeId={null}
              newId={newId}
              onEdit={() => undefined}
              codePanel={<CodePanel program={program} activeNodeId={activeNode} />}
              showCode
            />
          </div>
        </div>
        <p className="intro-explanation">{introduction.explanation}</p>
        <div className="intro-actions">
          <button type="button" className="btn btn-run" onClick={onDone}>
            {replay ? 'Back to the card book' : "Let's go"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setRound((r) => r + 1)}>
            Watch again
          </button>
          {replay && store.isUnlocked(firstLevelId) && (
            <a className="btn btn-quiet" href={hashFor({ screen: 'level', id: firstLevelId })}>
              Play {packTitle}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
