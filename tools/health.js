//@ts-check
import { z } from "zod";
import { SPARTAN_COMPONENTS_BASE, SPARTAN_DOCS_BASE } from "./utils.js";

export function registerHealthTools(server) {
  // Availability check (not CLI)
  server.registerTool(
    "spartan_health_check",
    {
      title: "Spartan pages availability check",
      description:
        "Check availability and response times for selected Spartan docs and component pages. Note: this is NOT the Spartan CLI health check.",
      inputSchema: {
        topics: z
          .array(
            z.enum([
              "installation",
              "theming",
              "dark-mode",
              "typography",
              "health-checks",
              "update-guide",
              "cli",
              "components-json",
              "version-support",
              "figma",
              "changelog",
              "about",
            ]),
          )
          .optional()
          .describe(
            "Docs topics to check; defaults to a small representative set.",
          ),
        components: z
          .array(z.string())
          .optional()
          .describe(
            "Component names to check; defaults to a small representative set.",
          ),
      },
    },
    async (args) => {
      const topics =
        args.topics && Array.isArray(args.topics)
          ? args.topics
          : ["installation", "theming", "dark-mode", "cli"];
      const components =
        args.components && Array.isArray(args.components)
          ? args.components
          : ["accordion", "button", "table", "form-field"];
      const checks = [];
      const checkUrl = async (label, url) => {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "spartan-ng-mcp/2.0" },
            signal: controller.signal,
          });
          const ok = res.ok;
          const status = res.status;
          const ms = Date.now() - start;
          checks.push({ label, url, ok, status, ms });
        } catch (err) {
          const ms = Date.now() - start;
          checks.push({
            label,
            url,
            ok: false,
            status: 0,
            ms,
            error:
              err.name === "AbortError"
                ? "Request timed out"
                : "Request failed",
          });
        } finally {
          clearTimeout(timeout);
        }
      };
      for (const t of topics) {
        const url = `${SPARTAN_DOCS_BASE}/${encodeURIComponent(t)}`;
        await checkUrl(`doc:${t}`, url);
      }
      for (const c of components) {
        const url = `${SPARTAN_COMPONENTS_BASE}/${encodeURIComponent(c)}`;
        await checkUrl(`component:${c}`, url);
      }
      const summary = {
        timestamp: new Date().toISOString(),
        totals: {
          count: checks.length,
          ok: checks.filter((x) => x.ok).length,
          fail: checks.filter((x) => !x.ok).length,
        },
        checks,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  // Official instructions per docs
  server.registerTool(
    "spartan_health_instructions",
    {
      title: "Spartan CLI health check instructions",
      description:
        "Return official instructions and commands for running the Spartan CLI health check in Angular CLI or Nx workspaces.",
      inputSchema: {},
    },
    async () => {
      const summary =
        "Run the Spartan CLI health check to scan your project and auto-fix common issues. Use Angular CLI or Nx commands in your project root.";
      const payload = {
        summary,
        prerequisites: [
          "Install Spartan CLI as a dev dependency: npm i -D @spartan-ng/cli",
          "Ensure your workspace uses Angular CLI or Nx",
        ],
        angular_cli_command: "ng g @spartan-ng/cli:healthcheck",
        nx_command: "nx g @spartan-ng/cli:healthcheck",
        source: `${SPARTAN_DOCS_BASE}/health-checks`,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  // Command builder for ng/nx with optional --dry-run
  server.registerTool(
    "spartan_health_command",
    {
      title: "Build Spartan health check command",
      description:
        "Return the exact command to run the Spartan health check for Angular CLI or Nx. Optionally append --dry-run.",
      inputSchema: {
        tool: z
          .enum(["ng", "nx"])
          .describe("Which toolchain to use: Angular CLI (ng) or Nx (nx)."),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Append --dry-run to preview changes."),
      },
    },
    async (args) => {
      const tool = /** @type {"ng"|"nx"} */ (args.tool);
      const dryRun = Boolean(args.dryRun);
      const base =
        tool === "ng"
          ? "npx ng g @spartan-ng/cli:healthcheck"
          : "npx nx g @spartan-ng/cli:healthcheck";
      const command = dryRun ? `${base} --dry-run` : base;
      return { content: [{ type: "text", text: command }] };
    },
  );
}
