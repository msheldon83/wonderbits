/**
 * Runtime contract. A runtime receives { program, world, objective, limits }
 * over postMessage and emits trace events until it reports `done`.
 *
 * Phase 1 runs the IR interpreter in a Worker. Later phases can put a
 * cross-origin sandboxed iframe behind the same messages without the app
 * changing. Keep every message structured-clone safe: plain data only.
 */
import type { CardId, CommandId, ConditionId, GateActionId, Key, NodeId, ProgramIR, Value } from '../ir/types';
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
  /** Key presses played after main, in order, on input levels. */
  input?: Key[];
  /** Seeds the robot's random generator: the same seed, the same rolls. */
  seed?: number;
  /** Levels of several days: the program runs once a day, keeping only the backpack overnight. */
  days?: number;
}

export type TraceResult =
  /** toggled: the gates a switch just flipped, by id. rode: the robot was carried by a log on a tick. */
  | { kind: 'ok'; collected?: Cell; toggled?: string[]; rode?: boolean }
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

/** A Repeat started one more go round its body, or a For each moved on to the next item (its after state holds the item). */
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

/** A gate card opened or shut a gate. */
export interface GateEvent extends TraceBase {
  op: GateActionId;
  gate: string;
}

/**
 * Something happened that a When card waits for, and its cards run next.
 * The node id is the When card's container, `on:<event>`.
 */
export interface WhenEvent extends TraceBase {
  op: 'when';
  event: string;
}

/** The next key in the level's script. The node id is its When card's container, or "input" when no card waits for that key. */
export interface PressEvent extends TraceBase {
  op: 'press';
  key: Key;
  /** Which press in the script, from 0. */
  press: number;
}

/**
 * Night on a level of several days: the robot sleeps, and the next day
 * starts. The after state is that morning: the robot back at the start, the
 * board as it began, and only the backpack's slots still holding last
 * night's values. The node id is "night".
 */
export interface NightEvent extends TraceBase {
  op: 'night';
  /** The day that starts, from 2. */
  day: number;
}

/**
 * On a team board, one robot has run the blueprint and the next takes over.
 * The after state has the next robot at its own start with its own memory;
 * the one before stays where it stopped. The node id is "team".
 */
export interface NextRobotEvent extends TraceBase {
  op: 'next';
  /** The robot that takes over, by number from 0. */
  robot: number;
}

/**
 * The world moved on one tick after a robot action: movers stepped, and a
 * robot on a log rode along. The node id is the action's. A blocked result
 * means the robot fell in the water or a beetle caught it.
 */
export interface TickEvent extends TraceBase {
  op: 'tick';
}

/** A Set or Add card put a value in a memory slot. Nothing moves on the board. */
export interface SetEvent extends TraceBase {
  op: 'set';
  slot: string;
  value: Value;
  /**
   * Who the robot asked for this value: the bird (something on the whole
   * board, or what is under it), or the inventory computer (a field of a
   * crate's record).
   */
  asked?: 'bird' | 'inventory';
  /** What was looked at: the map the bird read under it, such as walls, or the field asked for, such as crate.number. */
  seen?: string;
}

/** A Face card turned the robot to the direction a slot holds. A robot action, like a turn. */
export interface FaceEvent extends TraceBase {
  op: 'face';
  slot: string;
}

/** An Unlock card tried a gate's number lock with a slot's value. */
export interface UnlockEvent extends TraceBase {
  op: 'unlock';
  gate: string;
  opened: boolean;
}

export type TraceEvent = ActionEvent | CheckEvent | LoopEvent | CallEvent | GateEvent | WhenEvent | PressEvent | TickEvent | SetEvent | FaceEvent | UnlockEvent | NightEvent | NextRobotEvent;

export type RunOutcome =
  | { status: 'success' }
  | { status: 'incomplete' }
  | { status: 'blocked'; nodeId: NodeId; reason: BlockReason }
  | { status: 'halted'; reason: 'step-limit' | 'time-limit' | 'forever' }
  /** The program asked for something impossible. A card's error carries its node and a message a child can read. */
  | { status: 'error'; message: string; nodeId?: NodeId };

/**
 * A puzzle a child made, sent to the critic: is it solved by its maker's
 * program, and what is the shortest way through with plain steps?
 */
export interface CritiqueRequest {
  type: 'critique';
  contract: typeof CONTRACT_VERSION;
  requestId: string;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  /** The cards and limits a player gets. */
  rules: { allowedCommands: CardId[]; allowedConditions?: ConditionId[]; maxInstructions?: number; /** The most of one kind of card, by card. */ maxPerCommand?: Partial<Record<CardId, number>>; random: boolean };
  /** The maker's own program. */
  program: ProgramIR;
  input?: Key[];
  days?: number;
  /** How long the search for the shortest way may take; past it the critic says only what it knows. */
  searchMillis: number;
}

export interface Critique {
  /** The maker's program: does it stay within the puzzle's cards and limit, and does it solve the puzzle? */
  own: { fits: boolean; solves: boolean; steps: number; /** Cards the maker's program uses more of than the puzzle allows of that kind. */ over?: { card: CardId; used: number; most: number }[] };
  /**
   * The shortest program of plain steps. `impossible` is certain: no
   * program at all can solve it. `unknown`: the search could not tell.
   */
  flat: { kind: 'found'; steps: number; /** That way uses more of some card than the puzzle allows, so a player cannot take it. */ overCardLimit?: boolean } | { kind: 'impossible' } | { kind: 'unknown' };
}

export type RuntimeMessage =
  | { type: 'trace'; requestId: string; event: TraceEvent }
  | { type: 'done'; requestId: string; outcome: RunOutcome; final: SimState; executedSteps: number }
  | { type: 'critique'; requestId: string; critique: Critique };

export interface RunResult {
  trace: TraceEvent[];
  outcome: RunOutcome;
  final: SimState | null;
  executedSteps: number;
}

/** What the app depends on. Any runtime implementation satisfies this. */
export interface Runtime {
  run(input: Omit<RunRequest, 'type' | 'contract' | 'requestId'>): Promise<RunResult>;
  /** The critic's word on a child's puzzle, or null when it did not answer in time. Runs apart from `run`, so a search never holds up a run. */
  critique(input: Omit<CritiqueRequest, 'type' | 'contract' | 'requestId'>): Promise<Critique | null>;
  dispose(): void;
}
