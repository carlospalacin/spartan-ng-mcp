import { z } from "zod";
import type { CacheManager } from "../cache/cache-manager.js";
import type { AnalogApiClient } from "../data/analog-api.js";
import { componentNotFound } from "../errors/errors.js";
import type { RegistryLoader } from "../registry/registry.js";
import type { ToolDefinition } from "../server.js";

// Known dependency relationships between Spartan components
// Built from analysis of the spartan-ng/spartan repo
const COMPONENT_DEPENDENCIES: Record<string, string[]> = {
  "alert-dialog": ["button"],
  autocomplete: ["input", "popover"],
  "button-group": ["button"],
  calendar: ["button"],
  carousel: ["button"],
  combobox: ["input", "popover", "command"],
  command: ["input", "separator"],
  "context-menu": ["separator"],
  "data-table": ["table", "button", "checkbox", "select", "input"],
  "date-picker": ["calendar", "popover", "button", "input"],
  dialog: ["button"],
  "dropdown-menu": ["separator"],
  field: ["label"],
  "form-field": ["label", "field"],
  "input-group": ["input"],
  menubar: ["separator"],
  "navigation-menu": ["button"],
  pagination: ["button"],
  select: ["label"],
  sheet: ["button"],
  sidebar: ["separator", "tooltip", "button", "sheet"],
  sonner: ["button"],
  table: ["checkbox"],
};

export function createDependencyTools(
  registry: RegistryLoader,
  cacheManager: CacheManager,
  analogApi: AnalogApiClient,
): ToolDefinition[] {
  return [
    {
      name: "spartan_dependencies",
      title: "Component Dependency Graph",
      description:
        "Show the dependency graph for a Spartan component. Returns direct dependencies (which components it needs), transitive dependencies (up to configurable depth), and reverse dependencies (which components depend on it).",
      inputSchema: {
        name: z.string().min(1).describe("Component name (e.g. 'dialog', 'sidebar')"),
        depth: z
          .number()
          .min(1)
          .max(3)
          .default(1)
          .describe("Traversal depth for transitive dependencies (1-3)"),
      },
      handler: async (args: { name: string; depth?: number }) => {
        const name = args.name.trim().toLowerCase();
        const comp = registry.getComponent(name);
        if (!comp) throw componentNotFound(name);

        const depth = args.depth ?? 1;

        // Direct dependencies
        const directDeps = COMPONENT_DEPENDENCIES[name] ?? [];

        // Transitive dependencies (BFS)
        const transitive = new Set<string>();
        let frontier = [...directDeps];
        for (let d = 1; d < depth; d++) {
          const nextFrontier: string[] = [];
          for (const dep of frontier) {
            const subDeps = COMPONENT_DEPENDENCIES[dep] ?? [];
            for (const sub of subDeps) {
              if (!transitive.has(sub) && sub !== name && !directDeps.includes(sub)) {
                transitive.add(sub);
                nextFrontier.push(sub);
              }
            }
          }
          frontier = nextFrontier;
        }

        // Reverse dependencies (who depends on me)
        const dependents: string[] = [];
        for (const [compName, deps] of Object.entries(COMPONENT_DEPENDENCIES)) {
          if (deps.includes(name)) {
            dependents.push(compName);
          }
        }

        // Enrich with registry data
        const enrichDep = (depName: string) => {
          const depComp = registry.getComponent(depName);
          return {
            name: depName,
            category: depComp?.category ?? "unknown",
            brainPackage: depComp?.brainPackage ?? `@spartan-ng/brain/${depName}`,
            helmPackage: depComp?.helmPackage ?? `@spartan-ng/helm/${depName}`,
          };
        };

        const result = {
          component: name,
          category: comp.category,
          directDependencies: directDeps.map(enrichDep),
          directDependencyCount: directDeps.length,
          transitiveDependencies: depth > 1 ? [...transitive].sort().map(enrichDep) : [],
          transitiveDependencyCount: transitive.size,
          dependents: dependents.sort().map(enrichDep),
          dependentCount: dependents.length,
          depth,
          note:
            directDeps.length === 0 && dependents.length === 0
              ? `${name} has no known dependencies or dependents.`
              : undefined,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      },
    },
  ];
}
