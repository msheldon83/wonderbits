/**
 * One level: the board, the run controls, prediction, hints, the editor,
 * the code panel and the completion dialog. Keyed by level id in App, so
 * switching levels starts fresh. Everything the child does is recorded in
 * the observation log through the progress store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodePanel } from '../editor/CodePanel';
import { Editor } from '../editor/Editor';
import { paletteFor } from '../editor/palette';
import { canRedo, canUndo, createHistory, push, redo, undo, type History } from '../ir/history';
import { randomIdFactory } from '../ir/ids';
import { applyOp, type EditOp } from '../ir/ops';
import { countNodes, programFromSpec, stepNumber } from '../ir/program';
import { isPosition, type NodeId, type ProgramIR, type Value } from '../ir/types';
import { valueWords } from '../editor/commands';
import { coveredValue, withinOutcomes } from '../sim/world';
import type { ObjectiveDefinition } from '../sim/types';
import { hintEffect, type HintEffect } from '../lessons/hints';
import { gateLabel, gateOfField } from '../lessons/memory';
import { checkPrediction, predictionComplete } from '../lessons/prediction';
import type { MemoryField, MemoryValue, Prediction, PuzzleDefinition } from '../lessons/types';
import type { ProgressStore } from '../progress/store';
import type { BadgeId, Settings, Stars } from '../progress/types';
import { Board } from '../render/Board';
import type { BoardController } from '../render/controller';
import { Sequencer } from '../render/sequencer';
import { themeFor } from '../render/themes';
import { DEFAULT_LIMITS, type RunOutcome, type RunResult, type Runtime, type TraceEvent } from '../runtime/contract';
import type { Cell, Facing, SimState, WorldDefinition } from '../sim/types';
import { gatesOf, initialState, memoryShortfall, moversOf } from '../sim/world';
import { worldsOf } from '../lessons/shuffles';
import { checksOf, isRandomLevel, missingOutcomes } from '../lessons/checks';
import { useMotion } from './hooks';
import { BADGE_INFO, BadgeIcon, Star } from './icons';
import { hashFor } from './levels';
import { KeyScript } from './KeyScript';
import { MemoryCard } from './MemoryCard';
import { TickRules } from './TickRules';
import { outcomeMessage, type Shortfall, type Tone } from './messages';

/**
 * editing: the child is building the program (or predicting).
 * running: the trace is playing; editing is locked.
 * paused: playback stopped between steps; Run continues, Step plays one.
 * done: the trace finished; the outcome is shown.
 */
type Phase = 'editing' | 'running' | 'paused' | 'done';
const FACING_WORDS: Record<Facing, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

function describeBoard(world: WorldDefinition): string {
  const extras = world.collectibles.length ? ` ${world.collectibles.length} acorn${world.collectibles.length > 1 ? 's' : ''} to collect.` : '';
  return (
    `Island ${world.width} tiles wide and ${world.height} tiles deep. ` +
    `Robot at column ${world.robot.x}, row ${world.robot.y}, looking ${FACING_WORDS[world.robot.facing]}. ` +
    `Flag at column ${world.goal.x}, row ${world.goal.y}.${extras}`
  );
}

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export interface LessonProps {
  level: PuzzleDefinition;
  runtime: Runtime | null;
  store: ProgressStore;
  settings: Settings;
  nextLevelId: string | null;
  onGoTo(hash: string): void;
}

interface Completion {
  stars: Stars;
  newBadges: BadgeId[];
}

/** A fresh seed for the robot's random generator. */
const newSeed = () => 1 + Math.floor(Math.random() * 1_000_000);

/** Why a random level's run missed: the value it ended on, and the outcomes asked for. */
function outsideWords(covers: NonNullable<ObjectiveDefinition['covers']>, end: SimState): string {
  const got = coveredValue(covers.of, end);
  const want = covers.values.map(valueWords).join(', ');
  if (covers.of === 'column') return `The robot ended in column ${String(got)}. It should end in one of columns ${want}.`;
  return `${covers.of} ended as ${got === undefined ? 'nothing' : valueWords(got)}. It should be one of ${want}.`;
}

export function Lesson({ level, runtime, store, settings, nextLevelId, onGoTo }: LessonProps) {
  const theme = themeFor(level.themeId);
  const newId = useMemo(() => randomIdFactory(), []);
  const [history, setHistory] = useState<History>(() => createHistory(programFromSpec(level.programming.starterProgram, newId)));
  const program = history.present;
  const [phase, setPhase] = useState<Phase>('editing');
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [shortfall, setShortfall] = useState<Shortfall | undefined>(undefined);
  /** Shuffled levels: which version of the board is out now, and a version the program failed on, to show next. */
  const worlds = useMemo(() => worldsOf(level), [level]);
  const [shuffle, setShuffle] = useState(() => Math.floor(Math.random() * worlds.length));
  const world = worlds[shuffle] ?? level.world;
  const [failedShuffle, setFailedShuffle] = useState<number | null>(null);
  /** Random levels: the seed of this run's rolls, a seed the program failed on, and outcomes no roll gave. */
  const random = useMemo(() => isRandomLevel(level), [level]);
  const seedRef = useRef(newSeed());
  const [failedRoll, setFailedRoll] = useState<number | null>(null);
  const [unseen, setUnseen] = useState<Value[] | null>(null);
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);
  /** The event playing now, so blocks can show their count or answer. */
  const [activeEvent, setActiveEvent] = useState<TraceEvent | null>(null);
  const [position, setPosition] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  /** True once the flag was placed on the right tile; the run then plays. */
  const [guessedRight, setGuessedRight] = useState(false);
  /** Tiles guessed wrong so far, marked on the board until a fresh start. */
  const [wrongGuesses, setWrongGuesses] = useState<Cell[]>([]);
  /** Memory card fields guessed wrong last time, marked until answered again. */
  const [wrongFields, setWrongFields] = useState<MemoryField[]>([]);
  /** The state the memory card shows: after the last event played, or the start. */
  const [shownState, setShownState] = useState<SimState | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hint, setHint] = useState<HintEffect | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const motion = useMotion(1, settings.reducedMotion);

  const controller = useRef<BoardController | null>(null);
  const sequencer = useRef<Sequencer | null>(null);
  const runToken = useRef(0);
  const celebration = useRef<AbortController | null>(null);
  /** The trace for the current program, computed once per edit. */
  const cache = useRef<{ program: ProgramIR; world: WorldDefinition; seed: number; result: RunResult } | null>(null);
  const phaseRef = useRef<Phase>('editing');
  phaseRef.current = phase;
  const completedRef = useRef(false);

  const activity = level.curriculum.activity;
  const readOnly = activity === 'run' || activity === 'predict' || activity === 'model';
  const asking = level.prediction;
  /** Prediction mode: the run only plays once the flag and the memory card answers are right. */
  const predicting = asking !== undefined && !guessedRight;
  const predictionOk = !predicting || predictionComplete(prediction, asking!);
  const asksTile = asking?.askTile ?? false;
  const askedFields = asking?.askMemory ?? [];
  /** The memory card shows from the switch pack on: wherever there are gates, or the level asks about memory. */
  /** Number the board's rows and columns when the robot's memory holds a grid. */
  const coordinates =
    [...(program.memory ?? []), ...(level.programming.memoryOptions ?? [])].some((m) => m.kind === 'grid') ||
    level.programming.allowedCommands.some((c) => c === 'goRow' || c === 'goColumn' || c === 'shift');
  const showMemory = gatesOf(world).length > 0 || moversOf(world).length > 0 || askedFields.length > 0 || (program.memory?.length ?? 0) > 0 || level.programming.memoryOptions !== undefined;

  // The log: opened on mount, abandoned on unmount unless completed.
  useEffect(() => {
    store.record({ levelId: level.id, kind: 'level-opened' });
    return () => {
      if (!completedRef.current) store.record({ levelId: level.id, kind: 'level-abandoned' });
    };
  }, [store, level.id]);

  /** Waiting for the board to repaint for the next shuffle: called with its new sequencer. */
  const boardWaiter = useRef<((seq: Sequencer) => void) | null>(null);
  /** Shuffles a run still has to play through, in order, after the one on screen. */
  const shufflesLeft = useRef<number[]>([]);

  const onControllers = useCallback((cs: BoardController[] | null) => {
    controller.current = cs?.[0] ?? null;
    sequencer.current = controller.current
      ? new Sequencer(controller.current, {
          onEvent: (e) => {
            setActiveNode(e?.nodeId ?? null);
            setActiveEvent(e);
            if (!e) setShownState(null);
          },
          onPlayed: (e) => setShownState(e.after),
        })
      : null;
    if (sequencer.current && boardWaiter.current) {
      const resolve = boardWaiter.current;
      boardWaiter.current = null;
      resolve(sequencer.current);
    }
  }, []);

  const reset = useCallback(() => {
    runToken.current++;
    shufflesLeft.current = [];
    boardWaiter.current = null;
    celebration.current?.abort();
    sequencer.current?.reset();
    setPhase('editing');
    setOutcome(null);
    setActiveNode(null);
    setActiveEvent(null);
    setPosition(0);
    setCompletion(null);
    // A fresh go means a fresh guess: the placed flag, its result and the wrong marks go too.
    setPrediction(null);
    setGuessedRight(false);
    setWrongGuesses([]);
    setWrongFields([]);
    setShownState(null);
    setFailedShuffle(null);
    setUnseen(null);
  }, []);

  /** Another version of the board: the one the program failed on, if any, otherwise a different one at random. */
  const reshuffle = useCallback(() => {
    if (worlds.length < 2) return;
    reset();
    const next = failedShuffle ?? (shuffle + 1 + Math.floor(Math.random() * (worlds.length - 1))) % worlds.length;
    setShuffle(next);
    setFailedShuffle(null);
    cache.current = null;
    store.record({ levelId: level.id, kind: 'shuffled', shuffle: next });
  }, [worlds.length, reset, failedShuffle, shuffle, store, level.id]);

  /** Start the level afresh: starter program, no hints used, no guess, robot at the start. */
  const restart = useCallback(() => {
    reset();
    cache.current = null;
    setHistory(createHistory(programFromSpec(level.programming.starterProgram, newId)));
    setHintsUsed(0);
    setHint(null);
    store.record({ levelId: level.id, kind: 'level-restarted' });
  }, [reset, level, newId, store]);

  const ensureResult = useCallback(async (): Promise<RunResult | null> => {
    const seed = seedRef.current;
    if (cache.current?.program === program && cache.current.world === world && cache.current.seed === seed) return cache.current.result;
    if (!runtime) return null;
    const result = await runtime.run({ program, world, objective: level.objective, limits: DEFAULT_LIMITS, ...(level.inputScript && { input: level.inputScript }), ...(level.days && { days: level.days }), ...(random && { seed }) });
    cache.current = { program, world, seed, result };
    return result;
  }, [runtime, program, level, world, random]);

  /** Run plays to the end; Step plays one event. Both continue from a pause. */
  const start = useCallback(
    async (mode: 'play' | 'step') => {
      const seq = sequencer.current;
      if (!seq || !runtime || phase === 'running' || !predictionOk) return;
      const token = ++runToken.current;
      celebration.current?.abort();
      const resuming = phase === 'paused';
      setPhase('running');
      setOutcome(null);
      setHint(null);
      setCompletion(null);
      if (!resuming) store.record({ levelId: level.id, kind: 'run-started', steps: countNodes(program) });
      // A shuffled level plays every version of the board in turn, starting with the one on screen.
      if (!resuming) shufflesLeft.current = random ? [] : worlds.map((_, i) => (shuffle + i) % worlds.length).slice(1);
      // A random level rolls afresh on every new run, unless it is replaying a roll it failed on.
      if (!resuming && random && !predicting) {
        seedRef.current = failedRoll ?? newSeed();
        setFailedRoll(null);
      }
      const result = await ensureResult();
      if (!result || token !== runToken.current) return;
      // A wrong flag does not get a run: mark the tile and ask again.
      if (predicting && prediction && asking) {
        const end = result.final ?? result.trace.at(-1)?.after ?? initialState(world);
        const check = checkPrediction(prediction, asking, end);
        store.record({
          levelId: level.id,
          kind: 'prediction-made',
          ...(prediction.cell && { cell: prediction.cell }),
          ...(prediction.memory && { memory: prediction.memory }),
          ...(check.wrongFields.length > 0 && { wrongFields: check.wrongFields }),
          correct: check.correct,
        });
        if (!check.correct) {
          // Keep what was right; clear what was wrong and mark it.
          const wrongCell = check.tileRight === false ? prediction.cell : undefined;
          if (wrongCell) setWrongGuesses((w) => [...w, wrongCell]);
          setWrongFields(check.wrongFields);
          const memory = { ...prediction.memory };
          for (const f of check.wrongFields) delete memory[f];
          setPrediction({ ...(check.tileRight !== false && prediction.cell && { cell: prediction.cell }), memory });
          setPhase('editing');
          return;
        }
        setGuessedRight(true);
      }
      if (!resuming) seq.load(result.trace, initialState(world));
      if (mode === 'play') await seq.play();
      else await seq.step();
      if (token !== runToken.current) return;
      setPosition(seq.position);
      if (seq.state === 'paused') {
        setPhase('paused');
        return;
      }
      if (seq.state !== 'finished') return;
      /** The end of one version's run: its outcome, and what fell short, on the board it ran on. */
      const finish = (r: RunResult, w: WorldDefinition) => {
        setOutcome(r.outcome);
        setPhase('done');
        const end = r.final ?? r.trace.at(-1)?.after ?? initialState(w);
        setShortfall({
          onGoal: end.robot.x === w.goal.x && end.robot.y === w.goal.y,
          missing: w.collectibles.length - end.collected.length,
          memory: memoryShortfall(level.objective, end),
          ...(level.objective.covers && !withinOutcomes(level.objective, end) && { outside: outsideWords(level.objective.covers, end) }),
        });
        if (r.outcome.status === 'blocked') {
          store.record({ levelId: level.id, kind: 'trace-halted', nodeId: r.outcome.nodeId, reason: r.outcome.reason });
        }
      };
      // The board on screen played; on to the other shuffles, repainting the board for each, until one fails.
      let last = result;
      let lastWorld = world;
      while (last.outcome.status === 'success' && shufflesLeft.current.length > 0) {
        const next = shufflesLeft.current.shift()!;
        const w = worlds[next]!;
        const r = await runtime.run({ program, world: w, objective: level.objective, limits: DEFAULT_LIMITS, ...(level.inputScript && { input: level.inputScript }) });
        await new Promise((done) => setTimeout(done, settings.reducedMotion ? 150 : 700));
        if (token !== runToken.current) return;
        const repainted = new Promise<Sequencer>((resolve) => (boardWaiter.current = resolve));
        setShuffle(next);
        setActiveNode(null);
        setActiveEvent(null);
        setShownState(null);
        const nextSeq = await repainted;
        if (token !== runToken.current) return;
        cache.current = { program, world: w, seed: seedRef.current, result: r };
        nextSeq.load(r.trace, initialState(w));
        await nextSeq.play();
        if (token !== runToken.current) return;
        setPosition(nextSeq.position);
        if (nextSeq.state === 'paused') {
          setPhase('paused');
          return;
        }
        last = r;
        lastWorld = w;
      }
      finish(last, lastWorld);
      if (worlds.length > 1 && !random) {
        store.record({ levelId: level.id, kind: 'shuffles-checked', passed: worlds.length - shufflesLeft.current.length - (last.outcome.status === 'success' ? 0 : 1), total: worlds.length });
      }
      const result_ = last;
      if (result_.outcome.status === 'success' && random) {
        // One roll is not enough: the program must work on every roll, and the rolls must give every outcome.
        const checks = checksOf(level);
        const runs = await Promise.all(
          checks.map((c) =>
            runtime.run({ program, world: worlds[c.world]!, objective: level.objective, limits: DEFAULT_LIMITS, ...(level.inputScript && { input: level.inputScript }), ...(level.days && { days: level.days }), ...(c.seed !== undefined && { seed: c.seed }) }),
          ),
        );
        if (token !== runToken.current) return;
        const failed = runs.findIndex((r) => r.outcome.status !== 'success');
        const finals = runs.flatMap((r) => (r.final ? [r.final] : []));
        const missing = missingOutcomes(level.objective, finals);
        store.record({ levelId: level.id, kind: 'rolls-checked', passed: runs.filter((r) => r.outcome.status === 'success').length, total: runs.length, unseen: missing.length });
        if (failed >= 0) {
          const check = checks[failed]!;
          if (check.world !== shuffle) setFailedShuffle(check.world);
          else setFailedRoll(check.seed ?? null);
          return;
        }
        if (missing.length > 0) {
          setUnseen(missing);
          return;
        }
      }
      if (result_.outcome.status === 'success') {
        setActiveNode(null);
        setActiveEvent(null);
        const before = store.getSnapshot().progress.badges;
        const stars = store.complete({ levelId: level.id, usedHints: hintsUsed > 0, steps: countNodes(program), budget: level.stars.budget });
        const after = store.getSnapshot().progress.badges;
        completedRef.current = true;
        const ac = new AbortController();
        celebration.current = ac;
        await controller.current?.celebrate(ac.signal);
        if (token !== runToken.current) return;
        setCompletion({ stars, newBadges: after.filter((b) => !before.includes(b)) });
      }
    },
    [runtime, phase, ensureResult, level, store, program, prediction, predicting, predictionOk, hintsUsed, asking, world, worlds, shuffle, random, failedRoll, settings.reducedMotion],
  );

  const run = useCallback(() => void start('play'), [start]);
  const stepOnce = useCallback(() => void start('step'), [start]);
  const pause = useCallback(() => {
    if (phaseRef.current === 'running') sequencer.current?.pause();
  }, []);

  /** Any change to the program after a run puts the robot back at the start. */
  const change = useCallback(
    (update: (h: History) => History) => {
      if (phaseRef.current === 'running') return;
      if (phaseRef.current !== 'editing') reset();
      setHistory(update);
    },
    [reset],
  );
  const applyEdit = useCallback(
    (op: EditOp) => {
      change((h) => push(h, applyOp(h.present, op)));
      if (op.op === 'insert') store.record({ levelId: level.id, kind: 'card-placed', command: op.node.kind, at: op.at });
      else if (op.op === 'move') store.record({ levelId: level.id, kind: 'card-moved', nodeId: op.id, to: op.to });
      else if (op.op === 'set') {
        const { op: _op, id, ...change } = op;
        store.record({ levelId: level.id, kind: 'card-changed', nodeId: id, ...change });
      } else if (op.op === 'addSlot') store.record({ levelId: level.id, kind: 'slot-added', slot: op.slot.name });
      else if (op.op === 'removeSlot') store.record({ levelId: level.id, kind: 'slot-removed', slot: op.name });
      else store.record({ levelId: level.id, kind: 'card-removed', nodeId: op.id });
    },
    [change, store, level.id],
  );
  const onEdit = useCallback(
    (op: EditOp) => {
      setHint(null);
      applyEdit(op);
    },
    [applyEdit],
  );
  const onUndo = useCallback(() => {
    setHint(null);
    change(undo);
  }, [change]);
  const onRedo = useCallback(() => {
    setHint(null);
    change(redo);
  }, [change]);

  /** The next rung of the hint ladder. The solution is never given. */
  const openHint = useCallback(() => {
    if (hintsUsed >= 3 || phaseRef.current === 'running') return;
    const rung = hintsUsed as 0 | 1 | 2;
    const effect = hintEffect(level, rung, program, newId, paletteFor(level.programming, program).full);
    setHintsUsed(rung + 1);
    store.record({ levelId: level.id, kind: 'hint-opened', rung });
    if (effect.edit && !readOnly) applyEdit(effect.edit);
    setHint(effect);
  }, [hintsUsed, level, program, newId, store, applyEdit, readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        run();
      } else if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        onRedo();
      } else if (!mod && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'r') reset();
        if (key === 's') stepOnce();
        if (key === 'p') pause();
        if (key === 'h') openHint();
        if (key === 'c') setShowCode((v) => !v);
        if (e.key === 'Escape' && completion) setCompletion(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, reset, stepOnce, pause, onUndo, onRedo, openHint, completion]);

  // ----- Message line -----

  const errorNode = outcome?.status === 'blocked' || outcome?.status === 'error' ? (outcome.nodeId ?? null) : null;
  const predictionPrompt = (): { tone: Tone; text: string } => {
    const names = (fields: readonly MemoryField[]) => fields.map((f) => (gateOfField(f) ? gateLabel(gateOfField(f)!) : f === 'facing' ? 'which way it faces' : 'the acorns')).join(' and ');
    const tileMissing = asksTile && !prediction?.cell;
    const missing = askedFields.filter((f) => prediction?.memory?.[f] === undefined);
    if (wrongFields.length > 0 && missing.length > 0) return { tone: 'problem', text: `Not quite: look again at ${names(wrongFields)}. Follow the cards one at a time.` };
    if (wrongGuesses.length > 0 && tileMissing) return { tone: 'problem', text: 'Not there. The robot would not end up on that tile. Place the flag somewhere else.' };
    if (!tileMissing && missing.length === 0) return { tone: 'info', text: asksTile ? 'Ready. Press Run to see if you were right.' : 'Memory card filled in. Press Run to see if you were right.' };
    if (tileMissing && missing.length > 0) return { tone: 'info', text: 'Fill in the memory card for the end of the run, and place the flag where the robot will end up.' };
    if (missing.length > 0) return { tone: 'info', text: 'What will the memory card say when the run ends? Fill in the yellow lines.' };
    return { tone: 'info', text: 'Place the flag where the robot will end up: tap that tile.' };
  };
  let message: { tone: Tone | 'hint'; text: string };
  if (hint) message = { tone: 'hint', text: hint.text };
  else if (phase === 'running') message = { tone: 'info', text: worlds.length > 1 && !random ? `Running shuffle ${shuffle + 1} of ${worlds.length}…` : level.days ? `Running day ${shownState?.day ?? 1} of ${level.days}…` : 'Running…' };
  else if (phase === 'paused') message = { tone: 'info', text: `Paused after step ${position}. Step plays one more. Run keeps going.` };
  else if (outcome) {
    const base =
      outcome.status === 'incomplete' && countNodes(program) === 0
        ? { tone: 'problem' as const, text: 'Your program is empty. Tap an instruction to add a step.' }
        : outcome.status === 'success' && !level.objective.reachGoal
          ? { tone: 'success' as const, text: 'You did it!' }
          : outcomeMessage(outcome, errorNode ? stepNumber(program, errorNode) : null, shortfall);
    const guess = !guessedRight ? '' : asksTile && askedFields.length > 0 ? 'Your flag and your memory card were right! ' : asksTile ? 'Your flag was in the right spot! ' : 'Your memory card was right! ';
    message = { tone: base.tone, text: guess + base.text };
    if (worlds.length > 1 && !random) {
      message =
        outcome.status === 'success'
          ? { tone: 'success', text: `${base.text} It worked on all ${worlds.length} shuffles.` }
          : { tone: base.tone, text: `Shuffle ${shuffle + 1} of ${worlds.length}: ${base.text}` };
    }
    if (level.days && outcome.status !== 'success') message = { tone: base.tone, text: `Day ${shownState?.day ?? 1} of ${level.days}: ${message.text}` };
    if (failedShuffle !== null) message = { tone: 'problem', text: 'That worked on this shuffle, but not on every one. Press Shuffle to see a version it misses.' };
    if (failedRoll !== null) message = { tone: 'problem', text: 'That worked on this roll, but not on every roll. Press Run to see a roll it misses.' };
    if (unseen && level.objective.covers) {
      const of = level.objective.covers.of === 'column' ? 'the robot' : level.objective.covers.of;
      const ending = level.objective.covers.of === 'column' ? `ended in column ${unseen.join(' or ')}` : `came out as ${unseen.map(valueWords).join(' or ')}`;
      message = { tone: 'problem', text: `I ran it ${checksOf(level).length} times, and ${of} never ${ending}. Every outcome should be able to happen.` };
    }
  } else if (predicting) message = predictionPrompt();
  else message = { tone: 'info', text: level.intro ?? 'Help the robot reach the flag. Tap an instruction to add it to your program.' };
  if (level.days && phase === 'editing' && !hint && !outcome && !predicting) message = { tone: 'info', text: `${message.text} Run plays all ${level.days} days.` };
  if (worlds.length > 1 && phase === 'editing' && !hint && !outcome && !predicting) message = { tone: 'info', text: `${message.text} Shuffle ${shuffle + 1} of ${worlds.length}: Run plays every shuffle in turn.` };

  const busy = !runtime || phase === 'running';
  const marks = [
    ...wrongGuesses.map((cell) => ({ cell, state: 'wrong' as const })),
    ...(prediction?.cell ? [{ cell: prediction.cell, state: guessedRight ? ('right' as const) : ('pending' as const) }] : []),
  ];
  /** On finger levels, each place slot is drawn on the board where it points, moving as the run plays. */
  const fingerState = shownState ?? initialState(world, program.memory);
  const pointers = level.programming.allowedCommands.includes('shift')
    ? (program.memory ?? []).flatMap((m) => {
        const v = fingerState.memory?.[m.name];
        return m.kind === 'position' && isPosition(v) ? [{ name: m.name, cell: v }] : [];
      })
    : [];
  const starSlots: { key: keyof Stars; label: string }[] = [
    { key: 'complete', label: 'Reached the flag' },
    { key: 'noHints', label: 'No hints' },
    ...(level.stars.budget !== undefined ? [{ key: 'budget' as const, label: `${level.stars.budget} instructions or fewer` }] : []),
  ];

  return (
    <main className={`app-main ${showCode ? 'is-showing-code' : ''}`}>
      <div className="stage-col">
        <Board
          world={world}
          coordinates={coordinates}
          theme={theme}
          motion={motion}
          label={describeBoard(world)}
          onControllers={onControllers}
          onTileTap={predicting && asksTile && phase === 'editing' ? (cell) => setPrediction((p) => ({ ...p, cell })) : undefined}
          marks={marks}
          pointers={pointers}
          highlightCells={hint?.cells}
          hideIndicator={predicting}
          hideGoal={(predicting && asksTile) || !level.objective.reachGoal}
        />
        <div className="toolbar" role="toolbar" aria-label="Run controls">
          <button
            type="button"
            className="btn btn-run"
            onClick={run}
            disabled={busy || !predictionOk}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            title={!predictionOk ? (asksTile && !prediction?.cell ? 'Place the flag on the board first' : 'Fill in the memory card first') : undefined}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
            </svg>
            {phase === 'paused' ? 'Continue' : !predictionOk ? (asksTile && !prediction?.cell ? 'Place the flag' : 'Fill in the card') : 'Run'}
          </button>
          <button type="button" className="btn btn-step" onClick={stepOnce} disabled={busy || !predictionOk} aria-keyshortcuts="S" title="Play one step">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M6 5v14l9-7z" fill="currentColor" />
              <rect x="17" y="5" width="3" height="14" rx="1.2" fill="currentColor" />
            </svg>
            Step
          </button>
          <button type="button" className="btn btn-pause" onClick={pause} disabled={phase !== 'running'} aria-keyshortcuts="P">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <rect x="6" y="5" width="4.5" height="14" rx="1.4" fill="currentColor" />
              <rect x="13.5" y="5" width="4.5" height="14" rx="1.4" fill="currentColor" />
            </svg>
            Pause
          </button>
          {worlds.length > 1 && (
            <button
              type="button"
              className={`btn btn-shuffle ${failedShuffle !== null ? 'is-hinted' : ''}`}
              onClick={reshuffle}
              disabled={phase === 'running'}
              title="Put out another version of the board. Your program stays."
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.8-3.4M14.2 9.4C15.2 7.6 16.4 7 17 7h3M17 4l3 3-3 3M17 14l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Shuffle
            </button>
          )}
          <button type="button" className="btn btn-reset" onClick={reset} aria-keyshortcuts="R" title="Put the robot back at the start. Your program stays.">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reset
          </button>
          <button type="button" className="btn btn-hint" onClick={openHint} disabled={hintsUsed >= 3 || phase === 'running'} aria-keyshortcuts="H" aria-label={`Hint, ${3 - hintsUsed} left`}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Hint
            <span className="hint-dots" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`hint-dot ${i < 3 - hintsUsed ? 'is-left' : ''}`} />
              ))}
            </span>
          </button>
          <p className={`message tone-${message.tone}`} role="status" aria-live="polite">
            {message.text}
          </p>
        </div>
        <TickRules world={world} state={shownState ?? initialState(world, program.memory)} event={activeEvent} />
      </div>
      <div className="side-col">
        <Editor
          program={program}
          programming={level.programming}
          locked={phase === 'running'}
          readOnly={readOnly}
          activeNodeId={activeNode}
          activeEvent={activeEvent}
          errorNodeId={errorNode}
          highlightCommand={hint?.command ?? null}
          highlightNodeId={hint?.nodeId ?? null}
          newId={newId}
          onEdit={onEdit}
          canUndo={canUndo(history)}
          canRedo={canRedo(history)}
          onUndo={onUndo}
          onRedo={onRedo}
          onRestart={restart}
          codePanel={<CodePanel program={program} activeNodeId={activeNode} />}
          aboveProgram={
            // Keys and memory sit at the top of the Program panel, next to the cards that use and change them.
            <>
              {level.inputScript && <KeyScript keys={level.inputScript} event={activeEvent} played={phase === 'done'} />}
              {showMemory && (
          <MemoryCard
            world={world}
            state={shownState ?? initialState(world, program.memory)}
            slots={program.memory}
            {...(level.days && { days: level.days })}
            asking={predicting ? askedFields : []}
            answers={prediction?.memory}
            wrong={wrongFields}
            disabled={phase !== 'editing'}
            onAnswer={(field: MemoryField, value: MemoryValue) => {
              setPrediction((p) => ({ ...p, memory: { ...p?.memory, [field]: value } }));
              setWrongFields((w) => w.filter((f) => f !== field));
            }}
          />
              )}
            </>
          }
          gates={gatesOf(world).map((g) => g.id)}
          boardSize={{ width: world.width, height: world.height }}
          showCode={showCode}
          onToggleCode={() => setShowCode((v) => !v)}
        />
      </div>

      {completion && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="done-title">
            <h2 id="done-title" className="dialog-title">
              You did it!
            </h2>
            <ul className="star-row" aria-label="Stars">
              {starSlots.map(({ key, label }) => (
                <li key={key} className={`star-slot ${completion.stars[key] ? 'is-earned' : ''}`}>
                  <Star earned={completion.stars[key] === true} size={44} />
                  <span>{label}</span>
                  <span className="visually-hidden">{completion.stars[key] ? ', earned' : ', not yet'}</span>
                </li>
              ))}
            </ul>
            {completion.newBadges.length > 0 && (
              <ul className="new-badges" aria-label="New badges">
                {completion.newBadges.map((b) => (
                  <li key={b} className="new-badge">
                    <span className="badge-icon">
                      <BadgeIcon id={b} />
                    </span>
                    <span>
                      New badge: <strong>{BADGE_INFO[b].name}</strong>. {BADGE_INFO[b].how}.
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              {nextLevelId && store.isUnlocked(nextLevelId) && (
                <button type="button" className="btn btn-run" autoFocus onClick={() => onGoTo(hashFor({ screen: 'level', id: nextLevelId }))}>
                  Next level
                </button>
              )}
              <button type="button" className="btn btn-quiet" onClick={restart}>
                Play again
              </button>
              <a className="btn btn-quiet" href={hashFor({ screen: 'map' })}>
                Map
              </a>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
