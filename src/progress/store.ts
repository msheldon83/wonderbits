/**
 * The progress store: loads once, keeps progress, settings and the log in
 * memory, writes through to storage, and notifies subscribers so React can
 * read it with useSyncExternalStore.
 */
import type { PuzzleDefinition } from '../lessons/types';
import { computeBadges } from './badges';
import type { KeyValueStore } from './storage';
import {
  DEFAULT_SETTINGS,
  emptyLevelProgress,
  emptyProgress,
  PROGRESS_VERSION,
  type EventInput,
  type ExportFile,
  type LevelProgress,
  type ObservationEvent,
  type Progress,
  type Settings,
  type Stars,
} from './types';

export interface CompletionInput {
  levelId: string;
  usedHints: boolean;
  steps: number;
  budget: number | undefined;
}

export interface Snapshot {
  loaded: boolean;
  progress: Progress;
  settings: Settings;
  log: ObservationEvent[];
}

export class ProgressStore {
  private snapshot: Snapshot = { loaded: false, progress: emptyProgress(), settings: DEFAULT_SETTINGS, log: [] };
  private listeners = new Set<() => void>();
  private levels: readonly PuzzleDefinition[] = [];

  constructor(
    private storage: KeyValueStore,
    private now: () => number = Date.now,
  ) {}

  /** Levels in play order, for badge rules and unlocking. */
  setLevels(levels: readonly PuzzleDefinition[]): void {
    this.levels = levels;
  }

  async load(): Promise<void> {
    const [progress, settings, log] = await Promise.all([
      this.storage.get<Progress>('progress'),
      this.storage.get<Settings>('settings'),
      this.storage.get<ObservationEvent[]>('log'),
    ]);
    this.snapshot = {
      loaded: true,
      progress: progress?.version === PROGRESS_VERSION ? progress : emptyProgress(),
      settings: { ...DEFAULT_SETTINGS, ...settings },
      log: log ?? [],
    };
    this.emit();
  }

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private setProgress(progress: Progress): void {
    const badges = computeBadges(this.levels, progress, this.snapshot.log);
    this.snapshot = { ...this.snapshot, progress: { ...progress, badges } };
    this.emit();
    void this.storage.set('progress', this.snapshot.progress);
  }

  levelProgress(levelId: string): LevelProgress {
    return this.snapshot.progress.levels[levelId] ?? emptyLevelProgress(levelId);
  }

  private updateLevel(levelId: string, update: (p: LevelProgress) => LevelProgress): void {
    const progress = this.snapshot.progress;
    this.setProgress({ ...progress, levels: { ...progress.levels, [levelId]: update(this.levelProgress(levelId)) } });
  }

  /** A level is open when the one before it is complete, or the adult opened them all. */
  isUnlocked(levelId: string): boolean {
    if (this.snapshot.settings.openAllLevels) return true;
    const index = this.levels.findIndex((l) => l.id === levelId);
    if (index <= 0) return true;
    return this.levelProgress(this.levels[index - 1]!.id).stars.complete;
  }

  record(event: EventInput): void {
    const full = { t: this.now(), ...event } as ObservationEvent;
    const log = this.snapshot.log;
    const last = log[log.length - 1];
    // Opened and left without doing anything is not a visit worth logging.
    if (full.kind === 'level-abandoned' && last?.kind === 'level-opened' && last.levelId === full.levelId) {
      this.snapshot = { ...this.snapshot, log: log.slice(0, -1) };
      this.emit();
      void this.storage.set('log', this.snapshot.log);
      return;
    }
    this.snapshot = { ...this.snapshot, log: [...log, full] };
    this.emit();
    void this.storage.set('log', this.snapshot.log);
    if (full.kind === 'prediction-made') {
      this.updateLevel(full.levelId, (p) => ({
        ...p,
        predictions: { correct: p.predictions.correct + (full.correct ? 1 : 0), total: p.predictions.total + 1 },
      }));
    }
    if (full.kind === 'run-started') this.updateLevel(full.levelId, (p) => ({ ...p, attempts: p.attempts + 1 }));
    if (full.kind === 'trace-halted') this.updateLevel(full.levelId, (p) => ({ ...p, hadBlockedRun: true }));
  }

  /** The objective was met. Stars only ever accumulate. */
  complete(input: CompletionInput): Stars {
    const before = this.levelProgress(input.levelId);
    const stars: Stars = {
      complete: true,
      noHints: before.stars.noHints || !input.usedHints,
      budget: input.budget === undefined ? null : before.stars.budget === true || input.steps <= input.budget,
    };
    this.updateLevel(input.levelId, (p) => ({
      ...p,
      stars,
      bestSteps: p.bestSteps === null ? input.steps : Math.min(p.bestSteps, input.steps),
      solvedFirstRun: p.solvedFirstRun || p.attempts <= 1,
    }));
    this.record({ levelId: input.levelId, kind: 'level-completed', stars, steps: input.steps });
    return stars;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.snapshot = { ...this.snapshot, settings: { ...this.snapshot.settings, ...patch } };
    this.emit();
    void this.storage.set('settings', this.snapshot.settings);
  }

  exportFile(): ExportFile {
    return { exportedAt: new Date(this.now()).toISOString(), progress: this.snapshot.progress, settings: this.snapshot.settings, log: this.snapshot.log };
  }

  async reset(): Promise<void> {
    await this.storage.clear();
    this.snapshot = { loaded: true, progress: emptyProgress(), settings: this.snapshot.settings, log: [] };
    this.emit();
    void this.storage.set('settings', this.snapshot.settings);
  }
}
