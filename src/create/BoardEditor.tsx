/**
 * Build mode: the child's board with a strip of tools. Tap a tile to use
 * the tool on it; grass, rock, water and the eraser also paint as a finger
 * drags. The board checker says what is wrong, on the tiles, as it happens.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useMotion } from '../app/hooks';
import type { CardId } from '../ir/types';
import type { Settings } from '../progress/types';
import { Board } from '../render/Board';
import { themeFor } from '../render/themes';
import type { Cell, ObjectiveDefinition, WorldDefinition } from '../sim/types';
import { boardProblems } from './problems';
import { BOARD_MAX } from './types';
import { amendWorld, applyStroke, isPaintTool, minSize, pushWorld, redoWorld, resize, TOOLS, undoWorld, worldHistory, type Tool } from './worldOps';

const TOOL_INFO: Record<Tool, { name: string; tip: string }> = {
  floor: { name: 'Grass', tip: 'Tap or drag to lay ground the robot can walk on.' },
  wall: { name: 'Rock', tip: 'Tap or drag to put rocks down. The robot cannot walk through a rock.' },
  gap: { name: 'Water', tip: 'Tap or drag to pour water. The robot cannot cross water.' },
  acorn: { name: 'Acorn', tip: 'Tap a tile to put an acorn there. Tap the acorn to pick it back up.' },
  flag: { name: 'Flag', tip: 'Tap the tile where the robot should end up.' },
  robot: { name: 'Robot', tip: 'Tap a tile to start the robot there. Tap the robot to turn it.' },
  gate: { name: 'Gate', tip: 'Tap a tile to put a gate there. Tap a gate to start it open or shut.' },
  switch: { name: 'Switch', tip: 'Tap a tile to put a switch there. Stepping on it flips a gate. Tap the switch to pick another gate.' },
  plate: { name: 'Plate', tip: 'Tap a tile to put a plate there. Stepping on it sets off its When card. Tap the plate to pick it up.' },
  beetle: { name: 'Beetle', tip: 'Drag across grass to draw where a beetle walks, there and back. It moves one tile each time the robot does, and stops the robot if they meet.' },
  log: { name: 'Log', tip: 'Drag across water to draw where a log floats, there and back. The robot can ride it.' },
  erase: { name: 'Eraser', tip: 'Tap or drag to take acorns, gates, switches, plates, beetles and logs off the tiles.' },
};

function ToolIcon({ tool }: { tool: Tool }) {
  const box = (children: ReactNode) => (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      {children}
    </svg>
  );
  switch (tool) {
    case 'floor':
      return box(<rect x="3" y="3" width="26" height="26" rx="6" fill="#9fd67c" stroke="#6fb04c" strokeWidth="2" />);
    case 'wall':
      return box(<path d="M5 25c-1-7 2-14 8-16 5-2 11 1 13 7 1 4 0 7-1 9z" fill="#9aa6b4" stroke="#6d7a89" strokeWidth="2" strokeLinejoin="round" />);
    case 'gap':
      return box(
        <>
          <rect x="3" y="3" width="26" height="26" rx="6" fill="#7cc4ee" />
          <path d="M7 13c3-3 5 3 8 0s5 3 9 0M7 21c3-3 5 3 8 0s5 3 9 0" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </>,
      );
    case 'acorn':
      return box(
        <>
          <path d="M9 14h14c0 8-3 13-7 13s-7-5-7-13z" fill="#c98a3c" />
          <path d="M7 14c0-5 4-8 9-8s9 3 9 8z" fill="#7a4a1d" />
          <path d="M16 6V3" stroke="#7a4a1d" strokeWidth="2.4" strokeLinecap="round" />
        </>,
      );
    case 'flag':
      return box(
        <>
          <path d="M9 28V4" stroke="#5b4636" strokeWidth="3" strokeLinecap="round" />
          <path d="M10 5l15 5-15 6z" fill="#f2c230" stroke="#d19a12" strokeWidth="1.5" strokeLinejoin="round" />
        </>,
      );
    case 'robot':
      return box(
        <>
          <circle cx="16" cy="17" r="11" fill="#3291d6" stroke="#2b78b5" strokeWidth="2" />
          <circle cx="16" cy="17" r="6.5" fill="#fff" />
          <circle cx="13.5" cy="16" r="1.6" fill="#1d3047" />
          <circle cx="18.5" cy="16" r="1.6" fill="#1d3047" />
          <path d="M16 6V2" stroke="#2b78b5" strokeWidth="2.4" strokeLinecap="round" />
        </>,
      );
    case 'gate':
      return box(
        <>
          <path d="M5 28V8M27 28V8" stroke="#6c43a8" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M5 12h22M5 18h22M5 24h22M11 12v12M16 12v12M21 12v12" stroke="#8a5cc7" strokeWidth="2.4" strokeLinecap="round" />
        </>,
      );
    case 'switch':
      return box(
        <>
          <rect x="4" y="19" width="24" height="8" rx="4" fill="#6c43a8" />
          <rect x="9" y="12" width="14" height="9" rx="4" fill="#b592e6" stroke="#6c43a8" strokeWidth="2" />
        </>,
      );
    case 'plate':
      return box(
        <>
          <rect x="4" y="9" width="24" height="16" rx="5" fill="#f2c230" stroke="#b8701a" strokeWidth="2" />
          <text x="16" y="22" textAnchor="middle" fontSize="13" fontWeight="800" fill="#7a4a1d">
            1
          </text>
        </>,
      );
    case 'beetle':
      return box(
        <>
          <ellipse cx="16" cy="18" rx="9" ry="10" fill="#d6503c" stroke="#8a2c1d" strokeWidth="2" />
          <path d="M16 8v20M9 6l3 4M23 6l-3 4" stroke="#8a2c1d" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.8" fill="#8a2c1d" />
          <circle cx="20" cy="20" r="1.8" fill="#8a2c1d" />
        </>,
      );
    case 'log':
      return box(
        <>
          <rect x="3" y="10" width="26" height="12" rx="6" fill="#a9713d" stroke="#7a4a1d" strokeWidth="2" />
          <ellipse cx="25" cy="16" rx="3" ry="5" fill="#d9a871" stroke="#7a4a1d" strokeWidth="1.6" />
          <path d="M8 14h9M9 18h7" stroke="#7a4a1d" strokeWidth="1.6" strokeLinecap="round" />
        </>,
      );
    case 'erase':
      return box(
        <>
          <path d="M5 21 17 7l9 8-9 12H10z" fill="#f4a9a0" stroke="#d6503c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M11 14l9 8" stroke="#d6503c" strokeWidth="2" />
        </>,
      );
  }
}

const cellOf = (el: Element | null): Cell | null => {
  const raw = el?.closest('[data-cell]')?.getAttribute('data-cell');
  if (!raw) return null;
  const [x, y] = raw.split(',').map(Number);
  return { x: x!, y: y! };
};

const noControllers = () => {};

export interface BoardEditorProps {
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  /** The cards a player gets: cards that open gates change what the checker asks of a gate. */
  cards: readonly CardId[];
  settings: Settings;
  /** The board changed: saved by whoever owns the creation. */
  onChange(world: WorldDefinition): void;
  /** Tools the child has not met in a pack yet, and where the robot learns them. Nothing is locked. */
  signposts?: Partial<Record<Tool, { pack: string; href: string }>>;
}

export function BoardEditor({ world, objective, cards, settings, onChange, signposts = {} }: BoardEditorProps) {
  const [history, setHistory] = useState(() => worldHistory(world));
  const [tool, setTool] = useState<Tool>('wall');
  const present = history.present;
  const motion = useMotion(1, settings.reducedMotion);
  const theme = themeFor('forest');
  const problems = useMemo(() => boardProblems(present, objective, cards), [present, objective, cards]);

  const saved = useRef(present);
  useEffect(() => {
    if (present === saved.current) return;
    saved.current = present;
    onChange(present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  const use = useCallback((cell: Cell, fresh: boolean) => setHistory((h) => (fresh ? pushWorld : amendWorld)(h, applyStroke(h.present, tool, cell, fresh))), [tool]);

  /** The tile under the finger during a stroke, so a tile is painted once as the finger crosses it. */
  const stroke = useRef<string | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    const cell = cellOf(e.target as Element);
    if (!cell || e.button > 0) return;
    stroke.current = `${cell.x},${cell.y}`;
    use(cell, true);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (stroke.current === null || !isPaintTool(tool)) return;
    const cell = cellOf(document.elementFromPoint(e.clientX, e.clientY));
    if (!cell || stroke.current === `${cell.x},${cell.y}`) return;
    stroke.current = `${cell.x},${cell.y}`;
    use(cell, false);
  };
  const endStroke = () => {
    stroke.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        setHistory(e.shiftKey ? redoWorld : undoWorld);
      } else if (k === 'y') {
        e.preventDefault();
        setHistory(redoWorld);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const min = minSize(present);
  const size = (width: number, height: number) => setHistory((h) => pushWorld(h, resize(h.present, width, height)));
  const hasGate = (present.gates?.length ?? 0) > 0;
  /** Why a tool cannot be picked yet, or null. */
  const off = (t: Tool): string | null => (t === 'switch' && !hasGate ? 'Put a gate down first: a switch needs a gate to flip.' : null);
  const signpost = signposts[tool];
  const message = problems[0] ? { tone: 'problem', text: problems[0].text } : { tone: 'info', text: `${TOOL_INFO[tool].name}: ${TOOL_INFO[tool].tip}` };

  const stepper = (label: string, value: number, least: number, set: (n: number) => void) => (
    <div className="size-stepper" role="group" aria-label={label}>
      <span className="size-label">{label}</span>
      <button type="button" className="btn btn-icon" onClick={() => set(value - 1)} disabled={value <= least} aria-label={`${label}: one less`}>
        −
      </button>
      <span className="size-value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="btn btn-icon" onClick={() => set(value + 1)} disabled={value >= BOARD_MAX} aria-label={`${label}: one more`}>
        +
      </button>
    </div>
  );

  return (
    <main className="app-main build-main">
      <div className="lesson-banner">
        <p className={`message tone-${message.tone}`} role="status" aria-live="polite">
          {message.text}
        </p>
      </div>
      <div className="stage-col">
        {/* Pointer taps and strokes are handled here; a click with no pointer (the keyboard) goes through to the tile. */}
        <div
          className="board-paint"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onClickCapture={(e) => {
            if (e.detail !== 0) e.stopPropagation();
          }}
        >
          <Board
            world={present}
            theme={theme}
            motion={motion}
            label={`Your island, ${present.width} tiles wide and ${present.height} tiles deep. Tap a tile to use the ${TOOL_INFO[tool].name} tool on it.`}
            onControllers={noControllers}
            onTileTap={(cell) => use(cell, true)}
            plainTiles
            hideIndicator
            highlightCells={problems.flatMap((p) => p.cells)}
          />
        </div>
        <div className="toolbar" role="toolbar" aria-label="Board controls">
          <button type="button" className="btn btn-reset" onClick={() => setHistory(undoWorld)} disabled={history.past.length === 0}>
            Undo
          </button>
          <button type="button" className="btn btn-reset" onClick={() => setHistory(redoWorld)} disabled={history.future.length === 0}>
            Redo
          </button>
          {stepper('Wide', present.width, min.width, (n) => size(n, present.height))}
          {stepper('Tall', present.height, min.height, (n) => size(present.width, n))}
        </div>
      </div>
      <div className="side-col">
        <section className="panel tools-panel" aria-labelledby="tools-title">
          <h2 id="tools-title" className="panel-title">
            Tools
          </h2>
          <div className="tool-grid" role="radiogroup" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tool === t} className={`tool ${tool === t ? 'is-on' : ''}`} onClick={() => setTool(t)} disabled={off(t) !== null} title={off(t) ?? TOOL_INFO[t].tip}>
                <ToolIcon tool={t} />
                <span>{TOOL_INFO[t].name}</span>
              </button>
            ))}
          </div>
          {!hasGate && <p className="tool-note">A switch needs a gate to flip. Put a gate down first.</p>}
          {signpost && (
            <p className="tool-note">
              The robot learns this in <a href={signpost.href}>{signpost.pack}</a>. You can use it anyway.
            </p>
          )}
        </section>
        {problems.length > 0 && (
          <section className="panel tools-panel" aria-labelledby="check-title">
            <h2 id="check-title" className="panel-title">
              To fix
            </h2>
            <ul className="problem-list">
              {problems.map((p) => (
                <li key={p.text}>{p.text}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
