/**
 * Edit operations on the IR. Every change to a program goes through one of
 * these pure functions, so undo, redo and later AI-proposed edits share a path.
 *
 * A Place names a container (the main body, or a branch of a block) and a
 * gap in it: gap i is before node i, and the container's length is the gap
 * after the last node.
 */
import { branchBody, containerAt, isWithin, locate, mainBody, samePlaceContainer } from './program';
import { MAIN, REPEAT_MAX, REPEAT_MIN, type Branch, type ConditionId, type IRNode, type NodeId, type Place, type ProgramIR } from './types';

export type EditOp =
  | { op: 'insert'; at: Place; node: IRNode }
  | { op: 'move'; id: NodeId; to: Place }
  | { op: 'delete'; id: NodeId }
  /** Change a block's parameter: a Repeat's count or an If's or Until's condition. */
  | { op: 'set'; id: NodeId; count?: number; condition?: ConditionId };

function withMainBody(program: ProgramIR, body: IRNode[]): ProgramIR {
  return {
    ...program,
    procedures: program.procedures.map((p) => (p.name === MAIN ? { ...p, body } : p)),
  };
}

function assertIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new RangeError(`Index ${index} is outside 0..${length}`);
  }
}

/** Rebuild the tree with one container's cards replaced. */
function updateContainer(nodes: readonly IRNode[], parent: NodeId | null, branch: Branch, update: (cards: IRNode[]) => IRNode[]): IRNode[] {
  if (parent === null) return update([...nodes]);
  return nodes.map((n) => {
    if (n.id === parent) {
      if (branch === 'else' && n.kind === 'ifElse') return { ...n, elseBody: update([...n.elseBody]) };
      if (branch === 'body' && (n.kind === 'repeat' || n.kind === 'if' || n.kind === 'ifElse' || n.kind === 'until')) return { ...n, body: update([...n.body]) };
      throw new Error(`Node ${parent} has no ${branch} branch`);
    }
    switch (n.kind) {
      case 'repeat':
      case 'if':
      case 'until':
        return { ...n, body: updateContainer(n.body, parent, branch, update) };
      case 'ifElse':
        return { ...n, body: updateContainer(n.body, parent, branch, update), elseBody: updateContainer(n.elseBody, parent, branch, update) };
      default:
        return n;
    }
  });
}

function removeNode(nodes: readonly IRNode[], id: NodeId): IRNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      switch (n.kind) {
        case 'repeat':
        case 'if':
        case 'until':
          return { ...n, body: removeNode(n.body, id) };
        case 'ifElse':
          return { ...n, body: removeNode(n.body, id), elseBody: removeNode(n.elseBody, id) };
        default:
          return n;
      }
    });
}

function idsIn(nodes: readonly IRNode[], out: Set<NodeId> = new Set()): Set<NodeId> {
  for (const n of nodes) {
    out.add(n.id);
    for (const branch of ['body', 'else'] as const) {
      const inner = branchBody(n, branch);
      if (inner) idsIn(inner, out);
    }
  }
  return out;
}

export function applyOp(program: ProgramIR, edit: EditOp): ProgramIR {
  const body = mainBody(program);
  switch (edit.op) {
    case 'insert': {
      const container = containerAt(program, edit.at);
      if (!container) throw new Error(`No container at ${edit.at.parent}/${edit.at.branch}`);
      assertIndex(edit.at.index, container.length);
      const existing = idsIn(body);
      for (const id of idsIn([edit.node])) {
        if (existing.has(id)) throw new Error(`Node id ${id} already exists`);
      }
      return withMainBody(program, updateContainer(body, edit.at.parent, edit.at.branch, (cards) => (cards.splice(edit.at.index, 0, edit.node), cards)));
    }
    case 'move': {
      const from = locate(program, edit.id);
      if (!from) throw new Error(`No node ${edit.id}`);
      if (edit.to.parent !== null && isWithin(program, edit.to.parent, edit.id)) {
        throw new Error(`Cannot move node ${edit.id} inside itself`);
      }
      const target = containerAt(program, edit.to);
      if (!target) throw new Error(`No container at ${edit.to.parent}/${edit.to.branch}`);
      assertIndex(edit.to.index, target.length);
      // Removing the node shifts later gaps in the same container down by one.
      const index = samePlaceContainer(from, edit.to) && edit.to.index > from.index ? edit.to.index - 1 : edit.to.index;
      const without = removeNode(body, edit.id);
      return withMainBody(program, updateContainer(without, edit.to.parent, edit.to.branch, (cards) => (cards.splice(index, 0, from.node), cards)));
    }
    case 'delete': {
      if (!locate(program, edit.id)) throw new Error(`No node ${edit.id}`);
      return withMainBody(program, removeNode(body, edit.id));
    }
    case 'set': {
      const found = locate(program, edit.id);
      if (!found) throw new Error(`No node ${edit.id}`);
      const node = found.node;
      if (edit.count !== undefined) {
        if (node.kind !== 'repeat') throw new Error(`Node ${edit.id} has no count`);
        if (!Number.isInteger(edit.count) || edit.count < REPEAT_MIN || edit.count > REPEAT_MAX) {
          throw new RangeError(`Count ${edit.count} is outside ${REPEAT_MIN}..${REPEAT_MAX}`);
        }
      }
      if (edit.condition !== undefined && node.kind !== 'if' && node.kind !== 'ifElse' && node.kind !== 'until') {
        throw new Error(`Node ${edit.id} has no condition`);
      }
      const patch = (n: IRNode): IRNode => {
        if (n.id !== edit.id) return n;
        if (n.kind === 'repeat' && edit.count !== undefined) return { ...n, count: edit.count };
        if ((n.kind === 'if' || n.kind === 'ifElse' || n.kind === 'until') && edit.condition !== undefined) return { ...n, condition: edit.condition };
        return n;
      };
      const replaceIn = (nodes: readonly IRNode[]): IRNode[] =>
        nodes.map((n) => {
          const p = patch(n);
          switch (p.kind) {
            case 'repeat':
            case 'if':
            case 'until':
              return { ...p, body: replaceIn(p.body) };
            case 'ifElse':
              return { ...p, body: replaceIn(p.body), elseBody: replaceIn(p.elseBody) };
            default:
              return p;
          }
        });
      return withMainBody(program, replaceIn(body));
    }
  }
}

/** True when moving a node to a place would leave the program unchanged. */
export function isNoOpMove(program: ProgramIR, id: NodeId, to: Place): boolean {
  const from = locate(program, id);
  if (!from) return true;
  return samePlaceContainer(from, to) && (to.index === from.index || to.index === from.index + 1);
}
