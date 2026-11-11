/**
 * Progress, settings and the observation log. All of it is plain data kept
 * locally behind the storage interface; nothing leaves the device unless an
 * adult exports it.
 */
import type { ConditionId, NodeId, Place, Source } from '../ir/types';
import type { MemoryField, MemoryValue } from '../lessons/types';
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
  /** Packs whose concept introduction the child has watched through to "Let's go". */
  introsSeen: string[];
}

export interface Settings {
  muted: boolean;
  /** 'system' follows the operating system; 'on' and 'off' override it. */
  reducedMotion: 'system' | 'on' | 'off';
  themeId: string;
  /** For the adult: play any level without finishing the ones before it. */
  openAllLevels: boolean;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, reducedMotion: 'system', themeId: 'forest', openAllLevels: true };

/**
 * One structured event per thing the child did. Timestamps are epoch ms.
 * levelId is the level the event belongs to; for the card book it is the
 * level it was opened from, or "map".
 */
export type ObservationEvent = { t: number; levelId: string } & (
  | { kind: 'level-opened' }
  | { kind: 'intro-shown'; packId: string; replay: boolean }
  | { kind: 'card-book-opened' }
  | { kind: 'level-restarted' }
  | { kind: 'card-placed'; command: string; at: Place }
  | { kind: 'card-moved'; nodeId: NodeId; to: Place }
  | { kind: 'card-removed'; nodeId: NodeId }
  | { kind: 'card-changed'; nodeId: NodeId; count?: number; condition?: ConditionId; gate?: string; slot?: string; to?: Source; by?: number; list?: string; item?: string; grid?: string; at?: string }
  | { kind: 'slot-added'; slot: string }
  | { kind: 'shuffled'; shuffle: number }
  | { kind: 'shuffles-checked'; passed: number; total: number }
  | { kind: 'rolls-checked'; passed: number; total: number; unseen: number }
  | { kind: 'slot-removed'; slot: string }
  | { kind: 'run-started'; steps: number }
  | { kind: 'trace-halted'; nodeId: NodeId; reason: string }
  | { kind: 'prediction-made'; cell?: Cell; memory?: Partial<Record<MemoryField, MemoryValue>>; wrongFields?: MemoryField[]; correct: boolean }
  | { kind: 'hint-opened'; rung: number }
  | { kind: 'level-completed'; stars: Stars; steps: number }
  | { kind: 'level-abandoned' }
  // Creation mode: levelId is the creation's id.
  | { kind: 'creation-started'; basedOn?: string }
  | { kind: 'creation-removed' }
  | { kind: 'creation-solved' }
);

/** An event before its timestamp is stamped on. Distributes over the union. */
export type EventInput = ObservationEvent extends infer E ? (E extends ObservationEvent ? Omit<E, 't'> : never) : never;

export interface ExportFile {
  exportedAt: string;
  progress: Progress;
  settings: Settings;
  log: ObservationEvent[];
  /** Everything the child made, in its stored form, so a grown-up can back it up. */
  creations?: unknown[];
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {}, badges: [], introsSeen: [] };
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
