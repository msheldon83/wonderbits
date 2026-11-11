/**
 * The memory card: a strip under the board listing what the world holds
 * right now, one line per thing, each with an icon for its kind. On a model
 * level the lines the child must predict become questions: which way, how
 * many, open or shut. Values come from the trace state, so the card always
 * matches the board.
 */
import type { ReactElement } from 'react';
import { valueWords } from '../editor/commands';
import type { MemorySlot, Value } from '../ir/types';
import { describeValue, FACING_WORDS, gateOfField, memoryLines, memoryValue, slotOfField, type MemoryKind, type MemoryLine } from '../lessons/memory';
import type { MemoryField, MemoryValue } from '../lessons/types';
import { gateColor } from '../render/themes';
import { FACINGS, type Facing, type SimState, type WorldDefinition } from '../sim/types';
import { gatesOf } from '../sim/world';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** One small icon per kind of value, the same everywhere the kind appears. */
const KIND_ICON: Record<MemoryKind, ReactElement> = {
  position: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z" {...stroke} />
      <circle cx="12" cy="10.5" r="2.2" fill="currentColor" />
    </svg>
  ),
  direction: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 6l3 7h-6z" fill="currentColor" />
    </svg>
  ),
  number: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" {...stroke} />
    </svg>
  ),
  yesNo: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="2.5" y="7" width="19" height="10" rx="5" {...stroke} />
      <circle cx="16.5" cy="12" r="3" fill="currentColor" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" {...stroke} />
    </svg>
  ),
  record: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" {...stroke} />
      <path d="M7 9h3M7 15h3M13 9h4M13 15h4" {...stroke} strokeWidth={2} />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" {...stroke} />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17" {...stroke} strokeWidth={1.8} />
    </svg>
  ),
};

const KIND_WORDS: Record<MemoryKind, string> = { position: 'a place', direction: 'a direction', number: 'a number', yesNo: 'a yes or no', list: 'a list', grid: 'a grid of rows and columns', record: 'a record of named fields' };

const ITEM_WORDS: Record<string, string> = { number: 'numbers', yesNo: 'yes/noes', direction: 'directions' };
/** A slot's kind as a short tag beside its name: "number", "list of yes/noes", "grid of numbers". */
function kindWord(m: MemorySlot | undefined): string {
  if (!m) return '';
  if (m.kind === 'record') return m.shape ?? 'record';
  if (m.kind === 'list' && m.of === 'record') return `list of ${m.shape ?? 'record'}`;
  if (m.kind === 'list' || m.kind === 'grid') return `${m.kind} of ${ITEM_WORDS[m.of ?? 'number']}`;
  return { number: 'number', yesNo: 'yes/no', direction: 'direction', position: 'place' }[m.kind] ?? m.kind;
}

/** A backpack: what is kept overnight. */
const BACKPACK = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M9 6V4.5a3 3 0 0 1 6 0V6" {...stroke} />
    <rect x="4.5" y="6" width="15" height="15" rx="4" {...stroke} />
    <path d="M8.5 13.5h7v4h-7z" {...stroke} strokeWidth={2} />
  </svg>
);

/** A list slot drawn as its items in order, each with its index from 0 underneath. */
function ListItems({ items }: { items: Value[] }) {
  if (items.length === 0) return <span className="memory-list-empty">nothing yet</span>;
  return (
    <span className="memory-list" aria-hidden="true">
      {items.map((v, i) => (
        <span key={i} className="memory-list-item">
          <span className="memory-list-value">{valueWords(v)}</span>
          <span className="memory-list-index">{i}</span>
        </span>
      ))}
    </span>
  );
}

/** A grid slot drawn as a little table, rows like the board's, numbered from 0, the robot's tile ringed. */
function GridTable({ rows, here }: { rows: Value[]; here: { x: number; y: number } }) {
  const cell = (v: Value) => (typeof v === 'boolean' ? (v ? '■' : '·') : String(v));
  const width = Array.isArray(rows[0]) ? rows[0].length : 0;
  return (
    <table className="memory-grid">
      <thead>
        <tr>
          <th />
          {Array.from({ length: width }, (_, x) => (
            <th key={x}>{x}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, y) => (
          <tr key={y}>
            <th>{y}</th>
            {(Array.isArray(row) ? row : []).map((v, x) => (
              <td key={x} className={here.x === x && here.y === y ? 'is-here' : ''}>
                {cell(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const ARROW: Record<Facing, string> = { N: '↑', E: '→', S: '↓', W: '←' };

export interface MemoryCardProps {
  world: WorldDefinition;
  state: SimState;
  /** The robot's own memory slots, listed after the world's lines. */
  slots?: readonly MemorySlot[];
  /** On a level of several days, how many: the card then says which day it is. */
  days?: number;
  /** Fields the child is predicting now: they show as questions instead of values. */
  asking?: readonly MemoryField[];
  answers?: Partial<Record<MemoryField, MemoryValue>>;
  /** Fields guessed wrong last time, marked until answered again. */
  wrong?: readonly MemoryField[];
  disabled?: boolean;
  onAnswer?(field: MemoryField, value: MemoryValue): void;
}

export function MemoryCard({ world, state, slots = [], days, asking = [], answers = {}, wrong = [], disabled = false, onAnswer }: MemoryCardProps) {
  const gateIds = gatesOf(world).map((g) => g.id);
  const lines = memoryLines(world, slots);
  const valueOf = (line: MemoryLine): string => {
    if (line.field === 'position') return `column ${state.robot.x}, row ${state.robot.y}`;
    if (line.field === 'tick') return String(state.tick);
    const slot = slotOfField(line.field);
    if (slot !== null) {
      const v = state.memory?.[slot];
      return v === undefined ? '?' : Array.isArray(v) ? `[${valueWords(v)}]` : valueWords(v);
    }
    return describeValue(memoryValue(state, line.field));
  };
  /** What a slot line is asked as: a number, a yes or no, or a direction. */
  const askedKind = (line: MemoryLine): 'number' | 'yesNo' | 'direction' => (line.field === 'facing' ? 'direction' : line.field === 'acorns' ? 'number' : (line.kind as 'number' | 'yesNo' | 'direction'));

  const question = (field: MemoryField, label: string, kind: 'number' | 'yesNo' | 'direction') => {
    const answer = answers[field];
    const choice = (value: MemoryValue, text: string, aria: string) => (
      <button
        key={String(value)}
        type="button"
        className={`memory-choice ${answer === value ? 'is-on' : ''}`}
        aria-pressed={answer === value}
        aria-label={`${label}: ${aria}`}
        disabled={disabled}
        onClick={() => onAnswer?.(field, value)}
      >
        {text}
      </button>
    );
    if (kind === 'direction') return FACINGS.map((f) => choice(f, ARROW[f], FACING_WORDS[f]));
    if (kind === 'number') {
      const most = field === 'acorns' ? world.collectibles.length : 99;
      const n = typeof answer === 'number' ? answer : null;
      return (
        <span className="memory-stepper">
          <button type="button" className="memory-choice" aria-label={`${label}: one fewer`} disabled={disabled || n === null || n <= 0} onClick={() => onAnswer?.(field, (n ?? 0) - 1)}>
            −
          </button>
          <span className="memory-number" aria-live="polite">
            {n ?? '?'}
          </span>
          <button
            type="button"
            className="memory-choice"
            aria-label={`${label}: one more`}
            disabled={disabled || (n ?? -1) >= most}
            onClick={() => onAnswer?.(field, n === null ? 0 : n + 1)}
          >
            +
          </button>
        </span>
      );
    }
    return [choice(true, 'yes', 'yes, open'), choice(false, 'no', 'no, shut')];
  };

  return (
    <section className={`memory-card ${asking.length > 0 ? 'is-asking' : ''}`} aria-label="Memory card">
      <h2 className="memory-title">Memory card</h2>
      <ul className="memory-lines">
        {days !== undefined && (
          <li className="memory-line kind-number is-day">
            <span className="memory-kind" title="The day">
              {KIND_ICON.number}
            </span>
            <span className="memory-label">Day</span>
            <span className="memory-value">
              {state.day ?? 1} of {days}
            </span>
          </li>
        )}
        {lines.map((line) => {
          const gate = gateOfField(line.field);
          const field = line.field === 'position' || line.field === 'tick' ? null : line.field;
          const asked = field !== null && asking.includes(field);
          const isWrong = field !== null && wrong.includes(field);
          return (
            <li
              key={line.field}
              className={`memory-line kind-${line.kind} ${line.slot ? 'is-slot' : ''} ${asked ? 'is-asked' : ''} ${isWrong ? 'is-wrong' : ''}`}
              style={gate ? { ['--gate' as string]: gateColor(gateIds, gate) } : undefined}
            >
              <span className="memory-kind" title={`Holds ${KIND_WORDS[line.kind]}`}>
                {KIND_ICON[line.kind]}
                <span className="visually-hidden">Holds {KIND_WORDS[line.kind]}.</span>
              </span>
              <span className="memory-label">{line.label}</span>
              {line.slot && <span className="memory-kindword">{kindWord(slots.find((m) => slotOfField(line.field) === m.name))}</span>}
              {line.slot && slots.find((m) => slotOfField(line.field) === m.name)?.keep && (
                <span className="memory-backpack" title="In the backpack: kept overnight">
                  {BACKPACK}
                  <span className="visually-hidden">In the backpack: kept overnight.</span>
                </span>
              )}
              {asked ? (
                <span className="memory-question" role="group" aria-label={`${line.label} at the end? ${isWrong ? 'Not that one last time.' : ''}`}>
                  {question(line.field as MemoryField, line.label, askedKind(line))}
                </span>
              ) : line.kind === 'grid' && Array.isArray(state.memory?.[slotOfField(line.field) ?? '']) ? (
                <span className="memory-value">
                  <GridTable rows={state.memory![slotOfField(line.field)!] as Value[]} here={state.robot} />
                  <span className="visually-hidden">{valueOf(line)}</span>
                </span>
              ) : line.kind === 'list' && Array.isArray(state.memory?.[slotOfField(line.field) ?? '']) ? (
                <span className="memory-value">
                  <ListItems items={state.memory![slotOfField(line.field)!] as Value[]} />
                  <span className="visually-hidden">{valueOf(line)}</span>
                </span>
              ) : (
                <span className="memory-value" aria-live="off">
                  {line.field === 'facing' && <span aria-hidden="true">{ARROW[state.robot.facing]} </span>}
                  {valueOf(line)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
