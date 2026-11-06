/**
 * Storage interface over IndexedDB, with an in-memory fallback for tests and
 * for browsers where IndexedDB is unavailable. One key-value store is enough:
 * progress, settings and the log are three small documents.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
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
