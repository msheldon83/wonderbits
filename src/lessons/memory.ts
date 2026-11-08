/**
 * The memory card: what the world holds at one moment, line by line, each
 * with its kind. Pure, so the card the child sees, the prediction they make
 * and the check after the run all read the same values.
 */
import type { Facing, SimState, WorldDefinition } from '../sim/types';
import { gatesOf, moversOf } from '../sim/world';
import type { MemoryField, MemoryValue } from './types';

/** The kinds of value a memory line can hold, each with its own icon. */
export type MemoryKind = 'position' | 'direction' | 'number' | 'yesNo';

export interface MemoryLine {
  /** The field id; "position" (asked by placing the flag) and "tick" (on boards where things move) are shown, never asked. */
  field: MemoryField | 'position' | 'tick';
  label: string;
  kind: MemoryKind;
}

export const FACING_WORDS: Record<Facing, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

/** "Gate A" for gate a. */
export const gateLabel = (id: string): string => `Gate ${id.toUpperCase()}`;
export const gateField = (id: string): MemoryField => `gate:${id}`;
export const gateOfField = (field: string): string | null => (field.startsWith('gate:') ? field.slice(5) : null);

/** The lines a board's memory card shows, in order. Acorns only where there are acorns. */
export function memoryLines(world: WorldDefinition): MemoryLine[] {
  return [
    { field: 'position', label: 'Position', kind: 'position' },
    { field: 'facing', label: 'Facing', kind: 'direction' },
    ...(world.collectibles.length > 0 ? [{ field: 'acorns' as const, label: 'Acorns', kind: 'number' as const }] : []),
    ...gatesOf(world).map((g) => ({ field: gateField(g.id), label: `${gateLabel(g.id)} open`, kind: 'yesNo' as const })),
    ...(moversOf(world).length > 0 ? [{ field: 'tick' as const, label: 'Tick', kind: 'number' as const }] : []),
  ];
}

/** True when the board has this field on its memory card. */
export function hasField(world: WorldDefinition, field: MemoryField): boolean {
  return memoryLines(world).some((l) => l.field === field);
}

export function memoryValue(state: SimState, field: MemoryField): MemoryValue {
  if (field === 'facing') return state.robot.facing;
  if (field === 'acorns') return state.collected.length;
  return state.open.includes(gateOfField(field) ?? '');
}

/** A value in words: "right", "2", "yes". */
export function describeValue(value: MemoryValue): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  return FACING_WORDS[value];
}
