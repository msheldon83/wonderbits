import { describe, expect, it } from 'vitest';
import { depth, layoutFor, orient, projectOffset, toScreen, TILE_H, TILE_W } from './iso';

describe('isometric projection', () => {
  const layout = layoutFor({ width: 4, height: 3 });

  it('keeps a true 2:1 ratio between grid axes', () => {
    const a = toScreen(layout, { x: 0, y: 0 });
    const east = toScreen(layout, { x: 1, y: 0 });
    const south = toScreen(layout, { x: 0, y: 1 });
    expect([east.x - a.x, east.y - a.y]).toEqual([TILE_W / 2, TILE_H / 2]);
    expect([south.x - a.x, south.y - a.y]).toEqual([-TILE_W / 2, TILE_H / 2]);
  });

  it('fits every tile inside the stage', () => {
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++) {
        const p = toScreen(layout, { x, y });
        expect(p.x - TILE_W / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + TILE_W / 2).toBeLessThanOrEqual(layout.stageW);
        expect(p.y + TILE_H / 2).toBeLessThanOrEqual(layout.stageH);
      }
  });

  it('draws nearer tiles on top', () => {
    expect(depth({ x: 1, y: 1 }, 0)).toBeGreaterThan(depth({ x: 1, y: 0 }, 5));
  });

  it('orients an east-pointing vector to every facing', () => {
    expect(orient('E', 1, 0)).toEqual([1, 0]);
    expect(orient('S', 1, 0)).toEqual([-0, 1]);
    expect(orient('W', 1, 0)).toEqual([-1, -0]);
    expect(orient('N', 1, 0)).toEqual([0, -1]);
    expect(projectOffset(1, 0)).toEqual([TILE_W / 2, TILE_H / 2]);
  });
});
