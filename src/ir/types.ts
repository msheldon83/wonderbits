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

/** A memory test may look inside a record: `slot:crate.key=yes`. */
const SLOT_TEST = /^slot:([a-z][A-Za-z0-9]{0,19}(?:\.[a-z][A-Za-z0-9]{0,19})?)=(\d{1,3}|yes|no|[NESW]|here)$/;

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
export const MEMORY_CARD_IDS = ['set', 'change', 'face', 'unlock', 'mark', 'push', 'shift'] as const;

/**
 * Moves by coordinates: walk straight along to a row or a column, counted
 * from 0 like the numbers round the board. The robot turns to face the way
 * and steps tile by tile, so walls and gates still stop it.
 */
export const GO_IDS = ['goRow', 'goColumn'] as const;
export type GoId = (typeof GO_IDS)[number];
export type MemoryCardId = (typeof MEMORY_CARD_IDS)[number];

/** The kinds of value a memory slot can hold. A list holds items of one kind. */
export const VALUE_KINDS = ['number', 'yesNo', 'direction', 'position', 'list', 'grid', 'record'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];
export type ItemKind = 'number' | 'yesNo' | 'direction';
/** What a list holds: items of one kind, or records of one shape. */
export type ListOf = ItemKind | 'record';
/** A record: named fields, each a number, a yes/no or a direction. */
export type RecordValue = { [field: string]: number | boolean | string };
/** A value in memory: a number, a yes/no, a direction letter (N, E, S, W), a tile, a record, or a list. */
export type Value = number | boolean | string | { x: number; y: number } | RecordValue | Value[];

/** True when a value is a tile: an object of just x and y. Records are objects too, with their own fields. */
export function isPosition(v: unknown): v is { x: number; y: number } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 2 && keys.includes('x') && keys.includes('y');
}

/** A record's shape: its type name, such as Crate, and its fields with their kinds, in order. */
export interface Shape {
  shape: string;
  fields: Record<string, ItemKind>;
}

/** A named, typed slot in the robot's memory: TypeScript's `let name: type = start`. */
export interface MemorySlot {
  name: string;
  kind: ValueKind;
  /** The kind of a list's or a grid's items. A list may hold records. */
  of?: ListOf;
  /** A record's, or a list of records', type name and fields. */
  shape?: string;
  fields?: Record<string, ItemKind>;
  start: Value;
  /** In the backpack: on a level of several days, the slot keeps its value overnight instead of starting again. */
  keep?: boolean;
}

/**
 * Where a Set card's value comes from: a literal (a number, yes or no as
 * true or false, a direction letter), or the robot's own reading right now:
 * `facing`, `here`, `acorns` (how many are in its pocket), `acornsLeft`
 * (how many are still on the board, which the robot asks the bird, since
 * only the bird sees the whole board), a sense's yes or no, an
 * item of a grid slot, written `read:<grid>@<where>`, how many items a
 * list holds, written `length:<list>`, or a random value: see parseRandom.
 */
export type Source = number | boolean | string;

/** Readings only the bird can give: it flies over the board and sees all of it. */
export const BIRD_SOURCES: readonly string[] = ['acornsLeft'];
export const isBirdSource = (source: Source): boolean => typeof source === 'string' && BIRD_SOURCES.includes(source);

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

const LENGTH = /^length:([a-z][A-Za-z0-9]{0,19})$/;

/** The list a `length:` source counts, or null when it is not one. */
export function parseLength(source: Source): string | null {
  const m = typeof source === 'string' ? LENGTH.exec(source) : null;
  return m ? m[1]! : null;
}

export const lengthOf = (list: string): Source => `length:${list}`;

const FIELD = /^field:([a-z][A-Za-z0-9]{0,19})\.([a-z][A-Za-z0-9]{0,19})$/;

/** One field of a record slot, written `field:crate.number` and printed `crate.number`. Null when the source is not one. */
export function parseField(source: Source): { record: string; field: string } | null {
  const m = typeof source === 'string' ? FIELD.exec(source) : null;
  return m ? { record: m[1]!, field: m[2]! } : null;
}

export const fieldOf = (record: string, field: string): Source => `field:${record}.${field}`;

/** A slot test's slot: a slot's name, or a record slot and one of its fields, `crate.key`. */
export function splitSlotPath(path: string): { slot: string; field?: string } {
  const [slot, field] = path.split('.');
  return field ? { slot: slot!, field } : { slot: slot! };
}

const ITEM = /^item:([a-z][A-Za-z0-9]{0,19})@(\d{1,2}|[a-z][A-Za-z0-9]{0,19})$/;

/**
 * One item of a list by its index, counted from 0 like real lists:
 * `item:route@0` is the first, `item:route@i` the one a number slot points at.
 */
export function parseItem(source: Source): { list: string; index: number | string } | null {
  if (typeof source !== 'string') return null;
  const m = ITEM.exec(source);
  if (!m) return null;
  return { list: m[1]!, index: /^\d+$/.test(m[2]!) ? Number(m[2]) : m[2]! };
}

export const itemOf = (list: string, index: number | string): Source => `item:${list}@${index}`;

const RANDOM_RANGE = /^random:(\d{1,2})-(\d{1,2})$/;
const PICK = /^pick:([a-z][A-Za-z0-9]{0,19})$/;

/**
 * A random source: a whole number from low to high (`random:1-6`), a coin
 * flip (`coin`, yes or no), a random way (`randomWay`), or a random item of
 * a list (`pick:<list>`). Null when the source is not random.
 */
export type RandomSource = { kind: 'range'; low: number; high: number } | { kind: 'coin' } | { kind: 'way' } | { kind: 'pick'; list: string };

export function parseRandom(source: Source): RandomSource | null {
  if (source === 'coin') return { kind: 'coin' };
  if (source === 'randomWay') return { kind: 'way' };
  if (typeof source !== 'string') return null;
  const r = RANDOM_RANGE.exec(source);
  if (r && Number(r[1]) <= Number(r[2])) return { kind: 'range', low: Number(r[1]), high: Number(r[2]) };
  const p = PICK.exec(source);
  return p ? { kind: 'pick', list: p[1]! } : null;
}

export const randomRange = (low: number, high: number): Source => `random:${low}-${high}`;

/** Cards that act on the world instead of the robot: open or shut a gate by its letter. */
export const GATE_ACTION_IDS = ['openGate', 'closeGate'] as const;
export type GateActionId = (typeof GATE_ACTION_IDS)[number];

export function isGateActionId(value: unknown): value is GateActionId {
  return typeof value === 'string' && (GATE_ACTION_IDS as readonly string[]).includes(value);
}

/** Everything the palette can hand out: a command, a block, a call or a gate action. */
export const CARD_IDS = [...COMMAND_IDS, ...BLOCK_IDS, CALL, ...GATE_ACTION_IDS, ...MEMORY_CARD_IDS, ...GO_IDS] as const;
export type CardId = CommandId | BlockId | typeof CALL | GateActionId | MemoryCardId | GoId;

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

/** Puts a value on the end of a list slot: the list grows by one. */
export interface PushNode {
  id: NodeId;
  kind: 'push';
  list: string;
  to: Source;
}

/** Walks to a row or a column: a number on the card, or a number slot's value. */
export interface GoNode {
  id: NodeId;
  kind: GoId;
  to: number | string;
}

/** Moves a remembered place one tile, like a finger on the map; the robot stays put. */
export interface ShiftNode {
  id: NodeId;
  kind: 'shift';
  slot: string;
  dir: 'N' | 'E' | 'S' | 'W';
}

/** A grid slot that starts as a copy of the board: where the rocks are, or the acorns. */
export const BOARD_MAPS = ['board:walls', 'board:acorns'] as const;

/** Runs its body once for each item of a list slot, with the item in another slot. A grid's items are its rows. */
export interface ForEachNode {
  id: NodeId;
  kind: 'forEach';
  list: string;
  item: string;
  body: IRNode[];
}

export type BlockNode = RepeatNode | IfNode | IfElseNode | UntilNode | ForEachNode;
export type IRNode = CommandNode | BlockNode | CallNode | GateActionNode | SetNode | ChangeNode | FaceNode | UnlockNode | MarkNode | PushNode | GoNode | ShiftNode;

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
