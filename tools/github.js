//@ts-check

/**
 * GitHub API client for fetching Spartan UI source code.
 *
 * This module provides authenticated access to the spartan-ng/spartan repository
 * for retrieving component source code and block templates. It maintains its own
 * in-memory cache (separate from utils.js) with a 1-hour TTL.
 *
 * Environment variables:
 * - GITHUB_TOKEN: Optional PAT for higher rate limits (5000/hr vs 60/hr unauthenticated)
 */

/** @type {string} */
export const SPARTAN_REPO = "spartan-ng/spartan";
export const SPARTAN_REPO_BRANCH = "main";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";

/** In-memory cache with 1-hour TTL */
const githubCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;

/** Rate limit tracking updated from response headers */
const rateLimitInfo = {
  limit: 60,
  remaining: 60,
  resetAt: 0,
};

/**
 * @typedef {Object} GitHubFileResult
 * @property {string} content - Decoded file content
 * @property {string} sha - Git SHA of the file
 * @property {number} size - File size in bytes
 * @property {string} path - File path in the repo
 */

/**
 * @typedef {Object} GitHubDirEntry
 * @property {string} name - File/directory name
 * @property {string} path - Full path in repo
 * @property {"file"|"dir"} type - Entry type
 * @property {number} size - Size in bytes (0 for dirs)
 * @property {string} sha - Git SHA
 */

/**
 * Build request headers for GitHub API.
 * @returns {Record<string, string>}
 */
function getHeaders() {
  const headers = {
    "User-Agent": "spartan-ng-mcp/2.0",
    Accept: "application/vnd.github.v3+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Update rate limit info from response headers.
 * @param {Response} res
 */
function updateRateLimit(res) {
  const limit = res.headers.get("x-ratelimit-limit");
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (limit) rateLimitInfo.limit = Number(limit);
  if (remaining) rateLimitInfo.remaining = Number(remaining);
  if (reset) rateLimitInfo.resetAt = Number(reset) * 1000;
}

/**
 * Get a cached value or null if expired/missing.
 * @param {string} key
 * @returns {any|null}
 */
function getCached(key) {
  const entry = githubCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestampMs > CACHE_TTL_MS) {
    githubCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store a value in the cache.
 * @param {string} key
 * @param {any} data
 */
function setCache(key, data) {
  if (githubCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = githubCache.keys().next().value;
    githubCache.delete(firstKey);
  }
  githubCache.set(key, { data, timestampMs: Date.now() });
}

/**
 * Internal fetch wrapper with timeout and rate limit checking.
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @returns {Promise<Response>}
 */
async function githubFetch(url, headers) {
  if (rateLimitInfo.remaining <= 0 && Date.now() < rateLimitInfo.resetAt) {
    const resetDate = new Date(rateLimitInfo.resetAt).toISOString();
    throw new Error(
      `GitHub API rate limit exhausted. Resets at ${resetDate}. ` +
        `Set GITHUB_TOKEN env var for 5000 req/hr.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: headers || getHeaders(),
      signal: controller.signal,
    });
    updateRateLimit(res);

    if (!res.ok) {
      if (res.status === 403 && rateLimitInfo.remaining === 0) {
        throw new Error(
          "GitHub API rate limit exceeded. Set GITHUB_TOKEN env var for higher limits.",
        );
      }
      if (res.status === 404) {
        throw new Error(`GitHub path not found: ${url}`);
      }
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a single file's content from the GitHub repository.
 * Uses the Contents API with base64 decoding.
 *
 * @param {string} filePath - Path relative to repo root (e.g., "libs/helm/button/src/index.ts")
 * @param {boolean} [noCache=false] - Bypass cache
 * @returns {Promise<GitHubFileResult>}
 */
export async function fetchGitHubFile(filePath, noCache = false) {
  const cacheKey = `file:${filePath}`;
  if (!noCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${SPARTAN_REPO}/contents/${encodeURI(filePath)}?ref=${SPARTAN_REPO_BRANCH}`;
  const res = await githubFetch(url);
  const json = await res.json();

  if (json.type !== "file") {
    throw new Error(`Expected file but got ${json.type} at ${filePath}`);
  }

  const content = Buffer.from(json.content, "base64").toString("utf-8");
  const result = {
    content,
    sha: json.sha,
    size: json.size,
    path: json.path,
  };

  if (!noCache) setCache(cacheKey, result);
  return result;
}

/**
 * List contents of a directory in the GitHub repository.
 *
 * @param {string} dirPath - Path relative to repo root
 * @param {boolean} [noCache=false] - Bypass cache
 * @returns {Promise<GitHubDirEntry[]>}
 */
export async function fetchGitHubDirectory(dirPath, noCache = false) {
  const cacheKey = `dir:${dirPath}`;
  if (!noCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const url = `${GITHUB_API_BASE}/repos/${SPARTAN_REPO}/contents/${encodeURI(dirPath)}?ref=${SPARTAN_REPO_BRANCH}`;
  const res = await githubFetch(url);
  const json = await res.json();

  if (!Array.isArray(json)) {
    throw new Error(
      `Expected directory listing but got single entry at ${dirPath}`,
    );
  }

  /** @type {GitHubDirEntry[]} */
  const entries = json.map((entry) => ({
    name: entry.name,
    path: entry.path,
    type: entry.type === "dir" ? "dir" : "file",
    size: entry.size || 0,
    sha: entry.sha,
  }));

  if (!noCache) setCache(cacheKey, entries);
  return entries;
}

/**
 * Fetch raw file content from GitHub. No base64 decoding needed.
 * Uses raw.githubusercontent.com — no API rate limit but no directory listing.
 * Good for large files or when rate limit is a concern.
 *
 * @param {string} filePath - Path relative to repo root
 * @param {boolean} [noCache=false] - Bypass cache
 * @returns {Promise<string>}
 */
export async function fetchGitHubRaw(filePath, noCache = false) {
  const cacheKey = `raw:${filePath}`;
  if (!noCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const url = `${GITHUB_RAW_BASE}/${SPARTAN_REPO}/${SPARTAN_REPO_BRANCH}/${filePath}`;
  const res = await githubFetch(url, {
    "User-Agent": "spartan-ng-mcp/2.0",
  });
  const content = await res.text();

  if (!noCache) setCache(cacheKey, content);
  return content;
}

/**
 * Fetch all TypeScript files from a directory recursively (one level deep).
 * Useful for getting all source files of a component library.
 *
 * @param {string} dirPath - Directory path in repo
 * @param {boolean} [noCache=false]
 * @returns {Promise<Array<{name: string, path: string, content: string}>>}
 */
export async function fetchGitHubDirectoryFiles(dirPath, noCache = false) {
  const cacheKey = `dirfiles:${dirPath}`;
  if (!noCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const entries = await fetchGitHubDirectory(dirPath, noCache);
  const tsFiles = entries.filter(
    (e) =>
      e.type === "file" && (e.name.endsWith(".ts") || e.name.endsWith(".js")),
  );

  const files = [];
  for (const file of tsFiles) {
    try {
      const result = await fetchGitHubFile(file.path, noCache);
      files.push({
        name: file.name,
        path: file.path,
        content: result.content,
      });
    } catch (err) {
      // Skip files that fail to fetch (permissions, size, etc.)
      console.error(`Failed to fetch ${file.path}: ${err.message}`);
    }
  }

  if (!noCache) setCache(cacheKey, files);
  return files;
}

/**
 * Get current GitHub API rate limit information.
 * @returns {{ limit: number, remaining: number, resetAt: number, resetAtISO: string, hasToken: boolean }}
 */
export function getGitHubRateLimit() {
  return {
    ...rateLimitInfo,
    resetAtISO: rateLimitInfo.resetAt
      ? new Date(rateLimitInfo.resetAt).toISOString()
      : "unknown",
    hasToken: Boolean(process.env.GITHUB_TOKEN),
  };
}

/**
 * Clear the GitHub in-memory cache.
 */
export function clearGitHubCache() {
  githubCache.clear();
}
