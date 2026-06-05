import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpartanError } from '../errors/errors.js';
import { FileCache } from './file-cache.js';

describe('FileCache', () => {
  let tempDir: string;
  let cache: FileCache;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'spartan-test-'));
    cache = new FileCache(tempDir, 'v1', 24);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns miss for non-existent key', async () => {
    const result = await cache.get('components', 'missing');
    expect(result.hit).toBe(false);
    expect(result.data).toBeNull();
    expect(result.stale).toBe(false);
  });

  it('stores and retrieves data', async () => {
    await cache.set('components', 'dialog', { name: 'dialog' });
    const result = await cache.get<{ name: string }>('components', 'dialog');
    expect(result.hit).toBe(true);
    expect(result.data).toEqual({ name: 'dialog' });
    expect(result.stale).toBe(false);
    expect(result.cachedAt).toBeInstanceOf(Date);
  });

  it('writes valid JSON to disk', async () => {
    await cache.set('docs', 'install', { topic: 'install' });
    const filePath = join(tempDir, 'v1', 'docs', 'install.json');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.data).toEqual({ topic: 'install' });
    expect(parsed.cachedAt).toBeTruthy();
  });

  it('marks entries as stale after TTL', async () => {
    // Use a very short TTL and write an entry with an old timestamp
    const { mkdir: mkdirFn, writeFile: writeFn } = await import('node:fs/promises');
    const dir = join(tempDir, 'v1', 'components');
    await mkdirFn(dir, { recursive: true });
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    await writeFn(join(dir, 'stale.json'), JSON.stringify({ data: 'old', cachedAt: oldDate }));

    const shortCache = new FileCache(tempDir, 'v1', 1); // 1 hour TTL
    const result = await shortCache.get('components', 'stale');
    expect(result.hit).toBe(true);
    expect(result.stale).toBe(true);
  });

  it('clears specific category', async () => {
    await cache.set('components', 'a', 'data-a');
    await cache.set('docs', 'b', 'data-b');
    await cache.clear('components');
    expect((await cache.get('components', 'a')).hit).toBe(false);
    expect((await cache.get('docs', 'b')).hit).toBe(true);
  });

  it('clears all categories', async () => {
    await cache.set('components', 'a', 'data-a');
    await cache.set('docs', 'b', 'data-b');
    await cache.clear();
    expect((await cache.get('components', 'a')).hit).toBe(false);
    expect((await cache.get('docs', 'b')).hit).toBe(false);
  });

  it('reports stats', async () => {
    await cache.set('components', 'a', 'data');
    await cache.set('components', 'b', 'data');
    await cache.set('docs', 'c', 'data');
    const stats = await cache.stats();
    expect(stats.version).toBe('v1');
    expect(stats.categories.components).toBe(2);
    expect(stats.categories.docs).toBe(1);
    expect(stats.categories.blocks).toBe(0);
    expect(stats.categories.source).toBe(0);
    expect(stats.totalEntries).toBe(3);
  });

  it('switches version', async () => {
    await cache.set('components', 'a', 'v1-data');
    await cache.switchVersion('v2');
    expect((await cache.get('components', 'a')).hit).toBe(false);
    await cache.set('components', 'a', 'v2-data');
    const result = await cache.get<string>('components', 'a');
    expect(result.data).toBe('v2-data');
  });

  it('rejects invalid cache keys', async () => {
    await expect(cache.set('components', '../evil', 'data')).rejects.toThrow(SpartanError);
    await expect(cache.set('components', '', 'data')).rejects.toThrow(SpartanError);
    await expect(cache.set('components', 'has space', 'data')).rejects.toThrow(SpartanError);
  });

  it('rejects invalid version', () => {
    expect(() => new FileCache(tempDir, '../evil')).toThrow(SpartanError);
    expect(() => new FileCache(tempDir, '')).toThrow(SpartanError);
  });

  it('throws cache read error for corrupted files', async () => {
    // Write invalid JSON manually
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = join(tempDir, 'v1', 'components');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bad.json'), 'not json', 'utf-8');
    // JSON.parse will throw, which should be wrapped in CACHE_READ_ERROR
    await expect(cache.get('components', 'bad')).rejects.toThrow(SpartanError);
  });
});
