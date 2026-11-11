/**
 * The creation store: everything the child has made on this device. Each
 * creation is its own stored document (`creation:<id>`), so saving one does
 * not rewrite the others. Loads once, keeps them in memory, writes through
 * on every change, and notifies subscribers so React can read it with
 * useSyncExternalStore.
 */
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
        creations.push(parseCreation(await this.storage.get(key), key));
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

  /** Autosave: every edit goes through here. */
  update(id: string, patch: Partial<Omit<Creation, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'>>): Creation | undefined {
    const before = this.get(id);
    if (!before) return undefined;
    const after: Creation = { ...before, ...patch, ...(patch.title !== undefined && { title: cleanTitle(patch.title, before.title) }), updatedAt: this.now() };
    this.set(this.snapshot.creations.map((c) => (c.id === id ? after : c)));
    void this.storage.set(PREFIX + id, creationToJson(after));
    return after;
  }

  remove(id: string): void {
    if (!this.get(id)) return;
    this.set(this.snapshot.creations.filter((c) => c.id !== id));
    void this.storage.delete(PREFIX + id);
  }
}
