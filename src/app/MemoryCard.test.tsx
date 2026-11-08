// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldDefinition } from '../sim/types';
import { initialState } from '../sim/world';
import { MemoryCard } from './MemoryCard';

afterEach(cleanup);

const world: WorldDefinition = {
  width: 3,
  height: 1,
  tiles: [['floor', 'floor', 'floor']],
  robot: { x: 0, y: 0, facing: 'E' },
  goal: { x: 2, y: 0 },
  collectibles: [],
  gates: [{ id: 'a', x: 2, y: 0, open: false }],
  switches: [{ x: 1, y: 0, toggles: ['a'] }],
};

describe('MemoryCard', () => {
  it('shows each line with its value', () => {
    render(<MemoryCard world={world} state={initialState(world)} />);
    expect(screen.getByText('column 1, row 1')).toBeTruthy();
    expect(screen.getByText('Gate A open')).toBeTruthy();
    expect(screen.getByText('no')).toBeTruthy();
  });

  it('turns asked lines into questions and reports the answer', () => {
    const onAnswer = vi.fn();
    render(<MemoryCard world={world} state={initialState(world)} asking={['gate:a', 'facing']} answers={{ facing: 'S' }} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gate A open: yes, open' }));
    expect(onAnswer).toHaveBeenCalledWith('gate:a', true);
    expect(screen.getByRole('button', { name: 'Facing: down' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('right')).toBeNull();
  });
});
