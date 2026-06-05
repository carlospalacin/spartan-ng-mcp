import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import {
  buildRefreshedRegistry,
  maybeRefresh,
  resetRefreshGuard,
  type RefreshTarget,
} from './refresh.js';
import type { SpartanRegistry } from './schema.js';

function baseRegistry(): SpartanRegistry {
  return {
    version: '1.2.3',
    generatedAt: new Date(0).toISOString(),
    spartanVersion: '0.0.9',
    components: {
      dialog: {
        name: 'dialog',
        brainAvailable: true,
        helmAvailable: true,
        brainPackage: '@spartan-ng/brain/dialog',
        helmPackage: '@spartan-ng/helm/dialog',
        brainDirectives: ['BrnDialog'],
        helmComponents: ['HlmDialog'],
        category: 'overlay',
        peerDependencies: ['@angular/cdk', '@angular/cdk/dialog'],
        url: 'https://www.spartan.ng/components/dialog',
      },
    },
    blocks: {
      'login/simple': {
        category: 'login',
        variant: 'simple',
        githubPath: 'some/path',
        spartanImports: ['button'],
      },
    },
    docs: ['installation', 'theming'],
  };
}

const apiPayload = {
  docsData: {
    dialog: { brain: { BrnDialog: {} }, helm: { HlmDialog: {} } },
    card: { helm: { HlmCard: {} } }, // helm-only, new component
  },
  primitivesData: {},
  manualInstallSnippets: {},
};

function makeTarget(base: SpartanRegistry) {
  const state = {
    current: base,
    refreshedWith: [] as Array<{ registry: SpartanRegistry; iso: string }>,
  };
  const target: RefreshTarget = {
    getCurrentRegistry: () => state.current,
    setRefreshed: (registry, iso) => {
      state.current = registry;
      state.refreshedWith.push({ registry, iso });
    },
  };
  return { target, state };
}

function fakeAnalog(impl: () => Promise<unknown>): AnalogApiClient {
  return { fetchAll: vi.fn(impl) } as unknown as AnalogApiClient;
}

describe('buildRefreshedRegistry', () => {
  it('derives category via the shared map and never produces misc for known names', () => {
    const next = buildRefreshedRegistry(apiPayload, baseRegistry(), '2026-01-01T00:00:00.000Z');
    expect(next.components.dialog.category).toBe('overlay');
    expect(next.components.card.category).toBe('layout');
    expect(next.components.card.helmAvailable).toBe(true);
    expect(next.components.card.brainAvailable).toBe(false);
  });

  it('preserves blocks, docs, version, spartanVersion and stamps generatedAt', () => {
    const next = buildRefreshedRegistry(apiPayload, baseRegistry(), '2026-01-01T00:00:00.000Z');
    expect(next.blocks).toEqual(baseRegistry().blocks);
    expect(next.docs).toEqual(['installation', 'theming']);
    expect(next.version).toBe('1.2.3');
    expect(next.spartanVersion).toBe('0.0.9');
    expect(next.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves peerDependencies of existing components', () => {
    const next = buildRefreshedRegistry(apiPayload, baseRegistry(), '2026-01-01T00:00:00.000Z');
    expect(next.components.dialog.peerDependencies).toEqual(['@angular/cdk', '@angular/cdk/dialog']);
  });
});

describe('maybeRefresh (stale-while-revalidate)', () => {
  let tempDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    resetRefreshGuard();
    tempDir = await mkdtemp(join(tmpdir(), 'spartan-refresh-'));
    cacheManager = new CacheManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('does nothing when fresh', () => {
    const { target } = makeTarget(baseRegistry());
    const analogApi = fakeAnalog(() => Promise.resolve(apiPayload));
    const result = maybeRefresh({
      target,
      analogApi,
      cacheManager,
      lastRefreshedAtMs: 1_000,
      ttlMs: 10_000,
      now: 5_000,
    });
    expect(result).toBeNull();
    expect(analogApi.fetchAll).not.toHaveBeenCalled();
  });

  it('refreshes, persists atomically, and applies when stale', async () => {
    const { target, state } = makeTarget(baseRegistry());
    const analogApi = fakeAnalog(() => Promise.resolve(apiPayload));
    const now = 100_000;
    const expectedIso = new Date(now).toISOString();

    const promise = maybeRefresh({
      target,
      analogApi,
      cacheManager,
      lastRefreshedAtMs: 0,
      ttlMs: 10_000,
      now,
    });
    expect(promise).not.toBeNull();
    await promise;

    expect(analogApi.fetchAll).toHaveBeenCalledOnce();
    expect(state.refreshedWith).toHaveLength(1);
    expect(state.refreshedWith[0].iso).toBe(expectedIso);

    const cached = await cacheManager.readRegistryCache();
    expect(cached?.lastRefreshedAt).toBe(expectedIso);
    expect((cached?.registry as SpartanRegistry).components.card.category).toBe('layout');
  });

  it('triggers exactly one refresh under two simultaneous accesses', async () => {
    const { target } = makeTarget(baseRegistry());
    const analogApi = fakeAnalog(() => Promise.resolve(apiPayload));
    const deps = {
      target,
      analogApi,
      cacheManager,
      lastRefreshedAtMs: 0,
      ttlMs: 10_000,
      now: 100_000,
    };

    const first = maybeRefresh(deps);
    const second = maybeRefresh(deps);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    await first;

    expect(analogApi.fetchAll).toHaveBeenCalledOnce();
  });

  it('leaves cache file and target untouched when the refresh fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { target, state } = makeTarget(baseRegistry());
    const analogApi = fakeAnalog(() => Promise.reject(new Error('network down')));

    const promise = maybeRefresh({
      target,
      analogApi,
      cacheManager,
      lastRefreshedAtMs: 0,
      ttlMs: 10_000,
      now: 100_000,
    });
    await promise;

    expect(await cacheManager.readRegistryCache()).toBeNull();
    expect(state.refreshedWith).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it('refreshes when fresh but force=true', async () => {
    const { target } = makeTarget(baseRegistry());
    const analogApi = fakeAnalog(() => Promise.resolve(apiPayload));
    const promise = maybeRefresh({
      target,
      analogApi,
      cacheManager,
      lastRefreshedAtMs: 5_000,
      ttlMs: 10_000,
      now: 6_000,
      force: true,
    });
    expect(promise).not.toBeNull();
    await promise;
    expect(analogApi.fetchAll).toHaveBeenCalledOnce();
  });
});
