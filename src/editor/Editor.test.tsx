// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { applyOp } from '../ir/ops';
import { commandsOf, mainBody, programFromCommands } from '../ir/program';
import type { CommandId, ProgramIR } from '../ir/types';
import { Editor, type EditorProps } from './Editor';
import type { Programming } from './palette';

afterEach(cleanup);

interface HarnessProps {
  start: CommandId[];
  max?: number;
  allowed?: CommandId[];
  programming?: Partial<Programming>;
  history?: Pick<EditorProps, 'canUndo' | 'canRedo' | 'onUndo' | 'onRedo'>;
  onChange?: (p: ProgramIR) => void;
}

function Harness({ start, max, allowed = ['forward', 'rotateCW'], programming, history, onChange }: HarnessProps) {
  const [newId] = useState(() => sequentialIdFactory('t'));
  const [program, setProgram] = useState(() => programFromCommands(start, sequentialIdFactory('s')));
  return (
    <Editor
      program={program}
      programming={{ allowedCommands: allowed, maxInstructions: max, starterProgram: [], ...programming }}
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
      {...history}
    />
  );
}

const forwardCard = () => screen.getByRole('button', { name: /^Add Move forward one tile/ });
const rotateCard = () => screen.getByRole('button', { name: /^Add Rotate clockwise/ });
const step = (n: number) => screen.getByRole('button', { name: new RegExp(`^Step ${n}:`) });
const moveButton = (n: number) => screen.getByRole('button', { name: `Move step ${n}` });
const carets = () => screen.queryAllByRole('button', { name: /^Put / });
const ids = (p: ProgramIR) => mainBody(p).map((n) => n.id);

describe('Editor: tap to add, delete and move', () => {
  it('appends a palette card to the end of the program', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(rotateCard());
    expect(commandsOf(last!)).toEqual(['forward', 'rotateCW']);
    expect(screen.queryByText('Tap an instruction to add a step')).toBeNull();
  });

  it('shows a Move and a Delete button on every block', () => {
    render(<Harness start={['forward', 'rotateCW']} />);
    expect(screen.getAllByRole('button', { name: /^Move step/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Remove step/ })).toHaveLength(2);
  });

  it('deletes a block with its Delete button or the Delete key', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW', 'forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }));
    expect(ids(last!)).toEqual(['s1', 's3']);
    expect(document.activeElement?.getAttribute('data-node-id')).toBe('s3');
    fireEvent.keyDown(step(1), { key: 'Delete' });
    expect(ids(last!)).toEqual(['s3']);
  });

  it('opens carets for every gap that changes something when Move is tapped', () => {
    render(<Harness start={['forward', 'rotateCW', 'forward']} />);
    expect(carets()).toHaveLength(0);
    fireEvent.click(moveButton(2));
    expect(carets().map((c) => c.getAttribute('aria-label'))).toEqual(['Put Rotate before step 1', 'Put Rotate at the end']);
    expect(document.activeElement?.className).toContain('caret');
    expect(step(2).className).toContain('is-carried');
    expect(step(2).getAttribute('aria-label')).toContain('being moved');
    expect(screen.getByText('Tap an arrow to put Rotate there.')).toBeTruthy();
  });

  it('places the block at the tapped caret and closes the carets', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW', 'forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(moveButton(3));
    fireEvent.click(screen.getByRole('button', { name: 'Put Forward before step 1' }));
    expect(ids(last!)).toEqual(['s3', 's1', 's2']);
    expect(carets()).toHaveLength(0);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move step 1');
  });

  it('cancels a move by tapping Move again or pressing Escape', () => {
    render(<Harness start={['forward', 'rotateCW']} />);
    fireEvent.click(moveButton(1));
    expect(carets()).toHaveLength(1);
    fireEvent.click(moveButton(1));
    expect(carets()).toHaveLength(0);
    fireEvent.click(moveButton(1));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(carets()).toHaveLength(0);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move step 1');
  });

  it('moves with Shift and the arrow keys on a block', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW']} onChange={(p) => (last = p)} />);
    fireEvent.keyDown(step(1), { key: 'ArrowDown', shiftKey: true });
    expect(ids(last!)).toEqual(['s2', 's1']);
    fireEvent.keyDown(step(2), { key: 'ArrowUp', shiftKey: true });
    expect(ids(last!)).toEqual(['s1', 's2']);
  });

  it('disables palette cards when the instruction budget is full', () => {
    render(<Harness start={['forward', 'forward']} max={2} />);
    expect(forwardCard()).toHaveProperty('disabled', true);
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('2 of 2 steps');
    expect(screen.getByRole('status').className).toContain('is-full');
  });

  it('shows the unused steps as empty rows and warns when two are left', () => {
    const { container } = render(<Harness start={['forward']} max={4} />);
    const empties = () => container.querySelectorAll('.program-step.is-empty');
    expect(empties()).toHaveLength(3);
    expect(empties()[0]!.textContent).toContain('2');
    expect(screen.getByRole('status').className).not.toContain('is-low');
    fireEvent.click(forwardCard());
    expect(empties()).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('2 of 4 steps · 2 left');
    expect(screen.getByRole('status').className).toContain('is-low');
    expect(empties()[0]!.className).toContain('is-low');
    fireEvent.click(forwardCard());
    fireEvent.click(forwardCard());
    expect(empties()).toHaveLength(0);
    expect(screen.getByRole('status').className).toContain('is-full');
  });
});

describe('Editor: the cursor', () => {
  const cursorLabel = () => screen.getByRole('button', { name: /^New cards go/ }).getAttribute('aria-label');

  it('starts at the end and moves past each card added', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward']} onChange={(p) => (last = p)} />);
    expect(cursorLabel()).toBe('New cards go at the end. Tap to choose another spot');
    fireEvent.click(step(1));
    expect(cursorLabel()).toBe('New cards go at the end. Tap to choose another spot');
    fireEvent.click(rotateCard());
    expect(commandsOf(last!)).toEqual(['forward', 'rotateCW']);
    expect(cursorLabel()).toBe('New cards go at the end. Tap to choose another spot');
  });

  it('marks the block just added so it animates, for a moment', () => {
    vi.useFakeTimers();
    try {
      render(<Harness start={['forward']} />);
      fireEvent.click(rotateCard());
      expect(step(2).className).toContain('is-new');
      expect(step(1).className).not.toContain('is-new');
      fireEvent.click(forwardCard());
      expect(step(3).className).toContain('is-new');
      expect(step(2).className).not.toContain('is-new');
      act(() => vi.advanceTimersByTime(800));
      expect(step(3).className).not.toContain('is-new');
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be put after a tapped block, and new cards go there in order', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'forward', 'forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(step(1));
    expect(cursorLabel()).toBe('New cards go before step 2. Tap to choose another spot');
    expect(screen.getByText('next goes before step 2')).toBeTruthy();
    fireEvent.click(rotateCard());
    fireEvent.click(rotateCard());
    expect(ids(last!)).toEqual(['s1', 't1', 't2', 's2', 's3']);
    expect(cursorLabel()).toBe('New cards go before step 4. Tap to choose another spot');
  });

  it('opens carets to pick another spot when tapped, and follows deletions', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW', 'forward']} onChange={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole('button', { name: /^New cards go/ }));
    expect(carets().map((c) => c.getAttribute('aria-label'))).toEqual([
      'Put the insert point before step 1',
      'Put the insert point before step 2',
      'Put the insert point before step 3',
    ]);
    expect(document.activeElement?.className).toContain('caret');
    fireEvent.click(screen.getByRole('button', { name: 'Put the insert point before step 2' }));
    expect(carets()).toHaveLength(0);
    expect(cursorLabel()).toBe('New cards go before step 2. Tap to choose another spot');
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(ids(last!)).toEqual(['s2', 's3']);
    expect(cursorLabel()).toBe('New cards go before step 1. Tap to choose another spot');
  });
});

describe('Editor: drag and drop', () => {
  // jsdom has no layout, so every row measures as zero height: a pointer
  // below y = 0 lands in the last gap, and one above it in the first.
  const drag = (el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, drop = true) => {
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: to.x, clientY: to.y });
    if (drop) fireEvent.pointerUp(el, { pointerId: 1, clientX: to.x, clientY: to.y });
    else fireEvent.pointerCancel(el, { pointerId: 1 });
  };

  it('drags a palette card into the program and swallows the click that follows', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward']} onChange={(p) => (last = p)} />);
    drag(rotateCard(), { x: 10, y: -30 }, { x: 10, y: 30 });
    expect(commandsOf(last!)).toEqual(['forward', 'rotateCW']);
    fireEvent.click(rotateCard());
    expect(commandsOf(last!)).toEqual(['forward', 'rotateCW']);
    fireEvent.click(rotateCard());
    expect(commandsOf(last!)).toEqual(['forward', 'rotateCW', 'rotateCW']);
  });

  it('drags a block by its Move handle to a new gap', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW']} onChange={(p) => (last = p)} />);
    drag(moveButton(2), { x: 10, y: 10 }, { x: 10, y: -30 });
    expect(ids(last!)).toEqual(['s2', 's1']);
  });

  it('drags the cursor to a new gap', () => {
    render(<Harness start={['forward', 'rotateCW']} />);
    const cursor = screen.getByRole('button', { name: /^New cards go/ });
    drag(cursor, { x: 10, y: 10 }, { x: 10, y: -30 });
    expect(screen.getByRole('button', { name: /^New cards go/ }).getAttribute('aria-label')).toBe('New cards go before step 1. Tap to choose another spot');
  });

  it('drags a block by its body with a mouse but not with touch', () => {
    let last: ProgramIR | null = null;
    render(<Harness start={['forward', 'rotateCW']} onChange={(p) => (last = p)} />);
    fireEvent.pointerDown(step(2), { pointerId: 2, button: 0, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(step(2), { pointerId: 2, clientX: 10, clientY: -30 });
    fireEvent.pointerUp(step(2), { pointerId: 2, clientX: 10, clientY: -30 });
    expect(last).toBeNull();
    fireEvent.pointerDown(step(2), { pointerId: 3, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(step(2), { pointerId: 3, clientX: 10, clientY: -30 });
    fireEvent.pointerUp(step(2), { pointerId: 3, clientX: 10, clientY: -30 });
    expect(ids(last!)).toEqual(['s2', 's1']);
  });

  it('does nothing on a short press or a cancelled drag', () => {
    const onChange = vi.fn();
    render(<Harness start={['forward', 'rotateCW']} onChange={onChange} />);
    drag(moveButton(2), { x: 10, y: 10 }, { x: 12, y: 12 });
    drag(moveButton(2), { x: 10, y: 10 }, { x: 10, y: -30 }, false);
    expect(onChange).not.toHaveBeenCalled();
    expect(carets()).toHaveLength(0);
  });
});

describe('Editor: see the code', () => {
  it('toggles the code beside the blocks from the program header', () => {
    const onToggleCode = vi.fn();
    const base = { program: programFromCommands(['forward'], sequentialIdFactory()), programming: { allowedCommands: ['forward'] as CommandId[], starterProgram: [] as CommandId[] }, locked: false, activeNodeId: null, errorNodeId: null, newId: sequentialIdFactory('t'), onEdit: () => {}, codePanel: <pre>code here</pre>, onToggleCode };
    const { rerender } = render(<Editor {...base} />);
    expect(screen.queryByText('code here')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See code' }));
    expect(onToggleCode).toHaveBeenCalledTimes(1);
    rerender(<Editor {...base} showCode />);
    expect(screen.getByText('code here')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide code' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Editor: start over', () => {
  it('shows a Start over button only when given one, and not on read-only levels', () => {
    const onRestart = vi.fn();
    const { rerender } = render(<Harness start={['forward']} />);
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
    rerender(
      <Editor program={programFromCommands(['forward'], sequentialIdFactory())} programming={{ allowedCommands: ['forward'], starterProgram: [] }} locked={false} activeNodeId={null} errorNodeId={null} newId={sequentialIdFactory('t')} onEdit={() => {}} onRestart={onRestart} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    rerender(
      <Editor program={programFromCommands(['forward'], sequentialIdFactory())} programming={{ allowedCommands: ['forward'], starterProgram: [] }} locked={false} activeNodeId={null} errorNodeId={null} newId={sequentialIdFactory('t')} onEdit={() => {}} onRestart={onRestart} readOnly />,
    );
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
  });
});

describe('Editor: level constraints', () => {
  it('counts down a per-command quota and closes the card at zero', () => {
    render(<Harness start={[]} allowed={['forward', 'rotateCW']} programming={{ maxPerCommand: { rotateCW: 1 } }} />);
    expect(rotateCard().getAttribute('aria-label')).toBe('Add Rotate clockwise, 1 left');
    fireEvent.click(rotateCard());
    expect(rotateCard().getAttribute('aria-label')).toBe('Add Rotate clockwise, 0 left');
    expect(rotateCard()).toHaveProperty('disabled', true);
    expect(forwardCard()).toHaveProperty('disabled', false);
  });

  it('offers only the supplied cards on a reorder level, each once', () => {
    render(<Harness start={[]} allowed={['forward', 'rotateCW', 'rotateCCW']} programming={{ suppliedCards: ['forward', 'rotateCW'] }} />);
    expect(screen.queryByRole('button', { name: /counter-clockwise/ })).toBeNull();
    expect(screen.getByText('0 of 2 steps')).toBeTruthy();
    fireEvent.click(forwardCard());
    expect(forwardCard()).toHaveProperty('disabled', true);
    expect(screen.getByText('1 of 2 steps')).toBeTruthy();
  });
});

describe('Editor: undo, redo and keyboard', () => {
  it('wires the undo and redo buttons and disables them when there is nothing to do', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<Harness start={['forward']} history={{ canUndo: true, canRedo: false, onUndo, onRedo }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', true);
  });

  it('walks the blocks, the carets and the palette with the arrow keys', () => {
    render(<Harness start={['forward', 'rotateCW', 'forward']} />);
    step(1).focus();
    fireEvent.keyDown(step(1), { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Step 2:/);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Step 3:/);
    fireEvent.click(moveButton(2));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Put Rotate before step 1');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Put Rotate at the end');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    forwardCard().focus();
    fireEvent.keyDown(forwardCard(), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rotateCard());
  });
});
