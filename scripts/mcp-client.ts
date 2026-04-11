#!/usr/bin/env tsx

/**
 * MCP Test Client — connects to the spartan-ng-mcp server via stdio
 * and calls any tool by name with JSON arguments from the CLI.
 *
 * Usage:
 *   tsx scripts/mcp-client.ts                              # list all tools
 *   tsx scripts/mcp-client.ts spartan_search '{"query":"dialog"}'
 *   tsx scripts/mcp-client.ts spartan_view '{"component":"dialog"}'
 *   tsx scripts/mcp-client.ts spartan_list
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, '..', 'dist', 'index.js');

async function main(): Promise<void> {
  const [toolName, argsJson] = process.argv.slice(2);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverEntry],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: 'spartan-test-client', version: '1.0.0' });
  await client.connect(transport);

  try {
    if (!toolName) {
      const { tools } = await client.listTools();
      console.log(`\n  Available tools (${tools.length}):\n`);
      for (const tool of tools) {
        console.log(`  - ${tool.name}`);
        if (tool.description) {
          console.log(`    ${tool.description.split('\n')[0]}`);
        }
      }
      console.log(
        '\n  Usage: tsx scripts/mcp-client.ts <tool> [\'{"arg":"value"}\']\n',
      );
      return;
    }

    const args = argsJson ? JSON.parse(argsJson) : {};
    console.log(`\n  Calling ${toolName}(${JSON.stringify(args)})...\n`);

    const result = await client.callTool({ name: toolName, arguments: args });

    for (const content of result.content as Array<{ type: string; text?: string }>) {
      if (content.type === 'text' && content.text) {
        console.log(content.text);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
