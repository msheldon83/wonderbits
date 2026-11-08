/**
 * Hint paths point into a program. The same path can be followed through a
 * level's spec (to check the hint) or through the child's program (to act
 * on it). Pure.
 *
 * A path starts in main, in a function when its first entry is that
 * function's name, or in a When card when it is "on:<event>". Numbers then enter cards' bodies, and "else" right after
 * a number enters that card's else branch.
 */
import { splitSpec, type NodeSpec } from '../ir/spec';
import { branchBody, functionBody, handlerBody, mainBody } from '../ir/program';
import { functionContainerId, handlerContainerId, type Branch, type IRNode, type NodeId, type ProgramIR } from '../ir/types';
import type { HintPath } from './types';

/** The function a path starts in, or null for main. */
export function pathFunction(path: HintPath): string | null {
  const first = path[0];
  return typeof first === 'string' && first !== 'else' ? first : null;
}

/** The cards a path leads to inside a spec, or undefined when the path does not exist there. */
export function resolveSpecPath(spec: readonly NodeSpec[], path: HintPath): NodeSpec[] | undefined {
  const { main, functions, handlers } = splitSpec(spec);
  const fn = pathFunction(path);
  let cards: readonly NodeSpec[] = main;
  let start = 0;
  if (fn !== null) {
    const body = fn.startsWith('on:') ? handlers.find((h) => `on:${h.event}` === fn)?.body : functions.find((x) => x.name === fn)?.body;
    if (!body) return undefined;
    cards = body;
    start = 1;
  }
  for (let i = start; i < path.length; i++) {
    const p = path[i]!;
    if (typeof p === 'string') return undefined; // "else" is handled with its index below
    const node = cards[p];
    if (node === undefined || typeof node === 'string' || !('do' in node)) return undefined;
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

/** The container a path leads to inside a program, or undefined when the child has not built that far. */
export function resolveNodePath(program: ProgramIR, path: HintPath): ResolvedContainer | undefined {
  const fn = pathFunction(path);
  let current: ResolvedContainer;
  let start = 0;
  if (fn !== null) {
    const event = fn.startsWith('on:') ? fn.slice(3) : null;
    const body = event !== null ? handlerBody(program, event) : functionBody(program, fn);
    if (!body) return undefined;
    current = { parent: event !== null ? handlerContainerId(event) : functionContainerId(fn), branch: 'body', cards: body };
    start = 1;
  } else {
    current = { parent: null, branch: 'body', cards: mainBody(program) };
  }
  for (let i = start; i < path.length; i++) {
    const p = path[i]!;
    if (typeof p === 'string') return undefined;
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

/** The card id a spec node is: a command name, the block kind, or "call". */
export function cardOfSpec(node: NodeSpec): string {
  if (typeof node === 'string') return node;
  if ('call' in node) return 'call';
  if ('open' in node) return 'openGate';
  if ('close' in node) return 'closeGate';
  if ('define' in node) return 'define';
  if ('on' in node) return 'on';
  if ('repeat' in node) return 'repeat';
  if ('until' in node) return 'until';
  return 'else' in node && node.else ? 'ifElse' : 'if';
}
