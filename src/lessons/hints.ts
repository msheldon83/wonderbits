/**
 * Hint ladder. Pure: given the level, the rung and the current program, it
 * says what to highlight, what to say, and whether to make an edit. The UI
 * only has to show it.
 */
import type { EditOp } from '../ir/ops';
import { mainBody } from '../ir/program';
import { buildNodes, type NodeSpec } from '../ir/spec';
import type { CardId, IRNode, NodeId, ProgramIR } from '../ir/types';
import type { Cell } from '../sim/types';
import { cardOfSpec, resolveNodePath, resolveSpecPath } from './paths';
import type { HintPath, PuzzleDefinition } from './types';

export interface HintEffect {
  text: string;
  cells?: Cell[];
  command?: CardId;
  nodeId?: NodeId;
  /** The partial scaffold: one card placed for the child. */
  edit?: EditOp;
}

/** The card the fill rung places: a block comes with its count or condition from the solution, but empty. */
function scaffoldNode(level: PuzzleDefinition, path: HintPath, slot: number, command: CardId, newId: () => NodeId): IRNode {
  const cards = resolveSpecPath(level.referenceSolution, path);
  const there = cards?.[slot];
  let spec: NodeSpec;
  if (there !== undefined && typeof there !== 'string' && cardOfSpec(there) === command) {
    spec = 'repeat' in there ? { repeat: there.repeat, do: [] } : 'until' in there ? { until: there.until, do: [] } : there.else ? { if: there.if, do: [], else: [] } : { if: there.if, do: [] };
  } else if (command === 'repeat') spec = { repeat: 3, do: [] };
  else if (command === 'until') spec = { until: 'atFlag', do: [] };
  else if (command === 'if') spec = { if: 'blockedAhead', do: [] };
  else if (command === 'ifElse') spec = { if: 'pathAhead', do: [], else: [] };
  else spec = command;
  return buildNodes([spec], newId)[0]!;
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
      return { text: hint.text, nodeId: resolveNodePath(body, hint.path)?.cards[hint.index]?.id };
    case 'fill': {
      // The child has not built the block the hint points into: point at the card instead.
      const container = resolveNodePath(body, hint.path);
      if (!container) return { text: hint.text, command: hint.command };
      // Already there: just point at it. Otherwise place it, if there is room.
      const existing = container.cards[hint.slot];
      if (existing?.kind === hint.command) return { text: hint.text, nodeId: existing.id };
      if (full) return { text: `${hint.text} Remove a step first to make room.`, command: hint.command };
      const node = scaffoldNode(level, hint.path, hint.slot, hint.command, newId);
      return {
        text: hint.text,
        nodeId: node.id,
        edit: { op: 'insert', at: { parent: container.parent, branch: container.branch, index: Math.min(hint.slot, container.cards.length) }, node },
      };
    }
  }
}
