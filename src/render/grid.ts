/**
 * Top-down grid layout. Pure arithmetic: grid cells to screen pixels and
 * facings to rotation angles. No DOM here, so it is unit-tested.
 *
 * Up on the screen is always north, so "rotate clockwise" is clockwise on
 * screen. The robot is drawn once, pointing up, and rotated in code.
 */
import type { CommandId } from '../ir/types';
import type { Cell, Facing, WorldDefinition } from '../sim/types';

/** Rendered tile size in CSS px before the board is scaled to fit. */
export const TILE = 96;
/** Height of the island's front lip drawn under the bottom edge. */
export const LIP = 14;
const PAD = 24;

export interface BoardLayout {
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  stageW: number;
  stageH: number;
}

export function layoutFor(world: Pick<WorldDefinition, 'width' | 'height'>): BoardLayout {
  return {
    cols: world.width,
    rows: world.height,
    originX: PAD,
    originY: PAD,
    stageW: world.width * TILE + PAD * 2,
    stageH: world.height * TILE + LIP + PAD * 2,
  };
}

/** Screen position of the centre of a tile. Accepts fractional cells for tweens. */
export function toScreen(layout: BoardLayout, cell: Cell): { x: number; y: number } {
  return {
    x: layout.originX + (cell.x + 0.5) * TILE,
    y: layout.originY + (cell.y + 0.5) * TILE,
  };
}

/** Top-left corner of a tile. */
export function tileOrigin(layout: BoardLayout, cell: Cell): { x: number; y: number } {
  return { x: layout.originX + cell.x * TILE, y: layout.originY + cell.y * TILE };
}

/** Fixed draw order. With no depth sorting, layers never change. */
export const LAYER = { indicator: 5, goal: 10, collectible: 20, robot: 50, effect: 60 } as const;

const ANGLE: Record<Facing, number> = { N: 0, E: 90, S: 180, W: 270 };

/** Rotation in degrees for a facing, with north (up) at zero. */
export function angleFor(facing: Facing): number {
  return ANGLE[facing];
}

/**
 * Next display angle after a turn. Angles accumulate rather than wrap, so a
 * clockwise turn from west to north animates +90 degrees, not -270.
 */
export function turnAngle(angle: number, op: CommandId | string): number {
  if (op === 'rotateCW') return angle + 90;
  if (op === 'rotateCCW') return angle - 90;
  return angle;
}
