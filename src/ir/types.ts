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
export const COMMAND_IDS = ['forward', 'rotateCW', 'rotateCCW', 'wait'] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && (COMMAND_IDS as readonly string[]).includes(value);
}

/** What the robot can sense about the world, for If and Repeat until. */
export const CONDITION_IDS = ['pathAhead', 'blockedAhead', 'acornAhead', 'atFlag', 'gateClosedAhead', 'onSwitch'] as const;
/** A sense: something the robot can find out about the world right now. */
export type SenseId = (typeof CONDITION_IDS)[number];
/**
 * What an If or Repeat until checks: a sense, or a memory test written
 * `slot:<name>=<value>`, such as `slot:count=3`, `slot:found=yes`,
 * `slot:way=E` or `slot:spot=here`.
 */
export type SlotTest = `slot:${string}`;
export type ConditionId = SenseId | SlotTest;
/** What a level offers when it does not list its conditions: the senses every board has. Gate senses are listed by the levels that have gates. */
export const BASIC_CONDITIONS: readonly ConditionId[] = ['pathAhead', 'blockedAhead', 'acornAhead', 'atFlag'];

export function isSenseId(value: unknown): value is SenseId {
  return typeof value === 'string' && (CONDITION_IDS as readonly string[]).includes(value);
}

const SLOT_TEST = /^slot:([a-z][A-Za-z0-9]{0,19})=(\d{1,3}|yes|no|[NESW]|here)$/;

/** The parts of a memory test, or null when the string is not one. */
export function parseSlotTest(value: string): { slot: string; value: string } | null {
  const m = SLOT_TEST.exec(value);
  return m ? { slot: m[1]!, value: m[2]! } : null;
}

export function isConditionId(value: unknown): value is ConditionId {
  return isSenseId(value) || (typeof value === 'string' && parseSlotTest(value) !== null);
}

/** Blocks that hold other cards. */
export const BLOCK_IDS = ['repeat', 'if', 'ifElse', 'until', 'forEach'] as const;
export type BlockId = (typeof BLOCK_IDS)[number];

/**
 * A call runs one of the program's own functions by name. It is a card like
 * any other, but the palette shows one per function, labelled with its name.
 */
export const CALL = 'call' as const;

/**
 * Memory cards: Set a slot, Add to a number slot, Face the direction a slot
 * holds, and Unlock a gate with the number a slot holds. For each is a
 * block that walks a list slot.
 */
export const MEMORY_CARD_IDS = ['set', 'change', 'face', 'unlock', 'mark'] as const;
export type MemoryCardId = (typeof MEMORY_CARD_IDS)[number];

/** The kinds of value a memory slot can hold. A list holds items of one kind. */
export const VALUE_KINDS = ['number', 'yesNo', 'direction', 'position', 'list', 'grid'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];
export type ItemKind = 'number' | 'yesNo' | 'direction';
/** A value in memory: a number, a yes/no, a direction letter (N, E, S, W), a tile, or a list. */
export type Value = number | boolean | string | { x: number; y: number } | Value[];

/** A named, typed slot in the robot's memory: TypeScript's `let name: type = start`. */
export interface MemorySlot {
  name: string;
  kind: ValueKind;
  /** The kind of a list's or a grid's items. */
  of?: ItemKind;
  start: Value;
}

/**
 * Where a Set card's value comes from: a literal (a number, yes or no as
 * true or false, a direction letter), or the robot's own reading right now:
 * `facing`, `here`, `acorns` (how many it holds), a sense's yes or no, or
 * an item of a grid slot, written `read:<grid>@<where>`.
 */
export type Source = number | boolean | string;

/**
 * Where on a grid a card reads or marks: the robot's tile (`here`), the tile
 * in front of it (`ahead`), or a position slot's tile.
 */
export type GridPlace = string;

const READ = /^read:([a-z][A-Za-z0-9]{0,19})@([a-z][A-Za-z0-9]{0,19})$/;

/** The grid and the place a `read:` source names, or null when it is not one. */
export function parseRead(source: Source): { grid: string; at: GridPlace } | null {
  const m = typeof source === 'string' ? READ.exec(source) : null;
  return m ? { grid: m[1]!, at: m[2]! } : null;
}

export const readFrom = (grid: string, at: GridPlace): Source => `read:${grid}@${at}`;

/** Cards that act on the world instead of the robot: open or shut a gate by its letter. */
export const GATE_ACTION_IDS = ['openGate', 'closeGate'] as const;
export type GateActionId = (typeof GATE_ACTION_IDS)[number];

export function isGateActionId(value: unknown): value is GateActionId {
  return typeof value === 'string' && (GATE_ACTION_IDS as readonly string[]).includes(value);
}

/** Everything the palette can hand out: a command, a block, a call or a gate action. */
export const CARD_IDS = [...COMMAND_IDS, ...BLOCK_IDS, CALL, ...GATE_ACTION_IDS, ...MEMORY_CARD_IDS] as const;
export type CardId = CommandId | BlockId | typeof CALL | GateActionId | MemoryCardId;

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

/** Opens or shuts one gate, wherever the robot is. */
export interface GateActionNode {
  id: NodeId;
  kind: GateActionId;
  gate: string;
}

/** Puts a value in a slot. */
export interface SetNode {
  id: NodeId;
  kind: 'set';
  slot: string;
  to: Source;
}

/** Adds to (or with a minus, takes from) a number slot. */
export interface ChangeNode {
  id: NodeId;
  kind: 'change';
  slot: string;
  by: number;
}

/** Turns the robot to face the direction a slot holds. A robot action, like a turn. */
export interface FaceNode {
  id: NodeId;
  kind: 'face';
  slot: string;
}

/** Opens a gate with a number lock when the slot holds the gate's code; otherwise nothing happens. */
export interface UnlockNode {
  id: NodeId;
  kind: 'unlock';
  gate: string;
  slot: string;
}

/** Writes a slot's value into a grid slot, at the robot's tile, the tile ahead, or a remembered place. */
export interface MarkNode {
  id: NodeId;
  kind: 'mark';
  grid: string;
  at: GridPlace;
  slot: string;
}

/** Runs its body once for each item of a list slot, with the item in another slot. */
export interface ForEachNode {
  id: NodeId;
  kind: 'forEach';
  list: string;
  item: string;
  body: IRNode[];
}

export type BlockNode = RepeatNode | IfNode | IfElseNode | UntilNode | ForEachNode;
export type IRNode = CommandNode | BlockNode | CallNode | GateActionNode | SetNode | ChangeNode | FaceNode | UnlockNode | MarkNode;

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
 * A When card: cards that run each time an event happens. Events are
 * stepping onto a plate (`stepOn:1`), picking up an acorn (`acorn`), a key
 * press from the level's script (`key:up`), and every tick (`tick`).
 */
export interface EventHandler {
  event: string;
  body: IRNode[];
}

export const KEYS = ['up', 'down', 'left', 'right'] as const;
export type Key = (typeof KEYS)[number];

/** True for an event a When card can wait for. */
export function isEventId(value: unknown): value is string {
  return typeof value === 'string' && (/^stepOn:[1-9]$/.test(value) || value === 'acorn' || value === 'tick' || KEYS.some((k) => value === `key:${k}`));
}

export interface ProgramIR {
  version: typeof IR_VERSION;
  procedures: Procedure[];
  handlers: EventHandler[];
  /** The robot's memory: its named, typed slots. Absent on programs that remember nothing. */
  memory?: MemorySlot[];
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

/** A When card's own cards sit in a container whose parent is this id. */
const HANDLER_PREFIX = 'on:';
export const handlerContainerId = (event: string): NodeId => HANDLER_PREFIX + event;
/** The event a container id names, or null when it is not a When card. */
export function handlerOfContainer(parent: NodeId | null): string | null {
  return parent !== null && parent.startsWith(HANDLER_PREFIX) ? parent.slice(HANDLER_PREFIX.length) : null;
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
