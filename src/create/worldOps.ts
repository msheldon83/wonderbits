/**
 * Editing a board: pure operations from one world to the next, the way
 * ir/ops.ts edits a program. Every operation leaves a board the simulation
 * can run: the robot and the flag always stand on floor, apart; nothing
 * shares a tile; a switch always flips a gate that is there. An operation
 * that cannot be done returns the same world, so the caller can tell.
 */
import { FACINGS, type Cell, type Gate, type Switch, type TileKind, type WorldDefinition } from '../sim/types';
import { BOARD_MAX, BOARD_MIN } from './types';

/** What a tap on a tile does. */
export const TOOLS = ['floor', 'wall', 'gap', 'acorn', 'flag', 'robot', 'gate', 'switch', 'erase'] as const;
export type Tool = (typeof TOOLS)[number];

/** Tools that paint as a finger drags across tiles; the others place one thing per tap. */
export const isPaintTool = (tool: Tool): boolean => tool === 'floor' || tool === 'wall' || tool === 'gap' || tool === 'erase';

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const inside = (world: WorldDefinition, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < world.width && c.y < world.height;
const tile = (world: WorldDefinition, c: Cell): TileKind => world.tiles[c.y]![c.x]!;

/** Tiles a robot starts on or a flag stands on: they cannot be taken or flooded. */
function fixedCells(world: WorldDefinition): Cell[] {
  return [world.robot, world.goal, ...(world.team ?? []).slice(1).flatMap((t) => [t.robot, t.goal])];
}

/** Drops optional lists that ended up empty, so a board with no gates has no `gates` key. */
function tidy(world: WorldDefinition): WorldDefinition {
  const { gates, switches, plates, movers, ...rest } = world;
  return { ...rest, ...(gates?.length && { gates }), ...(switches?.length && { switches }), ...(plates?.length && { plates }), ...(movers?.length && { movers }) };
}

/** The board without anything placed on these tiles: acorns, gates, switches and plates. Switches left flipping nothing go too. */
function clearThings(world: WorldDefinition, cells: readonly Cell[]): WorldDefinition {
  const hit = (c: Cell) => cells.some((x) => same(x, c));
  const gates = (world.gates ?? []).filter((g) => !hit(g));
  const ids = new Set(gates.map((g) => g.id));
  const switches = (world.switches ?? [])
    .filter((s) => !hit(s))
    .map((s) => ({ ...s, toggles: s.toggles.filter((id) => ids.has(id)) }))
    .filter((s) => s.toggles.length > 0);
  return tidy({ ...world, collectibles: world.collectibles.filter((c) => !hit(c)), gates, switches, plates: (world.plates ?? []).filter((p) => !hit(p)) });
}

/** Movers whose whole path still suits them: logs on water, beetles on floor. */
function keepMovers(world: WorldDefinition): WorldDefinition {
  const movers = (world.movers ?? []).filter((m) => m.path.every((c) => inside(world, c) && tile(world, c) === (m.kind === 'log' ? 'gap' : 'floor')));
  return tidy({ ...world, movers });
}

function setTile(world: WorldDefinition, cell: Cell, kind: TileKind): WorldDefinition {
  if (tile(world, cell) === kind) return world;
  if (kind !== 'floor' && fixedCells(world).some((c) => same(c, cell))) return world;
  const tiles = world.tiles.map((row, y) => (y === cell.y ? row.map((t, x) => (x === cell.x ? kind : t)) : row));
  const next = { ...world, tiles };
  return keepMovers(kind === 'floor' ? next : clearThings(next, [cell]));
}

/** A floor tile nothing fixed stands on, emptied, ready for one new thing. */
function freeFloor(world: WorldDefinition, cell: Cell): WorldDefinition | null {
  if (tile(world, cell) !== 'floor' || fixedCells(world).some((c) => same(c, cell))) return null;
  return clearThings(world, [cell]);
}

const GATE_IDS = 'abcdefghijklmnopqrstuvwxyz';
/** As many gates as the board draws apart by colour. */
export const MAX_GATES = 6;

/** The gate a new switch flips: the first with no switch yet, or the first gate. */
function gateForNewSwitch(world: WorldDefinition): Gate | undefined {
  const gates = world.gates ?? [];
  return gates.find((g) => !(world.switches ?? []).some((s) => s.toggles.includes(g.id))) ?? gates[0];
}

/** One tap of a tool on a tile. */
export function applyTool(world: WorldDefinition, tool: Tool, cell: Cell): WorldDefinition {
  if (!inside(world, cell)) return world;
  switch (tool) {
    case 'floor':
    case 'wall':
    case 'gap':
      return setTile(world, cell, tool);
    case 'erase': {
      const cleared = clearThings(world, [cell]);
      return JSON.stringify(cleared) === JSON.stringify(world) ? world : cleared;
    }
    case 'acorn': {
      // Tapping an acorn picks it back up.
      if (world.collectibles.some((c) => same(c, cell))) return { ...world, collectibles: world.collectibles.filter((c) => !same(c, cell)) };
      const free = freeFloor(world, cell);
      return free ? { ...free, collectibles: [...free.collectibles, cell] } : world;
    }
    case 'flag': {
      if (same(world.goal, cell)) return world;
      const free = freeFloor({ ...world, goal: { x: -1, y: -1 } }, cell);
      if (!free) return world;
      return { ...free, goal: cell, ...(world.team && { team: world.team.map((t, i) => (i === 0 ? { ...t, goal: cell } : t)) }) };
    }
    case 'robot': {
      // Tapping the robot turns it a quarter turn clockwise.
      const robot = same(world.robot, cell) ? { ...world.robot, facing: FACINGS[(FACINGS.indexOf(world.robot.facing) + 1) % 4]! } : { ...world.robot, ...cell };
      const free = same(world.robot, cell) ? world : freeFloor({ ...world, robot: { ...world.robot, x: -1, y: -1 } }, cell);
      if (!free) return world;
      return { ...free, robot, ...(world.team && { team: world.team.map((t, i) => (i === 0 ? { ...t, robot } : t)) }) };
    }
    case 'gate': {
      // Tapping a gate changes how it starts: shut, or open.
      const there = (world.gates ?? []).find((g) => same(g, cell));
      if (there) return { ...world, gates: world.gates!.map((g) => (g === there ? { ...g, open: !g.open } : g)) };
      const used = new Set((world.gates ?? []).map((g) => g.id));
      const id = [...GATE_IDS].find((c) => !used.has(c));
      if (!id || used.size >= MAX_GATES) return world;
      const free = freeFloor(world, cell);
      return free ? { ...free, gates: [...(free.gates ?? []), { id, ...cell, open: false }] } : world;
    }
    case 'switch': {
      const gates = world.gates ?? [];
      if (gates.length === 0) return world;
      // Tapping a switch moves it on to the next gate.
      const there = (world.switches ?? []).find((s) => same(s, cell));
      if (there) {
        if (gates.length < 2) return world;
        const at = gates.findIndex((g) => g.id === there.toggles[0]);
        const next: Switch = { ...there, toggles: [gates[(at + 1) % gates.length]!.id] };
        return { ...world, switches: world.switches!.map((s) => (s === there ? next : s)) };
      }
      const target = gateForNewSwitch(world)!;
      const free = freeFloor(world, cell);
      if (!free) return world;
      // Clearing the tile may have taken the gate this switch was for.
      const gate = (free.gates ?? []).find((g) => g.id === target.id) ?? gateForNewSwitch(free);
      return gate ? { ...free, switches: [...(free.switches ?? []), { ...cell, toggles: [gate.id] }] } : world;
    }
  }
}

/** The smallest board that still holds every robot and flag. */
export function minSize(world: WorldDefinition): { width: number; height: number } {
  const fixed = fixedCells(world);
  return { width: Math.max(BOARD_MIN, ...fixed.map((c) => c.x + 1)), height: Math.max(BOARD_MIN, ...fixed.map((c) => c.y + 1)) };
}

/** Grow or shrink the board at its right and bottom edges. New tiles are floor; what falls off the edge is gone. */
export function resize(world: WorldDefinition, width: number, height: number): WorldDefinition {
  const min = minSize(world);
  if (width === world.width && height === world.height) return world;
  if (width < min.width || height < min.height || width > BOARD_MAX || height > BOARD_MAX) return world;
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x): TileKind => world.tiles[y]?.[x] ?? 'floor'));
  const gone: Cell[] = [];
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (x >= width || y >= height) gone.push({ x, y });
  return keepMovers({ ...clearThings(world, gone), width, height, tiles });
}

/** Undo and redo for a board, like ir/history.ts for a program. */
export interface WorldHistory {
  past: WorldDefinition[];
  present: WorldDefinition;
  future: WorldDefinition[];
}
export const WORLD_HISTORY_LIMIT = 100;
export const worldHistory = (present: WorldDefinition): WorldHistory => ({ past: [], present, future: [] });
export function pushWorld(h: WorldHistory, next: WorldDefinition): WorldHistory {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-WORLD_HISTORY_LIMIT), present: next, future: [] };
}
/** Replace the present without a new undo step: the rest of one stroke of the finger. */
export const amendWorld = (h: WorldHistory, next: WorldDefinition): WorldHistory => (next === h.present ? h : { ...h, present: next, future: [] });
export function undoWorld(h: WorldHistory): WorldHistory {
  const before = h.past.at(-1);
  return before ? { past: h.past.slice(0, -1), present: before, future: [h.present, ...h.future] } : h;
}
export function redoWorld(h: WorldHistory): WorldHistory {
  const [next, ...rest] = h.future;
  return next ? { past: [...h.past, h.present], present: next, future: rest } : h;
}
