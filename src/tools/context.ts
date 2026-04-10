import { z } from "zod";
import { detectProject } from "../project/detector.js";
import type { RegistryLoader } from "../registry/registry.js";
import type { ToolDefinition } from "../server.js";

export function createContextTools(registry: RegistryLoader): ToolDefinition[] {
  return [
    {
      name: "spartan_project_info",
      title: "Detect Project Configuration",
      description:
        "Detect the Angular/Nx project configuration in the current directory. Returns Angular version, Nx workspace info, Tailwind version, installed Spartan packages, package manager, and zoneless mode status.",
      inputSchema: {
        cwd: z
          .string()
          .optional()
          .describe("Working directory to scan (defaults to process.cwd())"),
      },
      handler: async (args: { cwd?: string }) => {
        const context = await detectProject(args.cwd);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      },
    },
    {
      name: "spartan_project_components",
      title: "List Installed Spartan Components",
      description:
        "List Spartan components installed in the current project. Shows Brain/Helm packages with versions and identifies missing pairs (Brain without Helm or vice versa).",
      inputSchema: {
        cwd: z.string().optional().describe("Working directory to scan"),
      },
      handler: async (args: { cwd?: string }) => {
        const context = await detectProject(args.cwd);

        // Cross-reference with registry for full info
        const installed = context.installedBrainPackages
          .concat(context.installedHelmPackages)
          .map((pkg) => {
            const parts = pkg.split("/");
            const name = parts[2] ?? parts[1];
            const layer = pkg.includes("/brain") ? "brain" : "helm";
            const regComponent = registry.getComponent(name);
            return {
              package: pkg,
              name,
              layer,
              category: regComponent?.category ?? "unknown",
            };
          });

        const result = {
          brainPackages: context.installedBrainPackages,
          helmPackages: context.installedHelmPackages,
          brainCount: context.installedBrainPackages.length,
          helmCount: context.installedHelmPackages.length,
          installed,
          missingPairs: context.missingPairs,
          hasMissingPairs:
            context.missingPairs.brainWithoutHelm.length > 0 ||
            context.missingPairs.helmWithoutBrain.length > 0,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },
  ];
}
