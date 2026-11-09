/**
 * Program specs: the compact, id-free form of a program used by level files
 * and tests. A spec is a list of commands and blocks:
 *
 *   ["forward", { "repeat": 3, "do": ["forward", "rotateCW"] }]
 *   [{ "if": "blockedAhead", "do": ["rotateCW"], "else": ["forward"] }]
 *   [{ "until": "atFlag", "do": ["forward"] }]
 *   [{ "call": "hop" }, "forward", { "call": "hop" }, { "define": "hop", "do": ["forward", "rotateCW"] }]
 *   ["forward", { "on": "stepOn:1", "do": [{ "open": "a" }] }]
 *   [{ "remember": "count", "kind": "number" }, { "change": "count", "by": 1 }, { "unlock": "a", "with": "count" }]
 *   [{ "forEach": "crates", "as": "item", "do": [{ "if": "slot:item=yes", "do": [...] }] }]
 *
 * An "if" with an "else" is an ifElse node. Three entries may only sit at
 * the top of a program spec, and each becomes part of the program rather
 * than a card of main, wherever it is listed: a "define" is a function, an
 * "on" is a When card, and a "remember" is a slot of the robot's memory.
 * "open" and "close" act on a gate by its letter. Building a program from a
 * spec mints fresh ids; specOf throws the ids away again.
 */
import type { IdFactory } from './ids';
import type { CommandId, ConditionId, IRNode, ItemKind, MemorySlot, Source, Value, ValueKind } from './types';

export type NodeSpec =
  | CommandId
  | { repeat: number; do: NodeSpec[] }
  | { if: ConditionId; do: NodeSpec[]; else?: NodeSpec[] }
  | { until: ConditionId; do: NodeSpec[] }
  | { forEach: string; as: string; do: NodeSpec[] }
  | { call: string }
  | { open: string }
  | { close: string }
  | { set: string; to: Source }
  | { change: string; by: number }
  | { face: string }
  | { unlock: string; with: string }
  | { mark: string; at: string; with: string }
  | { define: string; do: NodeSpec[] }
  | { on: string; do: NodeSpec[] }
  | { remember: string; kind: ValueKind; of?: ItemKind; start?: Value };

export type DefineSpec = Extract<NodeSpec, { define: string }>;
export type OnSpec = Extract<NodeSpec, { on: string }>;
export type RememberSpec = Extract<NodeSpec, { remember: string }>;

/** What a spec entry is: a card id ("forward", "repeat", "ifElse", "set"...), or "define", "on" or "remember". */
export type SpecKind = string;

export function kindOfSpec(s: NodeSpec): SpecKind {
  if (typeof s === 'string') return s;
  if ('repeat' in s) return 'repeat';
  if ('until' in s) return 'until';
  if ('forEach' in s) return 'forEach';
  if ('if' in s) return s.else ? 'ifElse' : 'if';
  if ('call' in s) return 'call';
  if ('open' in s) return 'openGate';
  if ('close' in s) return 'closeGate';
  if ('set' in s) return 'set';
  if ('change' in s) return 'change';
  if ('face' in s) return 'face';
  if ('unlock' in s) return 'unlock';
  if ('mark' in s) return 'mark';
  if ('define' in s) return 'define';
  if ('on' in s) return 'on';
  return 'remember';
}

/** The cards inside an entry, in order: a block's body (and else), a function's or When card's cards. */
function innerOf(s: NodeSpec): NodeSpec[][] {
  if (typeof s === 'string' || !('do' in s)) return [];
  return 'if' in s && s.else ? [s.do, s.else] : [s.do];
}

/** The start a slot gets when the spec gives none: nothing yet, in its kind. */
export function defaultStart(kind: ValueKind): Value {
  switch (kind) {
    case 'number':
      return 0;
    case 'yesNo':
      return false;
    case 'direction':
      return 'N';
    case 'position':
      return { x: 0, y: 0 };
    case 'list':
    case 'grid':
      return [];
  }
}

export function slotOfSpec(s: RememberSpec): MemorySlot {
  return { name: s.remember, kind: s.kind, ...(s.of && { of: s.of }), start: s.start ?? defaultStart(s.kind) };
}

/** A spec split into main's cards, its functions, its When cards and its memory slots, each in the order listed. */
export function splitSpec(spec: readonly NodeSpec[]): {
  main: NodeSpec[];
  functions: { name: string; body: NodeSpec[] }[];
  handlers: { event: string; body: NodeSpec[] }[];
  memory: MemorySlot[];
} {
  const main: NodeSpec[] = [];
  const functions: { name: string; body: NodeSpec[] }[] = [];
  const handlers: { event: string; body: NodeSpec[] }[] = [];
  const memory: MemorySlot[] = [];
  for (const s of spec) {
    if (typeof s !== 'string' && 'define' in s) functions.push({ name: s.define, body: s.do });
    else if (typeof s !== 'string' && 'on' in s) handlers.push({ event: s.on, body: s.do });
    else if (typeof s !== 'string' && 'remember' in s) memory.push(slotOfSpec(s));
    else main.push(s);
  }
  return { main, functions, handlers, memory };
}

export function buildNodes(spec: readonly NodeSpec[], newId: IdFactory): IRNode[] {
  return spec.map((s): IRNode => {
    if (typeof s === 'string') return { id: newId(), kind: s };
    if ('define' in s || 'on' in s || 'remember' in s) throw new Error(`"${kindOfSpec(s)}" can only sit at the top of a program`);
    // Ids are minted in document order so sequential factories read naturally.
    const id = newId();
    if ('call' in s) return { id, kind: 'call', name: s.call };
    if ('open' in s) return { id, kind: 'openGate', gate: s.open };
    if ('close' in s) return { id, kind: 'closeGate', gate: s.close };
    if ('set' in s) return { id, kind: 'set', slot: s.set, to: s.to };
    if ('change' in s) return { id, kind: 'change', slot: s.change, by: s.by };
    if ('face' in s) return { id, kind: 'face', slot: s.face };
    if ('unlock' in s) return { id, kind: 'unlock', gate: s.unlock, slot: s.with };
    if ('mark' in s) return { id, kind: 'mark', grid: s.mark, at: s.at, slot: s.with };
    if ('repeat' in s) return { id, kind: 'repeat', count: s.repeat, body: buildNodes(s.do, newId) };
    if ('until' in s) return { id, kind: 'until', condition: s.until, body: buildNodes(s.do, newId) };
    if ('forEach' in s) return { id, kind: 'forEach', list: s.forEach, item: s.as, body: buildNodes(s.do, newId) };
    const body = buildNodes(s.do, newId);
    if (s.else) return { id, kind: 'ifElse', condition: s.if, body, elseBody: buildNodes(s.else, newId) };
    return { id, kind: 'if', condition: s.if, body };
  });
}

export function specOf(nodes: readonly IRNode[]): NodeSpec[] {
  return nodes.map((n): NodeSpec => {
    switch (n.kind) {
      case 'repeat':
        return { repeat: n.count, do: specOf(n.body) };
      case 'if':
        return { if: n.condition, do: specOf(n.body) };
      case 'ifElse':
        return { if: n.condition, do: specOf(n.body), else: specOf(n.elseBody) };
      case 'until':
        return { until: n.condition, do: specOf(n.body) };
      case 'forEach':
        return { forEach: n.list, as: n.item, do: specOf(n.body) };
      case 'call':
        return { call: n.name };
      case 'openGate':
        return { open: n.gate };
      case 'closeGate':
        return { close: n.gate };
      case 'set':
        return { set: n.slot, to: n.to };
      case 'change':
        return { change: n.slot, by: n.by };
      case 'face':
        return { face: n.slot };
      case 'unlock':
        return { unlock: n.gate, with: n.slot };
      case 'mark':
        return { mark: n.grid, at: n.at, with: n.slot };
      default:
        return n.kind;
    }
  });
}

/**
 * The cards a spec is made of, in document order, blocks and calls included.
 * A function's or When card's cards count; their headings are not cards, and
 * neither is a memory slot.
 */
export function cardsOfSpec(spec: readonly NodeSpec[]): string[] {
  return spec.flatMap((s) => {
    const kind = kindOfSpec(s);
    const inner = innerOf(s).flatMap(cardsOfSpec);
    return kind === 'define' || kind === 'on' || kind === 'remember' ? inner : [kind, ...inner];
  });
}

/** Number of nodes a spec builds, which is what instruction budgets count. */
export function countSpec(spec: readonly NodeSpec[]): number {
  return cardsOfSpec(spec).length;
}

/** How deeply blocks nest: 0 for a flat program, 1 for one block, and so on. A function's top is depth 0. */
export function depthOfSpec(spec: readonly NodeSpec[]): number {
  let depth = 0;
  for (const s of spec) {
    const kind = kindOfSpec(s);
    const inner = Math.max(0, ...innerOf(s).map(depthOfSpec));
    if (kind === 'define' || kind === 'on') depth = Math.max(depth, inner);
    else if (innerOf(s).length > 0) depth = Math.max(depth, 1 + inner);
  }
  return depth;
}

/** Conditions a spec checks, senses and memory tests alike, for the validator. */
export function conditionsOfSpec(spec: readonly NodeSpec[]): ConditionId[] {
  return spec.flatMap((s): ConditionId[] => {
    const own = typeof s !== 'string' && ('if' in s || 'until' in s) ? ['if' in s ? s.if : (s as { until: ConditionId }).until] : [];
    return [...own, ...innerOf(s).flatMap(conditionsOfSpec)];
  });
}

/** The names a spec calls, in document order, repeats included. */
export function callsOfSpec(spec: readonly NodeSpec[]): string[] {
  return spec.flatMap((s): string[] => [...(typeof s !== 'string' && 'call' in s ? [s.call] : []), ...innerOf(s).flatMap(callsOfSpec)]);
}

/** The gates a spec opens, shuts or unlocks, for the validator. */
export function gatesOfSpec(spec: readonly NodeSpec[]): string[] {
  return spec.flatMap((s): string[] => {
    const own = typeof s === 'string' ? [] : 'open' in s ? [s.open] : 'close' in s ? [s.close] : 'unlock' in s ? [s.unlock] : [];
    return [...own, ...innerOf(s).flatMap(gatesOfSpec)];
  });
}

/** The parameters that make one entry differ from another of the same kind: a count, a condition, a gate, a slot, a value. */
function paramsOf(s: NodeSpec): string {
  if (typeof s === 'string') return '';
  const { do: _do, else: _else, ...rest } = s as Record<string, unknown>;
  return JSON.stringify(rest);
}

/**
 * Number of nodes that differ between two specs of the same shape, or -1
 * when the shapes differ. A debug level's starter must differ from the
 * solution in exactly one node: a card, a count, a condition, a gate or a
 * value. Commands swap freely with each other, and Open gate with Shut
 * gate; a function or When card is found by its name, so a different one is
 * a different shape. Memory slots are not cards and are compared elsewhere.
 */
export function specDiff(a: readonly NodeSpec[], b: readonly NodeSpec[]): number {
  const cards = (spec: readonly NodeSpec[]) => spec.filter((s) => kindOfSpec(s) !== 'remember');
  const xs = cards(a);
  const ys = cards(b);
  if (xs.length !== ys.length) return -1;
  let diffs = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    const kx = kindOfSpec(x);
    const ky = kindOfSpec(y);
    const swappable = (k: string) => typeof k === 'string' && (k === 'openGate' || k === 'closeGate');
    if (typeof x === 'string' || typeof y === 'string') {
      if (typeof x !== typeof y) return -1;
      if (x !== y) diffs++;
      continue;
    }
    if (swappable(kx) && swappable(ky)) {
      if (kx !== ky || paramsOf(x) !== paramsOf(y)) diffs++;
      continue;
    }
    if (kx !== ky) return -1;
    if (kx === 'define' || kx === 'on') {
      if (paramsOf(x) !== paramsOf(y)) return -1;
    } else if (paramsOf(x) !== paramsOf(y)) {
      diffs++;
    }
    const ix = innerOf(x);
    const iy = innerOf(y);
    if (ix.length !== iy.length) return -1;
    for (let j = 0; j < ix.length; j++) {
      const d = specDiff(ix[j]!, iy[j]!);
      if (d < 0) return -1;
      diffs += d;
    }
  }
  return diffs;
}
