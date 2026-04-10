import { SpartanError, SpartanErrorCode, rateLimited } from "../errors/errors.js";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  GITHUB_API_BASE,
  GITHUB_RAW_BASE,
  SPARTAN_REPO,
  SPARTAN_REPO_BRANCH,
} from "../utils/constants.js";
import type { GitHubEntry, GitHubFile, RateLimitInfo, SourceFile } from "./types.js";

const rateLimitInfo = {
  limit: 60,
  remaining: 60,
  resetAt: 0,
};

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "spartan-ng-mcp/2.0",
    Accept: "application/vnd.github.v3+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function githubFetch(url: string): Promise<Response> {
  // Check rate limit before request
  if (rateLimitInfo.remaining <= 0 && Date.now() < rateLimitInfo.resetAt) {
    throw rateLimited(rateLimitInfo.resetAt);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal,
    });

    // Update rate limit from headers
    const limit = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (limit) rateLimitInfo.limit = Number(limit);
    if (remaining) rateLimitInfo.remaining = Number(remaining);
    if (reset) rateLimitInfo.resetAt = Number(reset) * 1000;

    if (!res.ok) {
      if (res.status === 404) {
        throw new SpartanError(`GitHub path not found: ${url}`, {
          code: SpartanErrorCode.COMPONENT_NOT_FOUND,
          context: { url, status: 404 },
        });
      }
      if (res.status === 403 && rateLimitInfo.remaining === 0) {
        throw rateLimited(rateLimitInfo.resetAt);
      }
      throw new SpartanError(`GitHub API error: ${res.status} ${res.statusText}`, {
        code: SpartanErrorCode.NETWORK_ERROR,
        context: { url, status: res.status },
      });
    }

    return res;
  } catch (error) {
    if (error instanceof SpartanError) throw error;

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SpartanError(`GitHub request timed out: ${url}`, {
        code: SpartanErrorCode.TIMEOUT,
        context: { url },
        cause: error,
      });
    }

    throw new SpartanError(`GitHub fetch failed: ${String(error)}`, {
      code: SpartanErrorCode.NETWORK_ERROR,
      context: { url },
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class GitHubClient {
  private readonly repo = SPARTAN_REPO;
  private readonly branch = SPARTAN_REPO_BRANCH;

  async fetchFile(filePath: string): Promise<GitHubFile> {
    const url = `${GITHUB_API_BASE}/repos/${this.repo}/contents/${filePath}?ref=${this.branch}`;
    const res = await githubFetch(url);
    const json = (await res.json()) as Record<string, unknown>;

    const content = Buffer.from(String(json.content ?? ""), "base64").toString("utf-8");

    return {
      content,
      sha: String(json.sha ?? ""),
      size: Number(json.size ?? 0),
      path: String(json.path ?? filePath),
    };
  }

  async fetchDirectory(dirPath: string): Promise<GitHubEntry[]> {
    const url = `${GITHUB_API_BASE}/repos/${this.repo}/contents/${dirPath}?ref=${this.branch}`;
    const res = await githubFetch(url);
    const json = (await res.json()) as Array<Record<string, unknown>>;

    if (!Array.isArray(json)) {
      throw new SpartanError(`Expected directory listing, got single file: ${dirPath}`, {
        code: SpartanErrorCode.PARSE_ERROR,
        context: { dirPath },
      });
    }

    return json.map((entry) => ({
      name: String(entry.name ?? ""),
      path: String(entry.path ?? ""),
      type: String(entry.type ?? "file") as "file" | "dir",
      size: Number(entry.size ?? 0),
      sha: String(entry.sha ?? ""),
    }));
  }

  async fetchDirectoryFiles(dirPath: string): Promise<SourceFile[]> {
    const entries = await this.fetchDirectory(dirPath);
    const tsFiles = entries.filter(
      (e) => e.type === "file" && (e.name.endsWith(".ts") || e.name.endsWith(".js")),
    );

    const files: SourceFile[] = [];
    for (const file of tsFiles) {
      const result = await this.fetchFile(file.path);
      files.push({
        name: file.name,
        path: file.path,
        content: result.content,
      });
    }

    // Recurse into subdirectories
    const dirs = entries.filter((e) => e.type === "dir");
    for (const dir of dirs) {
      const subFiles = await this.fetchDirectoryFiles(dir.path);
      files.push(
        ...subFiles.map((f) => ({
          ...f,
          name: `${dir.name}/${f.name}`,
        })),
      );
    }

    return files;
  }

  async fetchRaw(filePath: string): Promise<string> {
    const url = `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${filePath}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "spartan-ng-mcp/2.0" },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new SpartanError(`GitHub raw fetch failed: ${res.status}`, {
          code: SpartanErrorCode.NETWORK_ERROR,
          context: { url, status: res.status },
        });
      }

      return await res.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  getRateLimit(): RateLimitInfo {
    return {
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      resetAt: rateLimitInfo.resetAt,
      resetAtISO: rateLimitInfo.resetAt ? new Date(rateLimitInfo.resetAt).toISOString() : "",
      hasToken: Boolean(process.env.GITHUB_TOKEN),
    };
  }
}
