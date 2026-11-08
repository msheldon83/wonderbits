/** Logical world model. No rendering, no assets: themes map these to art. */

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
}

/** Stepping onto a switch flips every gate it names: open ones close, closed ones open. */
export interface Switch extends Cell {
  toggles: string[];
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
}

export interface ObjectiveDefinition {
  /** Reach the goal tile. */
  reachGoal: boolean;
  /** Collect every collectible before the run ends. */
  collectAll: boolean;
}

/** Full simulation state: the robot plus anything the run changes. */
export interface SimState {
  robot: RobotState;
  /** Keys of collectibles picked up so far, as "x,y". */
  collected: string[];
  /** Ids of the gates open right now, sorted. */
  open: string[];
}
