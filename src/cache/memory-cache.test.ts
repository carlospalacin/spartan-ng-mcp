import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCache } from './memory-cache.js';

describe('MemoryCache', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>(3, 60_000);
  });

  it('returns null for missing keys', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves values', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns null for expired entries', () => {
    vi.useFakeTimers();
    const shortCache = new MemoryCache<string>(10, 1);
    shortCache.set('key', 'value');
    vi.advanceTimersByTime(10);
    expect(shortCache.get('key')).toBeNull();
    vi.useRealTimers();
  });

  it('evicts oldest entry when at capacity', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // should evict 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe('4');
  });

  it('does not evict when updating existing key', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('a', 'updated'); // update, not new entry
    expect(cache.get('a')).toBe('updated');
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('invalidates a key', () => {
    cache.set('key', 'value');
    cache.invalidate('key');
    expect(cache.get('key')).toBeNull();
  });

  it('clears all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('reports stats', () => {
    cache.set('a', '1');
    cache.get('a'); // hit
    cache.get('missing'); // miss

    const stats = cache.stats();
    expect(stats.entries).toBe(1);
    expect(stats.maxEntries).toBe(3);
    expect(stats.ttlMs).toBe(60_000);
    expect(stats.hitRate).toBe('50.0%');
  });

  it('reports N/A hit rate with no accesses', () => {
    expect(cache.stats().hitRate).toBe('N/A');
  });

  it('resets hit/miss counters on clear', () => {
    cache.set('a', '1');
    cache.get('a');
    cache.clear();
    expect(cache.stats().hitRate).toBe('N/A');
  });
});
