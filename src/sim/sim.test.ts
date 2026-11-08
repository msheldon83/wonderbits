import { describe, expect, it } from 'vitest';
import type { WorldDefinition } from './types';
import { advance, evaluate, initialState, isTimed, objectiveMet, passable, period, stateKey, step } from './world';

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
    const atWall = { robot: { x: 2, y: 1, facing: 'N' as const }, collected: [], open: [], tick: 0 };
    expect(step(world, atWall, 'forward')).toMatchObject({ kind: 'blocked', reason: 'wall', at: { x: 2, y: 0 } });
    const atGap = { robot: { x: 1, y: 1, facing: 'S' as const }, collected: [], open: [], tick: 0 };
    expect(step(world, atGap, 'forward')).toMatchObject({ kind: 'blocked', reason: 'gap', state: atGap });
    const atEdge = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [], open: [], tick: 0 };
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
    const atGoal = { robot: { x: 3, y: 1, facing: 'E' as const }, collected: [], open: [], tick: 0 };
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
    expect(stateKey(both.state)).not.toBe(stateKey({ ...both.state, open: [], tick: 0 }));
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

describe('plates, logs and beetles', () => {
  // . P _ .     robot at (0,0) facing E, plate 1 at (1,0), water at (2,0) and (2,1)
  // . . _ .     a log goes (2,1) -> (2,0) -> round again; a beetle walks (3,1) <-> (3,0)
  const timed: WorldDefinition = {
    width: 4,
    height: 2,
    tiles: [
      ['floor', 'floor', 'gap', 'floor'],
      ['floor', 'floor', 'gap', 'floor'],
    ],
    robot: { x: 0, y: 0, facing: 'E' },
    goal: { x: 3, y: 0 },
    collectibles: [{ x: 0, y: 1 }],
    plates: [{ id: '1', x: 1, y: 0 }],
    movers: [
      { id: 'log', kind: 'log', path: [{ x: 2, y: 1 }, { x: 2, y: 0 }] },
      { id: 'bug', kind: 'beetle', path: [{ x: 3, y: 1 }, { x: 3, y: 0 }, { x: 3, y: 1 }] },
    ],
  };
  const at = (x: number, y: number, tick: number, facing: 'N' | 'E' | 'S' | 'W' = 'E') => ({ ...initialState(timed), robot: { x, y, facing }, tick });

  it('fires an event for stepping on a plate and for picking up an acorn', () => {
    expect(step(timed, initialState(timed), 'forward')).toMatchObject({ kind: 'ok', events: ['stepOn:1'] });
    expect(step(timed, at(0, 0, 0, 'S'), 'forward')).toMatchObject({ kind: 'ok', events: ['acorn'] });
    expect(step(timed, initialState(timed), 'wait')).toEqual({ kind: 'ok', state: initialState(timed) });
  });

  it('lets the robot onto water only where a log floats now', () => {
    expect(step(timed, at(1, 0, 0), 'forward')).toMatchObject({ kind: 'blocked', reason: 'gap' });
    expect(step(timed, at(1, 0, 1), 'forward').kind).toBe('ok');
    expect(passable(timed, at(1, 0, 1), { x: 2, y: 0 })).toBe(true);
  });

  it('carries a robot standing on a log, and drops one left on water', () => {
    const riding = advance(timed, at(2, 0, 1));
    expect(riding).toMatchObject({ kind: 'ok', rode: true, state: { robot: { x: 2, y: 1 }, tick: 2 } });
    // Riding keeps a robot on its log; a robot left on bare water has fallen in.
    const still: WorldDefinition = { ...timed, movers: [{ id: 'log', kind: 'log', path: [{ x: 2, y: 1 }] }] };
    expect(advance(still, at(2, 0, 0))).toMatchObject({ kind: 'hazard', reason: 'gap' });
  });

  it('blocks a step onto a beetle, and catches a robot a beetle walks onto', () => {
    expect(step(timed, at(3, 1, 1, 'N'), 'forward')).toMatchObject({ kind: 'blocked', reason: 'beetle' });
    expect(advance(timed, at(3, 0, 0))).toMatchObject({ kind: 'hazard', reason: 'beetle' });
  });

  it('repeats after the period of its movers, and keys states by it', () => {
    expect(period(timed)).toBe(6);
    expect(isTimed(timed)).toBe(true);
    expect(isTimed({ ...timed, movers: [] })).toBe(false);
    expect(isTimed({ ...timed, movers: [] }, true)).toBe(true);
    expect(stateKey(at(0, 0, 1), 6)).toBe(stateKey(at(0, 0, 7), 6));
    expect(stateKey(at(0, 0, 1), 6)).not.toBe(stateKey(at(0, 0, 2), 6));
  });
});
