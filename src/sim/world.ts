import type { CommandId } from '../ir/types';
import type { Cell, Facing, ObjectiveDefinition, SimState, TileKind, WorldDefinition } from './types';

export const cellKey = (c: Cell): string => `${c.x},${c.y}`;

const DELTA: Record<Facing, Cell> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};
const CLOCKWISE: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const COUNTER_CLOCKWISE: Record<Facing, Facing> = { N: 'W', W: 'S', S: 'E', E: 'N' };

export function ahead(cell: Cell, facing: Facing): Cell {
  const d = DELTA[facing];
  return { x: cell.x + d.x, y: cell.y + d.y };
}

export function tileAt(world: WorldDefinition, cell: Cell): TileKind | 'outside' {
  if (cell.x < 0 || cell.y < 0 || cell.x >= world.width || cell.y >= world.height) return 'outside';
  return world.tiles[cell.y]![cell.x]!;
}

export function initialState(world: WorldDefinition): SimState {
  return { robot: { ...world.robot }, collected: [] };
}

export type BlockReason = 'wall' | 'gap' | 'edge';

export type StepResult =
  | { kind: 'ok'; state: SimState; collected?: Cell }
  | { kind: 'blocked'; state: SimState; reason: BlockReason; at: Cell };

/** Apply one command. Pure: never mutates its input. */
export function step(world: WorldDefinition, state: SimState, command: CommandId): StepResult {
  const { robot } = state;
  switch (command) {
    case 'rotateCW':
      return { kind: 'ok', state: { ...state, robot: { ...robot, facing: CLOCKWISE[robot.facing] } } };
    case 'rotateCCW':
      return { kind: 'ok', state: { ...state, robot: { ...robot, facing: COUNTER_CLOCKWISE[robot.facing] } } };
    case 'forward': {
      const target = ahead(robot, robot.facing);
      const tile = tileAt(world, target);
      if (tile !== 'floor') {
        const reason: BlockReason = tile === 'outside' ? 'edge' : tile;
        return { kind: 'blocked', state, reason, at: target };
      }
      const moved: SimState = { ...state, robot: { ...robot, x: target.x, y: target.y } };
      const key = cellKey(target);
      const isCollectible = world.collectibles.some((c) => cellKey(c) === key);
      if (isCollectible && !state.collected.includes(key)) {
        return { kind: 'ok', state: { ...moved, collected: [...state.collected, key] }, collected: target };
      }
      return { kind: 'ok', state: moved };
    }
  }
}

export function objectiveMet(world: WorldDefinition, objective: ObjectiveDefinition, state: SimState): boolean {
  if (objective.reachGoal && (state.robot.x !== world.goal.x || state.robot.y !== world.goal.y)) return false;
  if (objective.collectAll && state.collected.length !== world.collectibles.length) return false;
  return true;
}
