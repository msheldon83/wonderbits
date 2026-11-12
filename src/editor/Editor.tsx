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
 * - Repeat, If, If / else and Repeat until are blocks that hold cards. Each
 *   holds its own list with its own gaps, so the same cursor, carets and
 *   drags work inside them. A Repeat has a count with minus and plus; an If
 *   or Repeat until has a check to choose.
 * - Functions sit under the program, each a heading with its name and its
 *   own list. The palette has one card per function that runs it. A call
 *   goes in the program, never inside a function.
 *
 * Every control is a native button, so keyboard and screen readers work.
 * Enter on Move or on the cursor opens the carets and focuses the first;
 * arrows walk them; Enter places; Escape cancels. Delete on a block removes
 * it, and Shift plus the up and down arrows move it by one.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { IdFactory } from '../ir/ids';
import { isNoOpMove, type EditOp } from '../ir/ops';
import { ancestorsOf, branchesOf, branchBody, callsIn, canCall, containerAt, endOfMain, functionsOf, isWithin, locate, mainBody, memoryOf, procedureOfPlace, samePlaceContainer, slotsInUse, walk } from '../ir/program';
import { buildNodes } from '../ir/spec';
import { functionContainerId, functionLabel, functionOfContainer, handlerContainerId, handlerOfContainer, isSenseId, itemOf, fieldOf, lengthOf, MAIN as MAIN_PROCEDURE, parseRandom, readFrom, REPEAT_DEFAULT, REPEAT_MAX, REPEAT_MIN, type Branch, type CardId, type CommandId, type IRNode, type MemorySlot, type NodeId, type Place, type ProgramIR, type Source } from '../ir/types';
import type { TraceEvent } from '../runtime/contract';
import { cardLabel, COMMANDS, conditionLabel, describeNode, eventLabel, FunctionIcon, nodeLabel, placeWords, sourceWords, valueWords } from './commands';
import { gapCentres, slotForY, type RowBox } from './geometry';
import { OwnNames } from './OwnNames';
import { conditionsFor, defaultCondition, paletteFor, type Programming } from './palette';

export interface EditorProps {
  program: ProgramIR;
  /** The level's allowed commands, budget and quotas. */
  programming: Programming;
  /** True while a run is playing: editing is paused. */
  locked: boolean;
  activeNodeId: NodeId | null;
  /** The trace event playing now, so a Repeat can show which go round it is on and an If its answer. */
  activeEvent?: TraceEvent | null;
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
  highlightCommand?: CardId | null;
  /** A hint is pointing at this step. */
  highlightNodeId?: NodeId | null;
  /** The program as code, shown inside the program panel beside the blocks when showCode is on. */
  codePanel?: ReactNode;
  /** Shown at the top of the program panel, above the cards: the key script on input levels. */
  aboveProgram?: ReactNode;
  showCode?: boolean;
  /** Toggle the code view. The button lives in the program panel's header. */
  onToggleCode?(): void;
  /** The board's gate letters, for Open gate and Shut gate cards to choose from. */
  gates?: readonly string[];
  /** The number each gate's lock opens with, by letter: an Unlock card shows it. */
  gateCodes?: Readonly<Record<string, number>>;
  /** The board's columns and rows, for Go to column and Go to row cards to choose from. */
  boardSize?: { width: number; height: number };
  /** Creation mode: events a new When card may wait for. */
  events?: readonly string[];
  /** The level runs over several days: a new slot may go in the backpack. */
  backpack?: boolean;
  /** What the program panel is called, when not "Program": a maker's "Your solution". */
  programLabel?: string;
  /** One line under the panel's title saying what the program is for. */
  programNote?: string;
  /** The names are someone else's: nothing is added or removed, though every value that fits is still on offer. */
  lockNames?: boolean;
}

/** What is being carried to a gap: a palette card, a program block, or the cursor. */
type Carried = { kind: 'palette'; command: CardId; name?: string } | { kind: 'program'; id: NodeId } | { kind: 'cursor' };


type Focus = { kind: 'card' | 'move'; id: NodeId } | 'palette' | 'caret' | 'cursor' | null;

type Container = Pick<Place, 'parent' | 'branch'>;
const MAIN: Container = { parent: null, branch: 'body' };
const keyOf = (c: Container) => `${c.parent ?? ''}/${c.branch}`;

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
  activeEvent = null,
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
  codePanel,
  aboveProgram,
  showCode = false,
  onToggleCode,
  gates = [],
  boardSize,
  gateCodes = {},
  events = [],
  backpack = false,
  lockNames = false,
  programLabel = 'Program',
  programNote,
}: EditorProps) {
  /** Creation mode: the child adds and removes the program's named parts. */
  const own = programming.ownNames === true && !readOnly && !lockNames;
  const locked = lockedProp || readOnly;
  const body = mainBody(program);
  const palette = paletteFor(programming, program);
  const { full } = palette;
  /** Unused steps under the budget, drawn as empty rows so the space running out is visible. */
  const remaining = palette.max === undefined ? null : Math.max(0, palette.max - palette.used);
  const budgetTone = remaining === null ? '' : remaining === 0 ? 'is-full' : remaining <= 2 ? 'is-low' : '';
  /** Step numbers in document order, blocks included. */
  const numbers = new Map<NodeId, number>();
  for (const v of walk(program)) numbers.set(v.node.id, v.number);
  /** Blocks that hold the running step light up with it, and so do the calls that led into its function. */
  const runningAncestors = activeNodeId ? new Set(ancestorsOf(program, activeNodeId)) : new Set<NodeId>();
  for (const id of activeEvent?.via ?? []) {
    runningAncestors.add(id);
    for (const a of ancestorsOf(program, id)) runningAncestors.add(a);
  }
  /** The function or When card the running step belongs to, if it is in one; a When card also lights while it is being set off. */
  const runningFunction = activeNodeId ? (handlerOfContainer(activeNodeId) !== null ? activeNodeId : (locate(program, activeNodeId)?.procedure ?? null)) : null;
  const functions = functionsOf(program);
  const memory = memoryOf(program);
  const usedSlots = slotsInUse(program);
  /** A slot a Set card can fill: one of a single value, with something on offer to put in it. */
  const settable = (m: MemorySlot) => m.kind !== 'list' && m.kind !== 'grid' && sourcesFor(m.kind, programming, memory).length > 0;
  /** A picker of slots of some kinds, for a memory card. */
  const slotSelect = (label: string, value: string, kinds: readonly string[], onPick: (name: string) => void) => {
    const names = memory.filter((m) => kinds.includes(m.kind)).map((m) => m.name);
    return (
      <select className="param-select" aria-label={label} value={value} disabled={locked} onChange={(e) => onPick(e.target.value)}>
        {(names.includes(value) ? names : [value, ...names]).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    );
  };
  const handlers = program.handlers;
  /** True when a card somewhere calls the function, so it cannot be removed yet. */
  const isCalled = (name: string) => [...walk(program)].some((v) => v.node.kind === 'call' && v.node.name === name);
  /** Functions and When cards: everything listed under the program. */
  const extras = functions.length + handlers.length;

  /** The gap the next card goes into. Clamped, so edits elsewhere never leave it dangling. */
  const [cursorRaw, setCursor] = useState<Place>(() => endOfMain(program));
  const cursor = clampPlace(program, cursorRaw);
  /** What the carets are open for, after a tap on Move or on the cursor. */
  const [carrying, setCarrying] = useState<Carried | null>(null);
  /** The card, block or cursor being dragged, and the gap under the pointer. */
  const [drag, setDrag] = useState<{ carried: Carried; place: Place | null } | null>(null);
  /** Gap centres per container, keyed by container. */
  const [gaps, setGaps] = useState<Map<string, number[]>>(() => new Map([[keyOf(MAIN), [0]]]));
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
  /** One list element per container, keyed by container. */
  const listRefs = useRef(new Map<string, { el: HTMLOListElement; container: Container; depth: number }>());
  const root = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
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
    if (moving && !locate(program, moving)) setCarrying(null);
  }, [moving, program]);

  /** Row boxes of one container in its list's coordinate space, in program order. */
  const rowBoxes = useCallback(
    (container: Container): RowBox[] =>
      (containerAt(program, container) ?? []).map((n) => {
        const el = rowRefs.current.get(n.id);
        return el ? { top: el.offsetTop, height: el.offsetHeight } : { top: 0, height: 0 };
      }),
    [program],
  );

  // Measure the gaps of every list on every change, and again if a list resizes.
  useLayoutEffect(() => {
    const measure = () => {
      const next = new Map<string, number[]>();
      for (const [key, { el, container }] of listRefs.current) {
        const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
        next.set(key, gapCentres(rowBoxes(container), gap));
      }
      setGaps(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    for (const { el } of listRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [rowBoxes, carrying, drag]);

  // Move keyboard focus to whatever was just placed, moved or opened.
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === 'palette') paletteRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    else if (target === 'caret') root.current?.querySelector<HTMLButtonElement>('.caret:not(.cursor)')?.focus();
    else if (target === 'cursor') cursorRef.current?.focus();
    else if (target.kind === 'card') cardRefs.current.get(target.id)?.focus();
    else moveRefs.current.get(target.id)?.focus();
  });

  // ----- Edits -----

  /** A fresh node for a palette card: blocks start with a default count or check and nothing inside. */
  const nodeFor = (command: CardId, name?: string): IRNode => {
    switch (command) {
      case 'call':
        return { id: newId(), kind: 'call', name: name ?? functions[0]?.name ?? MAIN_PROCEDURE };
      case 'set': {
        const slot = memory.find((m) => settable(m));
        return { id: newId(), kind: 'set', slot: slot?.name ?? 'count', to: slot ? (sourcesFor(slot.kind, programming, memory)[0] ?? 0) : 0 };
      }
      case 'change':
        return { id: newId(), kind: 'change', slot: memory.find((m) => m.kind === 'number')?.name ?? 'count', by: 1 };
      case 'face':
        return { id: newId(), kind: 'face', slot: memory.find((m) => m.kind === 'direction')?.name ?? 'way' };
      case 'unlock':
        return { id: newId(), kind: 'unlock', gate: gates[0] ?? 'a', slot: memory.find((m) => m.kind === 'number')?.name ?? 'count' };
      case 'push': {
        const list = memory.find((m) => m.kind === 'list');
        return { id: newId(), kind: 'push', list: list?.name ?? 'list', to: sourcesFor(list?.of ?? 'yesNo', programming, memory)[0] ?? true };
      }
      case 'mark': {
        const grid = memory.find((m) => m.kind === 'grid');
        return { id: newId(), kind: 'mark', grid: grid?.name ?? 'map', at: 'here', slot: memory.find((m) => m.kind === grid?.of)?.name ?? 'count' };
      }
      case 'forEach': {
        const list = memory.find((m) => m.kind === 'list');
        const item = memory.find((m) => m.kind === list?.of);
        return { id: newId(), kind: 'forEach', list: list?.name ?? 'list', item: item?.name ?? 'item', body: [] };
      }
      case 'openGate':
      case 'closeGate':
        return { id: newId(), kind: command, gate: gates[0] ?? 'a' };
      case 'goRow':
      case 'goColumn':
        return { id: newId(), kind: command, to: 0 };
      case 'fly':
        return { id: newId(), kind: 'fly', slot: memory.find((m) => m.kind === 'position')?.name ?? 'bird', column: 0 };
      case 'shift':
        return { id: newId(), kind: 'shift', slot: memory.find((m) => m.kind === 'position')?.name ?? 'spot', dir: 'E' };
      case 'repeat':
        return buildNodes([{ repeat: REPEAT_DEFAULT, do: [] }], newId)[0]!;
      case 'if':
        return buildNodes([{ if: defaultCondition('if', programming), do: [] }], newId)[0]!;
      case 'ifElse':
        return buildNodes([{ if: defaultCondition('ifElse', programming), do: [], else: [] }], newId)[0]!;
      case 'until':
        return buildNodes([{ until: defaultCondition('until', programming), do: [] }], newId)[0]!;
      default:
        return { id: newId(), kind: command as CommandId };
    }
  };

  /** Whether a carried card or block may go into a container: a call goes where a call to that function may. */
  const nested = programming.ownNames === true;
  const fits = (carried: Carried, container: Container): boolean => {
    const called = carried.kind === 'palette' ? (carried.command === 'call' ? [carried.name ?? ''] : []) : carried.kind === 'program' ? callsIn([locate(program, carried.id)?.node ?? { id: '', kind: 'forward' }]) : [];
    const procedure = procedureOfPlace(program, container);
    return called.every((name) => canCall(program, procedure, name, nested));
  };

  const insertAt = (command: CardId, at: Place, focus: Focus, name?: string) => {
    if (full || !fits({ kind: 'palette', command, ...(name && { name }) }, at)) return;
    const node = nodeFor(command, name);
    onEdit({ op: 'insert', at, node });
    setCursor({ ...at, index: at.index + 1 });
    setJustAdded(node.id);
    focusAfter.current = focus;
  };

  /** Tap on a palette card: it goes in at the cursor, and the cursor moves past it. */
  const tapCard = (command: CardId, name?: string) => {
    if (full || locked) return;
    setCarrying(null);
    insertAt(command, cursor, null, name);
  };

  const placeAt = (carried: Carried, to: Place) => {
    if (carried.kind === 'palette') {
      insertAt(carried.command, to, 'cursor', carried.name);
    } else if (carried.kind === 'cursor') {
      setCursor(to);
      focusAfter.current = 'cursor';
    } else {
      if (!isNoOpMove(program, carried.id, to) && fits(carried, to)) onEdit({ op: 'move', id: carried.id, to });
      focusAfter.current = { kind: 'move', id: carried.id };
    }
    setCarrying(null);
  };

  const moveByOne = (id: NodeId, delta: -1 | 1) => {
    const found = locate(program, id);
    if (!found) return;
    const length = containerAt(program, found)?.length ?? 0;
    const target = found.index + delta;
    if (target < 0 || target >= length) return;
    onEdit({ op: 'move', id, to: { parent: found.parent, branch: found.branch, index: delta > 0 ? target + 1 : target } });
    focusAfter.current = { kind: 'card', id };
  };

  const remove = (id: NodeId) => {
    const found = locate(program, id);
    if (!found) return;
    onEdit({ op: 'delete', id });
    if (samePlaceContainer(found, cursor) && found.index < cursor.index) setCursor({ ...cursor, index: cursor.index - 1 });
    else if (cursor.parent !== null && isWithin(program, cursor.parent, id)) setCursor(endOfMain(program));
    const siblings = containerAt(program, found) ?? [];
    const neighbour = siblings[found.index + 1] ?? siblings[found.index - 1];
    focusAfter.current = neighbour ? { kind: 'card', id: neighbour.id } : found.parent && functionOfContainer(found.parent) === null && handlerOfContainer(found.parent) === null ? { kind: 'card', id: found.parent } : 'palette';
    if (moving === id) setCarrying(null);
  };

  const setParam = (id: NodeId, patch: Omit<Extract<EditOp, { op: 'set' }>, 'op' | 'id'>) => {
    onEdit({ op: 'set', id, ...patch });
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

  /** The gap under the pointer: the deepest list the point is over, then the nearest gap in it. */
  const placeUnderPointer = (carried: Carried, clientX: number, clientY: number): Place | null => {
    let best: { container: Container; depth: number; rect: DOMRect } | null = null;
    for (const { el, container, depth } of listRefs.current.values()) {
      // A block cannot be dropped into itself.
      if (carried.kind === 'program' && container.parent !== null && isWithin(program, container.parent, carried.id)) continue;
      // A call cannot be dropped into a function.
      if (!fits(carried, container)) continue;
      const rect = el.getBoundingClientRect();
      const margin = depth === 0 ? 40 : 8;
      const inside =
        clientY >= rect.top - margin && clientY <= rect.bottom + margin && (depth === 0 || (clientX >= rect.left - margin && clientX <= rect.right + margin));
      if (inside && (!best || depth >= best.depth)) best = { container, depth, rect };
    }
    if (!best) return null;
    return { ...best.container, index: slotForY(rowBoxes(best.container), clientY - best.rect.top) };
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
      setDrag({ carried: p.carried, place: placeUnderPointer(p.carried, e.clientX, e.clientY) });
    } else {
      const place = placeUnderPointer(p.carried, e.clientX, e.clientY);
      setDrag((d) => (d && !samePlace(d.place, place) ? { ...d, place } : d));
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
    const place = drop ? placeUnderPointer(p.carried, e.clientX, e.clientY) : null;
    setDrag(null);
    if (place !== null) placeAt(p.carried, place);
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
  const walkKeys = (e: KeyboardEvent) => {
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
        : el.querySelectorAll<HTMLButtonElement>(carrying ? '.caret:not(.cursor)' : '.program-step > .step-row > .card:not([disabled])'),
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
    walkKeys(e);
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

  /** Words for a gap: "before step 3", "at the end", "inside step 2 at the end", "in Hop at the end". */
  const gapLabel = (place: Place) => {
    const cards = containerAt(program, place) ?? [];
    const where = place.index >= cards.length ? 'at the end' : `before step ${numbers.get(cards[place.index]!.id)}`;
    if (place.parent === null) return where;
    const fn = functionOfContainer(place.parent);
    if (fn !== null) return `in ${functionLabel(fn)} ${where}`;
    const event = handlerOfContainer(place.parent);
    if (event !== null) return `in "${eventLabel(event)}" ${where}`;
    const inside = place.branch === 'else' ? `in the else part of step ${numbers.get(place.parent)}` : `inside step ${numbers.get(place.parent)}`;
    return `${inside} ${where}`;
  };
  const carriedNode = carrying?.kind === 'program' ? locate(program, carrying.id)?.node : undefined;
  const carriedName =
    carrying?.kind === 'cursor'
      ? 'the insert point'
      : carrying?.kind === 'palette'
        ? cardLabel(carrying.command, carrying.name)
        : carriedNode
          ? nodeLabel(carriedNode)
          : '';
  const isNoOp = (carried: Carried, place: Place) =>
    carried.kind === 'program' ? isNoOpMove(program, carried.id, place) : carried.kind === 'cursor' ? samePlace(place, cursor) : false;
  /** Carets never offer the inside of the block being moved. */
  const offersGaps = (container: Container) =>
    !(carrying?.kind === 'program' && container.parent !== null && isWithin(program, container.parent, carrying.id)) && (!carrying || fits(carrying, container));

  const ghostNode = drag?.carried.kind === 'program' ? locate(program, drag.carried.id)?.node : undefined;
  const ghost: { kind: CardId; label: string } | undefined =
    drag?.carried.kind === 'palette'
      ? { kind: drag.carried.command, label: cardLabel(drag.carried.command, drag.carried.name) }
      : ghostNode
        ? { kind: ghostNode.kind, label: nodeLabel(ghostNode) }
        : undefined;

  /** The steps of one container, with the carets, cursor and drop marker that belong to it. */
  const renderList = (container: Container, depth: number): ReactNode => {
    const cards = containerAt(program, container) ?? [];
    const key = keyOf(container);
    const centres = gaps.get(key) ?? [0];
    const isMain = container.parent === null;
    const fn = functionOfContainer(container.parent);
    const event = handlerOfContainer(container.parent);

    const carets =
      carrying &&
      offersGaps(container) &&
      centres.map((y, index) => {
        const place = { ...container, index };
        return isNoOp(carrying, place) ? null : (
          <button key={`caret-${index}`} type="button" className="caret" style={{ top: y }} onClick={() => placeAt(carrying, place)} aria-label={`Put ${carriedName} ${gapLabel(place)}`}>
            <Chevron />
          </button>
        );
      });

    const dropPlace = drag?.place ?? null;
    const dropMarker = drag && dropPlace && samePlaceContainer(dropPlace, container) && !isNoOp(drag.carried, dropPlace) && (
      <span className="caret is-target" style={{ top: centres[dropPlace.index] ?? 0 }} aria-hidden="true">
        <Chevron />
      </span>
    );

    const showCursor = !locked && !readOnly && carrying === null && drag?.carried.kind !== 'cursor' && samePlaceContainer(cursor, container);
    const cursorCaret = samePlaceContainer(cursor, container) && (
      <button
        ref={cursorRef}
        type="button"
        className={`caret cursor ${showCursor ? '' : 'is-hidden'}`}
        style={{ top: centres[cursor.index] ?? 0 }}
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

    return (
      <ol
        className={`program-list ${isMain ? '' : 'is-nested'} ${carrying ? 'is-moving' : ''}`}
        ref={(el) => {
          if (el) listRefs.current.set(key, { el, container, depth });
          else listRefs.current.delete(key);
        }}
      >
        {cards.length === 0 && isMain && remaining === null && extras === 0 && (
          <li className="slot-empty" aria-hidden="true">
            <span>{drag ? 'Drop it here' : 'Tap an instruction to add a step'}</span>
          </li>
        )}
        {/* With functions below, an empty program needs its own spot to tap, so new cards can come back here. */}
        {cards.length === 0 && isMain && extras > 0 && (
          <li className="slot-empty is-nested">
            {readOnly ? (
              <span aria-hidden="true">Nothing in the program</span>
            ) : (
              <button
                type="button"
                className="slot-empty-button"
                disabled={locked}
                aria-label="Nothing in the program yet. Tap to put the insert point here"
                onClick={() => {
                  setCarrying(null);
                  setCursor({ ...container, index: 0 });
                }}
              >
                {drag ? 'Drop it here' : 'Tap here, then an instruction'}
              </button>
            )}
          </li>
        )}
        {cards.length === 0 && !isMain && (
          <li className="slot-empty is-nested">
            {readOnly ? (
              <span aria-hidden="true">Nothing inside</span>
            ) : (
              <button
                type="button"
                className="slot-empty-button"
                disabled={locked}
                aria-label={
                  fn !== null || event !== null
                    ? `Nothing in ${fn !== null ? functionLabel(fn) : `"${eventLabel(event!)}"`} yet. Tap to put the insert point here`
                    : `Nothing ${container.branch === 'else' ? 'in the else part of' : 'inside'} step ${numbers.get(container.parent!)}. Tap to put the insert point here`
                }
                onClick={() => {
                  setCarrying(null);
                  setCursor({ ...container, index: 0 });
                }}
              >
                {drag ? 'Drop it here' : 'Put cards here'}
              </button>
            )}
          </li>
        )}
        {/* Carets come first so keyboard focus walks this list's gaps before any nested list's. */}
        {cursorCaret}
        {carets}
        {dropMarker}
        {cards.map((node) => renderStep(node, depth))}
        {/* Spare rows show the budget running out. With functions, the count in the header does, so the functions stay in view. */}
        {isMain &&
          remaining !== null &&
          !readOnly &&
          extras === 0 &&
          Array.from({ length: remaining }, (_, k) => (
            <li key={`empty-${k}`} className={`program-step is-empty ${budgetTone}`} aria-hidden="true">
              <span className="step-number">{palette.used + k + 1}</span>
              <span className="empty-step">{palette.used === 0 && k === 0 ? (drag ? 'Drop it here' : 'Tap an instruction to add a step') : ''}</span>
            </li>
          ))}
      </ol>
    );
  };

  /** One step: a card, or a block with its own list (or two) underneath. */
  const renderStep = (node: IRNode, depth: number): ReactNode => {
    const info = COMMANDS[node.kind];
    const label = nodeLabel(node);
    const number = numbers.get(node.id) ?? 0;
    const isMoving = moving === node.id;
    const isNew = justAdded === node.id;
    const hinted = highlightNodeId === node.id;
    const lifted = drag?.carried.kind === 'program' && drag.carried.id === node.id;
    const state = node.id === errorNodeId ? 'is-error' : node.id === activeNodeId ? 'is-active' : runningAncestors.has(node.id) ? 'is-running' : '';
    const words = describeNode(node);
    const branches = branchesOf(node);
    const isBlock = branches.length > 0;
    /** Live words on a running block: which go round, or the answer to its check. */
    const live =
      activeEvent && activeEvent.nodeId === node.id
        ? activeEvent.op === 'loop'
          ? `${activeEvent.iteration} of ${activeEvent.count}`
          : activeEvent.op === 'check'
            ? activeEvent.value
              ? 'yes'
              : 'no'
            : null
        : null;
    return (
      <li
        key={node.id}
        ref={(el) => {
          if (el) rowRefs.current.set(node.id, el);
          else rowRefs.current.delete(node.id);
        }}
        className={`program-step ${isBlock ? 'is-block' : ''} ${lifted ? 'is-lifted' : ''} ${isMoving ? 'is-moving' : ''}`}
      >
        <div className="step-row">
          <span className="step-number" aria-hidden="true">
            {number}
          </span>
          <button
            ref={(el) => {
              if (el) cardRefs.current.set(node.id, el);
              else cardRefs.current.delete(node.id);
            }}
            type="button"
            className={`card card-${node.kind} ${state} ${isMoving ? 'is-carried' : ''} ${isNew ? 'is-new' : ''} ${hinted ? 'is-hinted' : ''}`}
            aria-label={`Step ${number}: ${words}${isMoving ? ', being moved' : ''}${state === 'is-active' ? ', running' : ''}${state === 'is-error' ? ', problem here' : ''}${hinted ? ', the hint points here' : ''}`}
            title={isBlock ? 'Tap to put the insert point inside this block' : 'Tap to put the insert point after this step'}
            data-node-id={node.id}
            disabled={lockedProp}
            onClick={() => {
              setCarrying(null);
              // A block opens up: the next card goes inside it. A plain step: after it.
              if (isBlock) setCursor({ parent: node.id, branch: 'body', index: branchBody(node, 'body')!.length });
              else {
                const found = locate(program, node.id);
                if (found) setCursor({ parent: found.parent, branch: found.branch, index: found.index + 1 });
              }
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
            <span className="card-label">{label}</span>
            {live && (
              <span className="card-live" aria-live="polite">
                {live}
              </span>
            )}
          </button>
          {node.kind === 'repeat' && (
            <span className="block-param block-count" role="group" aria-label={`Count, step ${number}`}>
              <button type="button" className="btn-icon param-step" aria-label={`Fewer times, step ${number}`} disabled={locked || node.count <= REPEAT_MIN} onClick={() => setParam(node.id, { count: node.count - 1 })}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M6 12h12" {...stroke} strokeWidth={3.4} />
                </svg>
              </button>
              <span className="param-value" aria-live="polite">
                {node.count} times
              </span>
              <button type="button" className="btn-icon param-step" aria-label={`More times, step ${number}`} disabled={locked || node.count >= REPEAT_MAX} onClick={() => setParam(node.id, { count: node.count + 1 })}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M6 12h12M12 6v12" {...stroke} strokeWidth={3.4} />
                </svg>
              </button>
            </span>
          )}
          {node.kind === 'set' && (
            <span className="block-param block-condition">
              {slotSelect(`Which slot, step ${number}`, node.slot, [...new Set(memory.filter(settable).map((m) => m.kind))], (slot) => {
                const kind = memory.find((m) => m.name === slot)?.kind ?? 'number';
                setParam(node.id, { slot, to: sourcesFor(kind, programming, memory)[0] ?? 0 });
              })}
              <span className="param-word param-eq" aria-hidden="true">
                =
              </span>
              <select
                className="param-select"
                aria-label={`Set it to what, step ${number}`}
                value={JSON.stringify(node.to)}
                disabled={locked}
                onChange={(e) => setParam(node.id, { to: JSON.parse(e.target.value) as Source })}
              >
                {(() => {
                  const options = sourcesFor(memory.find((m) => m.name === node.slot)?.kind ?? 'number', programming, memory);
                  return (options.some((o) => o === node.to) ? options : [node.to, ...options]).map((o) => (
                    <option key={JSON.stringify(o)} value={JSON.stringify(o)}>
                      {sourceWords(o)}
                    </option>
                  ));
                })()}
              </select>
            </span>
          )}
          {node.kind === 'change' && (
            <span className="block-param block-condition">
              <select className="param-select" aria-label={`How much, step ${number}`} value={node.by} disabled={locked} onChange={(e) => setParam(node.id, { by: Number(e.target.value) })}>
                {[...new Set([node.by, 1, 2, -1])].map((b) => (
                  <option key={b} value={b}>
                    {b > 0 ? `+${b}` : `−${-b}`}
                  </option>
                ))}
              </select>
              {slotSelect(`To which slot, step ${number}`, node.slot, ['number'], (slot) => setParam(node.id, { slot }))}
            </span>
          )}
          {node.kind === 'push' && (
            <span className="block-param block-condition">
              <select
                className="param-select"
                aria-label={`Add what, step ${number}`}
                value={JSON.stringify(node.to)}
                disabled={locked}
                onChange={(e) => setParam(node.id, { to: JSON.parse(e.target.value) as Source })}
              >
                {(() => {
                  const options = sourcesFor(memory.find((m) => m.name === node.list)?.of ?? 'yesNo', programming, memory);
                  return (options.some((o) => o === node.to) ? options : [node.to, ...options]).map((o) => (
                    <option key={JSON.stringify(o)} value={JSON.stringify(o)}>
                      {sourceWords(o)}
                    </option>
                  ));
                })()}
              </select>
              <span className="param-word">to</span>
              {slotSelect(`To which list, step ${number}`, node.list, ['list'], (list) => {
                const of = memory.find((m) => m.name === list)?.of ?? 'yesNo';
                setParam(node.id, { list, to: sourcesFor(of, programming, memory)[0] ?? true });
              })}
            </span>
          )}
          {node.kind === 'mark' && (
            <span className="block-param block-condition">
              {slotSelect(`Which value, step ${number}`, node.slot, [memory.find((m) => m.name === node.grid)?.of ?? 'number'], (slot) => setParam(node.id, { slot }))}
              <span className="param-word">on</span>
              {slotSelect(`On which grid, step ${number}`, node.grid, ['grid'], (grid) => setParam(node.id, { grid }))}
              <select className="param-select" aria-label={`Where on the grid, step ${number}`} value={node.at} disabled={locked} onChange={(e) => setParam(node.id, { at: e.target.value })}>
                {['here', 'ahead', ...memory.filter((m) => m.kind === 'position').map((m) => m.name)].map((at) => (
                  <option key={at} value={at}>
                    {placeWords(at)}
                  </option>
                ))}
              </select>
            </span>
          )}
          {(node.kind === 'goRow' || node.kind === 'goColumn') && (
            <span className="block-param block-condition">
              <select
                className="param-select"
                aria-label={`Which ${node.kind === 'goRow' ? 'row' : 'column'}, step ${number}`}
                value={JSON.stringify(node.to)}
                disabled={locked}
                onChange={(e) => setParam(node.id, { target: JSON.parse(e.target.value) as number | string })}
              >
                {(() => {
                  const size = node.kind === 'goRow' ? (boardSize?.height ?? 8) : (boardSize?.width ?? 8);
                  const options: (number | string)[] = [...Array.from({ length: size }, (_, i) => i), ...memory.filter((m) => m.kind === 'number').map((m) => m.name)];
                  return (options.includes(node.to) ? options : [node.to, ...options]).map((o) => (
                    <option key={String(o)} value={JSON.stringify(o)}>
                      {o}
                    </option>
                  ));
                })()}
              </select>
            </span>
          )}
          {node.kind === 'fly' && (
            <span className="block-param block-condition">
              {(['column', 'row'] as const).map((axis) => {
                const value = node[axis];
                const size = axis === 'row' ? (boardSize?.height ?? 8) : (boardSize?.width ?? 8);
                const options: (number | string)[] = [...Array.from({ length: size }, (_, i) => i), ...memory.filter((m) => m.kind === 'number').map((m) => m.name)];
                const other = axis === 'row' ? node.column : node.row;
                return (
                  <span key={axis} className="block-param">
                    <span className="param-word">{axis}</span>
                    <select
                      className="param-select"
                      aria-label={`Which ${axis} to fly to, step ${number}`}
                      value={value === undefined ? 'stay' : JSON.stringify(value)}
                      disabled={locked}
                      onChange={(e) => setParam(node.id, { [axis]: e.target.value === 'stay' ? null : (JSON.parse(e.target.value) as number | string) })}
                    >
                      {/* A coordinate left as it is: only while the other one is set. */}
                      {(value === undefined || other !== undefined) && <option value="stay">stay</option>}
                      {(value === undefined || options.includes(value) ? options : [value, ...options]).map((o) => (
                        <option key={String(o)} value={JSON.stringify(o)}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </span>
                );
              })}
            </span>
          )}
          {node.kind === 'shift' && (
            <span className="block-param block-condition">
              {slotSelect(`Which place, step ${number}`, node.slot, ['position'], (slot) => setParam(node.id, { slot }))}
              <select className="param-select" aria-label={`Which way, step ${number}`} value={node.dir} disabled={locked} onChange={(e) => setParam(node.id, { dir: e.target.value as 'N' | 'E' | 'S' | 'W' })}>
                {(['N', 'E', 'S', 'W'] as const).map((d) => (
                  <option key={d} value={d}>
                    {valueWords(d)}
                  </option>
                ))}
              </select>
            </span>
          )}
          {node.kind === 'face' && <span className="block-param block-condition">{slotSelect(`Which slot, step ${number}`, node.slot, ['direction'], (slot) => setParam(node.id, { slot }))}</span>}
          {node.kind === 'unlock' && (
            <span className="block-param block-condition">
              <select className="param-select" aria-label={`Which gate, step ${number}`} value={node.gate} disabled={locked} onChange={(e) => setParam(node.id, { gate: e.target.value })}>
                {(gates.includes(node.gate) ? gates : [node.gate, ...gates]).map((g) => (
                  <option key={g} value={g}>
                    {g.toUpperCase()}
                  </option>
                ))}
              </select>
              <span className="param-word">when</span>
              {slotSelect(`With which slot, step ${number}`, node.slot, ['number'], (slot) => setParam(node.id, { slot }))}
              {/* The lock's own number: the gate opens only when the slot holds it. */}
              {gateCodes[node.gate] !== undefined && (
                <>
                  <span className="param-word param-eq" aria-hidden="true">
                    =
                  </span>
                  <span className="param-code" title={`Gate ${node.gate.toUpperCase()} opens with ${gateCodes[node.gate]}`}>
                    {gateCodes[node.gate]}
                  </span>
                </>
              )}
            </span>
          )}
          {node.kind === 'forEach' && (
            <span className="block-param block-condition">
              {slotSelect(`Which item slot, step ${number}`, node.item, [memory.find((m) => m.name === node.list)?.of ?? 'number'], (item) => setParam(node.id, { item }))}
              <span className="param-word">in</span>
              {slotSelect(`Which list, step ${number}`, node.list, ['list'], (list) => setParam(node.id, { list }))}
            </span>
          )}
          {(node.kind === 'openGate' || node.kind === 'closeGate') && (
            <span className="block-param block-condition">
              <select className="param-select" aria-label={`Which gate, step ${number}`} value={node.gate} disabled={locked} onChange={(e) => setParam(node.id, { gate: e.target.value })}>
                {(gates.includes(node.gate) ? gates : [node.gate, ...gates]).map((g) => (
                  <option key={g} value={g}>
                    {g.toUpperCase()}
                  </option>
                ))}
              </select>
            </span>
          )}
          {(node.kind === 'if' || node.kind === 'ifElse' || node.kind === 'until') && (
            <span className="block-param block-condition">
              <select
                className="param-select"
                aria-label={`What to check, step ${number}`}
                value={node.condition}
                disabled={locked}
                onChange={(e) => setParam(node.id, { condition: e.target.value as IRNode extends { condition: infer C } ? C : never })}
              >
                {[...new Set([...conditionsFor(programming, memory), node.condition])].map((c) => (
                  <option key={c} value={c}>
                    {conditionLabel(c)}
                  </option>
                ))}
              </select>
            </span>
          )}
          {!readOnly && (
            <>
              <button
                ref={(el) => {
                  if (el) moveRefs.current.set(node.id, el);
                  else moveRefs.current.delete(node.id);
                }}
                type="button"
                className={`btn-icon step-move ${isMoving ? 'is-on' : ''}`}
                aria-label={`Move step ${number}`}
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
              <button type="button" className="btn-icon step-delete" aria-label={`Remove step ${number}`} title="Remove" disabled={locked} onClick={() => remove(node.id)}>
                <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                  <path d="M7 10h18M13 10V7h6v3M10 10l1 16h10l1-16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>
        {branches.map((branch: Branch) => (
          <div key={branch} className={`block-body block-${branch}`}>
            {branch === 'else' &&
              (readOnly ? (
                <span className="block-else-label" aria-hidden="true">
                  else
                </span>
              ) : (
                <button
                  type="button"
                  className="block-else-label"
                  disabled={locked}
                  aria-label={`Else part of step ${number}. Tap to put the insert point here`}
                  title="Tap to put the insert point in the else part"
                  onClick={() => {
                    setCarrying(null);
                    setCursor({ parent: node.id, branch: 'else', index: node.kind === 'ifElse' ? node.elseBody.length : 0 });
                  }}
                >
                  else
                </button>
              ))}
            {renderList({ parent: node.id, branch }, depth + 1)}
          </div>
        ))}
      </li>
    );
  };

  /** The robot's memory: its slots as typed chips, and on budget levels a way to choose which to keep. */
  const renderMemory = () => {
    const options = (programming.memoryOptions ?? []).filter((o) => !memory.some((m) => m.name === o.name));
    const budget = programming.maxMemory;
    const atBudget = budget !== undefined && memory.length >= budget;
    return (
      <section className="memory-slots" aria-label="The robot's memory">
        <h3 className="memory-slots-title">
          Memory
          {budget !== undefined && (
            <span className={`capacity ${atBudget ? 'is-full' : ''}`}>
              {' '}
              {memory.length} of {budget} slots
            </span>
          )}
        </h3>
        <ul className="memory-chips">
          {memory.map((m) => {
            const inUse = usedSlots.has(m.name);
            return (
              <li key={m.name} className={`memory-chip kind-${m.kind}`}>
                <code>
                  {m.name}: {kindWords(m)}
                </code>
                {(programming.memoryOptions || own) && !readOnly && (
                  <button
                    type="button"
                    className="btn-icon memory-forget"
                    aria-label={inUse ? `${m.name} is used by a card, so it cannot be forgotten` : `Forget ${m.name}`}
                    title={inUse ? 'Remove the cards that use it first' : 'Forget this slot'}
                    disabled={locked || inUse}
                    onClick={() => onEdit({ op: 'removeSlot', name: m.name })}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
          {memory.length === 0 && <li className="memory-chip is-empty">Nothing remembered yet</li>}
        </ul>
        {!readOnly && options.length > 0 && (
          <label className="memory-add">
            <span>Remember</span>
            <select
              className="param-select"
              aria-label={atBudget ? 'Memory is full. Forget a slot to remember another' : 'Choose a slot to remember'}
              value=""
              disabled={locked || atBudget}
              onChange={(e) => {
                const slot = options.find((o) => o.name === e.target.value);
                if (slot) onEdit({ op: 'addSlot', slot });
              }}
            >
              <option value="">{atBudget ? 'memory full' : 'choose…'}</option>
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name}: {kindWords(o)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
    );
  };

  return (
    <div className={`editor ${drag ? 'is-dragging' : ''} ${readOnly ? 'is-readonly' : ''}`} ref={root} onKeyDown={onKeyDown}>
      {!readOnly && (
        <section className="palette" aria-label="Instructions">
          <h2 className="panel-title">
            <span className="panel-title-text">
              Instructions
              {palette.used > 0 && !(cursor.parent === null && cursor.index >= body.length) && <span className="palette-hint">next goes {gapLabel(cursor)}</span>}
            </span>
          </h2>
          <div className="palette-cards" ref={paletteRef}>
            {palette.entries.map(({ command, name, remaining, available, needs }) => {
              const info = COMMANDS[command];
              const label = cardLabel(command, name);
              const quota = remaining !== null ? `, ${remaining} left` : '';
              /** A call cannot go inside a function, so its card rests while the insert point is in one. */
              const resting = command === 'call' && !fits({ kind: 'palette', command, ...(name && { name }) }, cursor);
              const description = command === 'call' ? `${label}: run the cards of ${label}${resting ? (nested ? '. A function cannot use itself' : '. It goes in the program, not inside a function') : ''}` : info.description;
              return (
                <button
                  key={`${command}${name ? `:${name}` : ''}`}
                  type="button"
                  className={`card card-${command} ${drag?.carried.kind === 'palette' && drag.carried.command === command && drag.carried.name === name ? 'is-lifted' : ''} ${highlightCommand === command ? 'is-hinted' : ''}`}
                  aria-label={`Add ${description}${quota}${needs ? `. Remember ${needs} first` : ''}${highlightCommand === command ? ', the hint points here' : ''}`}
                  title={needs ? `Remember ${needs} first, under Memory` : resting ? (nested ? 'A function cannot use itself, even by way of another' : 'Put the insert point in the program to use this card') : 'Tap to add at the insert point, or drag into the program'}
                  disabled={locked || !available || resting}
                  onClick={() => tapCard(command, name)}
                  {...dragHandlers({ kind: 'palette', command, ...(name && { name }) })}
                >
                  <span className="card-icon">{info.icon}</span>
                  <span className="card-label">{label}</span>
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

      <section className="program" aria-label={programLabel === 'Program' ? 'Your program' : programLabel}>
        <h2 className="panel-title">
          <span className="panel-title-text">
            {programLabel}
            {palette.max !== undefined && (
              <span className={`capacity ${budgetTone}`} role="status">
                {palette.used} of {palette.max} steps
                {remaining !== null && remaining > 0 && remaining <= 2 && <span className="capacity-left"> · {remaining} left</span>}
              </span>
            )}
          </span>
          <span className="program-tools">
            {onToggleCode && (
              <button
                type="button"
                className={`btn-icon btn-code ${showCode ? 'is-on' : ''}`}
                aria-pressed={showCode}
                aria-label={showCode ? 'Hide code' : 'See code'}
                onClick={onToggleCode}
                aria-keyshortcuts="C"
                title={showCode ? 'Hide the code' : 'See the same program written in TypeScript beside the blocks'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" {...stroke} />
                </svg>
              </button>
            )}
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
        {programNote && <p className="program-purpose">{programNote}</p>}
        <div className={`program-body ${codePanel && showCode ? 'has-code' : ''}`}>
          <div className="program-blocks">
            {aboveProgram}
            {carrying && (
              <p className="program-note" role="status">
                Tap an arrow to put {carriedName} there.
              </p>
            )}
            {/* Choosing which slots to keep, on budget levels. The slots themselves show on the memory card above. */}
            {(programming.memoryOptions || (own && memory.length > 0)) && !readOnly && renderMemory()}
            {renderList(MAIN, 0)}
            {functions.map((f) => {
              const container: Container = { parent: functionContainerId(f.name), branch: 'body' };
              const label = functionLabel(f.name);
              const head = (
                <>
                  <span className="card-icon">
                    <FunctionIcon />
                  </span>
                  <span>{label}</span>
                  <span className="function-kicker">Function</span>
                </>
              );
              return (
                <section key={f.name} className={`function-def ${runningFunction === f.name ? 'is-running' : ''}`} aria-label={`Function ${label}: the cards ${label} runs`}>
                  {readOnly ? (
                    <h3 className="function-head">{head}</h3>
                  ) : (
                    <button
                      type="button"
                      className="function-head"
                      disabled={locked}
                      aria-label={`Function ${label}. Tap to put the insert point at the end of ${label}`}
                      title={`Tap to add cards to ${label}`}
                      onClick={() => {
                        setCarrying(null);
                        setCursor({ ...container, index: f.body.length });
                      }}
                    >
                      {head}
                    </button>
                  )}
                  {own && (
                    <button
                      type="button"
                      className="btn-icon own-remove"
                      disabled={locked || isCalled(f.name)}
                      aria-label={isCalled(f.name) ? `${label} is used by a card, so it cannot be removed` : `Remove the function ${label}`}
                      title={isCalled(f.name) ? 'Remove the cards that use it first' : 'Remove this function'}
                      onClick={() => onEdit({ op: 'removeFunction', name: f.name })}
                    >
                      ×
                    </button>
                  )}
                  <div className="function-body">{renderList(container, 1)}</div>
                </section>
              );
            })}
            {handlers.map((h) => {
              const container: Container = { parent: handlerContainerId(h.event), branch: 'body' };
              const label = eventLabel(h.event);
              const head = (
                <>
                  <span className="card-icon">
                    <WhenIcon />
                  </span>
                  <span>{label}</span>
                </>
              );
              return (
                <section key={h.event} className={`function-def handler-def ${runningFunction === container.parent ? 'is-running' : ''}`} aria-label={`${label}: the cards that run then`}>
                  {readOnly ? (
                    <h3 className="function-head">{head}</h3>
                  ) : (
                    <button
                      type="button"
                      className="function-head"
                      disabled={locked}
                      aria-label={`${label}. Tap to put the insert point at the end of this When card`}
                      title="Tap to add cards to this When card"
                      onClick={() => {
                        setCarrying(null);
                        setCursor({ ...container, index: h.body.length });
                      }}
                    >
                      {head}
                    </button>
                  )}
                  {own && (
                    <button type="button" className="btn-icon own-remove" disabled={locked} aria-label={`Remove the card ${label}`} title="Remove this When card and the cards in it" onClick={() => onEdit({ op: 'removeHandler', event: h.event })}>
                      ×
                    </button>
                  )}
                  <div className="function-body">{renderList(container, 1)}</div>
                </section>
              );
            })}
            {own && <OwnNames program={program} locked={locked} onEdit={onEdit} events={events} backpack={backpack} />}
          </div>
          {codePanel && showCode && <div className="program-code">{codePanel}</div>}
        </div>
      </section>

      {drag && ghost && (
        <div className="drag-ghost" ref={ghostRef} aria-hidden="true">
          <span className={`card card-${ghost.kind}`}>
            <span className="card-icon">{COMMANDS[ghost.kind].icon}</span>
            <span className="card-label">{ghost.label}</span>
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

const KIND_WORDS: Record<string, string> = { number: 'number', yesNo: 'yes/no', direction: 'direction', position: 'place', list: 'list', grid: 'grid', record: 'record' };
/** A slot's kind in words: "number", "list of yes/no", "grid of numbers". */
const kindWords = (m: MemorySlot) =>
  (m.kind === 'record' ? (m.shape ?? 'record') : m.kind === 'list' && m.of === 'record' ? `list of ${m.shape ?? 'record'}` : m.kind === 'list' || m.kind === 'grid' ? `${m.kind} of ${KIND_WORDS[m.of ?? 'number']}` : KIND_WORDS[m.kind]) + (m.keep ? ', in the backpack' : '');

/** The values a Set card may put in a slot of a kind: the level's allowed sources, or every one that fits. */
function sourcesFor(kind: string, programming: Programming, memory: readonly MemorySlot[] = []): Source[] {
  // Reading a grid gives an item of the grid's kind: here, ahead, or at a remembered place.
  const places = ['here', 'ahead', ...memory.filter((m) => m.kind === 'position').map((m) => m.name)];
  const reads = memory.filter((m) => m.kind === 'grid' && m.of === kind).flatMap((g) => places.map((at) => readFrom(g.name, at)));
  // How many items a list holds is a number.
  const lengths = kind === 'number' ? memory.filter((m) => m.kind === 'list').map((m) => lengthOf(m.name)) : [];
  // An item of a list, by its index from 0: a number, or a number slot's value.
  const indices: (number | string)[] = [0, 1, 2, 3, ...memory.filter((m) => m.kind === 'number').map((m) => m.name)];
  const items = memory.filter((m) => m.kind === 'list' && (m.of ?? 'number') === kind).flatMap((l) => indices.map((i) => itemOf(l.name, i)));
  // A field of a record slot, of the kind wanted: crate.number.
  const fields = memory.filter((m) => m.kind === 'record').flatMap((r) => Object.entries(r.fields ?? {}).flatMap(([f, k]) => (k === kind ? [fieldOf(r.name, f)] : [])));
  // Where the child names the memory, every value that fits is on offer; the listed sources (random, the bird) add to them.
  if (programming.ownNames) {
    const { allowedSources: extra, ...open } = programming;
    const extras = (extra ?? []).length > 0 ? ownSources(kind, programming, memory) : [];
    return [...new Set([...ownSources(kind, open, memory), ...reads, ...lengths, ...fields, ...items, ...extras])];
  }
  // Items only show where the level offers them, so earlier list levels keep their short menus.
  return [
    ...ownSources(kind, programming, memory),
    ...[...reads, ...lengths, ...fields].filter((r) => !programming.allowedSources || programming.allowedSources.includes(r)),
    ...items.filter((r) => programming.allowedSources?.includes(r)),
  ];
}

function ownSources(kind: string, programming: Programming, memory: readonly MemorySlot[]): Source[] {
  const all: Record<string, Source[]> = {
    number: programming.ownNames ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'acorns'] : [0, 1, 2, 3, 'acorns'],
    yesNo: [true, false, ...conditionsFor(programming).filter(isSenseId)],
    direction: ['N', 'E', 'S', 'W', 'facing'],
    position: ['here'],
  };
  const fits = all[kind] ?? [];
  const allowed = programming.allowedSources;
  if (!allowed) return fits;
  // A random source gives a number, a yes or no, or a way; a pick from a list gives one of its items.
  const randomKind = (a: Source): string | undefined => {
    const r = parseRandom(a);
    if (!r) return undefined;
    if (r.kind === 'range') return 'number';
    if (r.kind === 'coin') return 'yesNo';
    if (r.kind === 'way') return 'direction';
    return memory.find((m) => m.name === r.list)?.of ?? 'number';
  };
  return allowed.filter((a) => (parseRandom(a) ? randomKind(a) === kind : kind === 'number' ? typeof a === 'number' || a === 'acorns' || a === 'acornsLeft' : fits.includes(a)));
}

/** A lightning bolt: something happens, and a When card answers. */
function WhenIcon() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path d="M18 4 8 18h8l-2 10 10-14h-8z" fill="currentColor" />
    </svg>
  );
}

/** Keep a place inside the program: a container that is gone falls back to the end of main. */
function clampPlace(program: ProgramIR, place: Place): Place {
  const cards = containerAt(program, place);
  if (!cards) return endOfMain(program);
  return place.index > cards.length ? { ...place, index: cards.length } : place;
}

function samePlace(a: Place | null, b: Place | null): boolean {
  if (a === null || b === null) return a === b;
  return samePlaceContainer(a, b) && a.index === b.index;
}
