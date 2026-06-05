import { readFile, writeFile, mkdir, rm, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { SpartanError, SpartanErrorCode } from "../errors/errors.js";
import { DEFAULT_CACHE_TTL_HOURS } from "../utils/constants.js";

export type CacheCategory = "components" | "docs" | "blocks" | "source";

export interface CacheResult<T> {
  data: T | null;
  hit: boolean;
  stale: boolean;
  cachedAt?: Date;
}

export interface FileCacheStats {
  version: string;
  categories: Record<CacheCategory, number>;
  totalEntries: number;
  basePath: string;
}

function sanitizeSegment(segment: string, label: string): string {
  if (typeof segment !== "string" || segment.length === 0) {
    throw new SpartanError(`${label} must be a non-empty string`, {
      code: SpartanErrorCode.VALIDATION_ERROR,
    });
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)) {
    throw new SpartanError(
      `Invalid ${label}: "${segment}". Only alphanumeric, hyphens, underscores, and dots allowed.`,
      { code: SpartanErrorCode.VALIDATION_ERROR },
    );
  }
  return segment;
}

function assertWithinBase(resolvedPath: string, baseDir: string): void {
  const normalizedPath = resolve(resolvedPath);
  const normalizedBase = resolve(baseDir);
  if (
    !normalizedPath.startsWith(normalizedBase + sep) &&
    normalizedPath !== normalizedBase
  ) {
    throw new SpartanError("Path traversal detected", {
      code: SpartanErrorCode.VALIDATION_ERROR,
    });
  }
}

export class FileCache {
  private version: string;
  private readonly ttlHours: number;

  constructor(
    private readonly baseDir: string,
    version = "latest",
    ttlHours?: number,
  ) {
    this.version = sanitizeSegment(version, "version");
    this.ttlHours =
      ttlHours ??
      Number(process.env.SPARTAN_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS);
  }

  private versionDir(): string {
    return join(this.baseDir, this.version);
  }

  private filePath(category: CacheCategory, key: string): string {
    const safeKey = sanitizeSegment(key, "cache key");
    const path = join(this.versionDir(), category, `${safeKey}.json`);
    assertWithinBase(path, this.baseDir);
    return path;
  }

  async get<T>(category: CacheCategory, key: string): Promise<CacheResult<T>> {
    try {
      const path = this.filePath(category, key);
      const raw = await readFile(path, "utf-8");
      const entry = JSON.parse(raw) as { data: T; cachedAt: string };
      const cachedAt = new Date(entry.cachedAt);
      const ageMs = Date.now() - cachedAt.getTime();
      const stale = ageMs > this.ttlHours * 60 * 60 * 1000;

      return { data: entry.data, hit: true, stale, cachedAt };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { data: null, hit: false, stale: false };
      }
      throw new SpartanError(`Cache read error: ${String(error)}`, {
        code: SpartanErrorCode.CACHE_READ_ERROR,
        context: { category, key },
        cause: error,
      });
    }
  }

  async set<T>(category: CacheCategory, key: string, data: T): Promise<void> {
    try {
      const path = this.filePath(category, key);
      const dir = join(this.versionDir(), category);
      await mkdir(dir, { recursive: true });
      const entry = { data, cachedAt: new Date().toISOString() };
      await writeFile(path, JSON.stringify(entry, null, 2), "utf-8");
    } catch (error) {
      if (error instanceof SpartanError) throw error;
      throw new SpartanError(`Cache write error: ${String(error)}`, {
        code: SpartanErrorCode.CACHE_WRITE_ERROR,
        context: { category, key },
        cause: error,
      });
    }
  }

  async clear(category?: CacheCategory): Promise<void> {
    const target = category
      ? join(this.versionDir(), category)
      : this.versionDir();

    assertWithinBase(target, this.baseDir);
    await rm(target, { recursive: true, force: true });
  }

  async switchVersion(version: string): Promise<void> {
    this.version = sanitizeSegment(version, "version");
  }

  async stats(): Promise<FileCacheStats> {
    const categories: CacheCategory[] = ["components", "docs", "blocks", "source"];
    const counts = {} as Record<CacheCategory, number>;
    let total = 0;

    for (const cat of categories) {
      try {
        const dir = join(this.versionDir(), cat);
        const files = await readdir(dir);
        counts[cat] = files.filter((f) => f.endsWith(".json")).length;
        total += counts[cat];
      } catch {
        counts[cat] = 0;
      }
    }

    return {
      version: this.version,
      categories: counts,
      totalEntries: total,
      basePath: this.versionDir(),
    };
  }
}
