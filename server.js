#!/usr/bin/env node
//@ts-check

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerComponentTools } from "./tools/components.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerHealthTools } from "./tools/health.js";
import { registerMetaTools } from "./tools/meta.js";
import { registerSearchTools } from "./tools/search.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerBlockTools } from "./tools/blocks.js";
import { registerResourceHandlers } from "./tools/resources.js";
import { registerPromptHandlers } from "./tools/prompts.js";
import { registerCacheTools } from "./tools/cache-tools.js";

const server = new McpServer({
  name: "spartan-ng-mcp",
  version: "2.0.0",
  description:
    "MCP server exposing Spartan Angular UI components, blocks, and documentation. " +
    "Provides structured API data, source code from GitHub, and page-level building blocks.",
});

// Register tool modules
registerComponentTools(server);
registerDocsTools(server);
registerHealthTools(server);
registerMetaTools(server);
registerSearchTools(server);
registerAnalysisTools(server);
registerBlockTools(server);
registerCacheTools(server);

// Register resource handlers
registerResourceHandlers(server);

// Register prompt handlers
registerPromptHandlers(server);

const transport = new StdioServerTransport();

await server.connect(transport);
