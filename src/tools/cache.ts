import { z } from "zod";
import type { CacheManager } from "../cache/cache-manager.js";
import type { AnalogApiClient } from "../data/analog-api.js";
import type { GitHubClient } from "../data/github.js";
import type { RegistryLoader } from "../registry/registry.js";
import { spartanRegistrySchema } from "../registry/schema.js";
import type { ToolDefinition } from "../server.js";

export function createCacheTools(
  cacheManager: CacheManager,
  registry: RegistryLoader,
  analogApi: AnalogApiClient,
  github: GitHubClient,
): ToolDefinition[] {
  return [
    {
      name: "spartan_cache",
      title: "Cache Management",
      description:
        "Manage the MCP server cache. Check status (memory + file stats), clear cached data, or trigger a full rebuild from live sources.",
      inputSchema: {
        action: z
          .enum(["status", "clear", "rebuild"])
          .describe(
            "Cache action: status (show stats), clear (delete cached data), rebuild (refetch from network)",
          ),
        scope: z
          .enum(["all", "components", "docs", "blocks", "source"])
          .default("all")
          .describe("Which cache category to act on"),
      },
      handler: async (args: { action: string; scope?: string }) => {
        const scope = args.scope ?? "all";

        if (args.action === "status") {
          const stats = await cacheManager.stats();
          const rateLimit = github.getRateLimit();

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    cache: stats,
                    registry: {
                      version: registry.getVersion(),
                      spartanVersion: registry.getSpartanVersion(),
                      generatedAt: registry.getGeneratedAt(),
                      componentCount: registry.getComponentCount(),
                      blockCount: registry.getBlockCount(),
                      isStale: registry.isStale(),
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

        if (args.action === "clear") {
          if (scope === "all") {
            await cacheManager.clear();
          } else {
            await cacheManager.clear(scope as "components" | "docs" | "blocks" | "source");
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    action: "clear",
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
          scope === "all" ? undefined : (scope as "components" | "docs" | "blocks" | "source"),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  action: "rebuild",
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
      name: "spartan_registry_refresh",
      title: "Refresh Component Registry",
      description:
        "Refresh the component registry from the live Spartan Analog API. Updates the in-memory registry with the latest components without requiring an MCP update. Shows diff of added/updated/removed components.",
      inputSchema: {
        force: z.boolean().default(false).describe("Refresh even if the registry is not stale"),
      },
      handler: async (args: { force?: boolean }) => {
        const wasStale = registry.isStale();

        if (!args.force && !wasStale) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    refreshed: false,
                    reason: "Registry is not stale. Use force=true to refresh anyway.",
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

        // Fetch fresh data from Analog API
        const apiData = await analogApi.fetchAll(true);
        const componentNames = Object.keys(apiData.docsData).sort();

        // Build new registry components
        const components: Record<string, unknown> = {};
        for (const name of componentNames) {
          const docs = apiData.docsData[name] as Record<string, unknown>;
          const brainSection = docs?.brain as Record<string, unknown> | undefined;
          const helmSection = docs?.helm as Record<string, unknown> | undefined;
          const brainDirectives = brainSection ? Object.keys(brainSection) : [];
          const helmComponents = helmSection ? Object.keys(helmSection) : [];

          components[name] = {
            name,
            brainAvailable: brainDirectives.length > 0,
            helmAvailable: helmComponents.length > 0 || brainDirectives.length === 0,
            brainPackage: `@spartan-ng/brain/${name}`,
            helmPackage: `@spartan-ng/helm/${name}`,
            brainDirectives,
            helmComponents,
            category: "misc", // Simplified — full categorization in generator script
            peerDependencies: ["@angular/cdk"],
            url: `https://www.spartan.ng/components/${name}`,
          };
        }

        // Preserve existing blocks and docs from current registry
        const currentBlocks = Object.fromEntries(
          registry.listBlocks().map((b) => [`${b.category}/${b.variant}`, b]),
        );

        const newRegistry = spartanRegistrySchema.parse({
          version: registry.getVersion(),
          generatedAt: new Date().toISOString(),
          spartanVersion: "latest",
          components,
          blocks: currentBlocks,
          docs: registry.listDocs(),
        });

        const diff = registry.updateRegistry(newRegistry);

        return {
          content: [
            {
              type: "text" as const,
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
                  note: "Registry updated in memory only. The committed registry.json is unchanged. Run 'npm run generate-registry' to persist.",
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
