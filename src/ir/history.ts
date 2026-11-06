/**
 * Undo and redo over the program IR. Programs are tiny, so the history keeps
 * whole snapshots rather than inverse operations. Pure: every function
 * returns a new history and never touches its input.
 */
import type { ProgramIR } from './types';

export interface History {
  past: ProgramIR[];
  present: ProgramIR;
  future: ProgramIR[];
}

/** Oldest snapshots fall off once the past grows beyond this. */
export const HISTORY_LIMIT = 100;

export function createHistory(present: ProgramIR): History {
  return { past: [], present, future: [] };
}

/** Record a new present. Anything that could be redone is discarded. */
export function push(history: History, next: ProgramIR, limit = HISTORY_LIMIT): History {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next, future: [] };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;

export function undo(history: History): History {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  return { past, present: history.past[history.past.length - 1]!, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  if (!canRedo(history)) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present: present!, future };
}
