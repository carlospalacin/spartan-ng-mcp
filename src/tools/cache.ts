import { z } from 'zod';
import type { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import type { GitHubClient } from '../data/github.js';
import type { RegistryLoader } from '../registry/registry.js';
import { buildRefreshedRegistry } from '../registry/refresh.js';
import type { ToolDefinition } from '../server.js';

export function createCacheTools(
  cacheManager: CacheManager,
  registry: RegistryLoader,
  analogApi: AnalogApiClient,
  github: GitHubClient,
): ToolDefinition[] {
  return [
    {
      name: 'spartan_cache',
      title: 'Cache Management',
      description:
        'Manage the MCP server cache. Check status (memory + file stats), clear cached data, or trigger a full rebuild from live sources.',
      inputSchema: {
        action: z
          .enum(['status', 'clear', 'rebuild'])
          .describe(
            'Cache action: status (show stats), clear (delete cached data), rebuild (refetch from network)',
          ),
        scope: z
          .enum(['all', 'components', 'docs', 'blocks', 'source'])
          .default('all')
          .describe('Which cache category to act on'),
      },
      handler: async (args: { action: string; scope?: string }) => {
        const scope = args.scope ?? 'all';

        if (args.action === 'status') {
          const stats = await cacheManager.stats();
          const rateLimit = github.getRateLimit();
          const lastRefreshedAt = registry.getLastRefreshedAt();
          const ttlMs = cacheManager.ttlMs();
          const lastRefreshedMs = lastRefreshedAt ? Date.parse(lastRefreshedAt) : 0;
          const timeUntilStaleMs = Math.max(0, ttlMs - (Date.now() - lastRefreshedMs));

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    cache: stats,
                    registry: {
                      version: registry.getVersion(),
                      spartanVersion: registry.getSpartanVersion(),
                      generatedAt: registry.getGeneratedAt(), // build-time, informational only
                      lastRefreshedAt,
                      cacheFile: cacheManager.getRegistryCachePath(),
                      ttlHours: ttlMs / (60 * 60 * 1000),
                      timeUntilStaleMs,
                      isStale: registry.isStale(),
                      componentCount: registry.getComponentCount(),
                      blockCount: registry.getBlockCount(),
                    },
                    github: {
                      rateLimit: rateLimit.limit,
                      remaining: rateLimit.remaining,
                      resetAt: rateLimit.resetAtISO,
                      hasToken: rateLimit.hasToken,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (args.action === 'clear') {
          if (scope === 'all') {
            await cacheManager.clear();
          } else {
            await cacheManager.clear(scope as 'components' | 'docs' | 'blocks' | 'source');
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    action: 'clear',
                    scope,
                    message: `Cache cleared for scope: ${scope}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // rebuild
        await cacheManager.clear(
          scope === 'all' ? undefined : (scope as 'components' | 'docs' | 'blocks' | 'source'),
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  action: 'rebuild',
                  scope,
                  message: `Cache cleared for scope: ${scope}. Data will be re-fetched on next request.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    },
    {
      name: 'spartan_registry_refresh',
      title: 'Refresh Component Registry',
      description:
        'Refresh the component registry from the live Spartan Analog API. Updates the in-memory registry with the latest components without requiring an MCP update. Shows diff of added/updated/removed components.',
      inputSchema: {
        force: z.boolean().default(false).describe('Refresh even if the registry is not stale'),
      },
      handler: async (args: { force?: boolean }) => {
        const wasStale = registry.isStale();

        if (!args.force && !wasStale) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    refreshed: false,
                    reason: 'Registry is not stale. Use force=true to refresh anyway.',
                    generatedAt: registry.getGeneratedAt(),
                    componentCount: registry.getComponentCount(),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Fetch fresh data and rebuild with the shared categorization map (fidelity
        // preserved — never `misc`-flattened), preserving blocks/docs, then persist
        // atomically to the writable cache file.
        const nowIso = new Date().toISOString();
        const apiData = await analogApi.fetchAll(true);
        const newRegistry = buildRefreshedRegistry(apiData, registry.getCurrentRegistry(), nowIso);

        await cacheManager.writeRegistryCache(newRegistry, nowIso);
        const diff = registry.updateRegistry(newRegistry);
        registry.setLastRefreshedAt(nowIso);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  refreshed: true,
                  wasStale,
                  previousComponentCount:
                    registry.getComponentCount() - diff.added.length + diff.removed.length,
                  newComponentCount: registry.getComponentCount(),
                  diff: {
                    added: diff.added,
                    updated: diff.updated,
                    removed: diff.removed,
                    addedCount: diff.added.length,
                    updatedCount: diff.updated.length,
                    removedCount: diff.removed.length,
                  },
                  lastRefreshedAt: nowIso,
                  cacheFile: cacheManager.getRegistryCachePath(),
                  note: 'Registry persisted to the writable cache file. The committed registry.json (packaged floor) is unchanged.',
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    },
  ];
}
