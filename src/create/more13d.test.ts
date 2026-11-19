import { describe, expect, it } from 'vitest';
import { conditionLabel } from '../editor/commands';
import { conditionsFor } from '../editor/palette';
import { sequentialIdFactory } from '../ir/ids';
import { programFromSpec, slotsInUse } from '../ir/program';
import type { NodeSpec } from '../ir/spec';
import { innerCondition, isConditionId, negate, negationOf } from '../ir/types';
import { parseBoardRules } from '../lessons/parse';
import { conditionCode, printProgram } from '../projection/printTs';
import { interpretAll } from '../runtime/interpreter';
import { blankCreation, blankWorld } from './blank';
import { fitsRules } from './critic';
import { creationToJson } from './parse';
import { applyTool } from './worldOps';

const ir = (spec: NodeSpec[]) => programFromSpec(spec, sequentialIdFactory());
const goal = { reachGoal: true, collectAll: false };
const run = (spec: NodeSpec[], world = blankWorld()) => interpretAll({ program: ir(spec), world, objective: goal, limits: { maxSteps: 1000 } });

describe('not', () => {
  it('turns a check round, one deep', () => {
    expect(negate('atFlag')).toBe('not:atFlag');
    expect(negate('not:atFlag')).toBe('atFlag');
    expect(negationOf('not:slot:count=3')).toBe('slot:count=3');
    expect(negationOf('atFlag')).toBeNull();
    expect(innerCondition('not:acornAhead')).toBe('acornAhead');
    expect(isConditionId('not:atFlag')).toBe(true);
    expect(isConditionId('not:not:atFlag')).toBe(false);
    expect(isConditionId('not:nonsense')).toBe(false);
  });

  it('runs: walk while not at the flag', () => {
    // An If on "not at the flag" steps; once there it does not.
    const r = run([{ repeat: 6, do: [{ if: 'not:atFlag', do: ['forward'] }] }]);
    expect(r.outcome.status).toBe('success');
    expect(r.trace.filter((e) => e.op === 'forward')).toHaveLength(4);
  });

  it('tests memory: count is not 3', () => {
    const r = run([{ remember: 'count', kind: 'number', start: 0 }, { repeat: 5, do: [{ if: 'not:slot:count=3', do: [{ change: 'count', by: 1 }] }] }, 'forward', 'forward', 'forward', 'forward']);
    expect(r.final.memory).toEqual({ count: 3 });
  });

  it('reads and prints the way a person would', () => {
    expect(conditionLabel('not:atFlag')).toBe('not at the flag');
    expect(conditionLabel('not:slot:count=3')).toBe('count is not 3');
    expect(conditionLabel('not:slot:way=E')).toBe('way is not right');
    expect(conditionCode('not:atFlag')).toBe('!robot.atFlag()');
    expect(conditionCode('not:slot:count=3')).toBe('count !== 3');
    const code = printProgram(ir([{ remember: 'count', kind: 'number', start: 0 }, { until: 'not:slot:count=0', do: [{ change: 'count', by: 1 }] }]));
    expect(code).toContain('while (count === 0) {');
  });

  it('is offered in creation mode for checks with no opposite of their own', () => {
    const memory = ir([{ remember: 'count', kind: 'number', start: 0 }, { remember: 'found', kind: 'yesNo', start: false }]).memory!;
    const own = conditionsFor({ allowedCommands: ['if'], starterProgram: [], ownNames: true }, memory);
    expect(own).toEqual(expect.arrayContaining(['not:atFlag', 'not:acornAhead', 'not:slot:count=3']));
    expect(own).not.toContain('not:pathAhead');
    expect(own).not.toContain('not:blockedAhead');
    expect(own).not.toContain('not:slot:found=yes');
    expect(conditionsFor({ allowedCommands: ['if'], starterProgram: [] }, memory)).not.toContain('not:atFlag');
  });

  it('counts as using the slot it tests, stores and loads, and fits a puzzle that allows the check', () => {
    const spec: NodeSpec[] = [{ remember: 'count', kind: 'number', start: 0 }, { if: 'not:slot:count=3', do: ['forward'] }, { if: 'not:atFlag', do: ['forward'] }];
    expect(slotsInUse(ir(spec)).has('count')).toBe(true);
    const made = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...blankCreation('Mine'), program: spec };
    expect(parseBoardRules(JSON.parse(JSON.stringify(creationToJson(made))), 'not', ['program']).programs.program).toEqual(spec);
    expect(fitsRules({ allowedCommands: ['if', 'forward'], allowedConditions: ['atFlag'] }, ir(spec))).toBe(true);
    expect(fitsRules({ allowedCommands: ['if', 'forward'], allowedConditions: ['pathAhead'] }, ir(spec))).toBe(false);
  });

  it('works against the board: turn when there is not an acorn ahead', () => {
    const world = applyTool(blankWorld(), 'acorn', { x: 1, y: 2 });
    const r = run([{ if: 'not:acornAhead', do: ['rotateCW'] }, 'forward', 'forward', 'forward', 'forward'], world);
    expect(r.outcome.status).toBe('success');
  });
});

describe('a function that uses a function', async () => {
  const { applyOp } = await import('../ir/ops');
  const { canCall, reaches } = await import('../ir/program');
  const { functionContainerId } = await import('../ir/types');
  const base = () => ir([{ define: 'hop', do: ['forward'] }, { define: 'twoHops', do: [] }, { define: 'three', do: [] }]);
  const callInto = (p: ReturnType<typeof ir>, fn: string, callee: string, id: string, nestedCalls = true) =>
    applyOp(p, { op: 'insert', at: { parent: functionContainerId(fn), branch: 'body', index: 0 }, node: { id, kind: 'call', name: callee } }, { nestedCalls });

  it('is allowed in creation mode and not in a lesson', () => {
    expect(() => callInto(base(), 'twoHops', 'hop', 'c1', false)).toThrow(/cannot use a function/);
    const p = callInto(base(), 'twoHops', 'hop', 'c1');
    expect(reaches(p, 'twoHops', 'hop')).toBe(true);
    expect(reaches(p, 'hop', 'twoHops')).toBe(false);
  });

  it('never itself, directly or round a ring of calls', () => {
    expect(() => callInto(base(), 'hop', 'hop', 'c1')).toThrow(/cannot use itself/);
    let p = callInto(base(), 'twoHops', 'hop', 'c1');
    p = callInto(p, 'three', 'twoHops', 'c2');
    expect(() => callInto(p, 'hop', 'three', 'c3')).toThrow(/cannot use itself/);
    expect(canCall(p, 'hop', 'three', true)).toBe(false);
    expect(canCall(p, 'three', 'hop', true)).toBe(true);
    expect(canCall(p, 'main', 'three', false)).toBe(true);
    expect(canCall(p, 'on:tick', 'three', false)).toBe(true);
    expect(canCall(p, undefined, 'three', true)).toBe(false);
  });

  it('holds when a block of cards is moved into a function', () => {
    let p = ir([{ define: 'hop', do: [] }, { repeat: 2, do: [{ call: 'hop' }] }]);
    const repeat = p.procedures[0]!.body[0]!;
    expect(() => applyOp(p, { op: 'move', id: repeat.id, to: { parent: functionContainerId('hop'), branch: 'body', index: 0 } }, { nestedCalls: true })).toThrow(/cannot use itself/);
    p = applyOp(p, { op: 'addFunction', name: 'twice' });
    p = applyOp(p, { op: 'move', id: repeat.id, to: { parent: functionContainerId('twice'), branch: 'body', index: 0 } }, { nestedCalls: true });
    expect(reaches(p, 'twice', 'hop')).toBe(true);
    // A function another still uses cannot be removed.
    expect(() => applyOp(p, { op: 'removeFunction', name: 'hop' })).toThrow(/still used/);
  });

  it('runs and prints', () => {
    const spec: NodeSpec[] = [{ define: 'hop', do: ['forward'] }, { define: 'twoHops', do: [{ call: 'hop' }, { call: 'hop' }] }, { call: 'twoHops' }, { call: 'twoHops' }];
    const r = run(spec);
    expect(r.outcome.status).toBe('success');
    expect(r.trace.filter((e) => e.op === 'forward')).toHaveLength(4);
    const code = printProgram(ir(spec));
    expect(code).toMatch(/function twoHops\(\)[^}]*hop\(\);[^}]*hop\(\);/s);
  });
});

describe('records a child builds', async () => {
  const { parseWhole, wholeOf } = await import('../ir/types');
  const { newRecord, newRecordList, fieldsProblem } = await import('./RulesColumn');
  const { needsOf, slotTests } = await import('../editor/palette');
  const { cardsForSlot } = await import('./cards');
  const crate: NodeSpec = { remember: 'crate', kind: 'record', shape: 'Crate', fields: { number: 'number', key: 'yesNo' }, start: { number: 0, key: false } };
  const crates: NodeSpec = { remember: 'crates', kind: 'list', of: 'record', shape: 'Crate', fields: { number: 'number', key: 'yesNo' }, start: [] };
  const walk: NodeSpec[] = ['forward', 'forward', 'forward', 'forward'];

  it('sets one field and leaves the others', () => {
    const r = run([crate, { set: 'crate.number', to: 7 }, { set: 'crate.key', to: true }, { change: 'crate.number', by: 2 }, ...walk]);
    expect(r.outcome.status).toBe('success');
    expect(r.final.memory).toEqual({ crate: { number: 9, key: true } });
  });

  it('adds copies of a record to a list, each its own', () => {
    const r = run([crate, crates, { set: 'crate.number', to: 1 }, { push: 'crates', to: 'whole:crate' }, { set: 'crate.number', to: 2 }, { set: 'crate.key', to: true }, { push: 'crates', to: 'whole:crate' }, ...walk]);
    expect(r.final.memory?.crates).toEqual([{ number: 1, key: false }, { number: 2, key: true }]);
  });

  it('reads a built list back: find the crate with the key', () => {
    const found: NodeSpec = { remember: 'found', kind: 'number', start: 0 };
    const item: NodeSpec = { remember: 'item', kind: 'record', shape: 'Crate', fields: { number: 'number', key: 'yesNo' }, start: { number: 0, key: false } };
    const r = run([
      crate, crates, found, item,
      { set: 'crate.number', to: 4 }, { push: 'crates', to: 'whole:crate' },
      { set: 'crate.number', to: 5 }, { set: 'crate.key', to: true }, { push: 'crates', to: 'whole:crate' },
      { forEach: 'crates', as: 'item', do: [{ if: 'slot:item.key=yes', do: [{ set: 'found', to: 'field:item.number' }] }] },
      ...walk,
    ]);
    expect(r.outcome.status).toBe('success');
    expect(r.final.memory?.found).toBe(5);
  });

  it('prints as real TypeScript', () => {
    const code = printProgram(ir([crate, crates, { set: 'crate.number', to: 3 }, { change: 'crate.number', by: 1 }, { push: 'crates', to: 'whole:crate' }]));
    expect(code).toContain('crate.number = 3;');
    expect(code).toContain('crate.number += 1;');
    expect(code).toContain('crates.push({ ...crate });');
  });

  it('counts as using the record, and stores and loads', () => {
    const spec: NodeSpec[] = [crate, crates, { set: 'crate.number', to: 3 }, { push: 'crates', to: 'whole:crate' }, { if: 'slot:crate.key=yes', do: ['forward'] }];
    expect([...slotsInUse(ir(spec))].sort()).toEqual(['crate', 'crates']);
    expect(slotsInUse(ir([crate, { remember: 'n', kind: 'number', start: 0 }, { set: 'n', to: 'field:crate.number' }])).has('crate')).toBe(true);
    const made = { schemaVersion: 1 as const, id: 'c-1', createdAt: 1, updatedAt: 1, ...blankCreation('Mine'), program: spec };
    expect(parseBoardRules(JSON.parse(JSON.stringify(creationToJson(made))), 'rec', ['program']).programs.program).toEqual(spec);
    expect(parseWhole(wholeOf('crate'))).toBe('crate');
    expect(parseWhole('whole:Crate')).toBeNull();
    expect(() => parseBoardRules({ ...creationToJson(made), program: [{ set: 'crate.number.deep', to: 1 }] }, 'bad', ['program'])).toThrow(/slot name/);
  });

  it('is made from a name and its parts', () => {
    const slot = newRecord('crate', [{ name: 'number', kind: 'number' }, { name: ' key ', kind: 'yesNo' }], false);
    expect(slot).toEqual({ name: 'crate', kind: 'record', shape: 'Crate', fields: { number: 'number', key: 'yesNo' }, start: { number: 0, key: false } });
    expect(newRecordList('crates', slot, true)).toEqual({ name: 'crates', kind: 'list', of: 'record', shape: 'Crate', fields: { number: 'number', key: 'yesNo' }, start: [], keep: true });
    expect(fieldsProblem([{ name: 'number' }, { name: 'key' }])).toBeNull();
    expect(fieldsProblem([{ name: '' }])).toMatch(/Give every part/);
    expect(fieldsProblem([{ name: 'x' }])).toMatch(/cannot be a part's name/);
    expect(fieldsProblem([{ name: 'Big' }])).toMatch(/cannot be a part's name/);
    expect(fieldsProblem([{ name: 'key' }, { name: 'key' }])).toMatch(/same name/);
  });

  it('opens the cards and tests that work on it', () => {
    const memory = ir([crate]).memory!;
    expect(needsOf('set', memory)).toBeNull();
    expect(needsOf('change', memory)).toBeNull();
    expect(needsOf('change', ir([{ remember: 'flag', kind: 'record', shape: 'Flag', fields: { up: 'yesNo' }, start: { up: false } }]).memory!)).toBe('a number');
    expect(needsOf('forEach', ir([crates]).memory!)).toBe('a record to hold each item');
    expect(needsOf('forEach', ir([crates, crate]).memory!)).toBeNull();
    expect(slotTests(memory)).toEqual(expect.arrayContaining(['slot:crate.number=3', 'slot:crate.key=yes', 'slot:crate.key=no']));
    expect(cardsForSlot({ kind: 'record' })).toEqual(['set']);
    expect(cardsForSlot(memory[0]!)).toEqual(['set', 'change']);
  });
});

describe('comparing', async () => {
  const { parseSlotTest } = await import('../ir/types');
  const { buildTest, readTest, testTargets, valuesFor } = await import('../editor/ConditionPicker');
  const { winnerWords } = await import('../app/messages');
  const count: NodeSpec = { remember: 'count', kind: 'number', start: 0 };
  const best: NodeSpec = { remember: 'best', kind: 'number', start: 5 };

  it('reads less than, more than, and another slot', () => {
    expect(parseSlotTest('slot:count<3')).toEqual({ slot: 'count', value: '3', op: '<' });
    expect(parseSlotTest('slot:score>best')).toEqual({ slot: 'score', value: 'best', op: '>', other: 'best' });
    expect(parseSlotTest('slot:left=hidden')).toEqual({ slot: 'left', value: 'hidden', op: '=', other: 'hidden' });
    expect(parseSlotTest('slot:found=yes')).toEqual({ slot: 'found', value: 'yes', op: '=' });
    // Only numbers have an order.
    expect(parseSlotTest('slot:found<yes')).toBeNull();
    expect(parseSlotTest('slot:way>E')).toBeNull();
    expect(isConditionId('not:slot:count<3')).toBe(true);
  });

  it('runs: count up while it is less than 4, and keep the smaller of two numbers', () => {
    const r = run([count, best, { until: 'not:slot:count<4', do: [{ change: 'count', by: 1 }] }, { if: 'slot:count<best', do: [{ set: 'best', to: 'whole:count' }] }, 'forward', 'forward', 'forward', 'forward']);
    expect(r.final.memory).toEqual({ count: 4, best: 4 });
    const more = run([count, best, { if: 'slot:best>count', do: [{ change: 'count', by: 9 }] }, { if: 'slot:count>best', do: [{ change: 'count', by: 1 }] }, { if: 'slot:count=best', do: ['win'] }, 'forward', 'forward', 'forward', 'forward']);
    expect(more.final.memory).toEqual({ count: 10, best: 5 });
  });

  it('reads and prints the way a person would', () => {
    expect(conditionLabel('slot:count<3')).toBe('count is less than 3');
    expect(conditionLabel('slot:score>best')).toBe('score is more than best');
    expect(conditionLabel('not:slot:score>best')).toBe('score is not more than best');
    expect(conditionCode('slot:count<3')).toBe('count < 3');
    expect(conditionCode('slot:score>best')).toBe('score > best');
    expect(conditionCode('slot:left=hidden')).toBe('left === hidden');
    expect(conditionCode('not:slot:count<3')).toBe('count >= 3');
    expect(conditionCode('not:slot:score>best')).toBe('score <= best');
    expect(printProgram(ir([count, { until: 'slot:count>3', do: [{ change: 'count', by: 1 }] }]))).toContain('while (count <= 3) {');
  });

  it('counts both slots as used', () => {
    expect([...slotsInUse(ir([count, best, { if: 'slot:count>best', do: [] }]))].sort()).toEqual(['best', 'count']);
  });

  it('is built from its three parts, and taken apart again', () => {
    expect(buildTest('count', 'more', '3')).toBe('slot:count>3');
    expect(buildTest('count', 'isNot', 'best')).toBe('not:slot:count=best');
    expect(buildTest('crate.key', 'is', 'yes')).toBe('slot:crate.key=yes');
    expect(readTest('slot:count>3')).toEqual({ path: 'count', how: 'more', value: '3' });
    expect(readTest('not:slot:way=E')).toEqual({ path: 'way', how: 'isNot', value: 'E' });
    expect(readTest('atFlag')).toBeNull();
    const memory = ir([count, best, { remember: 'found', kind: 'yesNo', start: false }, { remember: 'crate', kind: 'record', shape: 'Crate', fields: { number: 'number' }, start: { number: 0 } }]).memory!;
    expect(testTargets(memory).map((t) => t.path)).toEqual(['count', 'best', 'found', 'crate.number']);
    expect(valuesFor(testTargets(memory)[0], memory).map((v) => v.value)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'best']);
    expect(valuesFor(testTargets(memory)[2], memory).map((v) => v.value)).toEqual(['yes', 'no']);
    expect(valuesFor(testTargets(memory)[0], memory, '42')[0]).toEqual({ value: '42', label: '42' });
  });

  it('a Win card can name the winner', () => {
    const r = run([{ remember: 'winner', kind: 'number', start: 2 }, { win: 'winner' }]);
    expect(r.outcome).toEqual({ status: 'success', player: 2 });
    expect(run(['win']).outcome).toEqual({ status: 'success' });
    expect(winnerWords(1, true)).toBe('Player 1 (crosses) wins!');
    expect(winnerWords(2, true)).toBe('Player 2 (noughts) wins!');
    expect(winnerWords(3, false)).toBe('Player 3 wins!');
    expect(printProgram(ir([{ remember: 'winner', kind: 'number', start: 2 }, { win: 'winner' }]))).toContain('robot.win(winner);');
    expect(slotsInUse(ir([{ remember: 'winner', kind: 'number', start: 2 }, { win: 'winner' }])).has('winner')).toBe(true);
  });
});

describe('the library', async () => {
  const { LIBRARY } = await import('../library');
  const { lineOf } = await import('../library/lineOf');
  const { uncover, minesAround, COVERED } = await import('../library/uncover');

  it('shows the very source that runs', () => {
    expect(LIBRARY.map((e) => e.id)).toEqual(['line-of', 'steer', 'uncover']);
    expect(LIBRARY[0]!.source).toContain('export function lineOf(grid: Grid, count: number): number {');
    expect(LIBRARY[1]!.source).toContain('export function chase(');
    expect(LIBRARY[2]!.source).toContain('export function uncover(');
    for (const e of LIBRARY) expect(e.steps.length).toBeGreaterThan(3);
  });

  it('lineOf finds a line', () => {
    expect(lineOf([[1, 1, 1], [0, 2, 0], [2, 0, 0]], 3)).toBe(1);
    expect(lineOf([[0, 0, 2], [0, 2, 0], [2, 0, 1]], 3)).toBe(2);
    expect(lineOf([[1, 2, 1], [2, 1, 2], [2, 1, 2]], 3)).toBe(0);
  });

  it('uncover opens an empty patch up to its numbered edge, and never a mine', () => {
    const F = false;
    const mines = [[F, F, F, F], [F, F, F, F], [F, F, F, true], [F, F, F, F]];
    const covered = mines.map((row) => row.map(() => COVERED));
    expect(minesAround(mines, { x: 2, y: 2 })).toBe(1);
    expect(minesAround(mines, { x: 0, y: 0 })).toBe(0);
    // One tap in the far corner opens the empty patch and its numbered edge. The corner past the mine touches no empty tile, so it stays covered.
    expect(uncover(covered, mines, { x: 0, y: 0 })).toEqual([[0, 0, 0, 0], [0, 0, 1, 1], [0, 0, 1, 9], [0, 0, 1, 9]]);
    // A numbered tile opens only itself; a mine, and a tile off the board, open nothing.
    expect(uncover(covered, mines, { x: 2, y: 2 }).flat().filter((v) => v !== COVERED)).toEqual([1]);
    expect(uncover(covered, mines, { x: 3, y: 2 })).toEqual(covered);
    expect(uncover(covered, mines, { x: 9, y: 9 })).toEqual(covered);
    expect(covered.flat().every((v) => v === COVERED)).toBe(true);
  });
});
