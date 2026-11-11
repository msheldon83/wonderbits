import { randomInt } from './random';
import { isPosition, isSenseId, parseField, splitSlotPath, parseItem, parseLength, parseRandom, parseRead, parseSlotTest, type CommandId, type ConditionId, type GridPlace, type MemorySlot, type SenseId, type Source, type Value } from '../ir/types';
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

export type MoverStep = 'up' | 'down' | 'left' | 'right' | 'stay';

/** What a mover does on each tick of its round: step one way, or stay put. Step i takes it from path[i] to path[i + 1]. */
export function moverSteps(mover: Mover): MoverStep[] {
  return mover.path.map((c, i) => {
    const n = mover.path[(i + 1) % mover.path.length]!;
    if (n.x > c.x) return 'right';
    if (n.x < c.x) return 'left';
    if (n.y > c.y) return 'down';
    if (n.y < c.y) return 'up';
    return 'stay';
  });
}

/** A mover's name as the child reads it: "Log 1", "Beetle 2", numbered by kind in the board's order. */
export function moverLabel(world: WorldDefinition, mover: Mover): string {
  const same = moversOf(world).filter((m) => m.kind === mover.kind);
  const name = mover.kind === 'log' ? 'Log' : 'Beetle';
  return same.length > 1 ? `${name} ${same.indexOf(mover) + 1}` : name;
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

/** True when another robot of the team stands on the cell. */
export function teammateAt(state: SimState, cell: Cell): boolean {
  return (state.team ?? []).some((r, i) => i !== state.active && r.x === cell.x && r.y === cell.y);
}

/** The flag a robot of the team must reach: the board's goal for the first, its own for the rest. */
export function goalOf(world: WorldDefinition, robot = 0): Cell {
  return world.team?.[robot]?.goal ?? world.goal;
}

/** The robot can step onto the cell: floor with no shut gate, no beetle and no other robot, or water with a log on it. */
export function passable(world: WorldDefinition, state: SimState, cell: Cell): boolean {
  const tile = tileAt(world, cell);
  if (tile === 'gap') return moverAt(world, state, cell, 'log') !== undefined;
  return tile === 'floor' && !closedGateAt(world, state, cell) && !moverAt(world, state, cell, 'beetle') && !teammateAt(state, cell);
}

/** The state before the first card. A program's memory slots hold their start values. */
export function initialState(world: WorldDefinition, memory: readonly MemorySlot[] = [], seed?: number): SimState {
  const base = { ...initialWorld(world), ...(seed !== undefined && { rng: seed }) };
  if (memory.length === 0) return base;
  return { ...base, memory: robotMemory(world, memory, 0) };
}

/** A robot's memory as it is built: the blueprint's starts, with that robot's own values on a team board. */
export function robotMemory(world: WorldDefinition, memory: readonly MemorySlot[], robot: number): Record<string, Value> {
  const own = world.team?.[robot]?.memory ?? {};
  return Object.fromEntries(memory.map((m) => [m.name, m.name in own ? own[m.name]! : startValue(world, m.start)]));
}

/**
 * The next robot of a team takes over: the one that ran stays where it
 * stopped, and the next starts from its own place with its own memory. The
 * board (gates, acorns) is shared. Pure.
 */
export function nextRobot(world: WorldDefinition, memory: readonly MemorySlot[], state: SimState): SimState {
  const done = state.active ?? 0;
  const next = done + 1;
  const team = (state.team ?? []).map((r, i) => (i === done ? { ...state.robot } : r));
  const robot = { ...world.team![next]!.robot };
  return { ...state, robot, team, active: next, ...(memory.length > 0 && { memory: robotMemory(world, memory, next) }) };
}

/**
 * The next morning on a level of several days: the board as it starts, the
 * robot back at the start, and memory started again, except the slots kept
 * in the backpack, which hold what they held last night. Pure.
 */
export function morning(world: WorldDefinition, memory: readonly MemorySlot[], night: SimState): SimState {
  const fresh = initialState(world, memory);
  const kept = Object.fromEntries(memory.filter((m) => m.keep && night.memory && m.name in night.memory).map((m) => [m.name, night.memory![m.name]!]));
  return { ...fresh, ...(fresh.memory && { memory: { ...fresh.memory, ...kept } }), ...(night.rng !== undefined && { rng: night.rng }), day: (night.day ?? 1) + 1 };
}

/** A slot's start: its own value, or, for a map, a copy of the board as rows of yes and no. */
export function startValue(world: WorldDefinition, start: Value): Value {
  if (start === 'board:walls') return world.tiles.map((row) => row.map((t) => t !== 'floor'));
  if (start === 'board:acorns') {
    const keys = new Set(world.collectibles.map(cellKey));
    return world.tiles.map((row, y) => row.map((_, x) => keys.has(`${x},${y}`)));
  }
  return start;
}

function initialWorld(world: WorldDefinition): SimState {
  return {
    ...(world.team && { team: world.team.map((t) => ({ ...t.robot })), active: 0 }),
    robot: { ...(world.team?.[0]?.robot ?? world.robot) },
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
  return `${s.robot.x},${s.robot.y},${s.robot.facing}|${[...s.collected].sort().join(';')}|${s.open.join(';')}|${s.tick % worldPeriod}|${s.memory ? JSON.stringify(s.memory) : ''}|${s.rng ?? ''}|${s.day ?? ''}|${s.active ?? ''}:${(s.team ?? []).map((r) => `${r.x},${r.y}`).join(';')}`;
}

/** A board where time passes: something moves, or the program has an every-tick card. */
export function isTimed(world: WorldDefinition, hasTickCard = false): boolean {
  return moversOf(world).length > 0 || hasTickCard;
}

export type BlockReason = 'wall' | 'gap' | 'edge' | 'gate' | 'beetle' | 'robot';

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
      if (teammateAt(state, target)) return { kind: 'blocked', state, reason: 'robot', at: target };
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
  const test = parseSlotTest(condition);
  if (test) return slotMatches(state, test.slot, test.value);
  switch (condition as SenseId) {
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
    case 'atFlag': {
      const goal = goalOf(world, state.active);
      return robot.x === goal.x && robot.y === goal.y;
    }
  }
}

/** The value a memory test compares with: 3, yes, E, or the robot's tile for "here". */
function slotMatches(state: SimState, path: string, written: string): boolean {
  const { slot, field } = splitSlotPath(path);
  const whole = state.memory?.[slot];
  const value = field === undefined ? whole : recordField(whole, field);
  if (written === 'here') return isPosition(value) && value.x === state.robot.x && value.y === state.robot.y;
  if (written === 'yes' || written === 'no') return value === (written === 'yes');
  if (/^\d+$/.test(written)) return value === Number(written);
  return value === written;
}

/** What a Set card's source reads right now, given the world and the state. */
/** The tile a grid card means: the robot's, the one ahead, or the one a position slot holds. Undefined when the slot holds no place. */
export function gridPlace(state: SimState, at: GridPlace): Cell | undefined {
  if (at === 'here') return { x: state.robot.x, y: state.robot.y };
  if (at === 'ahead') return ahead(state.robot, state.robot.facing);
  const v = state.memory?.[at];
  return isPosition(v) ? v : undefined;
}

/** A grid's item at a tile, rows first like the board. Off the grid there is nothing: no, or 0. */
export function gridItem(grid: Value | undefined, cell: Cell | undefined): Value {
  const row = Array.isArray(grid) && cell ? grid[cell.y] : undefined;
  const item = Array.isArray(row) && cell ? row[cell.x] : undefined;
  if (item !== undefined) return item;
  const sample = Array.isArray(grid) && Array.isArray(grid[0]) ? grid[0][0] : undefined;
  return typeof sample === 'number' ? 0 : false;
}

/** Write a value into a grid slot at a tile. Pure: returns the state unchanged when the tile is off the grid. */
export function markGrid(state: SimState, grid: string, cell: Cell | undefined, value: Value): SimState {
  const g = state.memory?.[grid];
  if (!Array.isArray(g) || !cell || !Array.isArray(g[cell.y]) || cell.x < 0 || cell.x >= (g[cell.y] as Value[]).length) return state;
  const rows = g.map((row, y) => (y === cell.y ? (row as Value[]).map((v, x) => (x === cell.x ? value : v)) : row));
  return remember(state, grid, rows);
}

/**
 * What a source gives right now, and the state after: a random source moves
 * the generator on, so the next roll is a new one. Without a seed the
 * generator starts at 0. Pure.
 */
export function drawSource(world: WorldDefinition, state: SimState, source: Source): { value: Value; state: SimState } {
  const random = parseRandom(source);
  if (!random) return { value: readSource(world, state, source), state };
  const seed = state.rng ?? 0;
  if (random.kind === 'range') {
    const r = randomInt(seed, random.low, random.high);
    return { value: r.value, state: { ...state, rng: r.state } };
  }
  if (random.kind === 'coin') {
    const r = randomInt(seed, 0, 1);
    return { value: r.value === 1, state: { ...state, rng: r.state } };
  }
  if (random.kind === 'way') {
    const r = randomInt(seed, 0, 3);
    return { value: (['N', 'E', 'S', 'W'] as const)[r.value]!, state: { ...state, rng: r.state } };
  }
  const list = state.memory?.[random.list];
  if (!Array.isArray(list) || list.length === 0) return { value: false, state };
  const r = randomInt(seed, 0, list.length - 1);
  return { value: list[r.value]!, state: { ...state, rng: r.state } };
}

/** A remembered place moved one tile in a direction. Pure. */
export function shiftPlace(value: Value | undefined, dir: Facing): Value | undefined {
  if (!isPosition(value)) return undefined;
  return ahead(value, dir);
}

/** One field of a record, or undefined when the value is not a record with that field. */
export function recordField(record: Value | undefined, field: string): Value | undefined {
  if (typeof record !== 'object' || record === null || Array.isArray(record) || isPosition(record)) return undefined;
  return (record as Record<string, Value>)[field];
}

export function readSource(world: WorldDefinition, state: SimState, source: Source): Value {
  if (typeof source !== 'string') return source;
  const field = parseField(source);
  if (field) return recordField(state.memory?.[field.record], field.field) ?? false;
  const read = parseRead(source);
  if (read) return gridItem(state.memory?.[read.grid], gridPlace(state, read.at));
  const counted = parseLength(source);
  if (counted) {
    const list = state.memory?.[counted];
    return Array.isArray(list) ? list.length : 0;
  }
  const item = parseItem(source);
  if (item) {
    const list = state.memory?.[item.list];
    const index = itemIndex(state, item.index);
    return Array.isArray(list) && index !== undefined && index < list.length ? list[index]! : false;
  }
  if (source === 'facing') return state.robot.facing;
  if (source === 'here') return { x: state.robot.x, y: state.robot.y };
  if (source === 'acorns') return state.collected.length;
  if (source === 'acornsLeft') return world.collectibles.length - state.collected.length;
  if (isSenseId(source)) return evaluate(world, state, source);
  return source;
}

/** An item's index: the number itself, or a number slot's value. */
function itemIndex(state: SimState, index: number | string): number | undefined {
  const v = typeof index === 'number' ? index : state.memory?.[index];
  return typeof v === 'number' ? v : undefined;
}

/** Why an item cannot be read: the list has no item at that index. Undefined when it can. */
export function missingItem(state: SimState, source: Source): string | undefined {
  const field = parseField(source);
  if (field) return recordField(state.memory?.[field.record], field.field) === undefined ? `${field.record} has no ${field.field}: every record of a shape needs all its fields` : undefined;
  const item = parseItem(source);
  if (!item) return undefined;
  const list = state.memory?.[item.list];
  const index = itemIndex(state, item.index);
  const length = Array.isArray(list) ? list.length : 0;
  if (index !== undefined && index < length) return undefined;
  const span = length === 0 ? 'it is empty' : length === 1 ? 'its only item is item 0' : `its items are 0 to ${length - 1}`;
  return `${item.list} has no item ${String(index)}: ${span}`;
}

/** Put a value in a memory slot. Pure. */
export function remember(state: SimState, slot: string, value: Value): SimState {
  return { ...state, memory: { ...state.memory, [slot]: value } };
}

/** Open a numbered gate when the value is its code. Pure: returns the state unchanged otherwise. */
export function unlockGate(world: WorldDefinition, state: SimState, id: string, value: Value | undefined): SimState {
  const gate = gatesOf(world).find((g) => g.id === id);
  if (!gate || gate.code === undefined || value !== gate.code) return state;
  return setGate(state, id, true);
}

/** Turn to face a direction, all at once. Pure. */
export function faceTo(state: SimState, facing: Facing): SimState {
  return { ...state, robot: { ...state.robot, facing } };
}

/** The slots whose values are not yet the objective's, in the order the objective lists them. */
export function memoryShortfall(objective: ObjectiveDefinition, state: SimState): string[] {
  return Object.entries(objective.memory ?? {})
    .filter(([slot, want]) => JSON.stringify(state.memory?.[slot]) !== JSON.stringify(want))
    .map(([slot]) => slot);
}

/** What a random level looks at once a run ends: a slot's value, or the robot's column counted from 0. */
export function coveredValue(of: string, state: SimState): Value | undefined {
  return of === 'column' ? state.robot.x : state.memory?.[of];
}

/** True when a run ended on one of a random level's outcomes, or the level has none. */
export function withinOutcomes(objective: ObjectiveDefinition, state: SimState): boolean {
  if (!objective.covers) return true;
  const got = JSON.stringify(coveredValue(objective.covers.of, state));
  return objective.covers.values.some((v) => JSON.stringify(v) === got);
}

/** Every robot on its own flag: on a team board all of them, wherever each stopped; otherwise the robot. */
export function teamOnFlags(world: WorldDefinition, state: SimState): boolean {
  if (!world.team) return state.robot.x === world.goal.x && state.robot.y === world.goal.y;
  return world.team.every((t, i) => {
    const at = i === state.active ? state.robot : state.team?.[i];
    return at !== undefined && at.x === t.goal.x && at.y === t.goal.y;
  });
}

export function objectiveMet(world: WorldDefinition, objective: ObjectiveDefinition, state: SimState): boolean {
  if (memoryShortfall(objective, state).length > 0) return false;
  if (!withinOutcomes(objective, state)) return false;
  if (objective.reachGoal && !teamOnFlags(world, state)) return false;
  if (objective.collectAll && state.collected.length !== world.collectibles.length) return false;
  return true;
}
