import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../ir/ids';
import { programFromCommands, programFromSpec } from '../ir/program';
import type { CommandId } from '../ir/types';
import { paletteFor, type Programming } from './palette';

const prog = (cmds: CommandId[]) => programFromCommands(cmds, sequentialIdFactory());
const base: Programming = { allowedCommands: ['forward', 'rotateCW', 'rotateCCW'], starterProgram: [] };

describe('paletteFor', () => {
  it('offers every allowed command without limits', () => {
    const p = paletteFor(base, prog(['forward']));
    expect(p.entries.map((e) => e.command)).toEqual(['forward', 'rotateCW', 'rotateCCW']);
    expect(p.entries.every((e) => e.available && e.remaining === null)).toBe(true);
    expect(p.max).toBeUndefined();
    expect(p.full).toBe(false);
  });

  it('closes every card when the step budget is used up', () => {
    const p = paletteFor({ ...base, maxInstructions: 2 }, prog(['forward', 'rotateCW']));
    expect(p.full).toBe(true);
    expect(p.entries.every((e) => !e.available)).toBe(true);
  });

  it('counts down per-command quotas', () => {
    const p = paletteFor({ ...base, maxPerCommand: { rotateCW: 1 } }, prog(['rotateCW']));
    expect(p.entries).toEqual([
      { command: 'forward', remaining: null, available: true },
      { command: 'rotateCW', remaining: 0, available: false },
      { command: 'rotateCCW', remaining: null, available: true },
    ]);
  });

  it('treats supplied cards as single-use and hides the rest', () => {
    const programming: Programming = { ...base, suppliedCards: ['forward', 'forward', 'rotateCW'] };
    const empty = paletteFor(programming, prog([]));
    expect(empty.max).toBe(3);
    expect(empty.entries).toEqual([
      { command: 'forward', remaining: 2, available: true },
      { command: 'rotateCW', remaining: 1, available: true },
    ]);
    const partial = paletteFor(programming, prog(['forward', 'rotateCW']));
    expect(partial.entries).toEqual([
      { command: 'forward', remaining: 1, available: true },
      { command: 'rotateCW', remaining: 0, available: false },
    ]);
    const done = paletteFor(programming, prog(['forward', 'rotateCW', 'forward']));
    expect(done.full).toBe(true);
  });

  it('offers one call card per function, sharing the call quota', () => {
    const program = programFromSpec([{ call: 'hop' }, { define: 'hop', do: [] }, { define: 'jump', do: [] }], sequentialIdFactory());
    const p = paletteFor({ allowedCommands: ['forward', 'call'], maxPerCommand: { call: 2 }, starterProgram: [] }, program);
    expect(p.entries.map((e) => [e.command, e.name ?? null, e.remaining])).toEqual([
      ['forward', null, null],
      ['call', 'hop', 1],
      ['call', 'jump', 1],
    ]);
  });
});

