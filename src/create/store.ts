/**
 * The creation store: everything the child has made on this device. Each
 * creation is its own stored document (`creation:<id>`), so saving one does
 * not rewrite the others. Loads once, keeps them in memory, writes through
 * on every change, and notifies subscribers so React can read it with
 * useSyncExternalStore.
 */
import type { NodeSpec } from '../ir/spec';
import { ContentError } from '../lessons/parse';
import type { KeyValueStore } from '../progress/storage';
import { creationToJson, parseCreation } from './parse';
import { CREATION_SCHEMA_VERSION, TITLE_MAX, type Creation } from './types';

const PREFIX = 'creation:';

export interface CreationSnapshot {
  loaded: boolean;
  /** Newest first. */
  creations: readonly Creation[];
}

const randomId = () => `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

/** A title that fits: trimmed, never empty, never too long. */
export function cleanTitle(title: string, fallback = 'My island'): string {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  return t.length > 0 ? t : fallback;
}

export class CreationStore {
  private snapshot: CreationSnapshot = { loaded: false, creations: [] };
  private listeners = new Set<() => void>();
  /** Stored documents that would not parse, by key. They are left alone, never overwritten. */
  readonly unreadable: string[] = [];

  constructor(
    private storage: KeyValueStore,
    private now: () => number = Date.now,
    private newId: () => string = randomId,
  ) {}

  async load(): Promise<void> {
    const keys = await this.storage.keys(PREFIX);
    const creations: Creation[] = [];
    for (const key of keys) {
      try {
        // Creations made before a child could name their own parts gain that now.
        const read = parseCreation(await this.storage.get(key), key);
        creations.push(read.programming.ownNames ? read : { ...read, programming: { ...read.programming, ownNames: true } });
      } catch (e) {
        if (!(e instanceof ContentError)) throw e;
        this.unreadable.push(key);
      }
    }
    this.set(creations);
  }

  getSnapshot = (): CreationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(creations: Creation[]): void {
    this.snapshot = { loaded: true, creations: [...creations].sort((a, b) => b.updatedAt - a.updatedAt) };
    for (const l of this.listeners) l();
  }

  get(id: string): Creation | undefined {
    return this.snapshot.creations.find((c) => c.id === id);
  }

  /** A new creation, saved at once. */
  add(input: Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>): Creation {
    const t = this.now();
    const creation: Creation = { ...input, title: cleanTitle(input.title), schemaVersion: CREATION_SCHEMA_VERSION, id: this.newId(), createdAt: t, updatedAt: t };
    this.set([...this.snapshot.creations, creation]);
    void this.storage.set(PREFIX + creation.id, creationToJson(creation));
    return creation;
  }

  /**
   * Autosave: every edit goes through here. A change to the board, the goal
   * or the cards makes it a different puzzle, so the proof made for the old
   * one is dropped and it is a draft again until it is solved afresh.
   */
  update(id: string, patch: Partial<Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt' | 'proof' | 'status'>>): Creation | undefined {
    const before = this.get(id);
    if (!before) return undefined;
    const changesPuzzle = (['world', 'objective', 'programming', 'inputScript', 'days'] as const).some((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k]));
    const { proof: _proof, ...unproved } = before;
    const base: Creation = changesPuzzle ? { ...unproved, status: 'draft' } : before;
    return this.save({ ...base, ...patch, ...(patch.title !== undefined && { title: cleanTitle(patch.title, before.title) }), updatedAt: this.now() });
  }

  /** The maker solved it under its own limits: others may play it now. */
  prove(id: string, solution: NodeSpec[], steps: number): Creation | undefined {
    const before = this.get(id);
    if (!before) return undefined;
    if (before.proof && before.proof.steps === steps && JSON.stringify(before.proof.solution) === JSON.stringify(solution)) return before;
    return this.save({ ...before, status: 'proved', proof: { solution, steps, provedAt: this.now() } });
  }

  private save(after: Creation): Creation {
    this.set(this.snapshot.creations.map((c) => (c.id === after.id ? after : c)));
    void this.storage.set(PREFIX + after.id, creationToJson(after));
    return after;
  }

  remove(id: string): void {
    if (!this.get(id)) return;
    this.set(this.snapshot.creations.filter((c) => c.id !== id));
    void this.storage.delete(PREFIX + id);
  }
}
