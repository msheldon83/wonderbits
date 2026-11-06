import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, push, redo, undo } from './history';
import { sequentialIdFactory } from './ids';
import { applyOp } from './ops';
import { commandsOf, programFromCommands } from './program';

const start = () => programFromCommands(['forward'], sequentialIdFactory());

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory(start());
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('undoes and redoes edits in order', () => {
    let h = createHistory(start());
    h = push(h, applyOp(h.present, { op: 'insert', slot: 1, node: { id: 'a', kind: 'rotateCW' } }));
    h = push(h, applyOp(h.present, { op: 'insert', slot: 2, node: { id: 'b', kind: 'forward' } }));
    expect(commandsOf(h.present)).toEqual(['forward', 'rotateCW', 'forward']);
    h = undo(h);
    expect(commandsOf(h.present)).toEqual(['forward', 'rotateCW']);
    h = undo(h);
    expect(commandsOf(h.present)).toEqual(['forward']);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect(commandsOf(h.present)).toEqual(['forward', 'rotateCW', 'forward']);
    expect(canRedo(h)).toBe(false);
  });

  it('discards the redo branch when a new edit follows an undo', () => {
    let h = createHistory(start());
    h = push(h, applyOp(h.present, { op: 'insert', slot: 1, node: { id: 'a', kind: 'rotateCW' } }));
    h = undo(h);
    h = push(h, applyOp(h.present, { op: 'insert', slot: 0, node: { id: 'b', kind: 'rotateCCW' } }));
    expect(canRedo(h)).toBe(false);
    expect(commandsOf(h.present)).toEqual(['rotateCCW', 'forward']);
  });

  it('ignores a push of the same program and caps the past', () => {
    let h = createHistory(start());
    expect(push(h, h.present)).toBe(h);
    for (let i = 0; i < 5; i++) h = push(h, applyOp(h.present, { op: 'insert', slot: 0, node: { id: `x${i}`, kind: 'forward' } }), 3);
    expect(h.past).toHaveLength(3);
  });
});
