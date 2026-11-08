/**
 * Program specs: the compact, id-free form of a program used by level files
 * and tests. A spec is a list of commands and blocks:
 *
 *   ["forward", { "repeat": 3, "do": ["forward", "rotateCW"] }]
 *   [{ "if": "blockedAhead", "do": ["rotateCW"], "else": ["forward"] }]
 *   [{ "until": "atFlag", "do": ["forward"] }]
 *   [{ "call": "hop" }, "forward", { "call": "hop" }, { "define": "hop", "do": ["forward", "rotateCW"] }]
 *
 * An "if" with an "else" is an ifElse node. A "define" gives a function its
 * cards; it may only sit at the top of a program spec, and it becomes a
 * procedure of its own rather than a card of main, wherever it is listed.
 * Building a program from a spec mints fresh ids; specOf throws the ids away
 * again.
 */
import type { IdFactory } from './ids';
import type { CommandId, ConditionId, IRNode } from './types';

export type NodeSpec =
  | CommandId
  | { repeat: number; do: NodeSpec[] }
  | { if: ConditionId; do: NodeSpec[]; else?: NodeSpec[] }
  | { until: ConditionId; do: NodeSpec[] }
  | { call: string }
  | { define: string; do: NodeSpec[] };

export type DefineSpec = Extract<NodeSpec, { define: string }>;

/** A spec split into main's cards and the functions it defines, in the order listed. */
export function splitSpec(spec: readonly NodeSpec[]): { main: NodeSpec[]; functions: { name: string; body: NodeSpec[] }[] } {
  const main: NodeSpec[] = [];
  const functions: { name: string; body: NodeSpec[] }[] = [];
  for (const s of spec) {
    if (typeof s !== 'string' && 'define' in s) functions.push({ name: s.define, body: s.do });
    else main.push(s);
  }
  return { main, functions };
}

export function buildNodes(spec: readonly NodeSpec[], newId: IdFactory): IRNode[] {
  return spec.map((s): IRNode => {
    if (typeof s === 'string') return { id: newId(), kind: s };
    if ('define' in s) throw new Error(`"define ${s.define}" can only sit at the top of a program`);
    // Ids are minted in document order so sequential factories read naturally.
    const id = newId();
    if ('call' in s) return { id, kind: 'call', name: s.call };
    if ('repeat' in s) return { id, kind: 'repeat', count: s.repeat, body: buildNodes(s.do, newId) };
    if ('until' in s) return { id, kind: 'until', condition: s.until, body: buildNodes(s.do, newId) };
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
      case 'call':
        return { call: n.name };
      default:
        return n.kind;
    }
  });
}

/**
 * The cards a spec is made of, in document order, blocks and calls included.
 * A function's cards count; the "define" heading itself is not a card.
 */
export function cardsOfSpec(spec: readonly NodeSpec[]): string[] {
  return spec.flatMap((s) => {
    if (typeof s === 'string') return [s];
    if ('call' in s) return ['call'];
    if ('define' in s) return cardsOfSpec(s.do);
    if ('repeat' in s) return ['repeat', ...cardsOfSpec(s.do)];
    if ('until' in s) return ['until', ...cardsOfSpec(s.do)];
    return [s.else ? 'ifElse' : 'if', ...cardsOfSpec(s.do), ...cardsOfSpec(s.else ?? [])];
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
    if (typeof s === 'string' || 'call' in s) continue;
    if ('define' in s) {
      depth = Math.max(depth, depthOfSpec(s.do));
      continue;
    }
    const inner = 1 + Math.max(depthOfSpec(s.do), 'if' in s && s.else ? depthOfSpec(s.else) : 0);
    depth = Math.max(depth, inner);
  }
  return depth;
}

/** Conditions a spec senses, for the validator. */
export function conditionsOfSpec(spec: readonly NodeSpec[]): ConditionId[] {
  return spec.flatMap((s) => {
    if (typeof s === 'string' || 'call' in s) return [];
    if ('repeat' in s || 'define' in s) return conditionsOfSpec(s.do);
    if ('until' in s) return [s.until, ...conditionsOfSpec(s.do)];
    return [s.if, ...conditionsOfSpec(s.do), ...conditionsOfSpec(s.else ?? [])];
  });
}

/** The names a spec calls, in document order, repeats included. */
export function callsOfSpec(spec: readonly NodeSpec[]): string[] {
  return spec.flatMap((s): string[] => {
    if (typeof s === 'string') return [];
    if ('call' in s) return [s.call];
    if ('if' in s) return [...callsOfSpec(s.do), ...callsOfSpec(s.else ?? [])];
    return callsOfSpec(s.do);
  });
}

/**
 * Number of nodes that differ between two specs of the same shape, or -1
 * when the shapes differ. A debug level's starter must differ from the
 * solution in exactly one node: a card, a count or a condition.
 */
export function specDiff(a: readonly NodeSpec[], b: readonly NodeSpec[]): number {
  if (a.length !== b.length) return -1;
  let diffs = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (typeof x === 'string' || typeof y === 'string') {
      if (typeof x !== typeof y) return -1;
      if (x !== y) diffs++;
      continue;
    }
    const kindOf = (s: Exclude<NodeSpec, string>) =>
      'call' in s ? 'call' : 'define' in s ? 'define' : 'repeat' in s ? 'repeat' : 'until' in s ? 'until' : s.else ? 'ifElse' : 'if';
    if (kindOf(x) !== kindOf(y)) return -1;
    if ('call' in x) {
      if (x.call !== (y as { call: string }).call) diffs++;
      continue;
    }
    if ('define' in x) {
      // A function is found by its name, so a different name is a different shape.
      if (x.define !== (y as DefineSpec).define) return -1;
      const inner = specDiff(x.do, (y as DefineSpec).do);
      if (inner < 0) return -1;
      diffs += inner;
      continue;
    }
    const param = 'repeat' in x ? x.repeat : 'until' in x ? x.until : x.if;
    const paramY = 'repeat' in y ? y.repeat : 'until' in y ? y.until : (y as { if: ConditionId }).if;
    if (param !== paramY) diffs++;
    const inner = specDiff(x.do, (y as { do: NodeSpec[] }).do);
    if (inner < 0) return -1;
    diffs += inner;
    if ('if' in x && x.else) {
      const elseDiff = specDiff(x.else, (y as { else?: NodeSpec[] }).else ?? []);
      if (elseDiff < 0) return -1;
      diffs += elseDiff;
    }
  }
  return diffs;
}
