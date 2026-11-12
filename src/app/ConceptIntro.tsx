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
import { cardsOfSpec, specAsksBird } from '../ir/spec';
import type { CardId, NodeId } from '../ir/types';
import { wordsOfIntroduction, type BookEntry } from '../lessons/concepts';
import type { ProgressStore } from '../progress/store';
import type { Settings } from '../progress/types';
import { Board } from '../render/Board';
import type { BoardController } from '../render/controller';
import { Pacer } from '../render/pacer';
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
import { Inventory, signsOf } from './Inventory';

/**
 * How a demo is paced. Slow is the pace to study at: the robot moves at
 * about half speed, each step is followed by a rest long enough to find its
 * card and its line of code, and the end stays on screen before the demo
 * goes round again. Normal is the pace of a level's own run.
 */
export const PACE = {
  slow: { speed: 0.55, beforeRun: 1200, betweenSteps: 700, afterRun: 2800 },
  normal: { speed: 1, beforeRun: 700, betweenSteps: 0, afterRun: 1100 },
} as const;
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
  const pace = PACE[settings.demoSpeed];
  /** Read by the demo loop at each rest, so a change of speed takes effect without starting over. */
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const motion = useMotion(pace.speed, settings.reducedMotion);
  /** The child can hold the demo and go through it a step at a time. */
  const [paused, setPaused] = useState(false);
  const pacer = useMemo(() => new Pacer(setPaused), []);
  /** How many steps of this run have played, and how many it has. */
  const [steps, setSteps] = useState({ at: 0, of: 0 });
  const newId = useMemo(() => randomIdFactory(), []);
  /** The old way first, when there is one, then the new way. */
  const stages = useMemo(() => {
    const specs = demo.before ? [demo.before, demo.program] : [demo.program];
    return specs.map((spec) => programFromSpec(spec, newId));
  }, [demo, newId]);
  /** The concept's real words, the same for the old way and the new, so they stay put while the demo loops. */
  const newWords = useMemo(() => wordsOfIntroduction(introduction), [introduction]);
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
            if (!e) {
              setShownState(null);
              setSteps((s) => ({ ...s, at: 0 }));
            }
          },
          onPlayed: (e) => {
            setShownState(e.after);
            setSteps((s) => ({ ...s, at: sequencer.current?.position ?? s.at }));
          },
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
        const results = await Promise.all(stages.map((p) => runtime.run({ program: p, world, objective, limits: DEFAULT_LIMITS, seed: round * 7919, ...(demo.input && { input: demo.input }), ...(demo.days && { days: demo.days }) })));
        if (signal.aborted) return;
        for (let i = 0; i < stages.length && !signal.aborted; i++) {
          setStage(i);
          setFolding(false);
          const trace = results[i]!.trace;
          seq.load(trace, initialState(world, stages[i]!.memory));
          setSteps({ at: 0, of: trace.length });
          await pacer.rest(paceRef.current.beforeRun, signal);
          // One step at a time, with a rest after each. Going back while the end is on screen plays on from there.
          for (;;) {
            while (seq.position < trace.length) {
              if (signal.aborted) return;
              await seq.step();
              if (signal.aborted) return;
              if (seq.position < trace.length) await pacer.rest(paceRef.current.betweenSteps, signal);
            }
            await pacer.rest(paceRef.current.afterRun, signal);
            if (signal.aborted) return;
            if (seq.position >= trace.length) break;
          }
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

  /** Back one step. A step that is still moving is taken back by itself. */
  const back = () => {
    const seq = sequencer.current;
    if (!seq) return;
    pacer.pause();
    seq.seek(seq.state === 'playing' ? seq.position : seq.position - 1);
  };
  const setSpeed = (demoSpeed: Settings['demoSpeed']) => {
    if (demoSpeed === settings.demoSpeed) return;
    store.updateSettings({ demoSpeed });
    store.record({ levelId: firstLevelId, kind: 'intro-paced', packId, action: demoSpeed });
  };
  /** The first time the child takes hold of a demo is worth knowing; every tap after it is not. */
  const held = useRef(false);
  const hold = (action: 'pause' | 'step' | 'back') => {
    if (held.current) return;
    held.current = true;
    store.record({ levelId: firstLevelId, kind: 'intro-paced', packId, action });
  };

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
            <Board world={world} theme={theme} motion={motion} label={label} onControllers={onControllers} maxScale={1.3} coordinates={cards.some((c) => c === 'goRow' || c === 'goColumn' || c === 'shift') || (program.memory ?? []).some((m) => m.kind === 'grid')} bird={specAsksBird(demo.program) || specAsksBird(demo.before ?? [])} signs={signsOf(program.memory, shownState ?? initialState(world, program.memory), activeEvent)} />
            <TickRules world={world} state={shownState ?? initialState(world, program.memory)} event={activeEvent} />
        <Inventory slots={program.memory} state={shownState ?? initialState(world, program.memory)} event={activeEvent} />
            {caption && (
              <p className="intro-caption" role="status" aria-live="polite">
                {caption}
              </p>
            )}
            <div className="intro-controls" role="group" aria-label="Demo controls">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  if (paused) pacer.resume();
                  else {
                    pacer.pause();
                    hold('pause');
                  }
                }}
                title={paused ? 'Let the demo play by itself' : 'Stop after this step'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  {paused ? (
                    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                  ) : (
                    <>
                      <rect x="6" y="5" width="4.5" height="14" rx="1.4" fill="currentColor" />
                      <rect x="13.5" y="5" width="4.5" height="14" rx="1.4" fill="currentColor" />
                    </>
                  )}
                </svg>
                {paused ? 'Play' : 'Pause'}
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={steps.at === 0}
                onClick={() => {
                  back();
                  hold('back');
                }}
                title="Go back one step"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M18 5v14l-9-7z" fill="currentColor" />
                  <rect x="4" y="5" width="3" height="14" rx="1.2" fill="currentColor" />
                </svg>
                Back
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-step"
                onClick={() => {
                  pacer.step();
                  hold('step');
                }}
                title={paused ? 'Play one step' : 'Stop, then play one step at a time'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M6 5v14l9-7z" fill="currentColor" />
                  <rect x="17" y="5" width="3" height="14" rx="1.2" fill="currentColor" />
                </svg>
                Step
              </button>
              <p className="intro-steps">
                Step {steps.at} of {steps.of}
              </p>
            </div>
            <div className="intro-speed" role="group" aria-label="Speed">
              <span className="intro-speed-label">Speed</span>
              {(['slow', 'normal'] as const).map((v) => (
                <button key={v} type="button" className="btn btn-quiet btn-speed" aria-pressed={settings.demoSpeed === v} onClick={() => setSpeed(v)}>
                  {v === 'slow' ? 'Slow' : 'Normal'}
                </button>
              ))}
            </div>
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
              codePanel={<CodePanel program={program} activeNodeId={activeNode} newWords={newWords} {...(demo.world.team && { team: demo.world.team })} />}
              aboveProgram={
                <>
                  {demo.input && <KeyScript keys={demo.input} event={activeEvent} />}
                  {(world.team !== undefined || gatesOf(world).length > 0 || moversOf(world).length > 0 || (program.memory?.length ?? 0) > 0) && (
                    <MemoryCard world={world} state={shownState ?? initialState(world, program.memory)} slots={program.memory} {...(demo.days && { days: demo.days })} {...(world.team && { team: world.team.length })} />
                  )}
                </>
              }
              gates={gatesOf(demo.world).map((g) => g.id)}
          gateCodes={Object.fromEntries(gatesOf(demo.world).flatMap((g) => (g.code !== undefined ? [[g.id, g.code]] : [])))}
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
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              pacer.resume();
              setRound((r) => r + 1);
            }}
          >
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
