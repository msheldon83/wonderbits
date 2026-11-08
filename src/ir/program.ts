import type { IdFactory } from './ids';
import { buildNodes, type NodeSpec } from './spec';
import { IR_VERSION, MAIN, type Branch, type CommandId, type IRNode, type NodeId, type Place, type ProgramIR } from './types';

export function emptyProgram(): ProgramIR {
  return { version: IR_VERSION, procedures: [{ name: MAIN, body: [] }], handlers: [] };
}

export function programFromCommands(commands: readonly CommandId[], newId: IdFactory): ProgramIR {
  return programFromSpec(commands, newId);
}

export function programFromSpec(spec: readonly NodeSpec[], newId: IdFactory): ProgramIR {
  const program = emptyProgram();
  program.procedures[0]!.body = buildNodes(spec, newId);
  return program;
}

export function mainBody(program: ProgramIR): readonly IRNode[] {
  const main = program.procedures.find((p) => p.name === MAIN);
  if (!main) throw new Error('Program has no main procedure');
  return main.body;
}

/** The top-level kinds, for flat programs and tests. */
export function commandsOf(program: ProgramIR): string[] {
  return mainBody(program).map((n) => n.kind);
}

/** The branches of a node that hold cards. Commands have none. */
export function branchesOf(node: IRNode): Branch[] {
  switch (node.kind) {
    case 'repeat':
    case 'if':
    case 'until':
      return ['body'];
    case 'ifElse':
      return ['body', 'else'];
    default:
      return [];
  }
}

export function branchBody(node: IRNode, branch: Branch): readonly IRNode[] | undefined {
  if (branch === 'else') return node.kind === 'ifElse' ? node.elseBody : undefined;
  return 'body' in node ? node.body : undefined;
}

export interface Visit {
  node: IRNode;
  /** The container the node sits in. */
  parent: NodeId | null;
  branch: Branch;
  index: number;
  depth: number;
  /** 1-based position in document order, blocks included: the step number the child sees. */
  number: number;
}

/** Every node in document order, with where it sits. */
export function* walk(program: ProgramIR): Generator<Visit> {
  let number = 0;
  function* visit(nodes: readonly IRNode[], parent: NodeId | null, branch: Branch, depth: number): Generator<Visit> {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!;
      yield { node, parent, branch, index, depth, number: ++number };
      for (const b of branchesOf(node)) yield* visit(branchBody(node, b)!, node.id, b, depth + 1);
    }
  }
  yield* visit(mainBody(program), null, 'body', 0);
}

/** Number of program nodes, blocks included, which is what instruction budgets count. */
export function countNodes(program: ProgramIR): number {
  let n = 0;
  for (const _ of walk(program)) n++;
  return n;
}

/** How many of each card the program uses, blocks included. */
export function cardCounts(program: ProgramIR): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { node } of walk(program)) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  return counts;
}

export function findNode(program: ProgramIR, id: NodeId): IRNode | undefined {
  for (const v of walk(program)) if (v.node.id === id) return v.node;
  return undefined;
}

export function locate(program: ProgramIR, id: NodeId): Visit | undefined {
  for (const v of walk(program)) if (v.node.id === id) return v;
  return undefined;
}

/** The step number shown for a node, or null when it is not in the program. */
export function stepNumber(program: ProgramIR, id: NodeId): number | null {
  return locate(program, id)?.number ?? null;
}

/** The cards in a container, or undefined when the place does not exist. */
export function containerAt(program: ProgramIR, place: Pick<Place, 'parent' | 'branch'>): readonly IRNode[] | undefined {
  if (place.parent === null) return place.branch === 'body' ? mainBody(program) : undefined;
  const node = findNode(program, place.parent);
  return node ? branchBody(node, place.branch) : undefined;
}

/** True when `id` is `ancestor` or sits somewhere inside it. */
export function isWithin(program: ProgramIR, id: NodeId, ancestor: NodeId): boolean {
  let current: NodeId | null = id;
  while (current !== null) {
    if (current === ancestor) return true;
    current = locate(program, current)?.parent ?? null;
  }
  return false;
}

/** The ids of the blocks enclosing a node, innermost first. */
export function ancestorsOf(program: ProgramIR, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let current = locate(program, id)?.parent ?? null;
  while (current !== null) {
    out.push(current);
    current = locate(program, current)?.parent ?? null;
  }
  return out;
}

/** The deepest nesting in the program: 0 when no block holds a block. */
export function nestingDepth(program: ProgramIR): number {
  let depth = 0;
  for (const v of walk(program)) if (v.depth > depth) depth = v.depth;
  return depth;
}

/** The end of the main body: where a new card goes by default. */
export function endOfMain(program: ProgramIR): Place {
  return { parent: null, branch: 'body', index: mainBody(program).length };
}

export const samePlaceContainer = (a: Pick<Place, 'parent' | 'branch'>, b: Pick<Place, 'parent' | 'branch'>): boolean =>
  a.parent === b.parent && a.branch === b.branch;
