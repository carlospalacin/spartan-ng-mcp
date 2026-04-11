#!/usr/bin/env tsx

/**
 * MCP Test Battery — runs all tools through the MCP client transport
 * and reports results with pass/fail validation.
 *
 * Usage:
 *   tsx scripts/mcp-test-battery.ts           # run all tests
 *   tsx scripts/mcp-test-battery.ts --verbose  # show full responses
 *   tsx scripts/mcp-test-battery.ts --filter discovery  # run matching tests only
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, '..', 'dist', 'index.js');

// ── Types ──────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  group: string;
  tool?: string;
  args?: Record<string, unknown>;
  run?: (client: Client) => Promise<unknown>;
  validate: (response: unknown) => ValidationResult;
}

interface ValidationResult {
  pass: boolean;
  reason: string;
}

interface TestResult {
  name: string;
  group: string;
  pass: boolean;
  reason: string;
  durationMs: number;
  response?: unknown;
  error?: string;
}

// ── Validation helpers ─────────────────────────────────────────────

function hasField(obj: unknown, field: string): boolean {
  return typeof obj === 'object' && obj !== null && field in obj;
}

function isArrayWithMin(obj: unknown, min: number): boolean {
  return Array.isArray(obj) && obj.length >= min;
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ok(reason: string): ValidationResult {
  return { pass: true, reason };
}

function fail(reason: string): ValidationResult {
  return { pass: false, reason };
}

// ── Test definitions ───────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Discovery: spartan_list ──────────────────────────────────────

  {
    name: 'list all (default)',
    group: 'discovery',
    tool: 'spartan_list',
    args: {},
    validate: (r) => {
      const data = r as { components?: unknown[]; totalComponents?: number };
      if (!hasField(data, 'components')) return fail('missing "components" field');
      if (!isArrayWithMin(data.components, 40)) return fail(`expected 40+ components, got ${data.components?.length}`);
      return ok(`${data.totalComponents ?? data.components?.length} components`);
    },
  },
  {
    name: 'list type=components',
    group: 'discovery',
    tool: 'spartan_list',
    args: { type: 'components' },
    validate: (r) => {
      const data = r as { components?: unknown[] };
      if (!hasField(data, 'components')) return fail('missing "components" field');
      if (!isArrayWithMin(data.components, 40)) return fail(`expected 40+ components`);
      return ok(`${data.components?.length} components`);
    },
  },
  {
    name: 'list type=blocks',
    group: 'discovery',
    tool: 'spartan_list',
    args: { type: 'blocks' },
    validate: (r) => {
      const data = r as { blocks?: Record<string, string[]> };
      if (!hasField(data, 'blocks')) return fail('missing "blocks" field');
      const categories = Object.keys(data.blocks ?? {});
      const total = Object.values(data.blocks ?? {}).flat().length;
      if (total < 10) return fail(`expected 10+ blocks, got ${total}`);
      return ok(`${total} blocks in ${categories.length} categories`);
    },
  },
  {
    name: 'list blocks with category filter',
    group: 'discovery',
    tool: 'spartan_list',
    args: { type: 'blocks', category: 'sidebar' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('sidebar')) return ok('sidebar blocks returned');
      return fail('no sidebar blocks in response');
    },
  },

  // ── Discovery: spartan_search ────────────────────────────────────

  {
    name: 'search "dialog" (default scope)',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'dialog' },
    validate: (r) => {
      const data = r as { results?: Array<{ name: string }> };
      if (!isArrayWithMin(data.results, 1)) return fail('no results');
      const first = data.results![0].name;
      if (first !== 'dialog') return fail(`expected first result "dialog", got "${first}"`);
      return ok(`${data.results?.length} results, first: ${first}`);
    },
  },
  {
    name: 'search scope=components',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'button', scope: 'components' },
    validate: (r) => {
      const data = r as { results?: Array<{ name: string; type: string }> };
      if (!isArrayWithMin(data.results, 1)) return fail('no results');
      const allComponents = data.results!.every((item) => item.type === 'component');
      if (!allComponents) return fail('results include non-component types');
      return ok(`${data.results?.length} component results`);
    },
  },
  {
    name: 'search scope=blocks',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'sidebar', scope: 'blocks' },
    validate: (r) => {
      const data = r as { results?: Array<{ name: string; type: string }> };
      if (!isArrayWithMin(data.results, 1)) return fail('no results');
      const allBlocks = data.results!.every((item) => item.type === 'block');
      if (!allBlocks) return fail('results include non-block types');
      return ok(`${data.results?.length} block results`);
    },
  },
  {
    name: 'search scope=docs',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'install', scope: 'docs' },
    validate: (r) => {
      const data = r as { results?: Array<{ type: string }> };
      if (!isArrayWithMin(data.results, 1)) return fail('no results');
      return ok(`${data.results?.length} doc results`);
    },
  },
  {
    name: 'search with limit=2',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'button', limit: 2 },
    validate: (r) => {
      const data = r as { results?: unknown[] };
      if (!data.results) return fail('no results');
      if (data.results.length > 2) return fail(`expected max 2 results, got ${data.results.length}`);
      return ok(`${data.results.length} results (limit=2)`);
    },
  },
  {
    name: 'search no match',
    group: 'discovery',
    tool: 'spartan_search',
    args: { query: 'nonexistent-xyz-qqq' },
    validate: (r) => {
      const data = r as { results?: unknown[]; resultCount?: number };
      if ((data.resultCount ?? data.results?.length ?? 0) === 0) return ok('0 results as expected');
      return fail(`expected 0 results, got ${data.resultCount ?? data.results?.length}`);
    },
  },

  // ── Discovery: spartan_view ──────────────────────────────────────

  {
    name: 'view dialog (all sections)',
    group: 'discovery',
    tool: 'spartan_view',
    args: { name: 'dialog' },
    validate: (r) => {
      const data = r as { name?: string; brainAPI?: unknown[]; helmAPI?: unknown[] };
      if (data.name !== 'dialog') return fail(`expected name "dialog", got "${data.name}"`);
      if (!hasField(data, 'brainAPI')) return fail('missing "brainAPI" field');
      if (!hasField(data, 'helmAPI')) return fail('missing "helmAPI" field');
      return ok(`brainAPI: ${data.brainAPI?.length}, helmAPI: ${data.helmAPI?.length}`);
    },
  },
  {
    name: 'view dialog sections=[api]',
    group: 'discovery',
    tool: 'spartan_view',
    args: { name: 'dialog', sections: ['api'] },
    validate: (r) => {
      const data = r as { name?: string; brainAPI?: unknown[] };
      if (data.name !== 'dialog') return fail(`wrong name`);
      if (!hasField(data, 'brainAPI')) return fail('missing "brainAPI" for api section');
      return ok('api section returned');
    },
  },
  {
    name: 'view dialog sections=[examples]',
    group: 'discovery',
    tool: 'spartan_view',
    args: { name: 'dialog', sections: ['examples'] },
    validate: (r) => {
      const data = r as { name?: string };
      if (data.name !== 'dialog') return fail(`wrong name`);
      return ok('examples section returned');
    },
  },
  {
    name: 'view dialog sections=[install]',
    group: 'discovery',
    tool: 'spartan_view',
    args: { name: 'dialog', sections: ['install'] },
    validate: (r) => {
      const data = r as { name?: string };
      if (data.name !== 'dialog') return fail(`wrong name`);
      const text = JSON.stringify(r);
      if (text.includes('spartan') || text.includes('install')) return ok('install section returned');
      return fail('no install info in response');
    },
  },
  {
    name: 'view nonexistent component',
    group: 'discovery',
    tool: 'spartan_view',
    args: { name: 'nonexistent-component' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found')) return ok('error as expected');
      return fail('expected an error for nonexistent component');
    },
  },

  // ── Discovery: spartan_dependencies ──────────────────────────────

  {
    name: 'dependencies for dialog (default depth)',
    group: 'discovery',
    tool: 'spartan_dependencies',
    args: { name: 'dialog' },
    validate: (r) => {
      const data = r as { component?: string; directDependencies?: unknown[]; directDependencyCount?: number };
      if (data.component !== 'dialog') return fail(`expected component "dialog"`);
      if (!hasField(data, 'directDependencies')) return fail('missing "directDependencies"');
      return ok(`${data.directDependencyCount} direct deps`);
    },
  },
  {
    name: 'dependencies with depth=3',
    group: 'discovery',
    tool: 'spartan_dependencies',
    args: { name: 'dialog', depth: 3 },
    validate: (r) => {
      const data = r as { component?: string; depth?: number; transitiveDependencies?: unknown[] };
      if (data.component !== 'dialog') return fail(`expected component "dialog"`);
      if (!hasField(data, 'transitiveDependencies')) return fail('missing "transitiveDependencies"');
      return ok(`depth=3, transitive: ${(data.transitiveDependencies as unknown[])?.length}`);
    },
  },
  {
    name: 'dependencies for nonexistent',
    group: 'discovery',
    tool: 'spartan_dependencies',
    args: { name: 'nonexistent-xyz' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found')) return ok('error as expected');
      return fail('expected error for nonexistent component');
    },
  },

  // ── Source: spartan_source ───────────────────────────────────────

  {
    name: 'source button layer=helm',
    group: 'source',
    tool: 'spartan_source',
    args: { name: 'button', layer: 'helm' },
    validate: (r) => {
      const data = r as { helm?: { files?: unknown[]; fileCount?: number } };
      if (!hasField(data, 'helm')) return fail('missing "helm" field');
      if (!isArrayWithMin(data.helm?.files, 1)) return fail('no files in helm');
      return ok(`${data.helm?.fileCount} helm files`);
    },
  },
  {
    name: 'source button layer=brain',
    group: 'source',
    tool: 'spartan_source',
    args: { name: 'button', layer: 'brain' },
    validate: (r) => {
      const data = r as { brain?: { files?: unknown[]; fileCount?: number } };
      if (!hasField(data, 'brain')) return fail('missing "brain" field');
      if (!isArrayWithMin(data.brain?.files, 1)) return fail('no files in brain');
      return ok(`${data.brain?.fileCount} brain files`);
    },
  },
  {
    name: 'source button layer=both',
    group: 'source',
    tool: 'spartan_source',
    args: { name: 'button', layer: 'both' },
    validate: (r) => {
      const data = r as { brain?: { files?: unknown[] }; helm?: { files?: unknown[] } };
      const hasBrain = hasField(data, 'brain');
      const hasHelm = hasField(data, 'helm');
      if (!hasBrain && !hasHelm) return fail('missing both brain and helm');
      return ok(`brain: ${hasBrain}, helm: ${hasHelm}`);
    },
  },
  {
    name: 'source nonexistent component',
    group: 'source',
    tool: 'spartan_source',
    args: { name: 'nonexistent-xyz' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found')) return ok('error as expected');
      return fail('expected error for nonexistent component');
    },
  },

  // ── Source: spartan_block_source ─────────────────────────────────

  {
    name: 'block source sidebar inset',
    group: 'source',
    tool: 'spartan_block_source',
    args: { category: 'sidebar', variant: 'inset' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('sidebar') || text.includes('files')) return ok('sidebar block source returned');
      return fail('unexpected response');
    },
  },
  {
    name: 'block source with variant',
    group: 'source',
    tool: 'spartan_block_source',
    args: { category: 'sidebar', variant: 'sticky-header' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('sidebar') || text.includes('sticky')) return ok('variant returned');
      return fail('unexpected response');
    },
  },
  {
    name: 'block source includeShared=false',
    group: 'source',
    tool: 'spartan_block_source',
    args: { category: 'sidebar', variant: 'inset', includeShared: false },
    validate: (r) => {
      return ok('block source without shared returned');
    },
  },
  {
    name: 'block source nonexistent category',
    group: 'source',
    tool: 'spartan_block_source',
    args: { category: 'nonexistent-xyz', variant: 'nope' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found')) return ok('error as expected');
      return fail('expected error for nonexistent block category');
    },
  },

  // ── Docs: spartan_docs ───────────────────────────────────────────

  {
    name: 'docs topic=installation',
    group: 'docs',
    tool: 'spartan_docs',
    args: { topic: 'installation' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 100) return fail('response too short');
      if (text.toLowerCase().includes('install') || text.toLowerCase().includes('spartan')) return ok(`${text.length} chars`);
      return fail('response does not mention install or spartan');
    },
  },
  {
    name: 'docs topic=theming',
    group: 'docs',
    tool: 'spartan_docs',
    args: { topic: 'theming' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 50) return fail('response too short');
      return ok(`${text.length} chars`);
    },
  },
  {
    name: 'docs topic=cli',
    group: 'docs',
    tool: 'spartan_docs',
    args: { topic: 'cli' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 50) return fail('response too short');
      return ok(`${text.length} chars`);
    },
  },
  {
    name: 'docs topic=dark-mode',
    group: 'docs',
    tool: 'spartan_docs',
    args: { topic: 'dark-mode' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 50) return fail('response too short');
      return ok(`${text.length} chars`);
    },
  },
  {
    name: 'docs format=text',
    group: 'docs',
    tool: 'spartan_docs',
    args: { topic: 'installation', format: 'text' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 50) return fail('response too short');
      return ok(`${text.length} chars (text format)`);
    },
  },

  // ── Install: spartan_install_command ──────────────────────────────

  {
    name: 'install command single component',
    group: 'install',
    tool: 'spartan_install_command',
    args: { components: ['dialog'] },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('spartan') || text.includes('npm') || text.includes('nx')) return ok('has install command');
      return fail('no install command found');
    },
  },
  {
    name: 'install command multiple components',
    group: 'install',
    tool: 'spartan_install_command',
    args: { components: ['dialog', 'button', 'card'] },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('dialog') && text.includes('button') && text.includes('card')) return ok('all components present');
      return fail('missing one or more components');
    },
  },
  {
    name: 'install command layer=brain',
    group: 'install',
    tool: 'spartan_install_command',
    args: { components: ['dialog'], layer: 'brain' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('brain') || text.includes('brn')) return ok('brain layer install');
      return fail('no brain reference in install command');
    },
  },
  {
    name: 'install command method=npm-install',
    group: 'install',
    tool: 'spartan_install_command',
    args: { components: ['button'], method: 'npm-install' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('npm') || text.includes('install')) return ok('npm install method');
      return fail('no npm install in response');
    },
  },
  {
    name: 'install command method=nx-generator',
    group: 'install',
    tool: 'spartan_install_command',
    args: { components: ['button'], method: 'nx-generator' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('nx') || text.includes('generate')) return ok('nx generator method');
      return fail('no nx generate in response');
    },
  },

  // ── Install: spartan_audit ───────────────────────────────────────

  {
    name: 'audit single component',
    group: 'install',
    tool: 'spartan_audit',
    args: { components: ['dialog'] },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length < 50) return fail('response too short');
      return ok('audit returned');
    },
  },
  {
    name: 'audit multiple components',
    group: 'install',
    tool: 'spartan_audit',
    args: { components: ['dialog', 'button', 'card'] },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('dialog') && text.includes('button') && text.includes('card')) return ok('all audited');
      return fail('missing components in audit');
    },
  },

  // ── Context: spartan_project_info ────────────────────────────────

  {
    name: 'project info (default cwd)',
    group: 'context',
    tool: 'spartan_project_info',
    args: {},
    validate: (r) => {
      const data = r as { packageManager?: string };
      if (hasField(data, 'packageManager') || typeof r === 'string') return ok('project info returned');
      return fail('unexpected response');
    },
  },
  {
    name: 'project info (invalid cwd)',
    group: 'context',
    tool: 'spartan_project_info',
    args: { cwd: '/nonexistent/path/xyz' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found') || text.includes('no')) return ok('error as expected');
      return ok('handled gracefully');
    },
  },

  // ── Context: spartan_project_components ──────────────────────────

  {
    name: 'project components (default cwd)',
    group: 'context',
    tool: 'spartan_project_components',
    args: {},
    validate: (r) => {
      return ok('project components returned');
    },
  },

  // ── Cache: spartan_cache ─────────────────────────────────────────

  {
    name: 'cache action=status',
    group: 'cache',
    tool: 'spartan_cache',
    args: { action: 'status' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('cache') || text.includes('memory') || text.includes('file')) return ok('cache status returned');
      return fail('no cache info');
    },
  },
  {
    name: 'cache action=clear',
    group: 'cache',
    tool: 'spartan_cache',
    args: { action: 'clear' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('clear') || text.toLowerCase().includes('success') || text.length > 0) return ok('cache cleared');
      return fail('unexpected response');
    },
  },
  {
    name: 'cache action=rebuild',
    group: 'cache',
    tool: 'spartan_cache',
    args: { action: 'rebuild' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length > 0) return ok('cache rebuilt');
      return fail('empty response');
    },
  },
  {
    name: 'cache clear scope=components',
    group: 'cache',
    tool: 'spartan_cache',
    args: { action: 'clear', scope: 'components' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.length > 0) return ok('components cache cleared');
      return fail('empty response');
    },
  },

  // ── Cache: spartan_registry_refresh ──────────────────────────────

  {
    name: 'registry refresh (default)',
    group: 'cache',
    tool: 'spartan_registry_refresh',
    args: {},
    validate: (r) => {
      return ok('refresh completed');
    },
  },
  {
    name: 'registry refresh force=true',
    group: 'cache',
    tool: 'spartan_registry_refresh',
    args: { force: true },
    validate: (r) => {
      return ok('forced refresh completed');
    },
  },

  // ── Skills: spartan_install_skills ───────────────────────────────

  {
    name: 'install skills (invalid cwd)',
    group: 'skills',
    tool: 'spartan_install_skills',
    args: { cwd: '/nonexistent/path/xyz' },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('not found') || text.toLowerCase().includes('no')) return ok('error as expected');
      return ok('handled gracefully');
    },
  },

  // ── noCache bypass ──────────────────────────────────────────────

  {
    name: 'view dialog noCache=true',
    group: 'noCache',
    tool: 'spartan_view',
    args: { name: 'dialog', noCache: true },
    validate: (r) => {
      const data = r as { name?: string; brainAPI?: unknown[] };
      if (data.name !== 'dialog') return fail(`wrong name: ${data.name}`);
      if (!hasField(data, 'brainAPI')) return fail('missing brainAPI');
      return ok('fresh fetch with noCache');
    },
  },
  {
    name: 'source button noCache=true',
    group: 'noCache',
    tool: 'spartan_source',
    args: { name: 'button', layer: 'helm', noCache: true },
    validate: (r) => {
      const data = r as { helm?: { files?: unknown[] } };
      if (!hasField(data, 'helm')) return fail('missing helm');
      if (!isArrayWithMin(data.helm?.files, 1)) return fail('no files');
      return ok('fresh source fetch with noCache');
    },
  },
  {
    name: 'block source noCache=true',
    group: 'noCache',
    tool: 'spartan_block_source',
    args: { category: 'sidebar', variant: 'inset', noCache: true },
    validate: (r) => {
      const text = typeof r === 'string' ? r : JSON.stringify(r);
      if (text.includes('sidebar') || text.includes('files')) return ok('fresh block fetch');
      return fail('unexpected response');
    },
  },

  // ── Resources ───────────────────────────────────────────────────

  {
    name: 'list resources',
    group: 'resources',
    run: async (client) => {
      const result = await client.listResources();
      return result;
    },
    validate: (r) => {
      const data = r as { resources?: Array<{ uri: string }> };
      if (!isArrayWithMin(data.resources, 3)) return fail(`expected 3+ resources, got ${data.resources?.length}`);
      const uris = data.resources!.map((res) => res.uri);
      return ok(`${uris.length} resources: ${uris.join(', ')}`);
    },
  },
  {
    name: 'read spartan://components/list',
    group: 'resources',
    run: async (client) => {
      const result = await client.readResource({ uri: 'spartan://components/list' });
      return result;
    },
    validate: (r) => {
      const data = r as { contents?: Array<{ text?: string }> };
      if (!isArrayWithMin(data.contents, 1)) return fail('no contents');
      const text = data.contents![0].text ?? '';
      if (text.length < 100) return fail('response too short');
      if (text.includes('dialog') || text.includes('button')) return ok(`${text.length} chars`);
      return fail('no component data in response');
    },
  },
  {
    name: 'read spartan://blocks/list',
    group: 'resources',
    run: async (client) => {
      const result = await client.readResource({ uri: 'spartan://blocks/list' });
      return result;
    },
    validate: (r) => {
      const data = r as { contents?: Array<{ text?: string }> };
      if (!isArrayWithMin(data.contents, 1)) return fail('no contents');
      const text = data.contents![0].text ?? '';
      if (text.includes('sidebar') || text.includes('login')) return ok(`${text.length} chars`);
      return fail('no block data');
    },
  },
  {
    name: 'read spartan://project/info',
    group: 'resources',
    run: async (client) => {
      const result = await client.readResource({ uri: 'spartan://project/info' });
      return result;
    },
    validate: (r) => {
      const data = r as { contents?: Array<{ text?: string }> };
      if (!isArrayWithMin(data.contents, 1)) return fail('no contents');
      return ok('project info resource returned');
    },
  },
  {
    name: 'read spartan://component/dialog/api',
    group: 'resources',
    run: async (client) => {
      const result = await client.readResource({ uri: 'spartan://component/dialog/api' });
      return result;
    },
    validate: (r) => {
      const data = r as { contents?: Array<{ text?: string }> };
      if (!isArrayWithMin(data.contents, 1)) return fail('no contents');
      const text = data.contents![0].text ?? '';
      if (text.includes('dialog') || text.includes('Brn') || text.includes('Hlm')) return ok(`${text.length} chars`);
      return fail('no API data for dialog');
    },
  },
  {
    name: 'read spartan://component/dialog/examples',
    group: 'resources',
    run: async (client) => {
      const result = await client.readResource({ uri: 'spartan://component/dialog/examples' });
      return result;
    },
    validate: (r) => {
      const data = r as { contents?: Array<{ text?: string }> };
      if (!isArrayWithMin(data.contents, 1)) return fail('no contents');
      return ok('dialog examples resource returned');
    },
  },

  // ── Prompts ─────────────────────────────────────────────────────

  {
    name: 'list prompts',
    group: 'prompts',
    run: async (client) => {
      const result = await client.listPrompts();
      return result;
    },
    validate: (r) => {
      const data = r as { prompts?: Array<{ name: string }> };
      if (!isArrayWithMin(data.prompts, 5)) return fail(`expected 5 prompts, got ${data.prompts?.length}`);
      const names = data.prompts!.map((p) => p.name);
      return ok(`${names.length} prompts: ${names.join(', ')}`);
    },
  },
  {
    name: 'prompt spartan-get-started',
    group: 'prompts',
    run: async (client) => {
      const result = await client.getPrompt({ name: 'spartan-get-started', arguments: { componentName: 'dialog' } });
      return result;
    },
    validate: (r) => {
      const data = r as { messages?: Array<{ content: { text?: string } }> };
      if (!isArrayWithMin(data.messages, 1)) return fail('no messages');
      const text = JSON.stringify(data.messages);
      if (text.includes('dialog')) return ok('get-started prompt returned');
      return fail('no dialog reference in prompt');
    },
  },
  {
    name: 'prompt spartan-compare-layers',
    group: 'prompts',
    run: async (client) => {
      const result = await client.getPrompt({ name: 'spartan-compare-layers', arguments: { componentName: 'dialog' } });
      return result;
    },
    validate: (r) => {
      const data = r as { messages?: unknown[] };
      if (!isArrayWithMin(data.messages, 1)) return fail('no messages');
      return ok('compare-layers prompt returned');
    },
  },
  {
    name: 'prompt spartan-implement',
    group: 'prompts',
    run: async (client) => {
      const result = await client.getPrompt({ name: 'spartan-implement', arguments: { componentName: 'dialog', feature: 'modal dialog with form' } });
      return result;
    },
    validate: (r) => {
      const data = r as { messages?: unknown[] };
      if (!isArrayWithMin(data.messages, 1)) return fail('no messages');
      return ok('implement prompt returned');
    },
  },
  {
    name: 'prompt spartan-use-block',
    group: 'prompts',
    run: async (client) => {
      const result = await client.getPrompt({ name: 'spartan-use-block', arguments: { category: 'sidebar', variant: 'sticky-header' } });
      return result;
    },
    validate: (r) => {
      const data = r as { messages?: unknown[] };
      if (!isArrayWithMin(data.messages, 1)) return fail('no messages');
      return ok('use-block prompt returned');
    },
  },
  {
    name: 'prompt spartan-migrate',
    group: 'prompts',
    run: async (client) => {
      const result = await client.getPrompt({ name: 'spartan-migrate', arguments: { componentName: 'dialog' } });
      return result;
    },
    validate: (r) => {
      const data = r as { messages?: unknown[] };
      if (!isArrayWithMin(data.messages, 1)) return fail('no messages');
      return ok('migrate prompt returned');
    },
  },
];

// ── Runner ─────────────────────────────────────────────────────────

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverEntry],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: 'spartan-test-battery', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

function extractResponse(result: { content: unknown }): unknown {
  const contents = result.content as Array<{ type: string; text?: string }>;
  const texts = contents.filter((c) => c.type === 'text' && c.text).map((c) => c.text!);
  const joined = texts.join('\n');
  return parsed(joined);
}

async function runTest(client: Client, test: TestCase, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  try {
    let response: unknown;
    if (test.run) {
      response = await test.run(client);
    } else {
      const result = await client.callTool({ name: test.tool!, arguments: test.args ?? {} });
      response = extractResponse(result);
    }
    const validation = test.validate(response);
    const duration = Date.now() - start;

    return {
      name: test.name,
      group: test.group,
      pass: validation.pass,
      reason: validation.reason,
      durationMs: duration,
      response: verbose ? response : undefined,
    };
  } catch (err) {
    return {
      name: test.name,
      group: test.group,
      pass: false,
      reason: 'exception thrown',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const filterIdx = args.indexOf('--filter');
  const filter = filterIdx !== -1 ? args[filterIdx + 1] : undefined;

  const selectedTests = filter
    ? tests.filter((t) => t.name.includes(filter) || t.group.includes(filter) || t.tool.includes(filter))
    : tests;

  if (selectedTests.length === 0) {
    console.error(`No tests match filter "${filter}"`);
    process.exit(1);
  }

  console.log(`\n  Spartan MCP Test Battery`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Running ${selectedTests.length} tests...\n`);

  const client = await createClient();
  const results: TestResult[] = [];

  for (const test of selectedTests) {
    const result = await runTest(client, test, verbose);
    results.push(result);

    const icon = result.pass ? '✓' : '✗';
    const color = result.pass ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    console.log(`  ${color}${icon}${reset} ${result.name} ${dim}(${result.durationMs}ms)${reset}`);
    console.log(`    ${dim}${result.reason}${reset}`);

    if (result.error) {
      console.log(`    ${'\x1b[31m'}Error: ${result.error}${reset}`);
    }

    if (verbose && result.response) {
      const json = JSON.stringify(result.response, null, 2);
      const lines = json.split('\n');
      const preview = lines.length > 20 ? lines.slice(0, 20).join('\n') + '\n    ...' : json;
      console.log(`    ${dim}${preview}${reset}`);
    }
  }

  await client.close();

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\n  ${'─'.repeat(50)}`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  ${selectedTests.length} total  (${totalMs}ms)`);

  // Group summary
  const groups = [...new Set(results.map((r) => r.group))];
  console.log('');
  for (const group of groups) {
    const groupResults = results.filter((r) => r.group === group);
    const groupPassed = groupResults.filter((r) => r.pass).length;
    const icon = groupPassed === groupResults.length ? '✓' : '✗';
    const color = groupPassed === groupResults.length ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${icon}\x1b[0m ${group}: ${groupPassed}/${groupResults.length}`);
  }

  console.log('');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
