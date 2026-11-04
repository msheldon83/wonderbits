import type { IdFactory } from './ids';
import { IR_VERSION, MAIN, type CommandId, type IRNode, type NodeId, type ProgramIR } from './types';

export function emptyProgram(): ProgramIR {
  return { version: IR_VERSION, procedures: [{ name: MAIN, body: [] }], handlers: [] };
}

export function programFromCommands(commands: readonly CommandId[], newId: IdFactory): ProgramIR {
  const program = emptyProgram();
  program.procedures[0]!.body = commands.map((kind) => ({ id: newId(), kind }));
  return program;
}

export function mainBody(program: ProgramIR): readonly IRNode[] {
  const main = program.procedures.find((p) => p.name === MAIN);
  if (!main) throw new Error('Program has no main procedure');
  return main.body;
}

export function commandsOf(program: ProgramIR): CommandId[] {
  return mainBody(program).map((n) => n.kind);
}

/** Number of program nodes, which is what instruction budgets count. */
export function countNodes(program: ProgramIR): number {
  return program.procedures.reduce((sum, p) => sum + p.body.length, 0);
}

export function findNodeIndex(program: ProgramIR, id: NodeId): number {
  return mainBody(program).findIndex((n) => n.id === id);
}
