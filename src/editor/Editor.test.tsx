// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { applyOp } from '../ir/ops';
import { commandsOf, mainBody, programFromCommands } from '../ir/program';
import type { CommandId, ProgramIR } from '../ir/types';
import { Editor } from './Editor';

afterEach(cleanup);

function Harness({ start, max, allowed = ['forward', 'rotateCW'], onChange }: { start: CommandId[]; max?: number; allowed?: CommandId[]; onChange?: (p: ProgramIR) => void }) {
  const [newId] = useState(() => sequentialIdFactory('t'));
  const [program, setProgram] = useState(() => programFromCommands(start, sequentialIdFactory('s')));
  return (
    <Editor
      program={program}
      allowedCommands={allowed}
      maxInstructions={max}
      locked={false}
      activeNodeId={null}
      errorNodeId={null}
      newId={newId}
      onEdit={(op) =>
        setProgram((p) => {
          const next = applyOp(p, op);
          onChange?.(next);
          return next;
        })
      }
    />
  );
}

const openSlots = () => screen.queryAllByRole('button', { name: /^Put / });

describe('Editor: tap a card, tap a slot', () => {
  it('shows no open slots until a card is selected', () => {
    render(<Harness start={['forward']} />);
    expect(openSlots()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate clockwise card' }));
    expect(openSlots()).toHaveLength(2);
  });

  it('inserts the selected palette card at the tapped slot', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate clockwise card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Put Rotate at step 1' }));
    expect(commandsOf(last!)).toEqual(['rotateCW', 'forward']);
    expect(openSlots()).toHaveLength(0);
    expect(document.activeElement?.getAttribute('data-node-id')).toBe('t1');
  });

  it('moves a program card with the same gesture and hides slots that change nothing', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW', 'forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Step 3:/ }));
    expect(openSlots()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Put Forward at step 1' }));
    expect(mainBody(last!).map((n) => n.id)).toEqual(['s3', 's1', 's2']);
  });

  it('removes a selected program card from the palette area or with the Delete key', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW']} onChange={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Step 2:/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove the selected/ }));
    expect(commandsOf(last!)).toEqual(['forward']);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Step 1:/ }), { key: 'Delete' });
    expect(commandsOf(last!)).toEqual([]);
  });

  it('cancels a selection by tapping the card again or pressing Escape', () => {
    render(<Harness start={['forward']} />);
    const card = screen.getByRole('button', { name: 'Move forward one tile card' });
    fireEvent.click(card);
    fireEvent.click(card);
    expect(openSlots()).toHaveLength(0);
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(openSlots()).toHaveLength(0);
  });

  it('disables palette cards when the instruction budget is full', () => {
    render(<Harness start={['forward', 'forward']} max={2} />);
    expect(screen.getByRole('button', { name: 'Move forward one tile card' })).toHaveProperty('disabled', true);
    expect(screen.getByText('2 of 2 steps')).toBeTruthy();
  });
});
