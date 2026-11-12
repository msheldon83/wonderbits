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
