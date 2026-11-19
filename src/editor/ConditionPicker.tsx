/**
 * Choosing what an If or a Repeat until checks, where the child names the
 * memory: a sense, or a test of something remembered, built from three
 * parts: what, how it is compared, and with what. "count is more than 3",
 * "score is more than best", "way is not right".
 */
import { negationOf, parseSlotTest, type Comparison, type ConditionId, type MemorySlot } from '../ir/types';
import { conditionLabel } from './commands';

/** Something that can be tested: a slot, or one part of a record. */
interface Target {
  path: string;
  label: string;
  kind: string;
}

/** Every slot, and every part of a record, that holds a single value. */
export function testTargets(memory: readonly MemorySlot[]): Target[] {
  return memory.flatMap((m): Target[] => {
    if (m.kind === 'number' || m.kind === 'yesNo' || m.kind === 'direction' || m.kind === 'position') return [{ path: m.name, label: m.name, kind: m.kind }];
    if (m.kind === 'record') return Object.entries(m.fields ?? {}).map(([f, k]) => ({ path: `${m.name}.${f}`, label: `${m.name}'s ${f}`, kind: k }));
    return [];
  });
}

/** How a test is put: the comparison, and whether it is turned round. */
type How = 'is' | 'isNot' | 'less' | 'more';
const HOW_WORDS: Record<How, string> = { is: 'is', isNot: 'is not', less: 'is less than', more: 'is more than' };
const DIRECTIONS: Record<string, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

/** A test from its three parts. */
export function buildTest(path: string, how: How, value: string): ConditionId {
  const op: Comparison = how === 'less' ? '<' : how === 'more' ? '>' : '=';
  const test = `slot:${path}${op}${value}` as ConditionId;
  return how === 'isNot' ? (`not:${test}` as ConditionId) : test;
}

/** A condition taken apart, when it is a test of memory: plain or turned round. */
export function readTest(condition: ConditionId): { path: string; how: How; value: string } | null {
  const inner = negationOf(condition);
  const test = parseSlotTest(inner ?? condition);
  if (!test) return null;
  // A turned-round less or more is not offered; it reads as its plain test.
  const how: How = test.op === '<' ? 'less' : test.op === '>' ? 'more' : inner ? 'isNot' : 'is';
  return { path: test.slot, how, value: test.value };
}

/** The values a target can be compared with: by its kind, and for a number the other numbers remembered. */
export function valuesFor(target: Target | undefined, memory: readonly MemorySlot[], current?: string): { value: string; label: string }[] {
  const kind = target?.kind ?? 'number';
  const base =
    kind === 'yesNo'
      ? [{ value: 'yes', label: 'yes' }, { value: 'no', label: 'no' }]
      : kind === 'direction'
        ? Object.entries(DIRECTIONS).map(([value, label]) => ({ value, label }))
        : kind === 'position'
          ? [{ value: 'here', label: 'here' }]
          : [...Array.from({ length: 10 }, (_, n) => ({ value: String(n), label: String(n) })), ...memory.filter((m) => m.kind === 'number' && m.name !== target?.path).map((m) => ({ value: m.name, label: m.name }))];
  return current !== undefined && !base.some((b) => b.value === current) ? [{ value: current, label: DIRECTIONS[current] ?? current }, ...base] : base;
}

export interface ConditionPickerProps {
  condition: ConditionId;
  memory: readonly MemorySlot[];
  /** The senses on offer, with their turned-round forms. */
  senses: readonly ConditionId[];
  disabled: boolean;
  /** Which step this is, for the labels. */
  step: number;
  onChange(condition: ConditionId): void;
}

export function ConditionPicker({ condition, memory, senses, disabled, step, onChange }: ConditionPickerProps) {
  const targets = testTargets(memory);
  const test = readTest(condition);
  const target = test ? targets.find((t) => t.path === test.path) : undefined;
  const what = test ? `slot:${test.path}` : condition;
  const hows: How[] = (target?.kind ?? 'number') === 'number' ? ['is', 'isNot', 'less', 'more'] : target?.kind === 'yesNo' ? ['is'] : ['is', 'isNot'];
  const options = [...new Set([...senses, ...(test ? [] : [condition])])];

  return (
    <>
      <select
        className="param-select"
        aria-label={`What to check, step ${step}`}
        value={what}
        disabled={disabled}
        onChange={(e) => {
          const picked = e.target.value;
          if (!picked.startsWith('slot:')) return onChange(picked as ConditionId);
          // A fresh test of this slot: "is", and its first value.
          const path = picked.slice('slot:'.length);
          onChange(buildTest(path, 'is', valuesFor(targets.find((t) => t.path === path), memory)[0]!.value));
        }}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {conditionLabel(c)}
          </option>
        ))}
        {(test && !target ? [{ path: test.path, label: test.path.replace('.', "'s "), kind: 'number' }, ...targets] : targets).map((t) => (
          <option key={t.path} value={`slot:${t.path}`}>
            {t.label}…
          </option>
        ))}
      </select>
      {test && (
        <>
          <select className="param-select" aria-label={`How to compare, step ${step}`} value={test.how} disabled={disabled} onChange={(e) => onChange(buildTest(test.path, e.target.value as How, test.value))}>
            {(hows.includes(test.how) ? hows : [test.how, ...hows]).map((h) => (
              <option key={h} value={h}>
                {HOW_WORDS[h]}
              </option>
            ))}
          </select>
          <select className="param-select" aria-label={`Compare with what, step ${step}`} value={test.value} disabled={disabled} onChange={(e) => onChange(buildTest(test.path, test.how, e.target.value))}>
            {valuesFor(target, memory, test.value).map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  );
}
