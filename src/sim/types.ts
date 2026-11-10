/** Logical world model. No rendering, no assets: themes map these to art. */
import type { Value } from '../ir/types';

export type Facing = 'N' | 'E' | 'S' | 'W';
export const FACINGS: readonly Facing[] = ['N', 'E', 'S', 'W'];

/** Grid cell. x grows east, y grows south. */
export interface Cell {
  x: number;
  y: number;
}

export type TileKind = 'floor' | 'wall' | 'gap';

export interface RobotState {
  x: number;
  y: number;
  facing: Facing;
}

/** A gate stands on a floor tile. Closed, it blocks the way like a wall; open, the robot walks through. */
export interface Gate extends Cell {
  /** A short id, such as "a". Switches name the gates they flip by id. */
  id: string;
  /** How the gate starts. */
  open: boolean;
  /** A number lock: an Unlock card opens the gate when its slot holds this number. */
  code?: number;
}

/** Stepping onto a switch flips every gate it names: open ones close, closed ones open. */
export interface Switch extends Cell {
  toggles: string[];
}

/** A pressure plate does nothing by itself: stepping onto it fires the event its When card waits for. */
export interface Plate extends Cell {
  /** A digit, such as "1", so plates read differently from gates. */
  id: string;
}

/**
 * Something that moves on its own, one step per tick, round and round its
 * path. A log floats on water and carries the robot; a beetle walks on floor
 * and catches it. A patrol that goes back and forth lists the way back too.
 */
export interface Mover {
  id: string;
  kind: 'log' | 'beetle';
  /** Where it is on tick 0, 1, 2 and so on, then round again. */
  path: Cell[];
}

export interface WorldDefinition {
  width: number;
  height: number;
  /** Row-major tiles, tiles[y][x]. */
  tiles: TileKind[][];
  robot: RobotState;
  goal: Cell;
  collectibles: Cell[];
  /** World state: gates and the switches that flip them. Absent on boards without any. */
  gates?: Gate[];
  switches?: Switch[];
  /** Events: pressure plates that fire When cards. */
  plates?: Plate[];
  /** Time: logs and beetles that move one step per tick. */
  movers?: Mover[];
}

export interface ObjectiveDefinition {
  /** Reach the goal tile. */
  reachGoal: boolean;
  /** Collect every collectible before the run ends. */
  collectAll: boolean;
  /** End with these values in these memory slots: the answer the robot worked out. */
  memory?: Record<string, Value>;
}

/** Full simulation state: the robot plus anything the run changes. */
export interface SimState {
  robot: RobotState;
  /** Keys of collectibles picked up so far, as "x,y". */
  collected: string[];
  /** Ids of the gates open right now, sorted. */
  open: string[];
  /** Ticks gone by. Only boards with movers or an every-tick card count them. */
  tick: number;
  /** The robot's memory, slot by slot. Absent when the program remembers nothing. */
  memory?: Record<string, Value>;
}
