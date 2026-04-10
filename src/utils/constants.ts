export const SPARTAN_DOCS_BASE = "https://www.spartan.ng/documentation";
export const SPARTAN_COMPONENTS_BASE = "https://www.spartan.ng/components";
export const SPARTAN_BLOCKS_BASE = "https://www.spartan.ng/blocks";
export const SPARTAN_ANALOG_API_URL =
  "https://www.spartan.ng/api/_analog/pages/(components)/components";

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
export const SPARTAN_REPO = "spartan-ng/spartan";
export const SPARTAN_REPO_BRANCH = "main";

export const ALLOWED_HOSTS = [
  "www.spartan.ng",
  "spartan.ng",
  "api.github.com",
  "raw.githubusercontent.com",
];

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (in-memory)
export const DEFAULT_CACHE_TTL_HOURS = 24; // 24 hours (file-based)
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000; // 15 seconds
export const ANALOG_API_TIMEOUT_MS = 30_000; // 30 seconds (larger payload)

export const DOCUMENTATION_TOPICS = [
  "installation",
  "cli",
  "theming",
  "dark-mode",
  "typography",
  "figma",
  "changelog",
] as const;

export type DocumentationTopic = (typeof DOCUMENTATION_TOPICS)[number];
