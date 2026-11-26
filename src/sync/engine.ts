/**
 * Sync for one child on one device. The game keeps reading and writing its
 * local store, exactly as it does with no accounts; the engine stands in
 * front of that store, notes which documents changed, and in the background
 * sends them up and brings other devices' changes down, joining the two with
 * the rules in merge.ts. Offline, it simply waits: nothing the child does
 * depends on the server answering.
 */
import type { Creation } from '../create/types';
import type { KeyValueStore } from '../progress/storage';
import type { Progress } from '../progress/types';
import type { RemoteDoc } from './api';
import { isTombstone, mergeCreation, mergeDrafts, mergeProgress, type CreationDoc, type Drafts } from './merge';

const STATE_KEY = 'sync:state';
const CREATION_PREFIX = 'creation:';

/** The documents that travel. Settings and the log stay on the device. */
export const isSynced = (key: string): boolean => key === 'progress' || key === 'drafts' || key.startsWith(CREATION_PREFIX);

export interface SyncApi {
  pull(since: number): Promise<{ docs: RemoteDoc[]; rev: number }>;
  /** Resolves with the new revision, or with the server's copy when this device was behind. */
  push(key: string, body: { baseRev: number; value: unknown; deleted?: boolean }): Promise<{ rev: number } | { conflict: RemoteDoc }>;
}

interface SyncState {
  /** The newest revision this device has pulled. */
  since: number;
  /** The server revision of each document this device last saw. */
  revs: Record<string, number>;
  /** Documents changed here and not yet sent. */
  dirty: string[];
  /** When each creation thrown away here was thrown away, until the server knows. */
  deletedAt: Record<string, number>;
}

const emptyState = (): SyncState => ({ since: 0, revs: {}, dirty: [], deletedAt: {} });

/** The same value whatever order its keys were written in. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** Marks documents as changed in a store no engine is running on, so they are sent the next time one does. */
export async function markDirty(local: KeyValueStore, keys: readonly string[]): Promise<void> {
  const state = { ...emptyState(), ...(await local.get<SyncState>(STATE_KEY)) };
  await local.set(STATE_KEY, { ...state, dirty: [...new Set([...state.dirty, ...keys.filter(isSynced)])] });
}

export class SyncEngine {
  /** The store to hand to the game: the local one, with changes noted. */
  readonly store: KeyValueStore;
  /** Called with the keys another device changed, after they are written locally. */
  onPulled: (keys: string[]) => void = () => {};
  /** Called when a change is waiting to be sent, so the owner can decide when. */
  onDirty: () => void = () => {};

  private state: SyncState = emptyState();
  private ready: Promise<void>;
  private running: Promise<void> | null = null;
  private again = false;
  /** Counts changes to each document, to notice one made while it was being sent. */
  private changes = new Map<string, number>();

  constructor(
    private local: KeyValueStore,
    private api: SyncApi,
    private now: () => number = Date.now,
  ) {
    this.ready = local.get<SyncState>(STATE_KEY).then((saved) => {
      this.state = { ...emptyState(), ...saved };
    });
    this.store = {
      get: (key) => local.get(key),
      keys: (prefix) => local.keys(prefix),
      clear: () => local.clear(),
      set: async (key, value) => {
        await local.set(key, value);
        if (isSynced(key)) await this.touch(key);
      },
      delete: async (key) => {
        await local.delete(key);
        if (isSynced(key)) await this.touch(key, true);
      },
    };
  }

  private async touch(key: string, deleted = false): Promise<void> {
    await this.ready;
    this.changes.set(key, (this.changes.get(key) ?? 0) + 1);
    if (!this.state.dirty.includes(key)) this.state.dirty.push(key);
    if (deleted && key.startsWith(CREATION_PREFIX)) this.state.deletedAt[key] = this.now();
    else delete this.state.deletedAt[key];
    await this.save();
    this.onDirty();
  }

  private save(): Promise<void> {
    return this.local.set(STATE_KEY, this.state);
  }

  /** Documents were written straight to the local store (progress from before sign-in being brought along): send them too. */
  async mark(keys: readonly string[]): Promise<void> {
    for (const key of keys) if (isSynced(key)) await this.touch(key);
  }

  /** True while something changed here has not reached the server. */
  get pending(): boolean {
    return this.state.dirty.length > 0;
  }

  /** Pull, then push. Calls made while one is running fold into a single run after it. Rejects if the server cannot be reached or says no. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.ready;
          await this.pull();
          await this.push();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** What is here for a key: the document, or for a creation thrown away here, the mark it left. */
  private async localDoc(key: string): Promise<unknown> {
    const value = await this.local.get<unknown>(key);
    if (value !== undefined) return value;
    const at = this.state.deletedAt[key];
    return at === undefined ? undefined : { deleted: true, at };
  }

  /** Join the server's copy into the local one. Returns whether the local document changed. */
  private async absorb(remote: RemoteDoc): Promise<boolean> {
    const { key } = remote;
    const local = await this.localDoc(key);
    let merged: unknown;
    if (key === 'progress') merged = local === undefined ? remote.value : mergeProgress(local as Progress, remote.value as Progress);
    else if (key === 'drafts') merged = local === undefined ? remote.value : mergeDrafts(local as Drafts, remote.value as Drafts);
    else merged = mergeCreation(local as CreationDoc | undefined, remote.value as CreationDoc);

    this.state.revs[key] = remote.rev;
    // Nothing here the server lacks: no need to send. Otherwise the joined copy goes up.
    if (same(merged, remote.value)) this.state.dirty = this.state.dirty.filter((k) => k !== key);
    else if (!this.state.dirty.includes(key)) this.state.dirty.push(key);

    if (same(merged, local)) return false;
    const gone = key.startsWith(CREATION_PREFIX) && isTombstone(merged as CreationDoc);
    if (gone) {
      await this.local.delete(key);
      delete this.state.deletedAt[key];
    } else {
      await this.local.set(key, merged as Creation | Progress | Drafts);
    }
    // A thrown-away creation that was not here to begin with changes nothing the child can see.
    return !(gone && local === undefined);
  }

  private async pull(): Promise<void> {
    const { docs, rev } = await this.api.pull(this.state.since);
    const changed: string[] = [];
    for (const doc of docs) if (isSynced(doc.key) && (await this.absorb(doc))) changed.push(doc.key);
    this.state.since = Math.max(this.state.since, rev);
    await this.save();
    if (changed.length > 0) this.onPulled(changed);
  }

  private async push(): Promise<void> {
    const changed: string[] = [];
    for (const key of [...this.state.dirty]) {
      // Twice at most: once, and once more if another device got there first.
      for (let attempt = 0; attempt < 2 && this.state.dirty.includes(key); attempt++) {
        const before = this.changes.get(key) ?? 0;
        const doc = await this.localDoc(key);
        if (doc === undefined) {
          // Progress erased on this device is this device's business; the server keeps what it has.
          this.state.dirty = this.state.dirty.filter((k) => k !== key);
          break;
        }
        const deleted = key.startsWith(CREATION_PREFIX) && isTombstone(doc as CreationDoc);
        const result = await this.api.push(key, { baseRev: this.state.revs[key] ?? 0, value: doc, ...(deleted && { deleted }) });
        if ('conflict' in result) {
          if (await this.absorb(result.conflict)) changed.push(key);
          continue;
        }
        this.state.revs[key] = result.rev;
        if ((this.changes.get(key) ?? 0) === before) {
          this.state.dirty = this.state.dirty.filter((k) => k !== key);
          if (deleted) delete this.state.deletedAt[key];
        }
      }
      await this.save();
    }
    if (changed.length > 0) this.onPulled(changed);
  }
}
