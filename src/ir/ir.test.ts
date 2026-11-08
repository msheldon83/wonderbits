import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from './ids';
import { applyOp, isNoOpMove } from './ops';
import { ancestorsOf, commandsOf, countNodes, emptyProgram, locate, mainBody, nestingDepth, programFromCommands, programFromSpec, stepNumber, walk } from './program';
import { buildNodes, cardsOfSpec, countSpec, depthOfSpec, specDiff, specOf, type NodeSpec } from './spec';
import { IR_VERSION, type Place } from './types';

const ids = (p: ReturnType<typeof emptyProgram>) => mainBody(p).map((n) => n.id);
const main = (index: number): Place => ({ parent: null, branch: 'body', index });
const inside = (parent: string, index: number, branch: Place['branch'] = 'body'): Place => ({ parent, branch, index });

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

  it('builds nested blocks from a spec, in document order, and prints them back', () => {
    const spec: NodeSpec[] = ['forward', { repeat: 3, do: ['forward', { if: 'blockedAhead', do: ['rotateCW'], else: ['forward'] }] }, { until: 'atFlag', do: ['forward'] }];
    const p = programFromSpec(spec, sequentialIdFactory());
    expect([...walk(p)].map((v) => [v.node.id, v.node.kind, v.parent, v.branch, v.index, v.depth, v.number])).toEqual([
      ['n1', 'forward', null, 'body', 0, 0, 1],
      ['n2', 'repeat', null, 'body', 1, 0, 2],
      ['n3', 'forward', 'n2', 'body', 0, 1, 3],
      ['n4', 'ifElse', 'n2', 'body', 1, 1, 4],
      ['n5', 'rotateCW', 'n4', 'body', 0, 2, 5],
      ['n6', 'forward', 'n4', 'else', 0, 2, 6],
      ['n7', 'until', null, 'body', 2, 0, 7],
      ['n8', 'forward', 'n7', 'body', 0, 1, 8],
    ]);
    expect(countNodes(p)).toBe(8);
    expect(nestingDepth(p)).toBe(2);
    expect(specOf(mainBody(p))).toEqual(spec);
    expect(stepNumber(p, 'n6')).toBe(6);
    expect(ancestorsOf(p, 'n6')).toEqual(['n4', 'n2']);
  });

  it('counts, flattens and measures specs', () => {
    const spec: NodeSpec[] = [{ repeat: 2, do: ['forward', { repeat: 3, do: ['rotateCW'] }] }];
    expect(cardsOfSpec(spec)).toEqual(['repeat', 'forward', 'repeat', 'rotateCW']);
    expect(countSpec(spec)).toBe(4);
    expect(depthOfSpec(spec)).toBe(2);
    expect(depthOfSpec(['forward'])).toBe(0);
  });

  it('counts the nodes that differ between specs of the same shape', () => {
    expect(specDiff(['forward', 'rotateCW'], ['forward', 'rotateCCW'])).toBe(1);
    expect(specDiff(['forward'], ['forward', 'forward'])).toBe(-1);
    expect(specDiff([{ repeat: 2, do: ['forward'] }], [{ repeat: 5, do: ['forward'] }])).toBe(1);
    expect(specDiff([{ repeat: 2, do: ['forward'] }], [{ repeat: 2, do: ['rotateCW'] }])).toBe(1);
    expect(specDiff([{ if: 'pathAhead', do: ['forward'] }], [{ if: 'blockedAhead', do: ['forward'] }])).toBe(1);
    expect(specDiff([{ if: 'pathAhead', do: ['forward'] }], [{ if: 'pathAhead', do: ['forward'], else: [] }])).toBe(-1);
    expect(specDiff([{ repeat: 2, do: ['forward'] }], ['forward'])).toBe(-1);
    expect(specDiff([{ until: 'atFlag', do: ['forward', 'rotateCW'] }], [{ until: 'atFlag', do: ['rotateCW', 'forward'] }])).toBe(2);
  });
});

describe('edit operations', () => {
  const base = () => programFromCommands(['forward', 'forward', 'rotateCW'], sequentialIdFactory());
  const nested = () => programFromSpec(['forward', { repeat: 2, do: ['rotateCW', 'forward'] }], sequentialIdFactory());

  it('inserts at any gap including both ends', () => {
    const p = base();
    expect(ids(applyOp(p, { op: 'insert', at: main(0), node: { id: 'x', kind: 'forward' } }))).toEqual(['x', 'n1', 'n2', 'n3']);
    expect(ids(applyOp(p, { op: 'insert', at: main(3), node: { id: 'x', kind: 'forward' } }))).toEqual(['n1', 'n2', 'n3', 'x']);
    expect(ids(applyOp(p, { op: 'insert', at: main(2), node: { id: 'x', kind: 'forward' } }))).toEqual(['n1', 'n2', 'x', 'n3']);
  });

  it('inserts into a block and rejects a branch the block does not have', () => {
    const p = nested();
    const q = applyOp(p, { op: 'insert', at: inside('n2', 1), node: { id: 'x', kind: 'forward' } });
    expect(specOf(mainBody(q))).toEqual(['forward', { repeat: 2, do: ['rotateCW', 'forward', 'forward'] }]);
    expect(locate(q, 'x')).toMatchObject({ parent: 'n2', branch: 'body', index: 1 });
    expect(() => applyOp(p, { op: 'insert', at: inside('n2', 0, 'else'), node: { id: 'x', kind: 'forward' } })).toThrow(/No container/);
    expect(() => applyOp(p, { op: 'insert', at: inside('n1', 0), node: { id: 'x', kind: 'forward' } })).toThrow(/No container/);
  });

  it('rejects invalid gaps and duplicate ids, including ids inside an inserted block', () => {
    const p = base();
    expect(() => applyOp(p, { op: 'insert', at: main(4), node: { id: 'x', kind: 'forward' } })).toThrow(RangeError);
    expect(() => applyOp(p, { op: 'insert', at: main(0), node: { id: 'n1', kind: 'forward' } })).toThrow(/already exists/);
    expect(() => applyOp(p, { op: 'insert', at: main(0), node: { id: 'x', kind: 'repeat', count: 2, body: [{ id: 'n2', kind: 'forward' }] } })).toThrow(/already exists/);
  });

  it('moves a node forward and backward using gap semantics', () => {
    const p = base();
    expect(ids(applyOp(p, { op: 'move', id: 'n1', to: main(3) }))).toEqual(['n2', 'n3', 'n1']);
    expect(ids(applyOp(p, { op: 'move', id: 'n1', to: main(2) }))).toEqual(['n2', 'n1', 'n3']);
    expect(ids(applyOp(p, { op: 'move', id: 'n3', to: main(0) }))).toEqual(['n3', 'n1', 'n2']);
  });

  it('moves cards into and out of blocks, and never into themselves', () => {
    const p = nested();
    const into = applyOp(p, { op: 'move', id: 'n1', to: inside('n2', 2) });
    expect(specOf(mainBody(into))).toEqual([{ repeat: 2, do: ['rotateCW', 'forward', 'forward'] }]);
    const out = applyOp(p, { op: 'move', id: 'n3', to: main(0) });
    expect(specOf(mainBody(out))).toEqual(['rotateCW', 'forward', { repeat: 2, do: ['forward'] }]);
    expect(() => applyOp(p, { op: 'move', id: 'n2', to: inside('n2', 0) })).toThrow(/inside itself/);
  });

  it('detects moves that change nothing', () => {
    const p = base();
    expect(isNoOpMove(p, 'n2', main(1))).toBe(true);
    expect(isNoOpMove(p, 'n2', main(2))).toBe(true);
    expect(isNoOpMove(p, 'n2', main(0))).toBe(false);
    expect(isNoOpMove(nested(), 'n3', main(1))).toBe(false);
    expect(ids(applyOp(p, { op: 'move', id: 'n2', to: main(2) }))).toEqual(['n1', 'n2', 'n3']);
  });

  it('deletes by id, blocks with their contents, and never mutates the input', () => {
    const p = base();
    const before = JSON.stringify(p);
    expect(ids(applyOp(p, { op: 'delete', id: 'n2' }))).toEqual(['n1', 'n3']);
    expect(JSON.stringify(p)).toBe(before);
    const q = nested();
    expect(countNodes(applyOp(q, { op: 'delete', id: 'n2' }))).toBe(1);
    expect(countNodes(applyOp(q, { op: 'delete', id: 'n4' }))).toBe(3);
  });

  it('sets a count or a condition, within range, on the right kind of block', () => {
    const p = programFromSpec([{ repeat: 2, do: [] }, { if: 'pathAhead', do: [] }], sequentialIdFactory());
    expect(specOf(mainBody(applyOp(p, { op: 'set', id: 'n1', count: 5 })))).toEqual([{ repeat: 5, do: [] }, { if: 'pathAhead', do: [] }]);
    expect(specOf(mainBody(applyOp(p, { op: 'set', id: 'n2', condition: 'atFlag' })))).toEqual([{ repeat: 2, do: [] }, { if: 'atFlag', do: [] }]);
    expect(() => applyOp(p, { op: 'set', id: 'n1', count: 11 })).toThrow(RangeError);
    expect(() => applyOp(p, { op: 'set', id: 'n1', count: 1 })).toThrow(RangeError);
    expect(() => applyOp(p, { op: 'set', id: 'n2', count: 3 })).toThrow(/no count/);
    expect(() => applyOp(p, { op: 'set', id: 'n1', condition: 'atFlag' })).toThrow(/no condition/);
  });

  it('builds nodes with the given id factory', () => {
    expect(buildNodes(['forward'], sequentialIdFactory('q'))).toEqual([{ id: 'q1', kind: 'forward' }]);
  });
});
