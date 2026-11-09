/**
 * The memory card: what the world holds at one moment, line by line, each
 * with its kind. Pure, so the card the child sees, the prediction they make
 * and the check after the run all read the same values.
 */
import type { MemorySlot } from '../ir/types';
import type { Facing, SimState, WorldDefinition } from '../sim/types';
import { gatesOf, moversOf } from '../sim/world';
import type { MemoryField, MemoryValue } from './types';

/** The kinds of value a memory line can hold, each with its own icon. */
export type MemoryKind = 'position' | 'direction' | 'number' | 'yesNo' | 'list';

export interface MemoryLine {
  /** The field id; "position" (asked by placing the flag) and "tick" (on boards where things move) are shown, never asked. */
  field: MemoryField | 'position' | 'tick';
  label: string;
  kind: MemoryKind;
  /** True for the robot's own memory slots, which the program changes; the rest is the world. */
  slot?: boolean;
}

export const FACING_WORDS: Record<Facing, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };

/** "Gate A" for gate a. */
export const gateLabel = (id: string): string => `Gate ${id.toUpperCase()}`;
export const gateField = (id: string): MemoryField => `gate:${id}`;
export const gateOfField = (field: string): string | null => (field.startsWith('gate:') ? field.slice(5) : null);

export const slotField = (name: string): MemoryField => `slot:${name}`;
export const slotOfField = (field: string): string | null => (field.startsWith('slot:') ? field.slice(5) : null);

/** The lines a board's memory card shows, in order: the world's, then the robot's own slots. Acorns only where there are acorns. */
export function memoryLines(world: WorldDefinition, slots: readonly MemorySlot[] = []): MemoryLine[] {
  return [
    { field: 'position', label: 'Position', kind: 'position' },
    { field: 'facing', label: 'Facing', kind: 'direction' },
    ...(world.collectibles.length > 0 ? [{ field: 'acorns' as const, label: 'Acorns', kind: 'number' as const }] : []),
    ...gatesOf(world).map((g) => ({ field: gateField(g.id), label: `${gateLabel(g.id)} open`, kind: 'yesNo' as const })),
    ...(moversOf(world).length > 0 ? [{ field: 'tick' as const, label: 'Tick', kind: 'number' as const }] : []),
    ...slots.map((m) => ({ field: slotField(m.name), label: m.name, kind: m.kind, slot: true })),
  ];
}

/** True when the memory card has this field and a child can answer it: a place or a whole list is shown, not asked. */
export function hasField(world: WorldDefinition, field: MemoryField, slots: readonly MemorySlot[] = []): boolean {
  const line = memoryLines(world, slots).find((l) => l.field === field);
  return line !== undefined && line.kind !== 'position' && line.kind !== 'list';
}

export function memoryValue(state: SimState, field: MemoryField): MemoryValue {
  if (field === 'facing') return state.robot.facing;
  if (field === 'acorns') return state.collected.length;
  const slot = slotOfField(field);
  if (slot !== null) return state.memory?.[slot] as MemoryValue;
  return state.open.includes(gateOfField(field) ?? '');
}

/** A value in words: "right", "2", "yes". */
export function describeValue(value: MemoryValue): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  return FACING_WORDS[value];
}
