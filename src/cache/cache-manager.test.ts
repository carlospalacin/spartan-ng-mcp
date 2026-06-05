import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpartanRegistry } from '../registry/schema.js';
import { REGISTRY_REFRESH_LOCK_FILENAME } from '../utils/constants.js';
import { CacheManager } from './cache-manager.js';

function sampleRegistry(): SpartanRegistry {
  return {
    version: '9.9.9',
    generatedAt: new Date(0).toISOString(),
    spartanVersion: '0.0.1',
    components: {},
    blocks: {},
    docs: ['installation'],
  };
}

describe('CacheManager', () => {
  let tempDir: string;
  let manager: CacheManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'spartan-cm-'));
    manager = new CacheManager(tempDir, 'test');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('fetches from network on first call', async () => {
    const fetcher = vi.fn().mockResolvedValue({ name: 'dialog' });
    const result = await manager.get('components', 'dialog', fetcher);
    expect(result).toEqual({ name: 'dialog' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns from memory cache on second call', async () => {
    const fetcher = vi.fn().mockResolvedValue({ name: 'dialog' });
    await manager.get('components', 'dialog', fetcher);
    const result = await manager.get('components', 'dialog', fetcher);
    expect(result).toEqual({ name: 'dialog' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('bypasses cache with noCache=true', async () => {
    const fetcher = vi.fn().mockResolvedValue('fresh');
    await manager.get('components', 'key', fetcher);
    const result = await manager.get('components', 'key', fetcher, true);
    expect(result).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears all caches', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    await manager.get('components', 'key', fetcher);
    await manager.clear();
    await manager.get('components', 'key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears specific category', async () => {
    const fetcher1 = vi.fn().mockResolvedValue('comp');
    const fetcher2 = vi.fn().mockResolvedValue('doc');
    await manager.get('components', 'a', fetcher1);
    await manager.get('docs', 'b', fetcher2);
    await manager.clear('components');
    // Memory is fully cleared, so both will need re-fetch
    await manager.get('components', 'a', fetcher1);
    expect(fetcher1).toHaveBeenCalledTimes(2);
  });

  it('returns stats', async () => {
    const stats = await manager.stats();
    expect(stats.memory).toBeDefined();
    expect(stats.memory.entries).toBe(0);
    expect(stats.file).toBeDefined();
    expect(stats.file.version).toBe('test');
  });

  it('switches version and clears memory', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    await manager.get('components', 'key', fetcher);
    await manager.switchVersion('v2');
    await manager.get('components', 'key', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('handles file cache write failures gracefully', async () => {
    // Create manager with invalid path — file writes will fail but shouldn't throw
    const badManager = new CacheManager('/nonexistent/readonly/path', 'test');
    const fetcher = vi.fn().mockResolvedValue('data');
    // Should still return data even if file cache fails
    const result = await badManager.get('components', 'key', fetcher);
    expect(result).toBe('data');
  });

  describe('registry cache', () => {
    it('round-trips registry + lastRefreshedAt', async () => {
      const iso = '2026-01-02T03:04:05.000Z';
      await manager.writeRegistryCache(sampleRegistry(), iso);
      const cached = await manager.readRegistryCache();
      expect(cached?.lastRefreshedAt).toBe(iso);
      expect((cached?.registry as SpartanRegistry).version).toBe('9.9.9');
    });

    it('returns null when the cache file is missing', async () => {
      expect(await manager.readRegistryCache()).toBeNull();
    });

    it('returns null on invalid JSON', async () => {
      await writeFile(manager.getRegistryCachePath(), 'not json', 'utf-8');
      expect(await manager.readRegistryCache()).toBeNull();
    });

    it('returns null when shape is invalid (missing lastRefreshedAt)', async () => {
      await writeFile(manager.getRegistryCachePath(), JSON.stringify({ registry: {} }), 'utf-8');
      expect(await manager.readRegistryCache()).toBeNull();
    });

    it('writes atomically, leaving no temp file behind', async () => {
      await manager.writeRegistryCache(sampleRegistry(), new Date(0).toISOString());
      const files = await readdir(tempDir);
      expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
      expect(files).toContain('registry.cache.json');
    });

    it('ttlMs honors SPARTAN_CACHE_TTL_HOURS', () => {
      const original = process.env.SPARTAN_CACHE_TTL_HOURS;
      try {
        delete process.env.SPARTAN_CACHE_TTL_HOURS;
        expect(manager.ttlMs()).toBe(24 * 60 * 60 * 1000);
        process.env.SPARTAN_CACHE_TTL_HOURS = '48';
        expect(manager.ttlMs()).toBe(48 * 60 * 60 * 1000);
      } finally {
        if (original === undefined) delete process.env.SPARTAN_CACHE_TTL_HOURS;
        else process.env.SPARTAN_CACHE_TTL_HOURS = original;
      }
    });
  });

  describe('refresh lock', () => {
    it('acquires, blocks a live re-acquire, then releases', async () => {
      expect(await manager.acquireRefreshLock()).toBe(true);
      // Same process holds a fresh lock → second acquire is blocked.
      expect(await manager.acquireRefreshLock()).toBe(false);
      await manager.releaseRefreshLock();
      expect(await manager.acquireRefreshLock()).toBe(true);
    });

    it('ignores a stale lock owned by a dead PID', async () => {
      await writeFile(
        join(tempDir, REGISTRY_REFRESH_LOCK_FILENAME),
        JSON.stringify({ pid: 2147483647, startedAt: new Date().toISOString() }),
        'utf-8',
      );
      expect(await manager.acquireRefreshLock()).toBe(true);
    });

    it('ignores a lock older than the age cap', async () => {
      await writeFile(
        join(tempDir, REGISTRY_REFRESH_LOCK_FILENAME),
        JSON.stringify({ pid: process.pid, startedAt: new Date(0).toISOString() }),
        'utf-8',
      );
      // maxAge of 1ms → the epoch-old lock is stale regardless of PID liveness.
      expect(await manager.acquireRefreshLock(1)).toBe(true);
    });
  });
});
