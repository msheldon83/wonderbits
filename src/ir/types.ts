/**
 * Program IR: the single source of truth for a child's program.
 *
 * The visual editor edits it, the TypeScript projection prints it, and
 * runtimes execute it. Every node carries a stable id that survives edits,
 * so traces, highlights and (later) AI operations can point at it.
 */

export const IR_VERSION = 1 as const;

export type NodeId = string;

/** Commands available in Phase 1. Later phases add repeat, if, set, call, on. */
export const COMMAND_IDS = ['forward', 'rotateCW', 'rotateCCW'] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && (COMMAND_IDS as readonly string[]).includes(value);
}

export interface CommandNode {
  id: NodeId;
  kind: CommandId;
}

/** Union of all node kinds. Phase 1 has only simple commands. */
export type IRNode = CommandNode;

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
