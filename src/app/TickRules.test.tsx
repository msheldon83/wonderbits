// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TraceEvent } from '../runtime/contract';
import type { WorldDefinition } from '../sim/types';
import { initialState } from '../sim/world';
import { TickRules } from './TickRules';

afterEach(cleanup);

const world: WorldDefinition = {
  width: 3,
  height: 2,
  tiles: [
    ['floor', 'gap', 'floor'],
    ['floor', 'gap', 'floor'],
  ],
  robot: { x: 0, y: 0, facing: 'E' },
  goal: { x: 2, y: 0 },
  collectibles: [],
  movers: [{ id: 'l', kind: 'log', path: [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }] }],
};

describe('TickRules', () => {
  it("spells out each mover's round and rings the move the next tick makes", () => {
    const { container } = render(<TickRules world={world} state={{ ...initialState(world), tick: 1 }} event={null} />);
    expect(screen.getByText('tick 1')).toBeTruthy();
    expect(screen.getByLabelText(/^Log: stays, up, down, then round again\. Next: up\./)).toBeTruthy();
    expect(container.querySelector('.tick-step.is-next')?.textContent).toBe('↑');
  });

  it('lights the move being made while a tick plays', () => {
    const s0 = initialState(world);
    const tick = { index: 0, nodeId: 'n1', op: 'tick', before: s0, after: { ...s0, tick: 1 }, result: { kind: 'ok' } } as TraceEvent;
    const { container } = render(<TickRules world={world} state={s0} event={tick} />);
    expect(container.querySelector('.tick-rules.is-ticking')).toBeTruthy();
    expect(container.querySelector('.tick-step.is-now')?.textContent).toBe('•');
  });

  it('shows nothing on a board where nothing moves', () => {
    const { container } = render(<TickRules world={{ ...world, movers: [] }} state={initialState(world)} event={null} />);
    expect(container.firstChild).toBeNull();
  });
});
