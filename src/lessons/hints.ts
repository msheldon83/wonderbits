/**
 * Hint ladder. Pure: given the level, the rung and the current program, it
 * says what to highlight, what to say, and whether to make an edit. The UI
 * only has to show it.
 */
import type { EditOp } from '../ir/ops';
import { mainBody } from '../ir/program';
import type { CommandId, NodeId, ProgramIR } from '../ir/types';
import type { Cell } from '../sim/types';
import type { PuzzleDefinition } from './types';

export interface HintEffect {
  text: string;
  cells?: Cell[];
  command?: CommandId;
  nodeId?: NodeId;
  /** The partial scaffold: one card placed for the child. */
  edit?: EditOp;
}

export function hintEffect(level: PuzzleDefinition, rung: 0 | 1 | 2, program: ProgramIR, newId: () => NodeId, full: boolean): HintEffect {
  const hint = level.hints[rung];
  const body = mainBody(program);
  switch (hint.kind) {
    case 'region':
      return { text: hint.text, cells: hint.cells };
    case 'card':
      return { text: hint.text, command: hint.command };
    case 'step':
      return { text: hint.text, nodeId: body[hint.index]?.id };
    case 'fill': {
      // Already there: just point at it. Otherwise place it, if there is room.
      const existing = body[hint.slot];
      if (existing?.kind === hint.command) return { text: hint.text, nodeId: existing.id };
      if (full) return { text: `${hint.text} Remove a step first to make room.`, command: hint.command };
      const node = { id: newId(), kind: hint.command };
      return { text: hint.text, nodeId: node.id, edit: { op: 'insert', slot: Math.min(hint.slot, body.length), node } };
    }
  }
}
