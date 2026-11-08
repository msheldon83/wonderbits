import type { CommandId, ConditionId } from '../ir/types';
import type { Cell, Facing, Gate, Mover, ObjectiveDefinition, Plate, SimState, Switch, TileKind, WorldDefinition } from './types';

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

export const platesOf = (world: WorldDefinition): readonly Plate[] => world.plates ?? [];
export const moversOf = (world: WorldDefinition): readonly Mover[] => world.movers ?? [];

export function plateAt(world: WorldDefinition, cell: Cell): Plate | undefined {
  return platesOf(world).find((p) => p.x === cell.x && p.y === cell.y);
}

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Where a mover is on a tick: round and round its path. */
export function moverCell(mover: Mover, tick: number): Cell {
  return mover.path[tick % mover.path.length]!;
}

/** The mover of a kind on a cell right now, if any. */
export function moverAt(world: WorldDefinition, state: SimState, cell: Cell, kind: Mover['kind']): Mover | undefined {
  return moversOf(world).find((m) => m.kind === kind && sameCell(moverCell(m, state.tick), cell));
}

/** Ticks before every mover is back where it started: the world repeats after this many. */
export function period(world: WorldDefinition): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  return moversOf(world).reduce((p, m) => (p * m.path.length) / gcd(p, m.path.length), 1);
}

/** True when a closed gate stands on the cell. */
export function closedGateAt(world: WorldDefinition, state: SimState, cell: Cell): boolean {
  const gate = gateAt(world, cell);
  return gate !== undefined && !state.open.includes(gate.id);
}

/** The robot can step onto the cell: floor with no shut gate and no beetle, or water with a log on it. */
export function passable(world: WorldDefinition, state: SimState, cell: Cell): boolean {
  const tile = tileAt(world, cell);
  if (tile === 'gap') return moverAt(world, state, cell, 'log') !== undefined;
  return tile === 'floor' && !closedGateAt(world, state, cell) && !moverAt(world, state, cell, 'beetle');
}

export function initialState(world: WorldDefinition): SimState {
  return {
    robot: { ...world.robot },
    collected: [],
    open: gatesOf(world)
      .filter((g) => g.open)
      .map((g) => g.id)
      .sort(),
    tick: 0,
  };
}

/**
 * One string for a whole state, for loop detection and searches. Ticks count
 * only up to the world's period, since after it the movers are back where
 * they were.
 */
export function stateKey(s: SimState, worldPeriod = 1): string {
  return `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}|${s.open.join(';')}|${s.tick % worldPeriod}`;
}

/** A board where time passes: something moves, or the program has an every-tick card. */
export function isTimed(world: WorldDefinition, hasTickCard = false): boolean {
  return moversOf(world).length > 0 || hasTickCard;
}

export type BlockReason = 'wall' | 'gap' | 'edge' | 'gate' | 'beetle';

/** The events an action fires: stepping onto a plate, or picking up an acorn. */
export type WorldEvent = `stepOn:${string}` | 'acorn';

export type StepResult =
  | { kind: 'ok'; state: SimState; collected?: Cell; toggled?: string[]; events?: WorldEvent[] }
  | { kind: 'blocked'; state: SimState; reason: BlockReason; at: Cell };

/** Open or shut a gate by id. Pure. */
export function setGate(state: SimState, id: string, open: boolean): SimState {
  const set = new Set(state.open);
  if (open) set.add(id);
  else set.delete(id);
  return { ...state, open: [...set].sort() };
}

export type TickResult = { kind: 'ok'; state: SimState; rode?: boolean } | { kind: 'hazard'; state: SimState; reason: 'gap' | 'beetle'; at: Cell };

/**
 * One tick: every mover takes one step along its path. A robot standing on a
 * log rides along with it. Afterwards a robot left on water has fallen in,
 * and one sharing a tile with a beetle has been caught.
 */
export function advance(world: WorldDefinition, state: SimState): TickResult {
  const next: SimState = { ...state, tick: state.tick + 1 };
  const ride = moverAt(world, state, state.robot, 'log');
  let robot = state.robot;
  if (ride) {
    const to = moverCell(ride, next.tick);
    robot = { ...robot, x: to.x, y: to.y };
  }
  const after: SimState = { ...next, robot };
  if (tileAt(world, robot) === 'gap' && !moverAt(world, after, robot, 'log')) return { kind: 'hazard', state: after, reason: 'gap', at: { x: robot.x, y: robot.y } };
  if (moverAt(world, after, robot, 'beetle')) return { kind: 'hazard', state: after, reason: 'beetle', at: { x: robot.x, y: robot.y } };
  return { kind: 'ok', state: after, ...(ride && { rode: true }) };
}

/** Apply one command. Pure: never mutates its input. */
export function step(world: WorldDefinition, state: SimState, command: CommandId): StepResult {
  const { robot } = state;
  switch (command) {
    case 'rotateCW':
      return { kind: 'ok', state: { ...state, robot: { ...robot, facing: CLOCKWISE[robot.facing] } } };
    case 'rotateCCW':
      return { kind: 'ok', state: { ...state, robot: { ...robot, facing: COUNTER_CLOCKWISE[robot.facing] } } };
    case 'wait':
      return { kind: 'ok', state };
    case 'forward': {
      const target = ahead(robot, robot.facing);
      const tile = tileAt(world, target);
      const log = tile === 'gap' && moverAt(world, state, target, 'log');
      if (tile !== 'floor' && !log) {
        const reason: BlockReason = tile === 'outside' ? 'edge' : tile === 'gap' ? 'gap' : 'wall';
        return { kind: 'blocked', state, reason, at: target };
      }
      if (closedGateAt(world, state, target)) return { kind: 'blocked', state, reason: 'gate', at: target };
      if (moverAt(world, state, target, 'beetle')) return { kind: 'blocked', state, reason: 'beetle', at: target };
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
      const plate = plateAt(world, target);
      const events: WorldEvent[] = [...(plate ? [`stepOn:${plate.id}` as const] : []), ...(collected ? ['acorn' as const] : [])];
      return { kind: 'ok', state: moved, ...(collected && { collected: target }), ...(sw && { toggled: [...sw.toggles] }), ...(events.length > 0 && { events }) };
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
