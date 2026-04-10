import { z } from 'zod';
import type { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import { componentNotFound } from '../errors/errors.js';
import type { RegistryLoader } from '../registry/registry.js';
import { searchItems } from '../search/fuzzy.js';
import type { ToolDefinition } from '../server.js';

export function createDiscoveryTools(
  registry: RegistryLoader,
  cacheManager: CacheManager,
  analogApi: AnalogApiClient,
): ToolDefinition[] {
  return [
    {
      name: 'spartan_list',
      title: 'List Spartan Components & Blocks',
      description:
        'List all available Spartan Angular UI components and blocks. Components show Brain/Helm availability. Blocks are grouped by category.',
      inputSchema: {
        type: z.enum(['components', 'blocks', 'all']).default('all').describe('What to list'),
        category: z
          .string()
          .optional()
          .describe('Filter blocks by category (sidebar, login, signup, calendar)'),
      },
      handler: async (args: { type?: string; category?: string }) => {
        const type = args.type ?? 'all';
        const result: Record<string, unknown> = {};

        if (type === 'components' || type === 'all') {
          const components = registry.listComponents();
          result.components = components.map((c) => ({
            name: c.name,
            category: c.category,
            brainAvailable: c.brainAvailable,
            helmAvailable: c.helmAvailable,
            brainPackage: c.brainPackage,
            helmPackage: c.helmPackage,
          }));
          result.componentCount = components.length;
        }

        if (type === 'blocks' || type === 'all') {
          let blocks = registry.listBlocks();
          if (args.category) {
            blocks = blocks.filter((b) => b.category === args.category);
          }

          const grouped: Record<string, string[]> = {};
          for (const b of blocks) {
            if (!grouped[b.category]) grouped[b.category] = [];
            grouped[b.category].push(b.variant);
          }
          result.blocks = grouped;
          result.blockCount = blocks.length;
        }

        result.registryVersion = registry.getVersion();
        result.spartanVersion = registry.getSpartanVersion();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
    {
      name: 'spartan_search',
      title: 'Search Spartan Components',
      description:
        'Fuzzy search across Spartan components, blocks, and documentation topics. Returns ranked results with relevance scores.',
      inputSchema: {
        query: z.string().min(1).describe('Search query for fuzzy matching'),
        scope: z
          .enum(['components', 'blocks', 'docs', 'all'])
          .default('all')
          .describe('Scope to search within'),
        limit: z.number().min(1).max(50).default(10).describe('Maximum number of results'),
      },
      handler: async (args: { query: string; scope?: string; limit?: number }) => {
        let items = registry.getSearchableItems();

        if (args.scope && args.scope !== 'all') {
          const scopeMap: Record<string, string> = {
            components: 'component',
            blocks: 'block',
            docs: 'doc',
          };
          const filterType = scopeMap[args.scope];
          if (filterType) {
            items = items.filter((i) => i.type === filterType);
          }
        }

        const results = searchItems(items, args.query, args.limit ?? 10);

        const output = {
          query: args.query,
          scope: args.scope ?? 'all',
          resultCount: results.length,
          results: results.map((r) => ({
            name: r.item.name,
            type: r.item.type,
            category: r.item.category,
            score: r.score,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        };
      },
    },
    {
      name: 'spartan_view',
      title: 'View Component Details',
      description:
        'View detailed information for a Spartan component including Brain directives, Helm components, inputs/outputs, signal models, code examples, and installation snippets.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Component name (kebab-case, e.g. 'dialog', 'alert-dialog')"),
        sections: z
          .array(z.enum(['api', 'examples', 'install', 'all']))
          .default(['all'])
          .describe('Which sections to include'),
        noCache: z.boolean().default(false).describe('Bypass cache and fetch fresh data'),
      },
      handler: async (args: { name: string; sections?: string[]; noCache?: boolean }) => {
        const name = args.name.trim().toLowerCase();
        const sections = args.sections ?? ['all'];
        const includeAll = sections.includes('all');

        // Check registry first
        const regComponent = registry.getComponent(name);
        if (!regComponent) {
          throw componentNotFound(name);
        }

        // Fetch full data from Analog API (cached)
        const componentData = await cacheManager.get(
          'components',
          name,
          () => analogApi.getComponent(name, args.noCache),
          args.noCache,
        );

        const result: Record<string, unknown> = {
          name: componentData.name,
          url: componentData.url,
          category: regComponent.category,
          brainPackage: regComponent.brainPackage,
          helmPackage: regComponent.helmPackage,
        };

        if (includeAll || sections.includes('api')) {
          result.brainAPI = componentData.brainAPI;
          result.helmAPI = componentData.helmAPI;
          result.brainCount = componentData.brainCount;
          result.helmCount = componentData.helmCount;
        }

        if (includeAll || sections.includes('examples')) {
          result.examples = componentData.examples;
        }

        if (includeAll || sections.includes('install')) {
          result.installSnippets = componentData.installSnippets;
          result.packages = {
            brain: regComponent.brainAvailable ? regComponent.brainPackage : null,
            helm: regComponent.helmAvailable ? regComponent.helmPackage : null,
          };
          result.peerDependencies = regComponent.peerDependencies;
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
  ];
}
