import { describe, expect, it } from 'vitest';
import { angleFor, layoutFor, TILE, tileOrigin, toScreen, turnAngle } from './grid';

describe('top-down grid layout', () => {
  const layout = layoutFor({ width: 4, height: 3 });

  it('spaces tiles evenly along both axes', () => {
    const a = toScreen(layout, { x: 0, y: 0 });
    expect(toScreen(layout, { x: 1, y: 0 })).toEqual({ x: a.x + TILE, y: a.y });
    expect(toScreen(layout, { x: 0, y: 1 })).toEqual({ x: a.x, y: a.y + TILE });
  });

  it('centres a tile inside its square', () => {
    const o = tileOrigin(layout, { x: 2, y: 1 });
    expect(toScreen(layout, { x: 2, y: 1 })).toEqual({ x: o.x + TILE / 2, y: o.y + TILE / 2 });
  });

  it('fits every tile inside the stage', () => {
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++) {
        const o = tileOrigin(layout, { x, y });
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.x + TILE).toBeLessThanOrEqual(layout.stageW);
        expect(o.y + TILE).toBeLessThanOrEqual(layout.stageH);
      }
  });
});

describe('rotation angles', () => {
  it('puts north up and turns clockwise on screen', () => {
    expect(['N', 'E', 'S', 'W'].map((f) => angleFor(f as 'N'))).toEqual([0, 90, 180, 270]);
  });

  it('accumulates turns so animations always take the short way', () => {
    // West to north clockwise is +90 on screen, never a -270 spin.
    expect(turnAngle(angleFor('W'), 'rotateCW')).toBe(360);
    expect(turnAngle(angleFor('N'), 'rotateCCW')).toBe(-90);
    expect(turnAngle(90, 'forward')).toBe(90);
  });
});
