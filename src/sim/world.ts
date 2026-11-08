import type { CommandId, ConditionId } from '../ir/types';
import type { Cell, Facing, Gate, ObjectiveDefinition, SimState, Switch, TileKind, WorldDefinition } from './types';

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

export const gatesOf = (world: WorldDefinition): readonly Gate[] => world.gates ?? [];
export const switchesOf = (world: WorldDefinition): readonly Switch[] => world.switches ?? [];

export function gateAt(world: WorldDefinition, cell: Cell): Gate | undefined {
  return gatesOf(world).find((g) => g.x === cell.x && g.y === cell.y);
}

export function switchAt(world: WorldDefinition, cell: Cell): Switch | undefined {
  return switchesOf(world).find((s) => s.x === cell.x && s.y === cell.y);
}

/** True when a closed gate stands on the cell. */
export function closedGateAt(world: WorldDefinition, state: SimState, cell: Cell): boolean {
  const gate = gateAt(world, cell);
  return gate !== undefined && !state.open.includes(gate.id);
}

/** The robot can step onto the cell: floor, and no closed gate on it. */
export function passable(world: WorldDefinition, state: SimState, cell: Cell): boolean {
  return tileAt(world, cell) === 'floor' && !closedGateAt(world, state, cell);
}

export function initialState(world: WorldDefinition): SimState {
  return {
    robot: { ...world.robot },
    collected: [],
    open: gatesOf(world)
      .filter((g) => g.open)
      .map((g) => g.id)
      .sort(),
  };
}

/** One string for a whole state, for loop detection and searches. */
export function stateKey(s: SimState): string {
  return `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}|${s.open.join(';')}`;
}

export type BlockReason = 'wall' | 'gap' | 'edge' | 'gate';

export type StepResult =
  | { kind: 'ok'; state: SimState; collected?: Cell; toggled?: string[] }
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
      if (closedGateAt(world, state, target)) return { kind: 'blocked', state, reason: 'gate', at: target };
      let moved: SimState = { ...state, robot: { ...robot, x: target.x, y: target.y } };
      const key = cellKey(target);
      const isCollectible = world.collectibles.some((c) => cellKey(c) === key);
      const collected = isCollectible && !state.collected.includes(key);
      if (collected) moved = { ...moved, collected: [...state.collected, key] };
      // Stepping onto a switch flips its gates.
      const sw = switchAt(world, target);
      if (sw) {
        const open = new Set(moved.open);
        for (const id of sw.toggles) {
          if (open.has(id)) open.delete(id);
          else open.add(id);
        }
        moved = { ...moved, open: [...open].sort() };
      }
      return { kind: 'ok', state: moved, ...(collected && { collected: target }), ...(sw && { toggled: [...sw.toggles] }) };
    }
  }
}

/** What the robot senses right now. Pure. */
export function evaluate(world: WorldDefinition, state: SimState, condition: ConditionId): boolean {
  const { robot } = state;
  const target = ahead(robot, robot.facing);
  switch (condition) {
    case 'pathAhead':
      return passable(world, state, target);
    case 'blockedAhead':
      return !passable(world, state, target);
    case 'gateClosedAhead':
      return closedGateAt(world, state, target);
    case 'onSwitch':
      return switchAt(world, robot) !== undefined;
    case 'acornAhead': {
      const key = cellKey(target);
      return tileAt(world, target) === 'floor' && world.collectibles.some((c) => cellKey(c) === key) && !state.collected.includes(key);
    }
    case 'atFlag':
      return robot.x === world.goal.x && robot.y === world.goal.y;
  }
}

export function objectiveMet(world: WorldDefinition, objective: ObjectiveDefinition, state: SimState): boolean {
  if (objective.reachGoal && (state.robot.x !== world.goal.x || state.robot.y !== world.goal.y)) return false;
  if (objective.collectAll && state.collected.length !== world.collectibles.length) return false;
  return true;
}
