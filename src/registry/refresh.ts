import type { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import { categorize } from './categorize.js';
import { type SpartanRegistry, spartanRegistrySchema } from './schema.js';

/**
 * Minimal surface the refresh coordinator needs from the registry loader.
 * Defined here (not imported from registry.ts) to avoid a runtime import cycle.
 */
export interface RefreshTarget {
  getCurrentRegistry(): SpartanRegistry;
  setRefreshed(registry: SpartanRegistry, lastRefreshedAt: string): void;
}

// In-process guard: prevents two near-simultaneous accesses from both firing a refresh.
let refreshInFlight = false;

/** Test-only: inspect the in-process refresh guard. */
export function isRefreshInFlight(): boolean {
  return refreshInFlight;
}

/** Test-only: reset the in-process refresh guard between cases. */
export function resetRefreshGuard(): void {
  refreshInFlight = false;
}

/**
 * Rebuild the registry from a fresh Analog API payload while PRESERVING fidelity:
 * categories come from the shared `categorize()` map (never `misc`-flattened), and
 * existing blocks/docs/peerDependencies are carried over from the current registry.
 */
export function buildRefreshedRegistry(
  apiData: { docsData: Record<string, unknown> },
  base: SpartanRegistry,
  nowIso: string,
): SpartanRegistry {
  const componentNames = Object.keys(apiData.docsData).sort();
  const components: Record<string, unknown> = {};

  for (const name of componentNames) {
    const docs = apiData.docsData[name] as Record<string, unknown> | undefined;
    const brainSection = docs?.brain as Record<string, unknown> | undefined;
    const helmSection = docs?.helm as Record<string, unknown> | undefined;
    const brainDirectives = brainSection ? Object.keys(brainSection) : [];
    const helmComponents = helmSection ? Object.keys(helmSection) : [];
    const previous = base.components[name];

    components[name] = {
      name,
      brainAvailable: brainDirectives.length > 0,
      helmAvailable: helmComponents.length > 0 || brainDirectives.length === 0,
      brainPackage: `@spartan-ng/brain/${name}`,
      helmPackage: `@spartan-ng/helm/${name}`,
      brainDirectives,
      helmComponents,
      category: categorize(name),
      peerDependencies: previous?.peerDependencies ?? ['@angular/cdk'],
      url: `https://www.spartan.ng/components/${name}`,
    };
  }

  return spartanRegistrySchema.parse({
    version: base.version,
    generatedAt: nowIso,
    spartanVersion: base.spartanVersion,
    components,
    blocks: base.blocks,
    docs: base.docs,
  });
}

/**
 * Perform a full refresh synchronously: fetch the Analog API, rebuild the registry,
 * persist it atomically, and apply it to the target. Throws on any failure so the
 * caller leaves the cache file and timestamp untouched.
 */
export async function performRefresh(deps: {
  target: RefreshTarget;
  analogApi: AnalogApiClient;
  cacheManager: CacheManager;
  nowIso: string;
}): Promise<SpartanRegistry> {
  const apiData = await deps.analogApi.fetchAll(true);
  const next = buildRefreshedRegistry(apiData, deps.target.getCurrentRegistry(), deps.nowIso);
  await deps.cacheManager.writeRegistryCache(next, deps.nowIso);
  deps.target.setRefreshed(next, deps.nowIso);
  return next;
}

/**
 * Stale-while-revalidate trigger. If the registry is within TTL (and not forced), or
 * a refresh is already in flight, returns null and does nothing. Otherwise starts a
 * single non-blocking refresh and returns its promise (callers fire-and-forget;
 * tests await it). A failed refresh is swallowed, leaving prior state intact.
 */
export function maybeRefresh(deps: {
  target: RefreshTarget;
  analogApi: AnalogApiClient;
  cacheManager: CacheManager;
  lastRefreshedAtMs: number;
  ttlMs: number;
  now: number;
  force?: boolean;
}): Promise<void> | null {
  const stale = deps.force === true || deps.now - deps.lastRefreshedAtMs > deps.ttlMs;
  if (!stale || refreshInFlight) return null;

  refreshInFlight = true;
  const nowIso = new Date(deps.now).toISOString();

  return (async () => {
    try {
      const acquired = await deps.cacheManager.acquireRefreshLock();
      if (!acquired) return;
      try {
        await performRefresh({
          target: deps.target,
          analogApi: deps.analogApi,
          cacheManager: deps.cacheManager,
          nowIso,
        });
      } finally {
        await deps.cacheManager.releaseRefreshLock();
      }
    } catch (error) {
      // Diagnostics go to stderr only — stdout is the JSON-RPC stream.
      console.error('[spartan-ng-mcp] background registry refresh failed:', error);
    } finally {
      refreshInFlight = false;
    }
  })();
}
