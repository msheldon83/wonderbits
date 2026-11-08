/**
 * Hint paths point into a program. The same path can be followed through a
 * level's spec (to check the hint) or through the child's program (to act
 * on it). Pure.
 */
import type { NodeSpec } from '../ir/spec';
import { branchBody } from '../ir/program';
import type { Branch, IRNode, NodeId } from '../ir/types';
import type { HintPath } from './types';

/** The cards a path leads to inside a spec, or undefined when the path does not exist there. */
export function resolveSpecPath(spec: readonly NodeSpec[], path: HintPath): NodeSpec[] | undefined {
  let cards: readonly NodeSpec[] = spec;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (p === 'else') return undefined; // handled with its index below
    const node = cards[p];
    if (node === undefined || typeof node === 'string') return undefined;
    if (path[i + 1] === 'else') {
      if (!('if' in node) || !node.else) return undefined;
      cards = node.else;
      i++;
    } else {
      cards = node.do;
    }
  }
  return [...cards];
}

export interface ResolvedContainer {
  parent: NodeId | null;
  branch: Branch;
  cards: readonly IRNode[];
}

/** The container a path leads to inside a program body, or undefined when the child has not built that far. */
export function resolveNodePath(body: readonly IRNode[], path: HintPath): ResolvedContainer | undefined {
  let current: ResolvedContainer = { parent: null, branch: 'body', cards: body };
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (p === 'else') return undefined;
    const node = current.cards[p];
    if (!node) return undefined;
    const branch: Branch = path[i + 1] === 'else' ? 'else' : 'body';
    if (branch === 'else') i++;
    const cards = branchBody(node, branch);
    if (!cards) return undefined;
    current = { parent: node.id, branch, cards };
  }
  return current;
}

/** The card id a spec node is: a command name, or the block kind. */
export function cardOfSpec(node: NodeSpec): string {
  if (typeof node === 'string') return node;
  if ('repeat' in node) return 'repeat';
  if ('until' in node) return 'until';
  return node.else ? 'ifElse' : 'if';
}
