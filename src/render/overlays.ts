/**
 * A grid in memory, drawn on the board's own tiles: what lets the board be
 * the game. Pure: from the slots and the state to what goes on each tile.
 */
import { COVERED, type MemorySlot, type Value } from '../ir/types';
import type { Cell, SimState } from '../sim/types';

/** One tile's drawing: a cross, a nought, a number, or a cover over a tile not uncovered yet. */
export interface Overlay {
  cell: Cell;
  kind: 'cross' | 'nought' | 'number' | 'cover';
  /** The number, on a number tile. */
  text?: string;
}

/** What every shown grid puts on the board right now. Tiles with nothing to show are left out. */
export function gridOverlays(slots: readonly MemorySlot[] | undefined, state: SimState): Overlay[] {
  return (slots ?? []).flatMap((slot): Overlay[] => {
    const grid = state.memory?.[slot.name];
    if (!slot.show || !Array.isArray(grid)) return [];
    return grid.flatMap((row, y) =>
      (Array.isArray(row) ? (row as Value[]) : []).flatMap((v, x): Overlay[] => {
        const cell = { x, y };
        if (slot.show === 'pieces') return v === 1 ? [{ cell, kind: 'cross' }] : v === 2 ? [{ cell, kind: 'nought' }] : [];
        if (v === COVERED) return [{ cell, kind: 'cover' }];
        return typeof v === 'number' && v > 0 ? [{ cell, kind: 'number', text: String(v) }] : [];
      }),
    );
  });
}
