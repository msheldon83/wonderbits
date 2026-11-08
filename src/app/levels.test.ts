import { describe, expect, it } from 'vitest';
import { hashFor, parseRoute } from './levels';

describe('routes', () => {
  it('parses the map, settings and level hashes, and anything else as the map', () => {
    expect(parseRoute('')).toEqual({ screen: 'map' });
    expect(parseRoute('#/')).toEqual({ screen: 'map' });
    expect(parseRoute('#/settings')).toEqual({ screen: 'settings' });
    expect(parseRoute('#/level/l01-first-step')).toEqual({ screen: 'level', id: 'l01-first-step' });
    expect(parseRoute('#/book')).toEqual({ screen: 'book' });
    expect(parseRoute('#/book/forest-loops')).toEqual({ screen: 'book', packId: 'forest-loops' });
    expect(parseRoute('#/nonsense/x')).toEqual({ screen: 'map' });
  });
  it('prints hashes that parse back', () => {
    for (const r of [{ screen: 'map' }, { screen: 'settings' }, { screen: 'level', id: 'a b' }, { screen: 'book' }, { screen: 'book', packId: 'p 1' }] as const) {
      expect(parseRoute(hashFor(r))).toEqual(r);
    }
  });
});
