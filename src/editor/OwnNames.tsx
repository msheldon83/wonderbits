/**
 * Creation mode: the child adds parts of their own to the program and
 * names them: something to remember, a function, a When card. A name is
 * typed, and the rule for names is said kindly when one does not fit.
 */
import { useState } from 'react';
import { nameProblem, type EditOp } from '../ir/ops';
import { defaultStart } from '../ir/spec';
import type { ListOf, MemorySlot, ProgramIR, ValueKind } from '../ir/types';
import { eventLabel } from './commands';

/** The kinds of slot a child can add, in the words the memory card uses. */
const SLOT_KINDS: { id: string; label: string; kind: ValueKind; of?: ListOf }[] = [
  { id: 'number', label: 'a number', kind: 'number' },
  { id: 'yesNo', label: 'a yes or no', kind: 'yesNo' },
  { id: 'direction', label: 'a direction', kind: 'direction' },
  { id: 'position', label: 'a place', kind: 'position' },
  { id: 'list:number', label: 'a list of numbers', kind: 'list', of: 'number' },
  { id: 'list:direction', label: 'a list of directions', kind: 'list', of: 'direction' },
  { id: 'list:yesNo', label: 'a list of yes or no', kind: 'list', of: 'yesNo' },
];

/** The slot a child asked for: empty, in its kind. */
export function newSlot(name: string, kindId: string, keep: boolean): MemorySlot {
  const k = SLOT_KINDS.find((s) => s.id === kindId) ?? SLOT_KINDS[0]!;
  return { name, kind: k.kind, ...(k.of && { of: k.of }), start: defaultStart(k.kind), ...(keep && { keep: true }) };
}

export interface OwnNamesProps {
  program: ProgramIR;
  locked: boolean;
  onEdit(op: EditOp): void;
  /** Events a new When card may wait for: the board's plates, an acorn, a tick. */
  events: readonly string[];
  /** The level runs over several days, so a slot may be kept overnight. */
  backpack: boolean;
}

export function OwnNames({ program, locked, onEdit, events, backpack }: OwnNamesProps) {
  const [slotName, setSlotName] = useState('');
  const [kind, setKind] = useState('number');
  const [keep, setKeep] = useState(false);
  const [fnName, setFnName] = useState('');
  /** The last name that did not fit, and why. */
  const [problem, setProblem] = useState<{ which: 'slot' | 'function'; text: string } | null>(null);
  const free = events.filter((e) => !program.handlers.some((h) => h.event === e));

  const add = (which: 'slot' | 'function') => {
    const name = (which === 'slot' ? slotName : fnName).trim();
    const text = nameProblem(program, name);
    if (text) return setProblem({ which, text });
    setProblem(null);
    if (which === 'slot') {
      onEdit({ op: 'addSlot', slot: newSlot(name, kind, backpack && keep) });
      setSlotName('');
    } else {
      onEdit({ op: 'addFunction', name });
      setFnName('');
    }
  };
  const nameInput = (which: 'slot' | 'function', value: string, set: (v: string) => void, label: string) => (
    <input
      type="text"
      className="own-name"
      aria-label={label}
      placeholder="name"
      value={value}
      maxLength={20}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      disabled={locked}
      onChange={(e) => {
        set(e.target.value);
        setProblem(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') add(which);
      }}
    />
  );

  return (
    // Typing a name must not reach the editor's own keys (Delete, arrows, letters).
    <section className="own-names" aria-label="Add parts of your own" onKeyDown={(e) => e.stopPropagation()}>
      <h3 className="memory-slots-title">Add your own</h3>
      <div className="own-row">
        <span className="own-label">Remember</span>
        {nameInput('slot', slotName, setSlotName, 'Name for something to remember')}
        <select className="param-select" aria-label="What kind of thing to remember" value={kind} disabled={locked} onChange={(e) => setKind(e.target.value)}>
          {SLOT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {backpack && (
          <label className="own-keep">
            <input type="checkbox" checked={keep} disabled={locked} onChange={(e) => setKeep(e.target.checked)} />
            in the backpack
          </label>
        )}
        <button type="button" className="btn btn-quiet own-add" disabled={locked} onClick={() => add('slot')}>
          Add
        </button>
      </div>
      {problem?.which === 'slot' && (
        <p className="own-problem" role="alert">
          {problem.text}
        </p>
      )}
      <div className="own-row">
        <span className="own-label">Function</span>
        {nameInput('function', fnName, setFnName, 'Name for a new function')}
        <button type="button" className="btn btn-quiet own-add" disabled={locked} onClick={() => add('function')}>
          Add
        </button>
      </div>
      {problem?.which === 'function' && (
        <p className="own-problem" role="alert">
          {problem.text}
        </p>
      )}
      {free.length > 0 && (
        <div className="own-row">
          <span className="own-label">When</span>
          <select
            className="param-select"
            aria-label="Add a When card for something that happens"
            value=""
            disabled={locked}
            onChange={(e) => {
              if (e.target.value) onEdit({ op: 'addHandler', event: e.target.value });
            }}
          >
            <option value="">choose what happens…</option>
            {free.map((e) => (
              <option key={e} value={e}>
                {eventLabel(e)}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}
