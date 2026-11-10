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
import type { SimState } from '../sim/types';
import { gatesOf, initialState, moversOf } from '../sim/world';
import { useMotion } from './hooks';
import { hashFor } from './levels';
import { KeyScript } from './KeyScript';
import { MemoryCard } from './MemoryCard';
import { TickRules } from './TickRules';

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
  /** What the memory card shows: the state after the last event, or the start. */
  const [shownState, setShownState] = useState<SimState | null>(null);
  const [round, setRound] = useState(0);
  const sequencer = useRef<Sequencer | null>(null);
  /** Bumped each time the board builds new controllers, so the demo loop picks them up. */
  const [boardVersion, setBoardVersion] = useState(0);
  const ready = boardVersion > 0 && sequencer.current !== null;
  /** A shuffled demo plays the same program on each version of the board in turn. */
  const worlds = useMemo(() => [demo.world, ...(demo.shuffles ?? [])], [demo]);
  const [shuffle, setShuffle] = useState(0);
  const world = worlds[shuffle] ?? demo.world;
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
            if (!e) setShownState(null);
          },
          onPlayed: (e) => setShownState(e.after),
        })
      : null;
    if (c) setBoardVersion((v) => v + 1);
  }, []);

  // The demo loop: each stage runs, rests, and on to the next; then round again.
  useEffect(() => {
    const seq = sequencer.current;
    if (!ready || !seq || !runtime) return;
    const ac = new AbortController();
    const { signal } = ac;
    const objective = { reachGoal: true, collectAll: world.collectibles.length > 0 };
    void (async () => {
      // A random demo rolls afresh each time round, so the loop shows different outcomes.
      for (let round = 1; !signal.aborted; round++) {
        const results = await Promise.all(stages.map((p) => runtime.run({ program: p, world, objective, limits: DEFAULT_LIMITS, seed: round * 7919, ...(demo.input && { input: demo.input }) })));
        if (signal.aborted) return;
        for (let i = 0; i < stages.length && !signal.aborted; i++) {
          setStage(i);
          setFolding(false);
          seq.load(results[i]!.trace, initialState(world, stages[i]!.memory));
          await wait(BEFORE_RUN_MS, signal);
          if (signal.aborted) return;
          await seq.play();
          await wait(AFTER_RUN_MS, signal);
          if (stages.length > 1 && i < stages.length - 1) {
            setFolding(true);
            await wait(FOLD_MS, signal);
          }
        }
        // A shuffled demo moves on to the next version of the board; the new board starts the loop again.
        if (worlds.length > 1 && !signal.aborted) {
          setShuffle((s) => (s + 1) % worlds.length);
          return;
        }
      }
    })();
    return () => {
      ac.abort();
      // The board may be unmounting with us, so stop without redrawing it.
      seq.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardVersion, runtime, stages, world, round]);

  const caption =
    stages.length > 1 ? (stage === 0 && !folding ? 'The old way' : `With ${introduction.title}`) : worlds.length > 1 ? `Shuffle ${shuffle + 1} of ${worlds.length}, same program` : null;
  const label = `A ${world.width} by ${world.height} island where the robot shows ${introduction.title}.`;

  return (
    <main className="intro" aria-labelledby="intro-title">
      <section className="intro-card">
        <p className="intro-kicker">{replay ? 'From the card book' : 'A new card'}</p>
        <h2 id="intro-title" className="intro-title">
          {introduction.title}
        </h2>
        <div className={`intro-demo ${folding ? 'is-folding' : ''}`}>
          <div className="intro-board">
            <Board world={world} theme={theme} motion={motion} label={label} onControllers={onControllers} maxScale={1.3} coordinates={cards.some((c) => c === 'goRow' || c === 'goColumn' || c === 'shift') || (program.memory ?? []).some((m) => m.kind === 'grid')} />
            <TickRules world={world} state={shownState ?? initialState(world, program.memory)} event={activeEvent} />
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
              aboveProgram={
                <>
                  {demo.input && <KeyScript keys={demo.input} event={activeEvent} />}
                  {(gatesOf(world).length > 0 || moversOf(world).length > 0 || (program.memory?.length ?? 0) > 0) && (
                    <MemoryCard world={world} state={shownState ?? initialState(world, program.memory)} slots={program.memory} />
                  )}
                </>
              }
              gates={gatesOf(demo.world).map((g) => g.id)}
          boardSize={{ width: demo.world.width, height: demo.world.height }}
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
