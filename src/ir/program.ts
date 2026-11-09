import type { IdFactory } from './ids';
import { buildNodes, specOf, splitSpec, type NodeSpec } from './spec';
import { functionContainerId, functionOfContainer, handlerContainerId, handlerOfContainer, IR_VERSION, MAIN, parseSlotTest, type Branch, type CommandId, type EventHandler, type IRNode, type MemorySlot, type NodeId, type Place, type Procedure, type ProgramIR } from './types';

export function emptyProgram(): ProgramIR {
  return { version: IR_VERSION, procedures: [{ name: MAIN, body: [] }], handlers: [] };
}

export function programFromCommands(commands: readonly CommandId[], newId: IdFactory): ProgramIR {
  return programFromSpec(commands, newId);
}

/** A program from a spec: main's cards, a procedure for each "define" and a handler for each "on", in the order listed. */
export function programFromSpec(spec: readonly NodeSpec[], newId: IdFactory): ProgramIR {
  const { main, functions, handlers, memory } = splitSpec(spec);
  const program = emptyProgram();
  if (memory.length > 0) program.memory = memory;
  program.procedures[0]!.body = buildNodes(main, newId);
  for (const f of functions) program.procedures.push({ name: f.name, body: buildNodes(f.body, newId) });
  for (const h of handlers) program.handlers.push({ event: h.event, body: buildNodes(h.body, newId) });
  return program;
}

/** The program back as a spec: main's cards, then each function as a "define", then each When card as an "on". */
export function programSpec(program: ProgramIR): NodeSpec[] {
  return [
    ...memoryOf(program).map((m): NodeSpec => ({ remember: m.name, kind: m.kind, ...(m.of && { of: m.of }), start: m.start })),
    ...specOf(mainBody(program)),
    ...functionsOf(program).map((f): NodeSpec => ({ define: f.name, do: specOf(f.body) })),
    ...program.handlers.map((h): NodeSpec => ({ on: h.event, do: specOf(h.body) })),
  ];
}

/** The cards of the When card for an event, or undefined when the program has none. */
export function handlerBody(program: ProgramIR, event: string): readonly IRNode[] | undefined {
  return program.handlers.find((h) => h.event === event)?.body;
}

export const handlersOf = (program: ProgramIR): readonly EventHandler[] => program.handlers;

/** The robot's memory slots, in order. */
export const memoryOf = (program: ProgramIR): readonly MemorySlot[] => program.memory ?? [];

export function slotOf(program: ProgramIR, name: string): MemorySlot | undefined {
  return memoryOf(program).find((m) => m.name === name);
}

/** The slot names cards use, so a slot in use cannot be forgotten. */
export function slotsInUse(program: ProgramIR): Set<string> {
  const used = new Set<string>();
  for (const { node } of walk(program)) {
    if (node.kind === 'set' || node.kind === 'change' || node.kind === 'face' || node.kind === 'unlock') used.add(node.slot);
    if (node.kind === 'forEach') {
      used.add(node.list);
      used.add(node.item);
    }
    if (node.kind === 'if' || node.kind === 'ifElse' || node.kind === 'until') {
      const test = parseSlotTest(node.condition);
      if (test) used.add(test.slot);
    }
  }
  return used;
}

export function mainBody(program: ProgramIR): readonly IRNode[] {
  const main = program.procedures.find((p) => p.name === MAIN);
  if (!main) throw new Error('Program has no main procedure');
  return main.body;
}

/** The program's functions: every procedure but main, in order. */
export function functionsOf(program: ProgramIR): readonly Procedure[] {
  return program.procedures.filter((p) => p.name !== MAIN);
}

export function functionNames(program: ProgramIR): string[] {
  return functionsOf(program).map((p) => p.name);
}

/** The cards of a function, or undefined when the program has no function by that name. */
export function functionBody(program: ProgramIR, name: string): readonly IRNode[] | undefined {
  return name === MAIN ? undefined : program.procedures.find((p) => p.name === name)?.body;
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
    case 'forEach':
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
  /** The procedure the node belongs to: main, a function's name, or a When card's container id (`on:<event>`). */
  procedure: string;
}

/**
 * Every node in document order, with where it sits: main first, then each
 * function. Step numbers run straight on from main into the functions, so
 * "step 7" means one card wherever it is.
 */
export function* walk(program: ProgramIR): Generator<Visit> {
  let number = 0;
  function* visit(nodes: readonly IRNode[], parent: NodeId | null, branch: Branch, depth: number, procedure: string): Generator<Visit> {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!;
      yield { node, parent, branch, index, depth, number: ++number, procedure };
      for (const b of branchesOf(node)) yield* visit(branchBody(node, b)!, node.id, b, depth + 1, procedure);
    }
  }
  yield* visit(mainBody(program), null, 'body', 0, MAIN);
  for (const f of functionsOf(program)) yield* visit(f.body, functionContainerId(f.name), 'body', 0, f.name);
  for (const h of program.handlers) yield* visit(h.body, handlerContainerId(h.event), 'body', 0, handlerContainerId(h.event));
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
  const fn = functionOfContainer(place.parent);
  if (fn !== null) return place.branch === 'body' ? functionBody(program, fn) : undefined;
  const event = handlerOfContainer(place.parent);
  if (event !== null) return place.branch === 'body' ? handlerBody(program, event) : undefined;
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

/** The procedure a gap belongs to: main, or a function's name. Undefined when the place does not exist. */
export function procedureOfPlace(program: ProgramIR, place: Pick<Place, 'parent'>): string | undefined {
  if (place.parent === null) return MAIN;
  if (handlerOfContainer(place.parent) !== null) return place.parent;
  return functionOfContainer(place.parent) ?? locate(program, place.parent)?.procedure;
}

/** The ids of the blocks enclosing a node, innermost first. A function's own container is not a block. */
export function ancestorsOf(program: ProgramIR, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let current = locate(program, id)?.parent ?? null;
  while (current !== null && functionOfContainer(current) === null && handlerOfContainer(current) === null) {
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
