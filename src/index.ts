#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheManager } from './cache/cache-manager.js';
import { AnalogApiClient } from './data/analog-api.js';
import { GitHubClient } from './data/github.js';
import { registerPromptHandlers } from './prompts/workflows.js';
import { RegistryLoader } from './registry/registry.js';
import { registerResourceHandlers } from './resources/spartan.js';
import { createServer, registerToolGroup } from './server.js';
import { createCacheTools } from './tools/cache.js';
import { createContextTools } from './tools/context.js';
import { createDependencyTools } from './tools/dependencies.js';
import { createDiscoveryTools } from './tools/discovery.js';
import { createDocsTools } from './tools/docs.js';
import { createInstallTools } from './tools/install.js';
import { createSkillsTools } from './tools/skills.js';
import { createSourceTools } from './tools/source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

async function main(): Promise<void> {
  // Initialize core services
  const registry = new RegistryLoader();
  await registry.initialize();

  const cacheDir = join(PROJECT_ROOT, 'cache');
  const cacheManager = new CacheManager(cacheDir);
  const analogApi = new AnalogApiClient();
  const github = new GitHubClient();

  // Create server
  const server = createServer();

  // Discovery
  registerToolGroup(server, createDiscoveryTools(registry, cacheManager, analogApi));
  registerToolGroup(server, createDependencyTools(registry, cacheManager, analogApi));

  // Source & Docs
  registerToolGroup(server, createSourceTools(registry, cacheManager, github));
  registerToolGroup(server, createDocsTools(cacheManager));

  // Install, Context, Cache & Registry
  registerToolGroup(server, createContextTools(registry));
  registerToolGroup(server, createInstallTools(registry));
  registerToolGroup(server, createCacheTools(cacheManager, registry, analogApi, github));

  // Skills installer
  registerToolGroup(server, createSkillsTools());

  // Resources & Prompts
  registerResourceHandlers(server, registry, cacheManager, analogApi);
  registerPromptHandlers(server, registry, cacheManager, analogApi);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error starting spartan-ng-mcp:', error);
  process.exit(1);
});
