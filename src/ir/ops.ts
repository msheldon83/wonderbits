/**
 * Edit operations on the IR. Every change to a program goes through one of
 * these pure functions, so undo, redo and later AI-proposed edits share a path.
 *
 * A Place names a container (the main body, or a branch of a block) and a
 * gap in it: gap i is before node i, and the container's length is the gap
 * after the last node. The top of a function is a container too, so the same
 * operations edit main and every function alike.
 *
 * A function cannot use a function yet: a call may sit anywhere in main or
 * in a When card but never inside a function, which also rules out a
 * function calling itself.
 */
import { branchBody, containerAt, functionNames, isWithin, locate, memoryOf, procedureOfPlace, samePlaceContainer, slotsInUse } from './program';
import { FUNCTION_NAME, isCardId, isEventId, RESERVED_NAMES, functionOfContainer, handlerOfContainer, MAIN, type MemorySlot, type Source, REPEAT_MAX, REPEAT_MIN, type Branch, type ConditionId, type IRNode, type NodeId, type Place, type ProgramIR } from './types';

export type EditOp =
  | { op: 'insert'; at: Place; node: IRNode }
  | { op: 'move'; id: NodeId; to: Place }
  | { op: 'delete'; id: NodeId }
  /** Change a block's parameter: a Repeat's count or an If's or Until's condition. */
  | { op: 'set'; id: NodeId; count?: number; condition?: ConditionId; gate?: string; slot?: string; to?: Source; by?: number; list?: string; item?: string; grid?: string; at?: string; target?: number | string; dir?: 'N' | 'E' | 'S' | 'W'; column?: number | string | null; row?: number | string | null }
  /** Give the robot a memory slot, or forget one no card uses. */
  | { op: 'addSlot'; slot: MemorySlot }
  | { op: 'removeSlot'; name: string }
  /** Creation mode: a function of the child's own, empty, and its removal once no card calls it. */
  | { op: 'addFunction'; name: string }
  | { op: 'removeFunction'; name: string }
  /** Creation mode: a When card for an event, empty, and its removal with whatever it holds. */
  | { op: 'addHandler'; event: string }
  | { op: 'removeHandler'; event: string };

/**
 * Why a name cannot be given to a new function or memory slot, said to the
 * child, or null when it can. A name prints as real TypeScript, so it is a
 * short word that starts with a small letter and is not already taken.
 */
export function nameProblem(program: ProgramIR, name: string): string | null {
  if (name.length === 0) return 'Type a name first.';
  if (!FUNCTION_NAME.test(name)) return name.length > 20 ? 'That name is too long. Use 20 letters or fewer.' : 'A name starts with a small letter and has only letters and numbers, like hop or bigJump.';
  if (RESERVED_NAMES.has(name) || isCardId(name) || ['here', 'ahead', 'facing', 'acorns', 'acornsLeft', 'coin', 'randomWay', 'x', 'y', 'column', 'row', 'item', 'list'].includes(name)) return `The robot already uses the word ${name}. Pick another name.`;
  if (functionNames(program).includes(name) || memoryOf(program).some((m) => m.name === name)) return `There is already something named ${name}.`;
  return null;
}

/** Rebuild every procedure's and every When card's body. Handlers are named `on:<event>` here. */
function mapBodies(program: ProgramIR, update: (body: readonly IRNode[], name: string) => IRNode[]): ProgramIR {
  return {
    ...program,
    procedures: program.procedures.map((p) => ({ ...p, body: update(p.body, p.name) })),
    handlers: program.handlers.map((h) => ({ ...h, body: update(h.body, `on:${h.event}`) })),
  };
}

/** Rebuild the program with one container's cards replaced, wherever it is. */
function updateIn(program: ProgramIR, parent: NodeId | null, branch: Branch, update: (cards: IRNode[]) => IRNode[]): ProgramIR {
  const fn = functionOfContainer(parent);
  const event = handlerOfContainer(parent);
  return mapBodies(program, (body, name) => {
    if (parent === null) return name === MAIN ? update([...body]) : [...body];
    if (fn !== null) return name === fn ? update([...body]) : [...body];
    if (event !== null) return name === parent ? update([...body]) : [...body];
    return updateContainer(body, parent, branch, update);
  });
}

function hasCall(nodes: readonly IRNode[]): boolean {
  return nodes.some((n) => n.kind === 'call' || (['body', 'else'] as const).some((b) => hasCall(branchBody(n, b) ?? [])));
}

/** Calls belong in main for now, and each must name one of the program's functions. */
function checkCalls(program: ProgramIR, node: IRNode, at: Pick<Place, 'parent'>): void {
  if (!hasCall([node])) return;
  const procedure = procedureOfPlace(program, at);
  if (procedure !== MAIN && !procedure?.startsWith('on:')) throw new Error('A function cannot use a function');
  const names = new Set(functionNames(program));
  const check = (n: IRNode) => {
    if (n.kind === 'call' && !names.has(n.name)) throw new Error(`No function named ${n.name}`);
    for (const b of ['body', 'else'] as const) (branchBody(n, b) ?? []).forEach(check);
  };
  check(node);
}

/** True when a call to the named function sits anywhere in these cards. */
function callsFunction(nodes: readonly IRNode[], name: string): boolean {
  return nodes.some((n) => (n.kind === 'call' && n.name === name) || (['body', 'else'] as const).some((b) => callsFunction(branchBody(n, b) ?? [], name)));
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
      if (branch === 'body' && (n.kind === 'repeat' || n.kind === 'if' || n.kind === 'ifElse' || n.kind === 'until' || n.kind === 'forEach')) return { ...n, body: update([...n.body]) };
      throw new Error(`Node ${parent} has no ${branch} branch`);
    }
    switch (n.kind) {
      case 'repeat':
      case 'if':
      case 'until':
      case 'forEach':
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
        case 'forEach':
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
  switch (edit.op) {
    case 'addSlot': {
      if (memoryOf(program).some((m) => m.name === edit.slot.name)) throw new Error(`The robot already remembers ${edit.slot.name}`);
      return { ...program, memory: [...memoryOf(program), edit.slot] };
    }
    case 'removeSlot': {
      if (slotsInUse(program).has(edit.name)) throw new Error(`${edit.name} is still used by a card`);
      const memory = memoryOf(program).filter((m) => m.name !== edit.name);
      const { memory: _old, ...rest } = program;
      return memory.length > 0 ? { ...rest, memory } : rest;
    }
    case 'addFunction': {
      const problem = nameProblem(program, edit.name);
      if (problem) throw new Error(problem);
      return { ...program, procedures: [...program.procedures, { name: edit.name, body: [] }] };
    }
    case 'removeFunction': {
      if (edit.name === MAIN || !functionNames(program).includes(edit.name)) throw new Error(`No function named ${edit.name}`);
      const called = [...program.procedures, ...program.handlers].some((p) => callsFunction(p.body, edit.name));
      if (called) throw new Error(`${edit.name} is still used by a card`);
      return { ...program, procedures: program.procedures.filter((p) => p.name !== edit.name) };
    }
    case 'addHandler': {
      if (!isEventId(edit.event)) throw new Error(`No event named ${edit.event}`);
      if (program.handlers.some((h) => h.event === edit.event)) throw new Error(`There is already a When card for ${edit.event}`);
      return { ...program, handlers: [...program.handlers, { event: edit.event, body: [] }] };
    }
    case 'removeHandler': {
      if (!program.handlers.some((h) => h.event === edit.event)) throw new Error(`No When card for ${edit.event}`);
      return { ...program, handlers: program.handlers.filter((h) => h.event !== edit.event) };
    }
    case 'insert': {
      const container = containerAt(program, edit.at);
      if (!container) throw new Error(`No container at ${edit.at.parent}/${edit.at.branch}`);
      assertIndex(edit.at.index, container.length);
      const existing = new Set<NodeId>();
      for (const p of [...program.procedures, ...program.handlers]) idsIn(p.body, existing);
      for (const id of idsIn([edit.node])) {
        if (existing.has(id)) throw new Error(`Node id ${id} already exists`);
      }
      checkCalls(program, edit.node, edit.at);
      return updateIn(program, edit.at.parent, edit.at.branch, (cards) => (cards.splice(edit.at.index, 0, edit.node), cards));
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
      checkCalls(program, from.node, edit.to);
      // Removing the node shifts later gaps in the same container down by one.
      const index = samePlaceContainer(from, edit.to) && edit.to.index > from.index ? edit.to.index - 1 : edit.to.index;
      const without = mapBodies(program, (body) => removeNode(body, edit.id));
      return updateIn(without, edit.to.parent, edit.to.branch, (cards) => (cards.splice(index, 0, from.node), cards));
    }
    case 'delete': {
      if (!locate(program, edit.id)) throw new Error(`No node ${edit.id}`);
      return mapBodies(program, (body) => removeNode(body, edit.id));
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
      if (edit.gate !== undefined && node.kind !== 'openGate' && node.kind !== 'closeGate' && node.kind !== 'unlock') throw new Error(`Node ${edit.id} has no gate`);
      if (edit.slot !== undefined && !('slot' in node)) throw new Error(`Node ${edit.id} has no slot`);
      if (edit.to !== undefined && node.kind !== 'set' && node.kind !== 'push') throw new Error(`Node ${edit.id} has no value`);
      if (edit.by !== undefined && node.kind !== 'change') throw new Error(`Node ${edit.id} has no amount`);
      if (edit.list !== undefined && node.kind !== 'forEach' && node.kind !== 'push') throw new Error(`Node ${edit.id} has no list`);
      if (edit.item !== undefined && node.kind !== 'forEach') throw new Error(`Node ${edit.id} has no item`);
      if ((edit.grid !== undefined || edit.at !== undefined) && node.kind !== 'mark') throw new Error(`Node ${edit.id} has no grid`);
      if (edit.target !== undefined && node.kind !== 'goRow' && node.kind !== 'goColumn') throw new Error(`Node ${edit.id} has no row or column`);
      if (edit.dir !== undefined && node.kind !== 'shift') throw new Error(`Node ${edit.id} has no direction`);
      if ((edit.column !== undefined || edit.row !== undefined) && node.kind !== 'fly') throw new Error(`Node ${edit.id} has no column or row to fly to`);
      const patch = (n: IRNode): IRNode => {
        if (n.id !== edit.id) return n;
        if (n.kind === 'goRow' || n.kind === 'goColumn') return { ...n, ...(edit.target !== undefined && { to: edit.target }) };
        if (n.kind === 'fly') {
          // null clears a coordinate, so it stays where it is; at least one must remain.
          const { column: _c, row: _r, ...rest } = n;
          const column = edit.column === undefined ? n.column : (edit.column ?? undefined);
          const row = edit.row === undefined ? n.row : (edit.row ?? undefined);
          if (column === undefined && row === undefined) throw new Error(`Node ${edit.id} must fly to a column, a row or both`);
          return { ...rest, ...(edit.slot !== undefined && { slot: edit.slot }), ...(column !== undefined && { column }), ...(row !== undefined && { row }) };
        }
        if (n.kind === 'shift') return { ...n, ...(edit.slot !== undefined && { slot: edit.slot }), ...(edit.dir !== undefined && { dir: edit.dir }) };
        if (n.kind === 'push') return { ...n, ...(edit.list !== undefined && { list: edit.list }), ...(edit.to !== undefined && { to: edit.to }) };
        if (n.kind === 'mark') return { ...n, ...(edit.slot !== undefined && { slot: edit.slot }), ...(edit.grid !== undefined && { grid: edit.grid }), ...(edit.at !== undefined && { at: edit.at }) };
        if (n.kind === 'set' || n.kind === 'change' || n.kind === 'face' || n.kind === 'unlock') {
          let out: IRNode = { ...n, ...(edit.slot !== undefined && { slot: edit.slot }) };
          if (out.kind === 'set' && edit.to !== undefined) out = { ...out, to: edit.to };
          if (out.kind === 'change' && edit.by !== undefined) out = { ...out, by: edit.by };
          if (out.kind === 'unlock' && edit.gate !== undefined) out = { ...out, gate: edit.gate };
          return out;
        }
        if (n.kind === 'forEach') return { ...n, ...(edit.list !== undefined && { list: edit.list }), ...(edit.item !== undefined && { item: edit.item }) };
        if ((n.kind === 'openGate' || n.kind === 'closeGate') && edit.gate !== undefined) return { ...n, gate: edit.gate };
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
            case 'forEach':
              return { ...p, body: replaceIn(p.body) };
            case 'ifElse':
              return { ...p, body: replaceIn(p.body), elseBody: replaceIn(p.elseBody) };
            default:
              return p;
          }
        });
      return mapBodies(program, replaceIn);
    }
  }
}

/** True when moving a node to a place would leave the program unchanged. */
export function isNoOpMove(program: ProgramIR, id: NodeId, to: Place): boolean {
  const from = locate(program, id);
  if (!from) return true;
  return samePlaceContainer(from, to) && (to.index === from.index || to.index === from.index + 1);
}
