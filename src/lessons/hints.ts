/**
 * Hint ladder. Pure: given the level, the rung and the current program, it
 * says what to highlight, what to say, and whether to make an edit. The UI
 * only has to show it.
 */
import type { EditOp } from '../ir/ops';
import { functionNames } from '../ir/program';
import { buildNodes, type NodeSpec } from '../ir/spec';
import type { CardId, CommandId, IRNode, NodeId, ProgramIR } from '../ir/types';
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

/**
 * The card the fill rung places: a block comes with its count or condition
 * from the solution, but empty; a call names the function the solution
 * calls there.
 */
function scaffoldNode(level: PuzzleDefinition, program: ProgramIR, path: HintPath, slot: number, command: CardId, newId: () => NodeId): IRNode {
  const cards = resolveSpecPath(level.referenceSolution, path);
  const there = cards?.[slot];
  let spec: NodeSpec;
  if (there !== undefined && typeof there !== 'string' && cardOfSpec(there) === command) {
    if ('call' in there) spec = { call: there.call };
    else if ('repeat' in there) spec = { repeat: there.repeat, do: [] };
    else if ('until' in there) spec = { until: there.until, do: [] };
    else if ('if' in there) spec = there.else ? { if: there.if, do: [], else: [] } : { if: there.if, do: [] };
    else spec = command as CommandId;
  } else if (command === 'call') spec = { call: functionNames(program)[0] ?? 'main' };
  else if (command === 'repeat') spec = { repeat: 3, do: [] };
  else if (command === 'until') spec = { until: 'atFlag', do: [] };
  else if (command === 'if') spec = { if: 'blockedAhead', do: [] };
  else if (command === 'ifElse') spec = { if: 'pathAhead', do: [], else: [] };
  else spec = command as CommandId;
  return buildNodes([spec], newId)[0]!;
}

export function hintEffect(level: PuzzleDefinition, rung: 0 | 1 | 2, program: ProgramIR, newId: () => NodeId, full: boolean): HintEffect {
  const hint = level.hints[rung];
  switch (hint.kind) {
    case 'region':
      return { text: hint.text, cells: hint.cells };
    case 'card':
      return { text: hint.text, command: hint.command };
    case 'step':
      return { text: hint.text, nodeId: resolveNodePath(program, hint.path)?.cards[hint.index]?.id };
    case 'fill': {
      // The child has not built the block the hint points into: point at the card instead.
      const container = resolveNodePath(program, hint.path);
      if (!container) return { text: hint.text, command: hint.command };
      // Already there: just point at it. Otherwise place it, if there is room.
      const existing = container.cards[hint.slot];
      const wanted = scaffoldNode(level, program, hint.path, hint.slot, hint.command, newId);
      const same = existing?.kind === hint.command && (existing.kind !== 'call' || (wanted.kind === 'call' && existing.name === wanted.name));
      if (existing && same) return { text: hint.text, nodeId: existing.id };
      if (full) return { text: `${hint.text} Remove a step first to make room.`, command: hint.command };
      const node = wanted;
      return {
        text: hint.text,
        nodeId: node.id,
        edit: { op: 'insert', at: { parent: container.parent, branch: container.branch, index: Math.min(hint.slot, container.cards.length) }, node },
      };
    }
  }
}
