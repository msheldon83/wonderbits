/**
 * Program editor.
 *
 * - A cursor caret always sits in the gutter, pointing at the gap where the
 *   next card will go. Tap a palette card and it lands there; the cursor
 *   moves past it, like a text cursor. Tap a block to put the cursor after
 *   it. Tap the cursor to pick another gap, or drag it there.
 * - Every block has a Move handle and a Delete button. Delete removes it.
 *   Tap Move and carets float in the gutter, one per gap between blocks;
 *   tap a caret to put the block there. The list never changes height.
 * - Drag and drop does the same: drag a block (by its handle on touch, or
 *   anywhere on it with a mouse), drag a palette card into the list, or drag
 *   the cursor. A green caret marks the gap under the pointer.
 *
 * Every control is a native button, so keyboard and screen readers work.
 * Enter on Move or on the cursor opens the carets and focuses the first;
 * arrows walk them; Enter places; Escape cancels. Delete on a block removes
 * it, and Shift plus the up and down arrows move it by one.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { IdFactory } from '../ir/ids';
import { isNoOpMove, type EditOp } from '../ir/ops';
import { mainBody } from '../ir/program';
import type { CommandId, NodeId, ProgramIR } from '../ir/types';
import { codeFor, MAIN_CLOSE, MAIN_OPEN } from '../projection/printTs';
import { COMMANDS } from './commands';
import { gapCentres, slotForY, type RowBox } from './geometry';
import { paletteFor, type Programming } from './palette';

export interface EditorProps {
  program: ProgramIR;
  /** The level's allowed commands, budget and quotas. */
  programming: Programming;
  /** True while a run is playing: editing is paused. */
  locked: boolean;
  activeNodeId: NodeId | null;
  errorNodeId: NodeId | null;
  newId: IdFactory;
  onEdit(op: EditOp): void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?(): void;
  onRedo?(): void;
  /** Erase the program and start the level afresh. Shown in the program header when given. */
  onRestart?(): void;
  /** The program is given: no palette, no editing, just the steps to read. */
  readOnly?: boolean;
  /** A hint is pointing at this palette card. */
  highlightCommand?: CommandId | null;
  /** A hint is pointing at this step. */
  highlightNodeId?: NodeId | null;
  /** Show each card's line of TypeScript under its label, with the function around the list. */
  showCode?: boolean;
}

/** What is being carried to a gap: a palette card, a program block, or the cursor. */
type Carried = { kind: 'palette'; command: CommandId } | { kind: 'program'; id: NodeId } | { kind: 'cursor' };

type Focus = { kind: 'card' | 'move'; id: NodeId } | 'palette' | 'caret' | 'cursor' | null;

const DRAG_THRESHOLD = 6;
/** How long the just-added block keeps its pop-and-glow class; matches the CSS. */
const ADDED_MS = 750;
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Chevron = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M8 4l9 8-9 8" {...stroke} strokeWidth={3.4} />
  </svg>
);

export function Editor({
  program,
  programming,
  locked: lockedProp,
  activeNodeId,
  errorNodeId,
  newId,
  onEdit,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onRestart,
  readOnly = false,
  highlightCommand = null,
  highlightNodeId = null,
  showCode = false,
}: EditorProps) {
  const locked = lockedProp || readOnly;
  const body = mainBody(program);
  const palette = paletteFor(programming, program);
  const { full } = palette;
  /** Unused steps under the budget, drawn as empty rows so the space running out is visible. */
  const remaining = palette.max === undefined ? null : Math.max(0, palette.max - palette.used);
  const budgetTone = remaining === null ? '' : remaining === 0 ? 'is-full' : remaining <= 2 ? 'is-low' : '';

  /** The gap the next card goes into. Clamped, so edits elsewhere never leave it dangling. */
  const [cursorRaw, setCursor] = useState(body.length);
  const cursor = Math.min(cursorRaw, body.length);
  /** What the carets are open for, after a tap on Move or on the cursor. */
  const [carrying, setCarrying] = useState<Carried | null>(null);
  /** The card, block or cursor being dragged, and the gap under the pointer. */
  const [drag, setDrag] = useState<{ carried: Carried; slot: number | null } | null>(null);
  const [gaps, setGaps] = useState<number[]>([0]);
  /** The block just inserted, which pops and glows for a moment. */
  const [justAdded, setJustAdded] = useState<NodeId | null>(null);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), ADDED_MS);
    return () => clearTimeout(t);
  }, [justAdded]);
  const moving = carrying?.kind === 'program' ? carrying.id : null;

  const focusAfter = useRef<Focus>(null);
  const cardRefs = useRef(new Map<NodeId, HTMLButtonElement>());
  const moveRefs = useRef(new Map<NodeId, HTMLButtonElement>());
  const rowRefs = useRef(new Map<NodeId, HTMLLIElement>());
  const root = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const cursorRef = useRef<HTMLButtonElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; carried: Carried; el: HTMLElement; dragging: boolean } | null>(null);
  const swallowClick = useRef(false);

  useEffect(() => {
    if (locked) {
      setCarrying(null);
      setDrag(null);
    }
  }, [locked]);

  useEffect(() => {
    if (moving && !body.some((n) => n.id === moving)) setCarrying(null);
  }, [moving, body]);

  /** Row boxes in the list's coordinate space, in program order. */
  const rowBoxes = useCallback(
    (): RowBox[] =>
      body.map((n) => {
        const el = rowRefs.current.get(n.id);
        return el ? { top: el.offsetTop, height: el.offsetHeight } : { top: 0, height: 0 };
      }),
    [body],
  );

  // Measure the gaps on every change of the list, and again if it resizes.
  useLayoutEffect(() => {
    const list = listRef.current;
    const measure = () => {
      const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
      setGaps(gapCentres(rowBoxes(), gap));
    };
    measure();
    if (!list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [rowBoxes, carrying, drag]);

  // Move keyboard focus to whatever was just placed, moved or opened.
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === 'palette') paletteRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    else if (target === 'caret') listRef.current?.querySelector<HTMLButtonElement>('.caret:not(.cursor)')?.focus();
    else if (target === 'cursor') cursorRef.current?.focus();
    else if (target.kind === 'card') cardRefs.current.get(target.id)?.focus();
    else moveRefs.current.get(target.id)?.focus();
  });

  // ----- Edits -----

  const insertAt = (command: CommandId, slot: number, focus: Focus) => {
    if (full) return;
    const node = { id: newId(), kind: command };
    onEdit({ op: 'insert', slot, node });
    setCursor(slot + 1);
    setJustAdded(node.id);
    focusAfter.current = focus;
  };

  /** Tap on a palette card: it goes in at the cursor, and the cursor moves past it. */
  const tapCard = (command: CommandId) => {
    if (full || locked) return;
    setCarrying(null);
    insertAt(command, cursor, null);
  };

  const placeAt = (carried: Carried, slot: number) => {
    if (carried.kind === 'palette') {
      insertAt(carried.command, slot, 'cursor');
    } else if (carried.kind === 'cursor') {
      setCursor(slot);
      focusAfter.current = 'cursor';
    } else {
      if (!isNoOpMove(program, carried.id, slot)) onEdit({ op: 'move', id: carried.id, slot });
      focusAfter.current = { kind: 'move', id: carried.id };
    }
    setCarrying(null);
  };

  const moveByOne = (id: NodeId, delta: -1 | 1) => {
    const index = body.findIndex((n) => n.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= body.length) return;
    onEdit({ op: 'move', id, slot: delta > 0 ? target + 1 : target });
    focusAfter.current = { kind: 'card', id };
  };

  const remove = (id: NodeId) => {
    const index = body.findIndex((n) => n.id === id);
    onEdit({ op: 'delete', id });
    if (index < cursor) setCursor(cursor - 1);
    const neighbour = body[index + 1] ?? body[index - 1];
    focusAfter.current = neighbour && neighbour.id !== id ? { kind: 'card', id: neighbour.id } : 'palette';
    if (moving === id) setCarrying(null);
  };

  const toggleMove = (id: NodeId) => {
    if (moving === id) {
      setCarrying(null);
      focusAfter.current = { kind: 'move', id };
    } else {
      setCarrying({ kind: 'program', id });
      focusAfter.current = 'caret';
    }
  };

  const toggleCursorPick = () => {
    if (carrying?.kind === 'cursor') {
      setCarrying(null);
      focusAfter.current = 'cursor';
    } else {
      setCarrying({ kind: 'cursor' });
      focusAfter.current = 'caret';
    }
  };

  const cancelCarry = () => {
    if (!carrying) return;
    if (carrying.kind === 'program') toggleMove(carrying.id);
    else if (carrying.kind === 'cursor') toggleCursorPick();
    else {
      setCarrying(null);
      focusAfter.current = 'palette';
    }
  };

  // ----- Drag and drop with pointer events (mouse, touch and pen alike) -----

  const slotUnderPointer = (clientY: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const rect = list.getBoundingClientRect();
    const margin = 40;
    if (clientY < rect.top - margin || clientY > rect.bottom + margin) return null;
    return slotForY(rowBoxes(), clientY - rect.top);
  };

  const onPointerDown = (carried: Carried, touchToo: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (locked || e.button !== 0) return;
    // A block's body scrolls the column on touch; its handle is the touch grip.
    if (!touchToo && e.pointerType === 'touch') return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, carried, el: e.currentTarget, dragging: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      if (p.carried.kind === 'palette' && full) return;
      p.dragging = true;
      p.el.setPointerCapture?.(e.pointerId);
      setCarrying(null);
      setDrag({ carried: p.carried, slot: slotUnderPointer(e.clientY) });
    } else {
      const slot = slotUnderPointer(e.clientY);
      setDrag((d) => (d && d.slot !== slot ? { ...d, slot } : d));
    }
    const ghost = ghostRef.current;
    if (ghost) ghost.style.transform = `translate(${e.clientX - ghost.offsetWidth / 2}px, ${e.clientY - ghost.offsetHeight / 2}px)`;
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>, drop: boolean) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    pointer.current = null;
    if (!p.dragging) return;
    p.el.releasePointerCapture?.(e.pointerId);
    swallowClick.current = true;
    const slot = drop ? slotUnderPointer(e.clientY) : null;
    setDrag(null);
    if (slot !== null) placeAt(p.carried, slot);
  };

  const dragHandlers = (carried: Carried, touchToo = true) => ({
    onPointerDown: onPointerDown(carried, touchToo),
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => endDrag(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => endDrag(e, false),
    onClickCapture: (e: MouseEvent) => {
      // The click after a drag must not count as a tap.
      if (swallowClick.current) {
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });

  // ----- Keyboard -----

  /** Arrow keys walk the carets while they are open, the blocks otherwise, and the palette sideways. */
  const walk = (e: KeyboardEvent) => {
    const el = root.current;
    const active = document.activeElement;
    if (!el || !(active instanceof HTMLButtonElement) || e.shiftKey) return;
    const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const horizontal = e.key === 'ArrowRight' || e.key === 'ArrowLeft';
    if (!vertical && !horizontal && e.key !== 'Home' && e.key !== 'End') return;
    const inPalette = paletteRef.current?.contains(active) ?? false;
    const list = Array.from(
      inPalette && horizontal
        ? paletteRef.current!.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        : el.querySelectorAll<HTMLButtonElement>(carrying ? '.caret:not(.cursor)' : '.program-step .card:not([disabled])'),
    );
    if (list.length === 0) return;
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const index = list.indexOf(active);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (index < 0) next = forward ? 0 : list.length - 1;
    else next = Math.min(list.length - 1, Math.max(0, index + (forward ? 1 : -1)));
    e.preventDefault();
    list[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && carrying) {
      e.stopPropagation();
      cancelCarry();
      return;
    }
    walk(e);
  };

  // ----- Rendering -----

  const historyButtons = (onUndo || onRedo) && (
    <span className="history-buttons" role="group" aria-label="Undo and redo">
      <button type="button" className="btn-icon" onClick={onUndo} disabled={!canUndo || locked} aria-label="Undo" title="Undo" aria-keyshortcuts="Control+Z Meta+Z">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M9 7 4 11.5 9 16M4.5 11.5H14a5 5 0 0 1 0 10h-3" {...stroke} />
        </svg>
      </button>
      <button type="button" className="btn-icon" onClick={onRedo} disabled={!canRedo || locked} aria-label="Redo" title="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="m15 7 5 4.5-5 4.5M19.5 11.5H10a5 5 0 0 0 0 10h3" {...stroke} />
        </svg>
      </button>
    </span>
  );

  const gapLabel = (slot: number) => (slot >= body.length ? 'at the end' : `before step ${slot + 1}`);
  const carriedName =
    carrying?.kind === 'cursor' ? 'the insert point' : carrying?.kind === 'palette' ? COMMANDS[carrying.command].label : carrying ? (COMMANDS[body.find((n) => n.id === carrying.id)?.kind ?? 'forward'].label) : '';
  const isNoOp = (carried: Carried, slot: number) =>
    carried.kind === 'program' ? isNoOpMove(program, carried.id, slot) : carried.kind === 'cursor' ? slot === cursor : false;

  /** Carets to choose a gap, one per gap that would change something. */
  const carets =
    carrying &&
    gaps.map((y, slot) =>
      isNoOp(carrying, slot) ? null : (
        <button key={`caret-${slot}`} type="button" className="caret" style={{ top: y }} onClick={() => placeAt(carrying, slot)} aria-label={`Put ${carriedName} ${gapLabel(slot)}`}>
          <Chevron />
        </button>
      ),
    );

  /** The drop marker while dragging. */
  const dropSlot = drag?.slot ?? null;
  const dropMarker = drag && dropSlot !== null && !isNoOp(drag.carried, dropSlot) && (
    <span className="caret is-target" style={{ top: gaps[dropSlot] ?? 0 }} aria-hidden="true">
      <Chevron />
    </span>
  );

  /** The cursor: always there unless carets have replaced it or it is being dragged. */
  const showCursor = !locked && !readOnly && carrying === null && drag?.carried.kind !== 'cursor';
  const cursorCaret = (
    <button
      ref={cursorRef}
      type="button"
      className={`caret cursor ${showCursor ? '' : 'is-hidden'}`}
      style={{ top: gaps[cursor] ?? 0 }}
      onClick={toggleCursorPick}
      aria-label={`New cards go ${gapLabel(cursor)}. Tap to choose another spot`}
      title="New cards go here. Tap to choose another spot, or drag"
      disabled={locked}
      tabIndex={showCursor ? 0 : -1}
      {...dragHandlers({ kind: 'cursor' })}
    >
      <Chevron />
    </button>
  );

  const ghostCommand = drag?.carried.kind === 'palette' ? drag.carried.command : drag?.carried.kind === 'program' ? body.find((n) => n.id === (drag.carried as { id: NodeId }).id)?.kind : undefined;

  return (
    <div className={`editor ${drag ? 'is-dragging' : ''} ${readOnly ? 'is-readonly' : ''} ${showCode ? 'is-showing-code' : ''}`} ref={root} onKeyDown={onKeyDown}>
      {!readOnly && (
      <section className="palette" aria-label="Command cards">
        <h2 className="panel-title">
          <span className="panel-title-text">
            Cards
            {body.length > 0 && cursor < body.length && <span className="palette-hint">next goes before step {cursor + 1}</span>}
          </span>
        </h2>
        <div className="palette-cards" ref={paletteRef}>
          {palette.entries.map(({ command, remaining, available }) => {
            const info = COMMANDS[command];
            const quota = remaining !== null ? `, ${remaining} left` : '';
            return (
              <button
                key={command}
                type="button"
                className={`card card-${command} ${drag?.carried.kind === 'palette' && drag.carried.command === command ? 'is-lifted' : ''} ${highlightCommand === command ? 'is-hinted' : ''}`}
                aria-label={`Add ${info.description}${quota}${highlightCommand === command ? ', the hint points here' : ''}`}
                title="Tap to add at the insert point, or drag into the program"
                disabled={locked || !available}
                onClick={() => tapCard(command)}
                {...dragHandlers({ kind: 'palette', command })}
              >
                <span className="card-icon">{info.icon}</span>
                <span className="card-text">
                  <span className="card-label">{info.label}</span>
                  {showCode && <code className="card-code">{codeFor(command)}</code>}
                </span>
                {remaining !== null && (
                  <span className="card-count" aria-hidden="true">
                    {remaining}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {full && !locked && <p className="palette-note">No room for more steps. Remove one to add another.</p>}
      </section>
      )}

      <section className="program" aria-label="Your program">
        <h2 className="panel-title">
          <span className="panel-title-text">
            Program
            {palette.max !== undefined && (
              <span className={`capacity ${budgetTone}`} role="status">
                {palette.used} of {palette.max} steps
                {remaining !== null && remaining > 0 && remaining <= 2 && <span className="capacity-left"> · {remaining} left</span>}
              </span>
            )}
          </span>
          <span className="program-tools">
            {historyButtons}
            {onRestart && !readOnly && (
              <button type="button" className="btn btn-small btn-restart" onClick={onRestart} disabled={locked} title="Erase the program and start this level again">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5" {...stroke} />
                </svg>
                Start over
              </button>
            )}
          </span>
        </h2>
        {carrying && (
          <p className="program-note" role="status">
            Tap an arrow to put {carriedName} there.
          </p>
        )}
        {showCode && (
          <pre className="code-frame code-frame-open" aria-hidden="true">
            {MAIN_OPEN}
          </pre>
        )}
        <ol className={`program-list ${carrying ? 'is-moving' : ''}`} ref={listRef}>
          {body.length === 0 && remaining === null && (
            <li className="slot-empty" aria-hidden="true">
              <span>{drag ? 'Drop it here' : 'Tap a card to add a step'}</span>
            </li>
          )}
          {body.map((node, i) => {
            const info = COMMANDS[node.kind];
            const isMoving = moving === node.id;
            const isNew = justAdded === node.id;
            const hinted = highlightNodeId === node.id;
            const lifted = drag?.carried.kind === 'program' && drag.carried.id === node.id;
            const state = node.id === errorNodeId ? 'is-error' : node.id === activeNodeId ? 'is-active' : '';
            return (
              <li
                key={node.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(node.id, el);
                  else rowRefs.current.delete(node.id);
                }}
                className={`program-step ${lifted ? 'is-lifted' : ''} ${isMoving ? 'is-moving' : ''}`}
              >
                <span className="step-number" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  ref={(el) => {
                    if (el) cardRefs.current.set(node.id, el);
                    else cardRefs.current.delete(node.id);
                  }}
                  type="button"
                  className={`card card-${node.kind} ${state} ${isMoving ? 'is-carried' : ''} ${isNew ? 'is-new' : ''} ${hinted ? 'is-hinted' : ''}`}
                  aria-label={`Step ${i + 1}: ${info.description}${isMoving ? ', being moved' : ''}${state === 'is-active' ? ', running' : ''}${state === 'is-error' ? ', problem here' : ''}${hinted ? ', the hint points here' : ''}`}
                  title="Tap to put the insert point after this step"
                  data-node-id={node.id}
                  disabled={lockedProp}
                  onClick={() => {
                    setCarrying(null);
                    setCursor(i + 1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      remove(node.id);
                    } else if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      moveByOne(node.id, e.key === 'ArrowUp' ? -1 : 1);
                    }
                  }}
                  {...dragHandlers({ kind: 'program', id: node.id }, false)}
                >
                  <span className="card-icon">{info.icon}</span>
                  <span className="card-text">
                    <span className="card-label">{info.label}</span>
                    {showCode && <code className="card-code">{codeFor(node.kind)}</code>}
                  </span>
                </button>
                {!readOnly && (
                <>
                <button
                  ref={(el) => {
                    if (el) moveRefs.current.set(node.id, el);
                    else moveRefs.current.delete(node.id);
                  }}
                  type="button"
                  className={`btn-icon step-move ${isMoving ? 'is-on' : ''}`}
                  aria-label={`Move step ${i + 1}`}
                  aria-pressed={isMoving}
                  title="Tap to choose a new place, or drag"
                  disabled={locked}
                  onClick={() => toggleMove(node.id)}
                  {...dragHandlers({ kind: 'program', id: node.id })}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                    <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" {...stroke} />
                  </svg>
                </button>
                <button type="button" className="btn-icon step-delete" aria-label={`Remove step ${i + 1}`} title="Remove" disabled={locked} onClick={() => remove(node.id)}>
                  <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                    <path d="M7 10h18M13 10V7h6v3M10 10l1 16h10l1-16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                </>
                )}
              </li>
            );
          })}
          {remaining !== null &&
            !readOnly &&
            Array.from({ length: remaining }, (_, k) => (
              <li key={`empty-${k}`} className={`program-step is-empty ${budgetTone}`} aria-hidden="true">
                <span className="step-number">{body.length + k + 1}</span>
                <span className="empty-step">{body.length === 0 && k === 0 ? (drag ? 'Drop it here' : 'Tap a card to add a step') : ''}</span>
              </li>
            ))}
          {cursorCaret}
          {carets}
          {dropMarker}
        </ol>
        {showCode && (
          <pre className="code-frame code-frame-close" aria-hidden="true">
            {MAIN_CLOSE}
          </pre>
        )}
        {showCode && <p className="code-note">Every card is a real line of TypeScript. Later you can edit it yourself.</p>}
      </section>

      {drag && ghostCommand && (
        <div className="drag-ghost" ref={ghostRef} aria-hidden="true">
          <span className={`card card-${ghostCommand}`}>
            <span className="card-icon">{COMMANDS[ghostCommand].icon}</span>
            <span className="card-text">
              <span className="card-label">{COMMANDS[ghostCommand].label}</span>
              {showCode && <code className="card-code">{codeFor(ghostCommand)}</code>}
            </span>
          </span>
        </div>
      )}
      {drag?.carried.kind === 'cursor' && (
        <div className="drag-ghost" ref={ghostRef} aria-hidden="true">
          <span className="caret cursor is-ghost">
            <Chevron />
          </span>
        </div>
      )}
    </div>
  );
}
