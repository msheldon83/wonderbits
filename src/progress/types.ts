/**
 * Progress, settings and the observation log. All of it is plain data kept
 * locally behind the storage interface; nothing leaves the device unless an
 * adult exports it.
 */
import type { ConditionId, NodeId, Place } from '../ir/types';
import type { Cell } from '../sim/types';

export const PROGRESS_VERSION = 1 as const;

export interface Stars {
  complete: boolean;
  noHints: boolean;
  /** Null when the level sets no budget. */
  budget: boolean | null;
}

export interface LevelProgress {
  levelId: string;
  stars: Stars;
  attempts: number;
  /** Fewest instructions in a successful run. */
  bestSteps: number | null;
  /** The first run on this level solved it. */
  solvedFirstRun: boolean;
  /** Some run on this level ended blocked by a wall, gap or edge. */
  hadBlockedRun: boolean;
  predictions: { correct: number; total: number };
}

export type BadgeId = 'crystal-ball' | 'wrench' | 'compass' | 'lightning' | 'map' | 'trophy';
export const BADGE_IDS: readonly BadgeId[] = ['crystal-ball', 'wrench', 'compass', 'lightning', 'map', 'trophy'];

export interface Progress {
  version: typeof PROGRESS_VERSION;
  levels: Record<string, LevelProgress>;
  badges: BadgeId[];
}

export interface Settings {
  muted: boolean;
  /** 'system' follows the operating system; 'on' and 'off' override it. */
  reducedMotion: 'system' | 'on' | 'off';
  themeId: string;
  /** For the adult: play any level without finishing the ones before it. */
  openAllLevels: boolean;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, reducedMotion: 'system', themeId: 'forest', openAllLevels: false };

/** One structured event per thing the child did. Timestamps are epoch ms. */
export type ObservationEvent = { t: number; levelId: string } & (
  | { kind: 'level-opened' }
  | { kind: 'level-restarted' }
  | { kind: 'card-placed'; command: string; at: Place }
  | { kind: 'card-moved'; nodeId: NodeId; to: Place }
  | { kind: 'card-removed'; nodeId: NodeId }
  | { kind: 'card-changed'; nodeId: NodeId; count?: number; condition?: ConditionId }
  | { kind: 'run-started'; steps: number }
  | { kind: 'trace-halted'; nodeId: NodeId; reason: string }
  | { kind: 'prediction-made'; cell: Cell; correct: boolean }
  | { kind: 'hint-opened'; rung: number }
  | { kind: 'level-completed'; stars: Stars; steps: number }
  | { kind: 'level-abandoned' }
);

/** An event before its timestamp is stamped on. Distributes over the union. */
export type EventInput = ObservationEvent extends infer E ? (E extends ObservationEvent ? Omit<E, 't'> : never) : never;

export interface ExportFile {
  exportedAt: string;
  progress: Progress;
  settings: Settings;
  log: ObservationEvent[];
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {}, badges: [] };
}

export function emptyLevelProgress(levelId: string): LevelProgress {
  return {
    levelId,
    stars: { complete: false, noHints: false, budget: null },
    attempts: 0,
    bestSteps: null,
    solvedFirstRun: false,
    hadBlockedRun: false,
    predictions: { correct: 0, total: 0 },
  };
}
