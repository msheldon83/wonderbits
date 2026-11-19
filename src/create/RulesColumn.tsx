/**
 * The rules of a puzzle, always in view beside the board and the maker's
 * solution: the goal, every card as a switch for whether the player gets
 * it, the named parts the player starts with (memory, functions, When
 * cards), and the limits. Nothing here is a step of a program. A part
 * added here lands in the solution beside it, empty, ready to be used.
 */
import { useState } from 'react';
import { cardLabel, eventLabel } from '../editor/commands';
import { newSlot, SLOT_KINDS } from '../editor/OwnNames';
import { needsOf } from '../editor/palette';
import { nameProblem, type EditOp } from '../ir/ops';
import { cardCounts, countNodes, functionNames, memoryOf, slotsInUse, walk } from '../ir/program';
import { emptyRecord } from '../ir/spec';
import { FUNCTION_NAME, RESERVED_NAMES, type CardId, type ItemKind, type MemorySlot, type ProgramIR } from '../ir/types';
import type { ProgressStore } from '../progress/store';
import type { Critique } from '../runtime/contract';
import type { CreationStore } from './store';
import type { Creation } from './types';

export const LIMIT_MAX = 40;
export const DAYS_MAX = 5;
/** The most a limit on one kind of card can be set to. */
export const CARD_LIMIT_MAX = 20;

type Goal = 'flag' | 'acorns' | 'both';
const GOALS: { id: Goal; label: string; reachGoal: boolean; collectAll: boolean }[] = [
  { id: 'flag', label: 'Reach the flag', reachGoal: true, collectAll: false },
  { id: 'acorns', label: 'Collect every acorn', reachGoal: false, collectAll: true },
  { id: 'both', label: 'Both', reachGoal: true, collectAll: true },
];

/** The cards in the groups a child knows them by: the idea each belongs to. */
export const CARD_GROUPS: { title: string; cards: CardId[] }[] = [
  { title: 'Moves', cards: ['forward', 'rotateCW', 'rotateCCW', 'wait'] },
  { title: 'Loops and ifs', cards: ['repeat', 'if', 'ifElse', 'until'] },
  { title: 'Functions', cards: ['call'] },
  { title: 'Memory', cards: ['set', 'change', 'face'] },
  { title: 'Lists', cards: ['push', 'forEach'] },
  { title: 'Map and bird', cards: ['goRow', 'goColumn', 'fly'] },
  { title: 'Gates', cards: ['openGate', 'closeGate'] },
];

/** A card's name in the rules, where there is no icon to tell the two Rotates apart. */
export const cardName = (card: CardId): string => (card === 'call' ? 'Use a function' : card === 'rotateCW' ? 'Rotate ↻' : card === 'rotateCCW' ? 'Rotate ↺' : cardLabel(card));

const KIND_WORDS: Record<string, string> = { number: 'number', yesNo: 'yes/no', direction: 'direction', position: 'place', list: 'list', grid: 'grid', record: 'record' };
const kindWords = (m: MemorySlot) =>
  (m.kind === 'record'
    ? `${m.shape ?? 'record'} with ${Object.keys(m.fields ?? {}).join(', ')}`
    : m.kind === 'list' && m.of === 'record'
      ? `list of ${m.shape ?? 'record'}`
      : m.kind === 'list' || m.kind === 'grid'
        ? `${m.kind} of ${KIND_WORDS[m.of ?? 'number']}`
        : (KIND_WORDS[m.kind] ?? m.kind)) + (m.keep ? ', in the backpack' : '');

/** As many fields as a record can have, as in the level schema. */
export const FIELDS_MAX = 4;
const FIELD_KINDS: { id: ItemKind; label: string }[] = [
  { id: 'number', label: 'a number' },
  { id: 'yesNo', label: 'a yes or no' },
  { id: 'direction', label: 'a direction' },
];

/** Why a record's fields cannot be used, said to the child, or null when they can. */
export function fieldsProblem(fields: readonly { name: string }[]): string | null {
  const names = fields.map((f) => f.name.trim());
  if (names.some((n) => n.length === 0)) return 'Give every part of the record a name.';
  const bad = names.find((n) => !FUNCTION_NAME.test(n) || n === 'x' || n === 'y' || RESERVED_NAMES.has(n));
  if (bad) return `"${bad}" cannot be a part's name. Use a short word that starts with a small letter, like number or key.`;
  if (new Set(names).size !== names.length) return 'Two parts have the same name.';
  return null;
}

/** A record slot the child asked for: its type is its name with a capital, and every field starts empty. */
export function newRecord(name: string, fields: readonly { name: string; kind: ItemKind }[], keep: boolean): MemorySlot {
  const shape = Object.fromEntries(fields.map((f) => [f.name.trim(), f.kind])) as Record<string, ItemKind>;
  return { name, kind: 'record', shape: name.charAt(0).toUpperCase() + name.slice(1), fields: shape, start: emptyRecord(shape), ...(keep && { keep: true }) };
}

/** A list of records shaped like an existing record slot, empty. */
export function newRecordList(name: string, like: MemorySlot, keep: boolean): MemorySlot {
  return { name, kind: 'list', of: 'record', ...(like.shape && { shape: like.shape }), ...(like.fields && { fields: like.fields }), start: [], ...(keep && { keep: true }) };
}

export interface RulesColumnProps {
  creation: Creation;
  /** Every card this creation may offer: creation mode's, and the cards of the level it came from. */
  universe: readonly CardId[];
  store: CreationStore;
  progress: ProgressStore;
  /** The maker's solution as it is now, and a way to add or remove its named parts. */
  program: ProgramIR;
  edit(op: EditOp): void;
  locked: boolean;
  /** What can happen on the board that a When card may wait for. */
  events: readonly string[];
  critique: Critique | null;
  /** Open the ready-made sets. */
  onAddSets(): void;
}

export function RulesColumn({ creation, universe, store, progress, program, edit, locked, events, critique, onAddSets }: RulesColumnProps) {
  const { objective, programming } = creation;
  /** Which "new part" form is open, the name typed so far, and why the last name did not fit. */
  const [adding, setAdding] = useState<'memory' | 'function' | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('number');
  const [keep, setKeep] = useState(false);
  /** The parts of a record being made. */
  const [fields, setFields] = useState<{ name: string; kind: ItemKind }[]>([{ name: '', kind: 'number' }]);
  const [problem, setProblem] = useState<string | null>(null);

  const setRules = (patch: Partial<Creation['programming']>, goal?: (typeof GOALS)[number]) => {
    const next = { ...programming, ...patch };
    if (patch.maxInstructions === undefined && 'maxInstructions' in patch) delete next.maxInstructions;
    if (next.maxPerCommand && Object.keys(next.maxPerCommand).length === 0) delete next.maxPerCommand;
    const nextObjective = goal ? { ...objective, reachGoal: goal.reachGoal, collectAll: goal.collectAll } : objective;
    store.update(creation.id, { programming: next, objective: nextObjective });
    progress.log({ levelId: creation.id, kind: 'puzzle-set', goal: nextObjective.reachGoal ? (nextObjective.collectAll ? 'both' : 'flag') : 'acorns', cards: next.allowedCommands.length, limit: next.maxInstructions ?? null });
  };
  const goal = GOALS.find((g) => g.reachGoal === objective.reachGoal && g.collectAll === objective.collectAll);
  const limit = programming.maxInstructions;
  const used = countNodes(program);
  /** Where a limit starts when first set: the size of the maker's solution, or the shortest plain way, or ten. */
  const firstLimit = Math.min(LIMIT_MAX, used > 0 ? used : critique?.flat.kind === 'found' && critique.flat.steps > 0 ? critique.flat.steps : 10);
  const days = creation.days ?? 1;
  /** One day is the plain puzzle; more makes the backpack matter. */
  const setDays = (n: number) => void store.update(creation.id, { days: n <= 1 ? undefined : n } as Partial<Creation>);

  const toggleCard = (card: CardId) => {
    const on = programming.allowedCommands.includes(card);
    if (on && programming.allowedCommands.length === 1) return;
    // Keep the cards in the order the palette shows them.
    // A card taken away takes its own limit with it.
    const { [card]: _gone, ...keptLimits } = programming.maxPerCommand ?? {};
    setRules({ allowedCommands: universe.filter((c) => (c === card ? !on : programming.allowedCommands.includes(c))), maxPerCommand: on ? keptLimits : programming.maxPerCommand });
  };
  /** The most of one kind of card: a number, or null to lift the limit. */
  const cardLimits = programming.maxPerCommand ?? {};
  const setCardLimit = (card: CardId, most: number | null) => {
    const { [card]: _old, ...rest } = cardLimits;
    setRules({ maxPerCommand: most === null ? rest : { ...rest, [card]: Math.min(CARD_LIMIT_MAX, Math.max(1, most)) } });
  };
  const usedOf = cardCounts(program);
  const limited = programming.allowedCommands.filter((c) => cardLimits[c] !== undefined);
  const unlimited = programming.allowedCommands.filter((c) => cardLimits[c] === undefined);
  const grouped = new Set(CARD_GROUPS.flatMap((g) => g.cards));
  const groups = [...CARD_GROUPS.map((g) => ({ ...g, cards: g.cards.filter((c) => universe.includes(c)) })), { title: 'From the level', cards: universe.filter((c) => !grouped.has(c)) }].filter((g) => g.cards.length > 0);
  const memory = memoryOf(program);
  const functions = functionNames(program);
  const inUse = slotsInUse(program);
  const called = new Set([...walk(program)].flatMap((v) => (v.node.kind === 'call' ? [v.node.name] : [])));
  const freeEvents = events.filter((e) => !program.handlers.some((h) => h.event === e));
  /** What a switched-on card still lacks before it can be used: "Set needs something to remember". */
  const lacks = (card: CardId): string | null => {
    if (!programming.allowedCommands.includes(card)) return null;
    if (card === 'call') return functions.length === 0 ? 'a function' : null;
    return needsOf(card, memory);
  };

  const open = (what: 'memory' | 'function') => {
    setAdding(what);
    setName('');
    setProblem(null);
    setFields([{ name: '', kind: 'number' }]);
  };
  const add = () => {
    const trimmed = name.trim();
    const text = nameProblem(program, trimmed);
    if (text) return setProblem(text);
    const kept = days > 1 && keep;
    if (adding === 'function') edit({ op: 'addFunction', name: trimmed });
    else if (kind === 'record') {
      const wrong = fieldsProblem(fields);
      if (wrong) return setProblem(wrong);
      edit({ op: 'addSlot', slot: newRecord(trimmed, fields, kept) });
    } else if (kind.startsWith('listOf:')) {
      const like = memory.find((m) => m.name === kind.slice('listOf:'.length));
      if (!like) return setProblem('Make the record first, then a list of it.');
      edit({ op: 'addSlot', slot: newRecordList(trimmed, like, kept) });
    } else edit({ op: 'addSlot', slot: newSlot(trimmed, kind, kept) });
    setAdding(null);
  };
  const nameForm = (what: 'memory' | 'function') =>
    adding === what && (
      <div className="part-form" onKeyDown={(e) => e.stopPropagation()}>
        <label className="part-field">
          <span>Its name</span>
          <input
            type="text"
            className="own-name"
            placeholder={what === 'memory' ? 'count' : 'hop'}
            value={name}
            maxLength={20}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') setAdding(null);
            }}
          />
        </label>
        {what === 'memory' && (
          <label className="part-field">
            <span>It holds</span>
            <select className="param-select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {SLOT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
              <option value="record">a record: a few named things together</option>
              {memory
                .filter((m) => m.kind === 'record')
                .map((m) => (
                  <option key={m.name} value={`listOf:${m.name}`}>
                    a list of {m.shape ?? m.name} records
                  </option>
                ))}
            </select>
          </label>
        )}
        {what === 'memory' && kind === 'record' && (
          <div className="record-fields" role="group" aria-label="The parts of the record">
            <span className="rule-note">A record keeps a few things together, like a crate with a number and whether it holds a key. Name each part.</span>
            {fields.map((f, i) => (
              <div key={i} className="part-field">
                <input
                  type="text"
                  className="own-name"
                  aria-label={`Name of part ${i + 1}`}
                  placeholder={i === 0 ? 'number' : 'key'}
                  value={f.name}
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setFields(fields.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
                    setProblem(null);
                  }}
                />
                <select className="param-select" aria-label={`What part ${i + 1} holds`} value={f.kind} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, kind: e.target.value as ItemKind } : x)))}>
                  {FIELD_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                {fields.length > 1 && (
                  <button type="button" className="btn-icon part-remove" aria-label={`Remove part ${i + 1}`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {fields.length < FIELDS_MAX && (
              <button type="button" className="btn btn-quiet part-new" onClick={() => setFields([...fields, { name: '', kind: 'yesNo' }])}>
                + Another part
              </button>
            )}
          </div>
        )}
        {what === 'memory' && days > 1 && (
          <label className="own-keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Keep it overnight, in the backpack
          </label>
        )}
        {problem && (
          <p className="own-problem" role="alert">
            {problem}
          </p>
        )}
        <div className="choice-row">
          <button type="button" className="btn btn-run part-add" onClick={add}>
            Add it
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setAdding(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  const stepper = (label: string, value: string | number, less: { off: boolean; go(): void; say: string }, more: { off: boolean; go(): void; say: string }) => (
    <div className="size-stepper" role="group" aria-label={label}>
      <span className="size-label">{label}</span>
      <button type="button" className="btn btn-icon" disabled={less.off} aria-label={less.say} onClick={less.go}>
        −
      </button>
      <span className="size-value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="btn btn-icon" disabled={more.off} aria-label={more.say} onClick={more.go}>
        +
      </button>
    </div>
  );

  return (
    <section className="rules-column" aria-labelledby="rules-title">
      <h2 id="rules-title" className="panel-title">
        Rules for the player
      </h2>

      <div className="rule" role="group" aria-labelledby="goal-title">
        <h3 id="goal-title" className="rule-title">
          The goal
        </h3>
        <div className="choice-row">
          {GOALS.filter((g) => g.reachGoal || !creation.world.team).map((g) => (
            <button key={g.id} type="button" className={`btn btn-choice ${goal?.id === g.id ? 'is-on' : ''}`} aria-pressed={goal?.id === g.id} onClick={() => setRules({}, g)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rule" role="group" aria-labelledby="cards-title">
        <h3 id="cards-title" className="rule-title">
          Cards the player gets
        </h3>
        <p className="rule-note">Tap a card to give it or take it away. The blue ones are in the player's hand, and in yours.</p>
        {groups.map((g) => {
          const lacking = g.cards.flatMap((c) => (lacks(c) ? [`${cardName(c)} needs ${lacks(c)}`] : []));
          return (
            <div key={g.title} className="card-group">
              <span className="card-group-title">{g.title}</span>
              <div className="choice-row">
                {g.cards.map((card) => {
                  const on = programming.allowedCommands.includes(card);
                  return (
                    <button key={card} type="button" className={`btn btn-choice card-switch ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleCard(card)}>
                      {cardName(card)}
                    </button>
                  );
                })}
              </div>
              {lacking.length > 0 && <p className="rule-note is-lacking">{[...new Set(lacking)].join('. ')}. Add it under Parts, below.</p>}
            </div>
          );
        })}
      </div>

      <div className="rule" role="group" aria-labelledby="parts-title">
        <h3 id="parts-title" className="rule-title">
          Parts the player starts with
        </h3>
        <p className="rule-note">Named things some cards work on. The player gets them empty, and so does your solution.</p>

        <div className="part">
          <span className="card-group-title">Memory</span>
          <p className="rule-note">Something the robot remembers, like a number called count. Set, Add and If cards use it.</p>
          {memory.length > 0 && (
            <ul className="part-chips">
              {memory.map((m) => (
                <li key={m.name} className="part-chip">
                  <code>
                    {m.name}: {kindWords(m)}
                  </code>
                  <button type="button" className="btn-icon part-remove" disabled={locked || inUse.has(m.name)} aria-label={inUse.has(m.name) ? `${m.name} is used in your solution, so it cannot be removed` : `Remove ${m.name}`} title={inUse.has(m.name) ? 'Used in your solution. Remove those cards first.' : 'Remove'} onClick={() => edit({ op: 'removeSlot', name: m.name })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nameForm('memory') || (
            <button type="button" className="btn btn-quiet part-new" disabled={locked} onClick={() => open('memory')}>
              + New memory
            </button>
          )}
        </div>

        <div className="part">
          <span className="card-group-title">Functions</span>
          <p className="rule-note">A set of cards with a name, built once and used again. The player fills it in.</p>
          {functions.length > 0 && (
            <ul className="part-chips">
              {functions.map((f) => (
                <li key={f} className="part-chip">
                  <code>{f}</code>
                  <button type="button" className="btn-icon part-remove" disabled={locked || called.has(f)} aria-label={called.has(f) ? `${f} is used in your solution, so it cannot be removed` : `Remove the function ${f}`} title={called.has(f) ? 'Used in your solution. Remove those cards first.' : 'Remove'} onClick={() => edit({ op: 'removeFunction', name: f })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nameForm('function') || (
            <button type="button" className="btn btn-quiet part-new" disabled={locked} onClick={() => open('function')}>
              + New function
            </button>
          )}
        </div>

        <div className="part">
          <span className="card-group-title">When cards</span>
          <p className="rule-note">Cards that run by themselves when something happens: an acorn picked up, a tick, a plate stepped on.</p>
          {program.handlers.length > 0 && (
            <ul className="part-chips">
              {program.handlers.map((h) => (
                <li key={h.event} className="part-chip">
                  <span>{eventLabel(h.event)}</span>
                  <button type="button" className="btn-icon part-remove" disabled={locked} aria-label={`Remove the card ${eventLabel(h.event)}`} title="Remove it and the cards in it" onClick={() => edit({ op: 'removeHandler', event: h.event })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {freeEvents.length > 0 && (
            <select
              className="param-select part-new"
              aria-label="Add a When card for something that happens"
              value=""
              disabled={locked}
              onChange={(e) => {
                if (e.target.value) edit({ op: 'addHandler', event: e.target.value });
              }}
            >
              <option value="">+ New When card…</option>
              {freeEvents.map((e) => (
                <option key={e} value={e}>
                  {eventLabel(e)}
                </option>
              ))}
            </select>
          )}
        </div>

        <button type="button" className="btn btn-quiet btn-create part-new" onClick={onAddSets}>
          Ready-made sets: a counter, the bird, the backpack…
        </button>
      </div>

      <div className="rule" role="group" aria-labelledby="limits-title">
        <h3 id="limits-title" className="rule-title">
          Limits
        </h3>
        <div className="choice-row">
          {stepper(
            'Most cards',
            limit ?? 'any',
            { off: limit !== undefined && limit <= 1, say: 'One card fewer', go: () => setRules({ maxInstructions: Math.max(1, (limit ?? firstLimit + 1) - 1) }) },
            { off: limit !== undefined && limit >= LIMIT_MAX, say: 'One card more', go: () => setRules({ maxInstructions: Math.min(LIMIT_MAX, limit === undefined ? firstLimit : limit + 1) }) },
          )}
          {limit !== undefined && (
            <button type="button" className="btn btn-quiet" onClick={() => setRules({ maxInstructions: undefined })}>
              No limit
            </button>
          )}
        </div>
        <div className="card-limits">
          <span className="card-group-title">Most of one kind of card</span>
          <p className="rule-note">Give the player only so many of a card, such as three Forward cards, so they have to find another way.</p>
          {limited.map((card) => {
            const most = cardLimits[card]!;
            return (
              <div key={card} className="choice-row">
                {stepper(
                  cardName(card),
                  most,
                  { off: most <= 1, say: `${cardName(card)}: one fewer`, go: () => setCardLimit(card, most - 1) },
                  { off: most >= CARD_LIMIT_MAX, say: `${cardName(card)}: one more`, go: () => setCardLimit(card, most + 1) },
                )}
                <button type="button" className="btn-icon part-remove" aria-label={`No limit on ${cardName(card)}`} title="Lift this limit" onClick={() => setCardLimit(card, null)}>
                  ×
                </button>
              </div>
            );
          })}
          {unlimited.length > 0 && (
            <select
              className="param-select part-new"
              aria-label="Limit one kind of card"
              value=""
              onChange={(e) => {
                const card = e.target.value as CardId;
                // Start at what the maker's own solution uses, so the limit does not break it.
                if (card) setCardLimit(card, usedOf.get(card) || 1);
              }}
            >
              <option value="">+ Limit a card…</option>
              {unlimited.map((c) => (
                <option key={c} value={c}>
                  {cardName(c)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="choice-row">
          {stepper('Days', days, { off: days <= 1, say: 'One day fewer', go: () => setDays(days - 1) }, { off: days >= DAYS_MAX, say: 'One day more', go: () => setDays(days + 1) })}
        </div>
        {days > 1 && <p className="rule-note">The program runs once a day. Only memory kept in the backpack lasts overnight, and the last day must reach the goal.</p>}
      </div>
    </section>
  );
}
