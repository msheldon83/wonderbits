import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from './ids';
import { applyOp, isNoOpMove } from './ops';
import { commandsOf, countNodes, emptyProgram, mainBody, programFromCommands } from './program';
import { IR_VERSION } from './types';

const ids = (p: ReturnType<typeof emptyProgram>) => mainBody(p).map((n) => n.id);

describe('program IR', () => {
  it('starts with an empty main procedure and no handlers', () => {
    const p = emptyProgram();
    expect(p).toEqual({ version: IR_VERSION, procedures: [{ name: 'main', body: [] }], handlers: [] });
  });

  it('builds a program from commands with stable ids', () => {
    const p = programFromCommands(['forward', 'rotateCW'], sequentialIdFactory());
    expect(ids(p)).toEqual(['n1', 'n2']);
    expect(commandsOf(p)).toEqual(['forward', 'rotateCW']);
    expect(countNodes(p)).toBe(2);
  });
});

describe('edit operations', () => {
  const base = () => programFromCommands(['forward', 'forward', 'rotateCW'], sequentialIdFactory());

  it('inserts at any slot including both ends', () => {
    const p = base();
    expect(ids(applyOp(p, { op: 'insert', slot: 0, node: { id: 'x', kind: 'forward' } }))).toEqual(['x', 'n1', 'n2', 'n3']);
    expect(ids(applyOp(p, { op: 'insert', slot: 3, node: { id: 'x', kind: 'forward' } }))).toEqual(['n1', 'n2', 'n3', 'x']);
    expect(ids(applyOp(p, { op: 'insert', slot: 2, node: { id: 'x', kind: 'forward' } }))).toEqual(['n1', 'n2', 'x', 'n3']);
  });

  it('rejects invalid slots and duplicate ids', () => {
    const p = base();
    expect(() => applyOp(p, { op: 'insert', slot: 4, node: { id: 'x', kind: 'forward' } })).toThrow(RangeError);
    expect(() => applyOp(p, { op: 'insert', slot: 0, node: { id: 'n1', kind: 'forward' } })).toThrow(/already exists/);
  });

  it('moves a node forward and backward using slot semantics', () => {
    const p = base();
    expect(ids(applyOp(p, { op: 'move', id: 'n1', slot: 3 }))).toEqual(['n2', 'n3', 'n1']);
    expect(ids(applyOp(p, { op: 'move', id: 'n1', slot: 2 }))).toEqual(['n2', 'n1', 'n3']);
    expect(ids(applyOp(p, { op: 'move', id: 'n3', slot: 0 }))).toEqual(['n3', 'n1', 'n2']);
  });

  it('detects moves that change nothing', () => {
    const p = base();
    expect(isNoOpMove(p, 'n2', 1)).toBe(true);
    expect(isNoOpMove(p, 'n2', 2)).toBe(true);
    expect(isNoOpMove(p, 'n2', 0)).toBe(false);
    expect(ids(applyOp(p, { op: 'move', id: 'n2', slot: 2 }))).toEqual(['n1', 'n2', 'n3']);
  });

  it('deletes by id and never mutates the input', () => {
    const p = base();
    const before = JSON.stringify(p);
    expect(ids(applyOp(p, { op: 'delete', id: 'n2' }))).toEqual(['n1', 'n3']);
    expect(JSON.stringify(p)).toBe(before);
  });
});
