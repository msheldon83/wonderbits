import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodePanel } from '../editor/CodePanel';
import { Editor } from '../editor/Editor';
import { randomIdFactory } from '../ir/ids';
import { applyOp, type EditOp } from '../ir/ops';
import { findNodeIndex, programFromCommands } from '../ir/program';
import type { NodeId, ProgramIR } from '../ir/types';
import { loadPacks } from '../lessons/content';
import type { PuzzleDefinition } from '../lessons/types';
import { Board } from '../render/Board';
import type { BoardController } from '../render/controller';
import { Sequencer } from '../render/sequencer';
import { themeFor } from '../render/themes';
import { DEFAULT_LIMITS, type RunOutcome } from '../runtime/contract';
import { initialState } from '../sim/world';
import { useMotion, useRuntime } from './hooks';
import { outcomeMessage } from './messages';

type Phase = 'editing' | 'running' | 'done';
const FACING_WORDS = { N: 'north', E: 'east', S: 'south', W: 'west' } as const;

function describeBoard(level: PuzzleDefinition): string {
  const { world } = level;
  return (
    `Island ${world.width} tiles wide and ${world.height} tiles deep. ` +
    `Robot at column ${world.robot.x + 1}, row ${world.robot.y + 1}, facing ${FACING_WORDS[world.robot.facing]}. ` +
    `Flag at column ${world.goal.x + 1}, row ${world.goal.y + 1}.`
  );
}

export function App() {
  const level = useMemo(() => loadPacks()[0]!.levels[0]!, []);
  const theme = themeFor(level.themeId);
  const newId = useMemo(() => randomIdFactory(), []);
  const [program, setProgram] = useState<ProgramIR>(() => programFromCommands(level.programming.starterProgram, newId));
  const [phase, setPhase] = useState<Phase>('editing');
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);
  const [showCode, setShowCode] = useState(false);
  const runtime = useRuntime();
  const motion = useMotion();

  const controller = useRef<BoardController | null>(null);
  const sequencer = useRef<Sequencer | null>(null);
  const runToken = useRef(0);
  const celebration = useRef<AbortController | null>(null);

  const onControllers = useCallback((cs: BoardController[] | null) => {
    controller.current = cs?.[0] ?? null;
    sequencer.current = controller.current
      ? new Sequencer(controller.current, { onEvent: (e) => setActiveNode(e?.nodeId ?? null) })
      : null;
  }, []);

  const reset = useCallback(() => {
    runToken.current++;
    celebration.current?.abort();
    sequencer.current?.reset();
    setPhase('editing');
    setOutcome(null);
    setActiveNode(null);
  }, []);

  const run = useCallback(async () => {
    const seq = sequencer.current;
    if (!seq || !runtime || phase === 'running') return;
    const token = ++runToken.current;
    celebration.current?.abort();
    setPhase('running');
    setOutcome(null);
    const result = await runtime.run({ program, world: level.world, objective: level.objective, limits: DEFAULT_LIMITS });
    if (token !== runToken.current) return;
    seq.load(result.trace, initialState(level.world));
    await seq.play();
    if (token !== runToken.current || seq.state !== 'finished') return;
    setOutcome(result.outcome);
    setPhase('done');
    if (result.outcome.status === 'success') {
      setActiveNode(null);
      const ac = new AbortController();
      celebration.current = ac;
      await controller.current?.celebrate(ac.signal);
    }
  }, [runtime, phase, program, level]);

  const onEdit = useCallback(
    (op: EditOp) => {
      if (phase === 'running') return;
      // Editing after a run puts the robot back at the start.
      if (phase === 'done') reset();
      setProgram((p) => applyOp(p, op));
    },
    [phase, reset],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void run();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'r' || e.key === 'R') reset();
        if (e.key === 'c' || e.key === 'C') setShowCode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, reset]);

  const errorNode = outcome?.status === 'blocked' ? outcome.nodeId : null;
  const message =
    phase === 'running'
      ? { tone: 'info' as const, text: 'Running…' }
      : outcome
        ? outcomeMessage(outcome, errorNode ? findNodeIndex(program, errorNode) + 1 : null)
        : { tone: 'info' as const, text: 'Help the robot reach the flag. Tap the Forward card, then tap a spot in your program.' };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">Wonderbits</h1>
        <p className="level-title">{level.title}</p>
        <button type="button" className="btn btn-quiet" aria-pressed={showCode} onClick={() => setShowCode((v) => !v)}>
          {showCode ? 'Hide the code' : 'See the code'}
        </button>
      </header>
      <main className="app-main">
        <div className="stage-col">
          <Board world={level.world} theme={theme} motion={motion} label={describeBoard(level)} onControllers={onControllers} />
          <div className="toolbar" role="toolbar" aria-label="Run controls">
            <button type="button" className="btn btn-run" onClick={() => void run()} disabled={!runtime || phase === 'running'} aria-keyshortcuts="Control+Enter Meta+Enter">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
              </svg>
              Run
            </button>
            <button type="button" className="btn btn-reset" onClick={reset} aria-keyshortcuts="R">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reset
            </button>
            <p className={`message tone-${message.tone}`} role="status" aria-live="polite">
              {message.text}
            </p>
          </div>
        </div>
        <div className="side-col">
          <Editor
            program={program}
            allowedCommands={level.programming.allowedCommands}
            maxInstructions={level.programming.maxInstructions}
            locked={phase === 'running'}
            activeNodeId={activeNode}
            errorNodeId={errorNode}
            newId={newId}
            onEdit={onEdit}
          />
          {showCode && <CodePanel program={program} activeNodeId={activeNode} />}
        </div>
      </main>
    </div>
  );
}
