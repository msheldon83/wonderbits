/**
 * Deterministic interpreter over the program IR. Pure: same input, same trace.
 * It is a generator so a host can stream events and stop it at any point.
 */
import { mainBody } from '../ir/program';
import { initialState, objectiveMet, step } from '../sim/world';
import type { ObjectiveDefinition, SimState, WorldDefinition } from '../sim/types';
import type { ProgramIR } from '../ir/types';
import type { RunLimits, RunOutcome, TraceEvent } from './contract';

export interface InterpretInput {
  program: ProgramIR;
  world: WorldDefinition;
  objective: ObjectiveDefinition;
  limits: Pick<RunLimits, 'maxSteps'>;
}

export interface InterpretSummary {
  outcome: RunOutcome;
  final: SimState;
  executedSteps: number;
}

export function* interpret(input: InterpretInput): Generator<TraceEvent, InterpretSummary, void> {
  const { program, world, objective, limits } = input;
  let state = initialState(world);
  let executed = 0;

  for (const node of mainBody(program)) {
    if (executed >= limits.maxSteps) {
      return { outcome: { status: 'halted', reason: 'step-limit' }, final: state, executedSteps: executed };
    }
    const result = step(world, state, node.kind);
    const event: TraceEvent = {
      index: executed,
      nodeId: node.id,
      op: node.kind,
      before: state,
      after: result.state,
      result:
        result.kind === 'ok'
          ? result.collected
            ? { kind: 'ok', collected: result.collected }
            : { kind: 'ok' }
          : { kind: 'blocked', reason: result.reason, at: result.at },
    };
    executed++;
    yield event;
    if (result.kind === 'blocked') {
      return {
        outcome: { status: 'blocked', nodeId: node.id, reason: result.reason },
        final: state,
        executedSteps: executed,
      };
    }
    state = result.state;
  }

  const outcome: RunOutcome = objectiveMet(world, objective, state) ? { status: 'success' } : { status: 'incomplete' };
  return { outcome, final: state, executedSteps: executed };
}

/** Run to completion and collect the trace. Used by tests and validators. */
export function interpretAll(input: InterpretInput): InterpretSummary & { trace: TraceEvent[] } {
  const trace: TraceEvent[] = [];
  const it = interpret(input);
  for (;;) {
    const next = it.next();
    if (next.done) return { ...next.value, trace };
    trace.push(next.value);
  }
}
