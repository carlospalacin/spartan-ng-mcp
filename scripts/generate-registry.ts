#!/usr/bin/env tsx

/**
 * Registry Generator — fetches component data from Spartan's Analog API
 * and produces a static registry.json committed with the MCP.
 *
 * Usage: npm run generate-registry
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

const ANALOG_API_URL = "https://www.spartan.ng/api/_analog/pages/(components)/components";

// Known blocks (from v1, hardcoded until GitHub client is available)
const KNOWN_BLOCKS: Record<string, string[]> = {
  sidebar: ["sidebar-sticky-header", "sidebar-inset"],
  login: ["login-simple-reactive-form", "login-two-column-reactive-form"],
  signup: ["signup-simple-reactive-form", "signup-two-column-reactive-form"],
  calendar: [
    "calendar-simple",
    "calendar-multi",
    "calendar-date-picker",
    "calendar-date-picker-with-button",
    "calendar-date-picker-multi",
    "calendar-date-picker-range",
    "calendar-disabled-days",
    "calendar-disabled-weekends",
    "calendar-date-time-picker",
    "calendar-month-year-dropdown",
    "calendar-localized",
  ],
};

const BLOCK_GITHUB_PATHS: Record<string, string> = {
  sidebar: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  login: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  signup: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  calendar: "apps/app/src/app/pages/(blocks)/blocks/calendar",
};

const DOCUMENTATION_TOPICS = [
  "installation",
  "cli",
  "theming",
  "dark-mode",
  "typography",
  "figma",
  "changelog",
];

// Components that are Helm-only (no Brain package)
const HELM_ONLY = new Set([
  "alert",
  "aspect-ratio",
  "badge",
  "breadcrumb",
  "button-group",
  "card",
  "carousel",
  "context-menu",
  "data-table",
  "date-picker",
  "dropdown-menu",
  "empty",
  "icon",
  "input-group",
  "item",
  "kbd",
  "menubar",
  "native-select",
  "pagination",
  "scroll-area",
  "sidebar",
  "skeleton",
  "spinner",
  "table",
  "typography",
]);

// Components that use CDK directly instead of Brain
const CDK_BASED = new Set(["dropdown-menu", "context-menu", "menubar"]);

// Category mapping
function categorize(name: string): string {
  const categories: Record<string, string[]> = {
    form: [
      "input",
      "textarea",
      "select",
      "native-select",
      "checkbox",
      "radio-group",
      "switch",
      "slider",
      "combobox",
      "autocomplete",
      "input-otp",
      "input-group",
      "field",
      "form-field",
      "label",
      "calendar",
      "date-picker",
    ],
    action: ["button", "button-group", "toggle", "toggle-group"],
    layout: [
      "card",
      "separator",
      "resizable",
      "scroll-area",
      "aspect-ratio",
      "accordion",
      "collapsible",
    ],
    overlay: ["dialog", "alert-dialog", "sheet", "popover", "tooltip", "hover-card"],
    menu: ["dropdown-menu", "context-menu", "menubar", "command"],
    navigation: ["navigation-menu", "tabs", "breadcrumb", "pagination", "sidebar"],
    "data-display": ["avatar", "badge", "table", "data-table", "carousel", "item"],
    feedback: ["alert", "progress", "skeleton", "spinner", "sonner", "empty"],
    typography: ["icon", "kbd", "typography"],
  };

  for (const [cat, names] of Object.entries(categories)) {
    if (names.includes(name)) return cat;
  }
  return "misc";
}

interface AnalogAPIData {
  docsData: Record<
    string,
    { brain?: Record<string, { selector: string }>; helm?: Record<string, { selector: string }> }
  >;
  primitivesData: Record<string, unknown>;
  manualInstallSnippets: Record<string, unknown>;
}

async function main() {
  console.log("Fetching from Spartan Analog API...");

  const response = await fetch(ANALOG_API_URL, {
    headers: {
      "User-Agent": "spartan-ng-mcp/2.0 registry-generator",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Analog API returned ${response.status}`);
  }

  const data = (await response.json()) as AnalogAPIData;

  if (!data.docsData || !data.primitivesData) {
    throw new Error("Unexpected API response shape");
  }

  const componentNames = Object.keys(data.docsData).sort();
  console.log(`Found ${componentNames.length} components in Analog API`);

  // Build component entries
  const components: Record<string, unknown> = {};

  for (const name of componentNames) {
    const docs = data.docsData[name];
    const brainDirectives = docs?.brain ? Object.keys(docs.brain) : [];
    const helmComponents = docs?.helm ? Object.keys(docs.helm) : [];
    const hasBrain = brainDirectives.length > 0 && !HELM_ONLY.has(name);
    const hasHelm = helmComponents.length > 0 || HELM_ONLY.has(name);

    const peerDeps: string[] = ["@angular/cdk"];
    if (CDK_BASED.has(name)) {
      peerDeps.push("@angular/cdk/menu");
    }

    components[name] = {
      name,
      brainAvailable: hasBrain,
      helmAvailable: hasHelm,
      brainPackage: `@spartan-ng/brain/${name}`,
      helmPackage: `@spartan-ng/helm/${name}`,
      brainDirectives,
      helmComponents,
      category: categorize(name),
      peerDependencies: peerDeps,
      url: `https://www.spartan.ng/components/${name}`,
    };
  }

  // Build block entries
  const blocks: Record<string, unknown> = {};

  for (const [category, variants] of Object.entries(KNOWN_BLOCKS)) {
    for (const variant of variants) {
      const key = `${category}/${variant}`;
      blocks[key] = {
        category,
        variant,
        githubPath: `${BLOCK_GITHUB_PATHS[category]}/${variant}`,
        spartanImports: [], // Will be populated when GitHub client is available
      };
    }
  }

  // Read package version
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"));

  const registry = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    spartanVersion: "latest",
    components,
    blocks,
    docs: DOCUMENTATION_TOPICS,
  };

  const outputPath = join(PROJECT_ROOT, "src", "registry", "registry.json");
  writeFileSync(outputPath, JSON.stringify(registry, null, 2), "utf-8");

  console.log(`\nRegistry generated:`);
  console.log(`  Components: ${Object.keys(components).length}`);
  console.log(`  Blocks: ${Object.keys(blocks).length}`);
  console.log(`  Docs: ${DOCUMENTATION_TOPICS.length}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Registry generation failed:", err);
  process.exit(1);
});
