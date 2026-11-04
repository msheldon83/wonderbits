import type { NodeId } from './types';

export type IdFactory = () => NodeId;

/** Random ids for real use. Short, URL-safe, collision-resistant enough per program. */
export function randomIdFactory(): IdFactory {
  return () => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return 'n_' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  };
}

/** Deterministic ids for tests and content loading. */
export function sequentialIdFactory(prefix = 'n'): IdFactory {
  let next = 1;
  return () => `${prefix}${next++}`;
}
