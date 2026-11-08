/**
 * Runtime contract. A runtime receives { program, world, objective, limits }
 * over postMessage and emits trace events until it reports `done`.
 *
 * Phase 1 runs the IR interpreter in a Worker. Later phases can put a
 * cross-origin sandboxed iframe behind the same messages without the app
 * changing. Keep every message structured-clone safe: plain data only.
 */
import type { CommandId, ConditionId, NodeId, ProgramIR } from '../ir/types';
import type { BlockReason } from '../sim/world';
import type { Cell, ObjectiveDefinition, SimState, WorldDefinition } from '../sim/types';

export const CONTRACT_VERSION = 1 as const;

export interface RunLimits {
  /** Maximum trace events (actions, checks and loop turns) before the run is halted. */
  maxSteps: number;
  /** Wall-clock budget in milliseconds, enforced by the client. */
  maxMillis: number;
}

export const DEFAULT_LIMITS: RunLimits = { maxSteps: 600, maxMillis: 2000 };

export interface RunRequest {
  type: 'run';
  contract: typeof CONTRACT_VERSION;
  requestId: string;
  program: ProgramIR;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  limits: RunLimits;
}

export type TraceResult =
  | { kind: 'ok'; collected?: Cell }
  | { kind: 'blocked'; reason: BlockReason; at: Cell };

interface TraceBase {
  index: number;
  nodeId: NodeId;
  before: SimState;
  after: SimState;
  result: TraceResult;
  /**
   * The call cards this event is running inside, outermost first. Absent in
   * main, so a card in a function knows which call brought it there.
   */
  via?: NodeId[];
}

/** The robot did something: moved, turned, or bumped. */
export interface ActionEvent extends TraceBase {
  op: CommandId;
}

/** An If or Repeat until looked at the world and got an answer. */
export interface CheckEvent extends TraceBase {
  op: 'check';
  condition: ConditionId;
  value: boolean;
}

/** A Repeat started one more go round its body. */
export interface LoopEvent extends TraceBase {
  op: 'loop';
  iteration: number;
  count: number;
}

/** A call card handed over to its function. The function's own events follow. */
export interface CallEvent extends TraceBase {
  op: 'call';
  name: string;
}

export type TraceEvent = ActionEvent | CheckEvent | LoopEvent | CallEvent;

export type RunOutcome =
  | { status: 'success' }
  | { status: 'incomplete' }
  | { status: 'blocked'; nodeId: NodeId; reason: BlockReason }
  | { status: 'halted'; reason: 'step-limit' | 'time-limit' | 'forever' }
  | { status: 'error'; message: string };

export type RuntimeMessage =
  | { type: 'trace'; requestId: string; event: TraceEvent }
  | { type: 'done'; requestId: string; outcome: RunOutcome; final: SimState; executedSteps: number };

export interface RunResult {
  trace: TraceEvent[];
  outcome: RunOutcome;
  final: SimState | null;
  executedSteps: number;
}

/** What the app depends on. Any runtime implementation satisfies this. */
export interface Runtime {
  run(input: Omit<RunRequest, 'type' | 'contract' | 'requestId'>): Promise<RunResult>;
  dispose(): void;
}
