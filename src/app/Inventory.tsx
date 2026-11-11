/**
 * The warehouse under the board on levels with records: the robot's friend,
 * the inventory computer, and a shelf of the crates it knows about. Every
 * crate is a box with its index and its fields. The crate being looked at
 * is lifted, and when the robot asks about a field, the computer answers in
 * its bubble. Presentation only: the values come from the trace state.
 */
import { useEffect, useState } from 'react';
import { parseSlotTest, splitSlotPath, type MemorySlot, type RecordValue, type Value } from '../ir/types';
import type { TraceEvent } from '../runtime/contract';
import type { SimState } from '../sim/types';

const ARROW: Record<string, string> = { N: '↑', E: '→', S: '↓', W: '←' };

/** A field's value on a crate's label: a number, a tick or a cross, an arrow. */
function fieldText(v: unknown): string {
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'string') return ARROW[v] ?? v;
  return String(v);
}

/** The computer's answer, in words: "number is 3", "key? yes". */
function answerFor(event: TraceEvent | null): string | null {
  if (!event) return null;
  if (event.op === 'set' && event.asked === 'inventory' && event.seen) {
    const { field } = splitSlotPath(event.seen);
    const v = event.value;
    return `${field} is ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : fieldText(v)}`;
  }
  if (event.op === 'check') {
    const t = parseSlotTest(event.condition);
    const field = t && splitSlotPath(t.slot).field;
    if (!t || !field) return null;
    const asked = t.value === 'yes' || t.value === 'no' ? `${field}?` : `${field} ${ARROW[t.value] ?? t.value}?`;
    return `${asked} ${event.value ? 'yes' : 'no'}`;
  }
  return null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function CrateArt() {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
      <rect x="2" y="4" width="36" height="26" rx="3" fill="#c98a4b" stroke="#8a5a2b" strokeWidth="2" />
      <path d="M2 13h36M2 21h36" stroke="#8a5a2b" strokeWidth="2" />
      <path d="M8 4v26M32 4v26" stroke="#a96f37" strokeWidth="2" />
    </svg>
  );
}

function ComputerArt() {
  return (
    <svg viewBox="0 0 64 60" width="64" height="60" aria-hidden="true">
      <rect x="4" y="4" width="56" height="40" rx="7" fill="#5d6b80" />
      <rect className="inventory-screen" x="9" y="9" width="46" height="30" rx="4" fill="#1fb39a" />
      <circle cx="24" cy="21" r="3.2" fill="#0d3b33" />
      <circle cx="40" cy="21" r="3.2" fill="#0d3b33" />
      <path d="M24 29q8 6 16 0" fill="none" stroke="#0d3b33" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="26" y="44" width="12" height="7" fill="#4a566a" />
      <rect x="16" y="51" width="32" height="5" rx="2.5" fill="#4a566a" />
    </svg>
  );
}

function Crate({ record, index, current, name }: { record: RecordValue; index?: number; current: boolean; name: string }) {
  const fields = Object.entries(record);
  return (
    <li className={`inventory-crate ${current ? 'is-current' : ''}`} aria-label={`${name}${index !== undefined ? ` ${index}` : ''}: ${fields.map(([f, v]) => `${f} ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : fieldText(v)}`).join(', ')}${current ? ', looking at it now' : ''}`}>
      <CrateArt />
      <dl className="inventory-fields" aria-hidden="true">
        {fields.map(([f, v]) => (
          <div key={f} className={`inventory-field ${typeof v === 'boolean' ? (v ? 'is-yes' : 'is-no') : ''}`}>
            <dt>{f}</dt>
            <dd>{fieldText(v)}</dd>
          </div>
        ))}
      </dl>
      {index !== undefined && (
        <span className="inventory-index" aria-hidden="true">
          {index}
        </span>
      )}
    </li>
  );
}

export function Inventory({ slots = [], state, event }: { slots?: readonly MemorySlot[]; state: SimState; event: TraceEvent | null }) {
  // The computer keeps its last answer showing until the run starts again.
  const [answer, setAnswer] = useState<string | null>(null);
  useEffect(() => {
    if (!event) setAnswer(null);
    else {
      const a = answerFor(event);
      if (a) setAnswer(a);
    }
  }, [event]);

  const lists = slots.filter((m) => m.kind === 'list' && m.of === 'record');
  const listShapes = new Set(lists.map((m) => m.shape));
  const records = slots.filter((m) => m.kind === 'record');
  // A record slot of a listed shape is the crate being looked at; one of its own shape is a crate by itself.
  const loose = records.filter((m) => !listShapes.has(m.shape));
  if (lists.length === 0 && loose.length === 0) return null;
  const memory = state.memory ?? {};
  // The crate being looked at: the one a record slot holds now. A slot still at its start has looked at nothing yet,
  // unless a For each is handing it that very crate right now.
  const looking = records
    .filter((m) => listShapes.has(m.shape))
    .filter((m) => !same(memory[m.name], m.start) || (event?.op === 'loop' && same(event.after.memory?.[m.name], memory[m.name])))
    .map((m) => memory[m.name]);
  return (
    <section className="inventory" aria-label="The warehouse inventory computer and its crates">
      <div className={`inventory-computer ${answer ? 'is-talking' : ''}`}>
        <ComputerArt />
        <span className="inventory-name">Inventory computer</span>
        {answer && (
          <span className="inventory-bubble" role="status">
            {answer}
          </span>
        )}
      </div>
      <div className="inventory-shelves">
        {lists.map((l) => {
          const items = (Array.isArray(memory[l.name]) ? memory[l.name] : []) as Value[];
          return (
            <div key={l.name} className="inventory-shelf">
              <span className="inventory-shelf-name">{l.name}</span>
              <ol className="inventory-crates">
                {items.map((item, i) => (
                  <Crate key={i} record={item as RecordValue} index={i} name={l.name} current={looking.some((v) => same(v, item))} />
                ))}
              </ol>
            </div>
          );
        })}
        {loose.map((r) => (
          <div key={r.name} className="inventory-shelf">
            <span className="inventory-shelf-name">{r.name}</span>
            <ol className="inventory-crates">
              <Crate record={(memory[r.name] ?? {}) as RecordValue} name={r.name} current />
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
