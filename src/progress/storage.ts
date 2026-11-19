/**
 * Storage interface over IndexedDB, with an in-memory fallback for tests and
 * for browsers where IndexedDB is unavailable. One key-value store is enough:
 * progress, settings and the log are three small documents, and each of
 * the child's creations is one more.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key that starts with the prefix. */
  keys(prefix: string): Promise<string[]>;
  clear(): Promise<void>;
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    async clear() {
      map.clear();
    },
  };
}

const DB_NAME = 'wonderbits';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function indexedDbStore(): KeyValueStore {
  const db = openDb();
  return {
    async get<T>(key: string) {
      const tx = (await db).transaction(STORE, 'readonly');
      return request(tx.objectStore(STORE).get(key)) as Promise<T | undefined>;
    },
    async set(key, value) {
      const tx = (await db).transaction(STORE, 'readwrite');
      await request(tx.objectStore(STORE).put(value, key));
    },
    async delete(key) {
      const tx = (await db).transaction(STORE, 'readwrite');
      await request(tx.objectStore(STORE).delete(key));
    },
    async keys(prefix) {
      const tx = (await db).transaction(STORE, 'readonly');
      const all = await request(tx.objectStore(STORE).getAllKeys());
      return all.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix));
    },
    async clear() {
      const tx = (await db).transaction(STORE, 'readwrite');
      await request(tx.objectStore(STORE).clear());
    },
  };
}

/** IndexedDB when the browser has it, memory otherwise. */
export function defaultStore(): KeyValueStore {
  return typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore();
}

/**
 * One profile's corner of a store: every key gains the prefix on the way in
 * and loses it on the way out, so two children on one device never see each
 * other's documents. Clearing it clears only that corner.
 */
export function scopedStore(store: KeyValueStore, prefix: string): KeyValueStore {
  return {
    get: (key) => store.get(prefix + key),
    set: (key, value) => store.set(prefix + key, value),
    delete: (key) => store.delete(prefix + key),
    async keys(inner) {
      return (await store.keys(prefix + inner)).map((k) => k.slice(prefix.length));
    },
    async clear() {
      await Promise.all((await store.keys(prefix)).map((k) => store.delete(k)));
    },
  };
}

/** The prefix a signed-in child's documents live under. */
export const profilePrefix = (childId: string): string => `p:${childId}:`;
