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

export interface WorldDefinition {
  width: number;
  height: number;
  /** Row-major tiles, tiles[y][x]. */
  tiles: TileKind[][];
  robot: RobotState;
  goal: Cell;
  collectibles: Cell[];
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
}
