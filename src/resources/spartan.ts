import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CacheManager } from "../cache/cache-manager.js";
import type { AnalogApiClient } from "../data/analog-api.js";
import type { RegistryLoader } from "../registry/registry.js";

export function registerResourceHandlers(
  server: McpServer,
  registry: RegistryLoader,
  cacheManager: CacheManager,
  analogApi: AnalogApiClient,
): void {
  // spartan://components/list (static URI — no variables)
  server.resource(
    "Component List",
    "spartan://components/list",
    {
      description: "List all Spartan components with Brain/Helm availability",
      mimeType: "application/json",
    },
    async () => {
      const components = registry.listComponents().map((c) => ({
        name: c.name,
        category: c.category,
        brainAvailable: c.brainAvailable,
        helmAvailable: c.helmAvailable,
        brainPackage: c.brainPackage,
        helmPackage: c.helmPackage,
        url: c.url,
      }));

      return {
        contents: [
          {
            uri: "spartan://components/list",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                componentCount: components.length,
                components,
                registryVersion: registry.getVersion(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // spartan://component/{name}/api (template URI)
  server.resource(
    "Component API Documentation",
    new ResourceTemplate("spartan://component/{name}/api", { list: undefined }),
    {
      description: "Brain & Helm API specs for a component",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = String(Array.isArray(variables.name) ? variables.name[0] : variables.name);

      const componentData = await cacheManager.get("components", name, () =>
        analogApi.getComponent(name),
      );
      const comp = registry.getComponent(name);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                name: componentData.name,
                url: componentData.url,
                category: comp?.category,
                brainAPI: componentData.brainAPI,
                helmAPI: componentData.helmAPI,
                brainCount: componentData.brainCount,
                helmCount: componentData.helmCount,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // spartan://component/{name}/examples (template URI)
  server.resource(
    "Component Examples",
    new ResourceTemplate("spartan://component/{name}/examples", { list: undefined }),
    {
      description: "Code examples for a component",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = String(Array.isArray(variables.name) ? variables.name[0] : variables.name);

      const componentData = await cacheManager.get("components", name, () =>
        analogApi.getComponent(name),
      );

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                name: componentData.name,
                examples: componentData.examples,
                exampleCount: componentData.examples.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // spartan://blocks/list (static URI)
  server.resource(
    "Block List",
    "spartan://blocks/list",
    {
      description: "List all Spartan page-level blocks by category",
      mimeType: "application/json",
    },
    async () => {
      const blocks = registry.listBlocks();
      const grouped: Record<string, string[]> = {};
      for (const b of blocks) {
        if (!grouped[b.category]) grouped[b.category] = [];
        grouped[b.category].push(b.variant);
      }

      return {
        contents: [
          {
            uri: "spartan://blocks/list",
            mimeType: "application/json",
            text: JSON.stringify({ blockCount: blocks.length, categories: grouped }, null, 2),
          },
        ],
      };
    },
  );

  // spartan://project/info (static URI)
  server.resource(
    "Project Information",
    "spartan://project/info",
    {
      description: "Basic registry information",
      mimeType: "application/json",
    },
    async () => {
      return {
        contents: [
          {
            uri: "spartan://project/info",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                registryVersion: registry.getVersion(),
                spartanVersion: registry.getSpartanVersion(),
                generatedAt: registry.getGeneratedAt(),
                componentCount: registry.getComponentCount(),
                blockCount: registry.getBlockCount(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
