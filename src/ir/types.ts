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
export const CONDITION_IDS = ['pathAhead', 'blockedAhead', 'acornAhead', 'atFlag', 'gateClosedAhead', 'onSwitch'] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];
/** What a level offers when it does not list its conditions: the senses every board has. Gate senses are listed by the levels that have gates. */
export const BASIC_CONDITIONS: readonly ConditionId[] = ['pathAhead', 'blockedAhead', 'acornAhead', 'atFlag'];

export function isConditionId(value: unknown): value is ConditionId {
  return typeof value === 'string' && (CONDITION_IDS as readonly string[]).includes(value);
}

/** Blocks that hold other cards. */
export const BLOCK_IDS = ['repeat', 'if', 'ifElse', 'until'] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

/**
 * A call runs one of the program's own functions by name. It is a card like
 * any other, but the palette shows one per function, labelled with its name.
 */
export const CALL = 'call' as const;

/** Everything the palette can hand out: a command, a block or a call. */
export const CARD_IDS = [...COMMAND_IDS, ...BLOCK_IDS, CALL] as const;
export type CardId = CommandId | BlockId | typeof CALL;

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

/** Runs the function with this name, then carries on with the next card. */
export interface CallNode {
  id: NodeId;
  kind: 'call';
  name: string;
}

export type BlockNode = RepeatNode | IfNode | IfElseNode | UntilNode;
export type IRNode = CommandNode | BlockNode | CallNode;

export function isBlockNode(node: IRNode): node is BlockNode {
  return isBlockId(node.kind);
}

/** The two places a block can hold cards. Only ifElse has an else branch. */
export type Branch = 'body' | 'else';

/**
 * A gap in the program: a container (the main body when parent is null, the
 * top of a function when parent is that function's container id, otherwise
 * a branch of a block) and an index into it. Index i is the gap before node
 * i, and the container's length is the gap after the last node.
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

/**
 * Every procedure other than main is a function the child can call. Its own
 * cards sit in a container whose parent is this id, so a Place can point at
 * the top of a function the same way it points into a block.
 */
const FUNCTION_PREFIX = 'fn:';
export const functionContainerId = (name: string): NodeId => FUNCTION_PREFIX + name;
/** The function a container id names, or null when it is a block or main. */
export function functionOfContainer(parent: NodeId | null): string | null {
  return parent !== null && parent.startsWith(FUNCTION_PREFIX) ? parent.slice(FUNCTION_PREFIX.length) : null;
}

/** Function names are short lower camel case words, so they print as real TypeScript. */
export const FUNCTION_NAME = /^[a-z][A-Za-z0-9]{0,19}$/;
/** Names a function may not take: main, and words TypeScript or the hint paths reserve. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set(['main', 'robot', 'else', 'if', 'for', 'while', 'function', 'return', 'let', 'const', 'var', 'new', 'do', 'in', 'of', 'import', 'export', 'default', 'void', 'this', 'true', 'false', 'null']);

/** "hop" becomes "Hop", which is how the card reads. */
export function functionLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
