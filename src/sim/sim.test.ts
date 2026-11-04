import { describe, expect, it } from 'vitest';
import type { WorldDefinition } from './types';
import { initialState, objectiveMet, step } from './world';

// 4x3 board:   . . # .
//              R . . G     robot at (0,1) facing E, goal at (3,1)
//              . _ . .     gap at (1,2)
const world: WorldDefinition = {
  width: 4,
  height: 3,
  tiles: [
    ['floor', 'floor', 'wall', 'floor'],
    ['floor', 'floor', 'floor', 'floor'],
    ['floor', 'gap', 'floor', 'floor'],
  ],
  robot: { x: 0, y: 1, facing: 'E' },
  goal: { x: 3, y: 1 },
  collectibles: [{ x: 2, y: 1 }],
};

describe('step', () => {
  it('moves forward onto floor', () => {
    const r = step(world, initialState(world), 'forward');
    expect(r.kind).toBe('ok');
    expect(r.state.robot).toEqual({ x: 1, y: 1, facing: 'E' });
  });

  it('rotates both ways without moving', () => {
    const s = initialState(world);
    expect(step(world, s, 'rotateCW').state.robot.facing).toBe('S');
    expect(step(world, s, 'rotateCCW').state.robot.facing).toBe('N');
  });

  it('is blocked by walls, gaps and the board edge, and stays put', () => {
    const atWall = { robot: { x: 2, y: 1, facing: 'N' as const }, collected: [] };
    expect(step(world, atWall, 'forward')).toMatchObject({ kind: 'blocked', reason: 'wall', at: { x: 2, y: 0 } });
    const atGap = { robot: { x: 1, y: 1, facing: 'S' as const }, collected: [] };
    expect(step(world, atGap, 'forward')).toMatchObject({ kind: 'blocked', reason: 'gap', state: atGap });
    const atEdge = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [] };
    expect(step(world, atEdge, 'forward')).toMatchObject({ kind: 'blocked', reason: 'edge', at: { x: 4, y: 1 } });
  });

  it('collects a collectible once', () => {
    let s = initialState(world);
    s = step(world, s, 'forward').state;
    const r = step(world, s, 'forward');
    expect(r).toMatchObject({ kind: 'ok', collected: { x: 2, y: 1 } });
    expect(r.state.collected).toEqual(['2,1']);
  });

  it('never mutates the input state', () => {
    const s = initialState(world);
    const copy = structuredClone(s);
    step(world, s, 'forward');
    step(world, s, 'rotateCW');
    expect(s).toEqual(copy);
  });
});

describe('objectiveMet', () => {
  it('checks the goal and, when asked, the collectibles', () => {
    const atGoal = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [] };
    expect(objectiveMet(world, { reachGoal: true, collectAll: false }, atGoal)).toBe(true);
    expect(objectiveMet(world, { reachGoal: true, collectAll: true }, atGoal)).toBe(false);
    expect(objectiveMet(world, { reachGoal: true, collectAll: true }, { ...atGoal, collected: ['2,1'] })).toBe(true);
  });
});
