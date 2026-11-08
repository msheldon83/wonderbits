/**
 * Program IR: the single source of truth for a child's program.
 *
 * The visual editor edits it, the TypeScript projection prints it, and
 * runtimes execute it. Every node carries a stable id that survives edits,
 * so traces, highlights and (later) AI operations can point at it.
 */

export const IR_VERSION = 1 as const;

export type NodeId = string;

/** Primitive commands: one robot action each. */
export const COMMAND_IDS = ['forward', 'rotateCW', 'rotateCCW'] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && (COMMAND_IDS as readonly string[]).includes(value);
}

/** What the robot can sense about the world, for If and Repeat until. */
export const CONDITION_IDS = ['pathAhead', 'blockedAhead', 'acornAhead', 'atFlag'] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export function isConditionId(value: unknown): value is ConditionId {
  return typeof value === 'string' && (CONDITION_IDS as readonly string[]).includes(value);
}

/** Blocks that hold other cards. */
export const BLOCK_IDS = ['repeat', 'if', 'ifElse', 'until'] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

/** Everything the palette can hand out: a command or a block. */
export const CARD_IDS = [...COMMAND_IDS, ...BLOCK_IDS] as const;
export type CardId = CommandId | BlockId;

export function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && (CARD_IDS as readonly string[]).includes(value);
}

export function isBlockId(value: unknown): value is BlockId {
  return typeof value === 'string' && (BLOCK_IDS as readonly string[]).includes(value);
}

/** A Repeat runs its body this many times. */
export const REPEAT_MIN = 2;
export const REPEAT_MAX = 10;
export const REPEAT_DEFAULT = 3;
export const DEFAULT_CONDITION: ConditionId = 'blockedAhead';

export interface CommandNode {
  id: NodeId;
  kind: CommandId;
}

export interface RepeatNode {
  id: NodeId;
  kind: 'repeat';
  count: number;
  body: IRNode[];
}

export interface IfNode {
  id: NodeId;
  kind: 'if';
  condition: ConditionId;
  body: IRNode[];
}

export interface IfElseNode {
  id: NodeId;
  kind: 'ifElse';
  condition: ConditionId;
  body: IRNode[];
  elseBody: IRNode[];
}

/** Runs its body again and again until the condition is true. */
export interface UntilNode {
  id: NodeId;
  kind: 'until';
  condition: ConditionId;
  body: IRNode[];
}

export type BlockNode = RepeatNode | IfNode | IfElseNode | UntilNode;
export type IRNode = CommandNode | BlockNode;

export function isBlockNode(node: IRNode): node is BlockNode {
  return isBlockId(node.kind);
}

/** The two places a block can hold cards. Only ifElse has an else branch. */
export type Branch = 'body' | 'else';

/**
 * A gap in the program: a container (the main body when parent is null,
 * otherwise a branch of a block) and an index into it. Index i is the gap
 * before node i, and the container's length is the gap after the last node.
 */
export interface Place {
  parent: NodeId | null;
  branch: Branch;
  index: number;
}

export interface Procedure {
  name: string;
  body: IRNode[];
}

/**
 * Event handlers are part of the shape from day one so Game Workshop events
 * need no migration. Phase 1 programs always have an empty list.
 */
export interface EventHandler {
  event: string;
  body: IRNode[];
}

export interface ProgramIR {
  version: typeof IR_VERSION;
  procedures: Procedure[];
  handlers: EventHandler[];
}

export const MAIN = 'main';
