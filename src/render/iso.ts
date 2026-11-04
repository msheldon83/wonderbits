/**
 * Isometric projection. Pure arithmetic: grid cells to screen pixels at a
 * true 2:1 ratio, plus depth ordering. No DOM here, so it is unit-tested.
 */
import type { Cell, Facing, WorldDefinition } from '../sim/types';

export const TILE_W = 128;
export const TILE_H = 64;
/** Thickness of the floating island's visible side faces. */
export const SIDE = 22;
/** Space above the back row for tall walls, trees and the robot. */
const HEADROOM = 120;
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
  const cols = world.width;
  const rows = world.height;
  const originX = rows * (TILE_W / 2) + PAD;
  const originY = HEADROOM + TILE_H / 2;
  return {
    cols,
    rows,
    originX,
    originY,
    stageW: (cols + rows) * (TILE_W / 2) + PAD * 2,
    stageH: originY + (cols + rows - 2) * (TILE_H / 2) + TILE_H / 2 + SIDE + PAD * 2,
  };
}

/** Screen position of the centre of a tile's top face. */
export function toScreen(layout: BoardLayout, cell: Cell): { x: number; y: number } {
  return {
    x: layout.originX + (cell.x - cell.y) * (TILE_W / 2),
    y: layout.originY + (cell.x + cell.y) * (TILE_H / 2),
  };
}

/** Draw order. Higher is nearer the viewer. Layer breaks ties on one tile. */
export const LAYER = { indicator: 1, goal: 3, collectible: 3, wall: 4, robot: 5 } as const;
export function depth(cell: Cell, layer: number): number {
  return 10 + (cell.x + cell.y) * 10 + layer;
}

/** Rotate a grid-space vector that points east so it points along `facing`. */
export function orient(facing: Facing, gx: number, gy: number): [number, number] {
  switch (facing) {
    case 'E':
      return [gx, gy];
    case 'S':
      return [-gy, gx];
    case 'W':
      return [-gx, -gy];
    case 'N':
      return [gy, -gx];
  }
}

/** Project a grid-space offset (in tiles) to a screen-space offset (in px). */
export function projectOffset(gx: number, gy: number): [number, number] {
  return [(gx - gy) * (TILE_W / 2), (gx + gy) * (TILE_H / 2)];
}

/** Facings that point toward the right half of the screen. */
export const FACES_SCREEN_RIGHT: Record<Facing, boolean> = { E: true, N: true, S: false, W: false };
/** Facings that point toward the viewer (down the screen). */
export const FACES_VIEWER: Record<Facing, boolean> = { E: true, S: true, N: false, W: false };
