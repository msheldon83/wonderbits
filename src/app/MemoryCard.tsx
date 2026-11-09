/**
 * The memory card: a strip under the board listing what the world holds
 * right now, one line per thing, each with an icon for its kind. On a model
 * level the lines the child must predict become questions: which way, how
 * many, open or shut. Values come from the trace state, so the card always
 * matches the board.
 */
import type { ReactElement } from 'react';
import { valueWords } from '../editor/commands';
import type { MemorySlot } from '../ir/types';
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
};

const KIND_WORDS: Record<MemoryKind, string> = { position: 'a place', direction: 'a direction', number: 'a number', yesNo: 'a yes or no', list: 'a list' };
const ARROW: Record<Facing, string> = { N: '↑', E: '→', S: '↓', W: '←' };

export interface MemoryCardProps {
  world: WorldDefinition;
  state: SimState;
  /** The robot's own memory slots, listed after the world's lines. */
  slots?: readonly MemorySlot[];
  /** Fields the child is predicting now: they show as questions instead of values. */
  asking?: readonly MemoryField[];
  answers?: Partial<Record<MemoryField, MemoryValue>>;
  /** Fields guessed wrong last time, marked until answered again. */
  wrong?: readonly MemoryField[];
  disabled?: boolean;
  onAnswer?(field: MemoryField, value: MemoryValue): void;
}

export function MemoryCard({ world, state, slots = [], asking = [], answers = {}, wrong = [], disabled = false, onAnswer }: MemoryCardProps) {
  const gateIds = gatesOf(world).map((g) => g.id);
  const lines = memoryLines(world, slots);
  const valueOf = (line: MemoryLine): string => {
    if (line.field === 'position') return `column ${state.robot.x + 1}, row ${state.robot.y + 1}`;
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
              {asked ? (
                <span className="memory-question" role="group" aria-label={`${line.label} at the end? ${isWrong ? 'Not that one last time.' : ''}`}>
                  {question(line.field as MemoryField, line.label, askedKind(line))}
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
