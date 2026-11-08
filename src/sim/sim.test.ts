import { describe, expect, it } from 'vitest';
import type { WorldDefinition } from './types';
import { evaluate, initialState, objectiveMet, passable, stateKey, step } from './world';

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
    const atWall = { robot: { x: 2, y: 1, facing: 'N' as const }, collected: [], open: [] };
    expect(step(world, atWall, 'forward')).toMatchObject({ kind: 'blocked', reason: 'wall', at: { x: 2, y: 0 } });
    const atGap = { robot: { x: 1, y: 1, facing: 'S' as const }, collected: [], open: [] };
    expect(step(world, atGap, 'forward')).toMatchObject({ kind: 'blocked', reason: 'gap', state: atGap });
    const atEdge = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [], open: [] };
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
    const atGoal = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [], open: [] };
    expect(objectiveMet(world, { reachGoal: true, collectAll: false }, atGoal)).toBe(true);
    expect(objectiveMet(world, { reachGoal: true, collectAll: true }, atGoal)).toBe(false);
    expect(objectiveMet(world, { reachGoal: true, collectAll: true }, { ...atGoal, collected: ['2,1'] })).toBe(true);
  });
});

describe('switches and gates', () => {
  // . S G .     robot at (0,0) facing E, switch at (1,0) flips gate a at (2,0), goal at (3,0)
  // . . . .     gate b at (0,1) starts open; the switch at (3,1) flips a and b
  const gated: WorldDefinition = {
    width: 4,
    height: 2,
    tiles: [
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
    ],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 3, y: 0 },
    collectibles: [],
    gates: [
      { id: 'a', x: 2, y: 0, open: false },
      { id: 'b', x: 0, y: 1, open: true },
    ],
    switches: [
      { x: 1, y: 0, toggles: ['a'] },
      { x: 3, y: 1, toggles: ['a', 'b'] },
    ],
  };

  it('starts with the gates that start open', () => {
    expect(initialState(gated).open).toEqual(['b']);
  });

  it('blocks the robot at a shut gate, and lets it through an open one', () => {
    const s = { ...initialState(gated), robot: { x: 1, y: 0, facing: 'E' as const } };
    const r = step(gated, s, 'forward');
    expect(r).toMatchObject({ kind: 'blocked', reason: 'gate', at: { x: 2, y: 0 } });
    expect(passable(gated, s, { x: 2, y: 0 })).toBe(false);
    expect(step(gated, { ...s, open: ['a', 'b'] }, 'forward').kind).toBe('ok');
  });

  it('flips gates when the robot steps onto a switch, and again on the next step onto it', () => {
    const once = step(gated, initialState(gated), 'forward');
    expect(once).toMatchObject({ kind: 'ok', toggled: ['a'] });
    expect(once.state.open).toEqual(['a', 'b']);
    // Standing still or turning on the switch flips nothing.
    expect(step(gated, once.state, 'rotateCW').state.open).toEqual(['a', 'b']);
    const corner = { ...initialState(gated), robot: { x: 2, y: 1, facing: 'E' as const } };
    const both = step(gated, corner, 'forward');
    expect(both.state.open).toEqual(['a']);
    expect(stateKey(both.state)).not.toBe(stateKey({ ...both.state, open: [] }));
  });

  it('senses a shut gate ahead and a switch underfoot', () => {
    const facingGate = { ...initialState(gated), robot: { x: 1, y: 0, facing: 'E' as const } };
    expect(evaluate(gated, facingGate, 'gateClosedAhead')).toBe(true);
    expect(evaluate(gated, facingGate, 'blockedAhead')).toBe(true);
    expect(evaluate(gated, facingGate, 'pathAhead')).toBe(false);
    expect(evaluate(gated, facingGate, 'onSwitch')).toBe(true);
    expect(evaluate(gated, { ...facingGate, open: ['a'] }, 'gateClosedAhead')).toBe(false);
    expect(evaluate(gated, initialState(gated), 'onSwitch')).toBe(false);
  });
});
