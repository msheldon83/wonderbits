/**
 * Edit operations on the IR. Every change to a program goes through one of
 * these pure functions, so undo, redo and later AI-proposed edits share a path.
 *
 * Slots are numbered 0..n for a body of n nodes: slot i is the gap before
 * node i, and slot n is the gap after the last node.
 */
import { mainBody } from './program';
import { MAIN, type IRNode, type NodeId, type ProgramIR } from './types';

export type EditOp =
  | { op: 'insert'; slot: number; node: IRNode }
  | { op: 'move'; id: NodeId; slot: number }
  | { op: 'delete'; id: NodeId };

function withMainBody(program: ProgramIR, body: IRNode[]): ProgramIR {
  return {
    ...program,
    procedures: program.procedures.map((p) => (p.name === MAIN ? { ...p, body } : p)),
  };
}

function assertSlot(slot: number, length: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > length) {
    throw new RangeError(`Slot ${slot} is outside 0..${length}`);
  }
}

export function applyOp(program: ProgramIR, edit: EditOp): ProgramIR {
  const body = [...mainBody(program)];
  switch (edit.op) {
    case 'insert': {
      assertSlot(edit.slot, body.length);
      if (body.some((n) => n.id === edit.node.id)) {
        throw new Error(`Node id ${edit.node.id} already exists`);
      }
      body.splice(edit.slot, 0, edit.node);
      return withMainBody(program, body);
    }
    case 'move': {
      assertSlot(edit.slot, body.length);
      const from = body.findIndex((n) => n.id === edit.id);
      if (from < 0) throw new Error(`No node ${edit.id}`);
      const [node] = body.splice(from, 1);
      // Removing the node shifts later slots down by one.
      const to = edit.slot > from ? edit.slot - 1 : edit.slot;
      body.splice(to, 0, node!);
      return withMainBody(program, body);
    }
    case 'delete': {
      const from = body.findIndex((n) => n.id === edit.id);
      if (from < 0) throw new Error(`No node ${edit.id}`);
      body.splice(from, 1);
      return withMainBody(program, body);
    }
  }
}

/** True when moving a node to a slot would leave the program unchanged. */
export function isNoOpMove(program: ProgramIR, id: NodeId, slot: number): boolean {
  const from = mainBody(program).findIndex((n) => n.id === id);
  return slot === from || slot === from + 1;
}
