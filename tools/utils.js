//@ts-check
// Base URLs for Spartan UI docs
export const SPARTAN_DOCS_BASE = "https://www.spartan.ng/documentation";
export const SPARTAN_COMPONENTS_BASE = "https://www.spartan.ng/components";

/**
 * Known Spartan components (from docs navigation). Keep this list updated.
 * Some entries may be marked as "soon" on the site.
 */
export const KNOWN_COMPONENTS = [
  "accordion",
  "alert",
  "alert-dialog",
  "aspect-ratio",
  "autocomplete",
  "avatar",
  "badge",
  "breadcrumb",
  "button",
  "button-group",
  "calendar",
  "card",
  "carousel",
  "checkbox",
  "collapsible",
  "combobox",
  "command",
  "context-menu",
  "data-table",
  "date-picker",
  "dialog",
  "dropdown-menu",
  "empty",
  "field",
  "form-field",
  "hover-card",
  "icon",
  "input",
  "input-group",
  "input-otp",
  "item",
  "kbd",
  "label",
  "menubar",
  "native-select",
  "navigation-menu",
  "pagination",
  "popover",
  "progress",
  "radio-group",
  "resizable",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "sidebar",
  "skeleton",
  "slider",
  "sonner",
  "spinner",
  "switch",
  "table",
  "tabs",
  "textarea",
  "toggle",
  "toggle-group",
  "tooltip",
];

/**
 * Known Spartan UI block categories and their variants.
 * Blocks are page-level building blocks (complete Angular components).
 * Source code lives on GitHub — blocks have no API docs page on the website.
 */
export const KNOWN_BLOCKS = {
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

/** All block category names */
export const BLOCK_CATEGORIES =
  /** @type {Array<keyof typeof KNOWN_BLOCKS>} */ (Object.keys(KNOWN_BLOCKS));

/**
 * GitHub paths for block source code in the spartan-ng/spartan repo.
 * sidebar/login/signup live under blocks-preview, calendar under blocks.
 */
export const BLOCK_GITHUB_PATHS = {
  sidebar: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  login: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  signup: "apps/app/src/app/pages/(blocks-preview)/blocks-preview",
  calendar: "apps/app/src/app/pages/(blocks)/blocks/calendar",
};

/** GitHub path for shared block utilities (sidebar nav components, data, etc.) */
export const BLOCK_SHARED_PATH =
  "apps/app/src/app/pages/(blocks-preview)/blocks-preview/shared";

/**
 * Canonical component dependency graph from spartan-ng/cli.
 * Source: libs/cli/src/generators/ui/primitive-deps.ts
 * @type {Record<string, string[]>}
 */
export const COMPONENT_DEPENDENCIES = {
  accordion: ["utils", "icon"],
  alert: ["utils", "icon"],
  "alert-dialog": ["utils", "button"],
  "aspect-ratio": ["utils"],
  autocomplete: ["utils", "popover", "icon", "input-group"],
  avatar: ["utils"],
  badge: ["utils"],
  breadcrumb: ["utils", "icon"],
  button: ["utils"],
  "button-group": ["utils", "button"],
  calendar: ["utils", "button", "icon", "select"],
  card: ["utils"],
  carousel: ["utils", "button", "icon"],
  checkbox: ["utils", "icon"],
  collapsible: ["utils"],
  combobox: ["utils", "input-group", "button", "icon"],
  command: ["utils", "button", "icon"],
  "context-menu": ["utils", "dropdown-menu"],
  "data-table": [
    "utils",
    "table",
    "button",
    "checkbox",
    "icon",
    "select",
    "input",
  ],
  "date-picker": ["utils", "calendar", "icon", "popover"],
  dialog: ["utils", "icon"],
  "dropdown-menu": ["utils", "icon"],
  empty: ["utils"],
  field: ["utils", "label", "separator"],
  "form-field": ["utils"],
  "hover-card": ["utils"],
  icon: [],
  input: ["utils"],
  "input-group": ["utils", "button", "input", "textarea"],
  "input-otp": ["utils", "icon"],
  item: ["utils", "separator"],
  kbd: ["utils"],
  label: ["utils"],
  menubar: ["utils", "dropdown-menu"],
  "native-select": ["utils", "icon"],
  "navigation-menu": ["utils"],
  pagination: ["utils", "button", "icon", "select"],
  popover: ["utils"],
  progress: ["utils"],
  "radio-group": ["utils"],
  resizable: ["utils"],
  "scroll-area": ["utils"],
  select: ["utils", "icon"],
  separator: ["utils"],
  sheet: ["utils", "icon", "button"],
  sidebar: [
    "utils",
    "button",
    "icon",
    "input",
    "separator",
    "sheet",
    "skeleton",
    "tooltip",
  ],
  skeleton: ["utils"],
  slider: ["utils"],
  sonner: ["utils"],
  spinner: ["utils"],
  switch: ["utils"],
  table: ["utils"],
  tabs: ["utils", "icon"],
  textarea: ["utils"],
  toggle: ["utils"],
  "toggle-group": ["utils", "toggle"],
  tooltip: [],
};

/**
 * Spartan Analog API — returns structured JSON for ALL components in one request.
 * This is the primary data source, far superior to HTML scraping.
 */
const SPARTAN_API_URL =
  "https://www.spartan.ng/api/_analog/pages/(components)/components";

/**
 * @typedef {Object} SpartanDirectiveInfo
 * @property {string} file - Source file path
 * @property {string} selector - CSS selector
 * @property {Array<{name: string, type: string, description: string, defaultValue: string|null, required: boolean}>} inputs
 * @property {Array<{name: string, type: string, description: string}>} outputs
 * @property {Array<{name: string, type: string, description: string, defaultValue: string}>} models
 * @property {string} [exportAs]
 */

/**
 * @typedef {Object} SpartanAPIData
 * @property {Record<string, {brain: Record<string, SpartanDirectiveInfo>, helm: Record<string, SpartanDirectiveInfo>}>} docsData
 * @property {Record<string, Record<string, string>>} primitivesData
 * @property {Record<string, Record<string, string>>} manualInstallSnippets
 */

/** Cached Analog API data (heavy — loaded once, shared across tools) */
let _spartanAPICache = /** @type {SpartanAPIData|null} */ (null);
let _spartanAPICacheTimestamp = 0;
const SPARTAN_API_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch the complete Spartan component API data from the Analog endpoint.
 * Returns structured JSON with docsData, primitivesData, and manualInstallSnippets
 * for ALL components in a single request.
 *
 * @param {boolean} [noCache=false]
 * @returns {Promise<SpartanAPIData>}
 */
export async function fetchSpartanAPI(noCache = false) {
  const now = Date.now();
  if (
    !noCache &&
    _spartanAPICache &&
    now - _spartanAPICacheTimestamp < SPARTAN_API_CACHE_TTL_MS
  ) {
    return _spartanAPICache;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s for large payload

  try {
    const res = await fetch(SPARTAN_API_URL, {
      headers: {
        "User-Agent": "spartan-ng-mcp/2.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Spartan API returned ${res.status}`);
    }

    const data = /** @type {SpartanAPIData} */ (await res.json());

    // Validate basic structure
    if (!data.docsData || !data.primitivesData) {
      throw new Error("Spartan API response missing expected fields");
    }

    _spartanAPICache = data;
    _spartanAPICacheTimestamp = now;
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get structured API data for a specific component from the Analog API.
 * Returns brain/helm directives with selectors, inputs, outputs, and code examples.
 *
 * @param {string} componentName
 * @param {boolean} [noCache=false]
 */
export async function getComponentAPI(componentName, noCache = false) {
  const api = await fetchSpartanAPI(noCache);
  const docs = api.docsData[componentName];
  const examples = api.primitivesData[componentName];
  const installSnippets = api.manualInstallSnippets?.[componentName];

  if (!docs) {
    return null;
  }

  // Transform to a clean structure
  const brainAPI = Object.entries(docs.brain || {}).map(([name, info]) => ({
    name,
    selector: info.selector,
    file: info.file,
    exportAs: info.exportAs || null,
    inputs: info.inputs || [],
    outputs: info.outputs || [],
    models: info.models || [],
  }));

  const helmAPI = Object.entries(docs.helm || {}).map(([name, info]) => ({
    name,
    selector: info.selector,
    file: info.file,
    exportAs: info.exportAs || null,
    inputs: info.inputs || [],
    outputs: info.outputs || [],
    models: info.models || [],
  }));

  const codeExamples = examples
    ? Object.entries(examples).map(([variant, code]) => ({
        variant,
        code,
        language: "typescript",
      }))
    : [];

  return {
    component: componentName,
    brainAPI,
    helmAPI,
    examples: codeExamples,
    installSnippets: installSnippets || null,
    brainCount: brainAPI.length,
    helmCount: helmAPI.length,
    exampleCount: codeExamples.length,
  };
}

/**
 * Minimal HTML -> text converter for callers that want plain text.
 * This is not a full HTML sanitizer. It strips tags and decodes basic entities.
 * @param {string} html
 */
export function htmlToText(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const withBreaks = withoutStyles
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|pre)>/gi, "\n")
    .replace(/<(br|hr)\s*\/>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Simple in-memory cache for fetched pages with size limit.
 */
const responseCache = new Map();
const MAX_CACHE_ENTRIES = 200;

/** Allowed hostnames for outbound requests (SSRF protection) */
const ALLOWED_HOSTS = ["www.spartan.ng", "spartan.ng", "dev.to"];

/** Default fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = Number(process.env.SPARTAN_FETCH_TIMEOUT_MS || 15000);

/**
 * Fetch a URL and return HTML or text with basic caching.
 * @param {string} url
 * @param {"html"|"text"} format
 * @param {boolean} noCache
 */
export async function fetchContent(url, format = "html", noCache = false) {
  // Validate URL against allowlist to prevent SSRF
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL provided");
  }
  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    throw new Error(
      `Blocked request to disallowed host: ${parsedUrl.hostname}`,
    );
  }

  const ttlMs = Number(process.env.SPARTAN_CACHE_TTL_MS || 5 * 60 * 1000);
  const cacheKey = `${url}::${format}`;
  const now = Date.now();
  if (!noCache && responseCache.has(cacheKey)) {
    const entry = responseCache.get(cacheKey);
    if (now - entry.timestampMs < ttlMs) {
      return entry.content;
    }
    responseCache.delete(cacheKey);
  }

  // Fetch with timeout via AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "spartan-ng-mcp/2.0" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Fetch failed with status ${res.status}`);
    }
    const html = await res.text();
    const result = format === "text" ? htmlToText(html) : html;
    if (!noCache) {
      // Evict oldest entries if cache is full
      if (responseCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
      }
      responseCache.set(cacheKey, { content: result, timestampMs: now });
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract code blocks from HTML and return as an array of strings.
 * Filters out single-line snippets and very short code blocks.
 * @param {string} html
 */
export function extractCodeBlocks(html) {
  const blocks = [];
  const preCodeRegex = /<pre[^>]*><code[^>]*>[\s\S]*?<\/code><\/pre>/gi;
  const codeRegex = /<code[^>]*>[\s\S]*?<\/code>/gi;

  const pushMatchText = (s) => {
    const inner = s.replace(/^<[^>]+>/, "").replace(/<[^>]+>$/, "");
    const code = htmlToText(inner);

    // Filter out short, insignificant code snippets
    const lines = code.split("\n").filter((line) => line.trim().length > 0);

    // Skip single-line imports
    if (lines.length === 1 && code.includes("import")) {
      return;
    }

    // Only include code blocks that have more than 2 lines of actual code
    // This filters out selectors, single imports, and other tiny snippets
    if (lines.length > 2) {
      blocks.push(code);
    }
  };

  let match;
  while ((match = preCodeRegex.exec(html)) !== null) pushMatchText(match[0]);
  while ((match = codeRegex.exec(html)) !== null) pushMatchText(match[0]);
  return blocks;
}

/**
 * Extract headings (h1-h3) and return as plain text in order.
 * @param {string} html
 */
export function extractHeadings(html) {
  const regex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings = [];
  let match;
  while ((match = regex.exec(html)) !== null)
    headings.push(htmlToText(match[2]));
  return headings;
}

/**
 * Extract links: { text, href }
 * @param {string} html
 */
export function extractLinks(html) {
  const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push({ href: match[1], text: htmlToText(match[2]) });
  }
  return links;
}

/**
 * Extract structured API information from component documentation
 * @param {string} html
 */
export function extractAPIInfo(html) {
  const apiInfo = {
    brainAPI:
      /** @type {Array<{name: string, selector: string, inputs: Array<{prop: string, type: string, default: string, description: string}>, outputs: Array<{prop: string, type: string, description: string}>}>} */ ([]),
    helmAPI:
      /** @type {Array<{name: string, selector: string, inputs: Array<{prop: string, type: string, default: string, description: string}>, outputs: Array<{prop: string, type: string, description: string}>}>} */ ([]),
    examples:
      /** @type {Array<{title: string, code: string, language: string}>} */ ([]),
  };

  try {
    // Extract only the visible documentation section, not embedded JSON
    // Look for Brain API and Helm API sections in the visible HTML
    const brainAPIMatch = html.match(
      /<h[1-6][^>]*>Brain API<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>(?:Helm API|On this page|$)|$)/i,
    );
    const helmAPIMatch = html.match(
      /<h[1-6][^>]*>Helm API<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>(?:On this page|$)|$)/i,
    );

    // Parse Brain API section
    if (brainAPIMatch) {
      const brainSection = brainAPIMatch[1];
      const brainComponents = extractAPIComponents(brainSection);
      apiInfo.brainAPI = brainComponents;
    }

    // Parse Helm API section
    if (helmAPIMatch) {
      const helmSection = helmAPIMatch[1];
      const helmComponents = extractAPIComponents(helmSection);
      apiInfo.helmAPI = helmComponents;
    }

    // Use extractCodeBlocks for focused code examples
    // This reuses the proven extraction logic and avoids pollution
    const codeBlocks = extractCodeBlocks(html);

    // Convert code blocks to example format with simple titles
    apiInfo.examples = codeBlocks.slice(0, 10).map((code, index) => ({
      title: `Example ${index + 1}`,
      code: code,
      language: detectLanguage(code),
    }));
  } catch (error) {
    console.error("Error extracting API info:", error);
  }

  return apiInfo;
}

/**
 * Extract API components from a section of HTML
 * @param {string} html
 */
function extractAPIComponents(html) {
  const components = [];

  // Look for component definitions with headers like "BrnAvatar" or "HlmAvatar"
  const componentRegex =
    /<h[1-6][^>]*>((Brn|Hlm)\w+)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>(?:Brn|Hlm)\w+<\/h[1-6]>|$)/gi;

  let match;
  while ((match = componentRegex.exec(html)) !== null) {
    const name = match[1];
    const content = match[3];

    // Extract selector
    const selectorMatch = content.match(/Selector:\s*([^\n<]+)/i);
    const selector = selectorMatch ? selectorMatch[1].trim() : "";

    // Extract inputs table
    const inputs = extractPropsFromTable(content, "Inputs");

    // Extract outputs table
    const outputs = extractPropsFromTable(content, "Outputs");

    components.push({
      name,
      selector,
      inputs,
      outputs,
    });
  }

  return components;
}

/**
 * Extract properties from an API table
 * @param {string} html
 * @param {string} tableType - "Inputs" or "Outputs"
 */
function extractPropsFromTable(html, tableType) {
  const props = [];

  // Look for the table section
  const tableSectionRegex = new RegExp(
    `<h[1-6][^>]*>${tableType}<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]|$)`,
    "i",
  );
  const tableSectionMatch = html.match(tableSectionRegex);

  if (!tableSectionMatch) return props;

  const tableSection = tableSectionMatch[1];

  // Extract table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  let isHeaderRow = true;

  while ((rowMatch = rowRegex.exec(tableSection)) !== null) {
    const rowContent = rowMatch[1];

    // Skip header row
    if (isHeaderRow) {
      isHeaderRow = false;
      continue;
    }

    // Extract cells
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(htmlToText(cellMatch[1]).trim());
    }

    if (cells.length >= 3) {
      if (tableType === "Inputs") {
        props.push({
          prop: cells[0],
          type: cells[1],
          default: cells[2],
          description: cells[3] || "",
        });
      } else {
        // Outputs
        props.push({
          prop: cells[0],
          type: cells[1],
          description: cells[2] || "",
        });
      }
    }
  }

  return props;
}

/**
 * Simple language detection based on code content
 * @param {string} code
 */
function detectLanguage(code) {
  if (code.includes("import") && code.includes("Component")) {
    return "typescript";
  }
  if (code.includes("import") && code.includes("from")) {
    return "javascript";
  }
  if (code.includes("<") && code.includes(">") && code.includes("hlm")) {
    return "html";
  }
  if (code.includes("npm") || code.includes("npx") || code.includes("ng ")) {
    return "bash";
  }
  return "typescript"; // default
}
