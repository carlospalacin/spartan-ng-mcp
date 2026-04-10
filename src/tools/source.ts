import { z } from 'zod';
import type { CacheManager } from '../cache/cache-manager.js';
import type { GitHubClient } from '../data/github.js';
import { blockNotFound, componentNotFound } from '../errors/errors.js';
import type { RegistryLoader } from '../registry/registry.js';
import type { ToolDefinition } from '../server.js';
import { extractExportsFromIndex, extractImportsFromSource } from '../utils/imports.js';

export function createSourceTools(
  registry: RegistryLoader,
  cacheManager: CacheManager,
  github: GitHubClient,
): ToolDefinition[] {
  return [
    {
      name: 'spartan_source',
      title: 'Fetch Component Source Code',
      description:
        'Fetch the TypeScript source code of a Spartan component from GitHub. Returns files from libs/brain/{name}/src/ and/or libs/helm/{name}/src/ with extracted exports.',
      inputSchema: {
        name: z.string().min(1).describe("Component name (kebab-case, e.g. 'dialog')"),
        layer: z
          .enum(['brain', 'helm', 'both'])
          .default('both')
          .describe('Which layer to fetch source for'),
        noCache: z.boolean().default(false).describe('Bypass cache and fetch fresh from GitHub'),
      },
      handler: async (args: { name: string; layer?: string; noCache?: boolean }) => {
        const name = args.name.trim().toLowerCase();
        const comp = registry.getComponent(name);
        if (!comp) throw componentNotFound(name);

        const layers = args.layer === 'both' ? ['brain', 'helm'] : [args.layer ?? 'both'];
        const results: Record<string, unknown> = {};

        for (const layer of layers) {
          const isAvailable = layer === 'brain' ? comp.brainAvailable : comp.helmAvailable;

          if (!isAvailable) {
            results[layer] = {
              component: name,
              layer,
              available: false,
              reason: `No ${layer} library found for "${name}".`,
            };
            continue;
          }

          const cacheKey = `${layer}-${name}`;
          const data = await cacheManager.get(
            'source',
            cacheKey,
            async () => {
              const libPath = `libs/${layer}/${name}/src`;
              const srcEntries = await github.fetchDirectory(libPath);

              const files: Array<{
                name: string;
                content: string;
                path: string;
              }> = [];

              // Fetch index.ts (exports)
              const indexFile = srcEntries.find((e) => e.name === 'index.ts');
              if (indexFile) {
                const indexData = await github.fetchFile(indexFile.path);
                files.push({
                  name: 'index.ts',
                  content: indexData.content,
                  path: indexFile.path,
                });
              }

              // Fetch lib/ directory recursively
              const libDir = srcEntries.find((e) => e.name === 'lib' && e.type === 'dir');
              if (libDir) {
                const libFiles = await github.fetchDirectoryFiles(libDir.path);
                files.push(...libFiles);
              }

              // Extract exports from index.ts
              const exports = extractExportsFromIndex(
                indexFile ? (files.find((f) => f.name === 'index.ts')?.content ?? '') : '',
              );

              return {
                component: name,
                layer,
                available: true,
                fileCount: files.length,
                files: files.map((f) => ({
                  name: f.name,
                  path: f.path,
                  content: f.content,
                })),
                exports,
              };
            },
            args.noCache,
          );

          results[layer] = data;
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
        };
      },
    },
    {
      name: 'spartan_block_source',
      title: 'Fetch Block Source Code',
      description:
        'Fetch the source code of a Spartan page-level block from GitHub. Returns component files, shared utilities, and extracted imports (spartan/angular/cdk/other).',
      inputSchema: {
        category: z.string().min(1).describe('Block category (sidebar, login, signup, calendar)'),
        variant: z
          .string()
          .min(1)
          .describe("Block variant (e.g. 'sidebar-sticky-header', 'login-simple-reactive-form')"),
        includeShared: z
          .boolean()
          .default(true)
          .describe('Include shared utility files (nav, data)'),
        noCache: z.boolean().default(false).describe('Bypass cache'),
      },
      handler: async (args: {
        category: string;
        variant: string;
        includeShared?: boolean;
        noCache?: boolean;
      }) => {
        const { category, variant } = args;
        const block = registry.getBlock(category, variant);
        if (!block) throw blockNotFound(category, variant);

        const cacheKey = `${category}-${variant}`;
        const data = await cacheManager.get(
          'blocks',
          cacheKey,
          async () => {
            // Fetch main block files
            const entries = await github.fetchDirectory(block.githubPath);
            const files = await fetchTsFiles(github, entries, block.githubPath);

            // Extract imports from all source
            const allSource = files.map((f) => f.content).join('\n');
            const imports = extractImportsFromSource(allSource);

            // Optionally fetch shared utilities
            let sharedFiles: Array<{
              name: string;
              content: string;
              path: string;
            }> = [];

            if (args.includeShared !== false && category !== 'calendar') {
              const usesShared = files.some(
                (f) => f.content.includes('/shared/') || f.content.includes('../shared/'),
              );
              if (usesShared) {
                const sharedPath = 'apps/app/src/app/pages/(blocks-preview)/blocks-preview/shared';
                try {
                  const sharedEntries = await github.fetchDirectory(sharedPath);
                  for (const dir of sharedEntries) {
                    if (dir.type === 'dir') {
                      const dirFiles = await github.fetchDirectoryFiles(dir.path);
                      sharedFiles.push(
                        ...dirFiles.map((f) => ({
                          name: `shared/${dir.name}/${f.name}`,
                          content: f.content,
                          path: f.path,
                        })),
                      );
                    }
                  }
                } catch {
                  // Shared path may not exist for all blocks
                }
              }
            }

            return {
              category,
              variant,
              fileCount: files.length,
              files,
              sharedFiles,
              sharedFileCount: sharedFiles.length,
              imports,
            };
          },
          args.noCache,
        );

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    },
  ];
}

async function fetchTsFiles(
  github: GitHubClient,
  entries: Array<{ name: string; path: string; type: string }>,
  _basePath: string,
): Promise<Array<{ name: string; content: string; path: string }>> {
  const files: Array<{ name: string; content: string; path: string }> = [];

  for (const entry of entries) {
    if (entry.type === 'file' && entry.name.endsWith('.ts')) {
      const fileData = await github.fetchFile(entry.path);
      files.push({
        name: entry.name,
        content: fileData.content,
        path: entry.path,
      });
    } else if (entry.type === 'dir') {
      const subFiles = await github.fetchDirectoryFiles(entry.path);
      files.push(
        ...subFiles.map((f) => ({
          ...f,
          name: `${entry.name}/${f.name}`,
        })),
      );
    }
  }

  return files;
}
