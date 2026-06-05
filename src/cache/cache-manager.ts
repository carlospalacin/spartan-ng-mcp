import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ANALOG_API_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_HOURS,
  DEFAULT_CACHE_TTL_MS,
  REGISTRY_CACHE_FILENAME,
  REGISTRY_REFRESH_LOCK_FILENAME,
} from "../utils/constants.js";
import type { SpartanRegistry } from "../registry/schema.js";
import { FileCache, type CacheCategory, type FileCacheStats } from "./file-cache.js";
import { MemoryCache } from "./memory-cache.js";

/** Shape persisted to `<cacheDir>/registry.cache.json`. */
export interface RegistryCacheFile {
  lastRefreshedAt: string;
  registry: unknown;
}

function isPidAlive(pid?: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    // Signal 0 performs error checking without sending a signal.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but is owned by another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class CacheManager {
  private memory: MemoryCache<unknown>;
  private file: FileCache;

  constructor(
    private readonly baseDir: string,
    version = "latest",
  ) {
    const ttlMs = Number(process.env.SPARTAN_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);
    this.memory = new MemoryCache(200, ttlMs);
    this.file = new FileCache(baseDir, version);
  }

  /**
   * Get data with fallback: memory → file → fetcher.
   * Results are written back to both cache layers.
   */
  async get<T>(
    category: CacheCategory,
    key: string,
    fetcher: () => Promise<T>,
    noCache = false,
  ): Promise<T> {
    const cacheKey = `${category}:${key}`;

    // 1. Check memory cache
    if (!noCache) {
      const memResult = this.memory.get(cacheKey) as T | null;
      if (memResult !== null) {
        return memResult;
      }

      // 2. Check file cache
      const fileResult = await this.file.get<T>(category, key);
      if (fileResult.hit && !fileResult.stale && fileResult.data !== null) {
        this.memory.set(cacheKey, fileResult.data);
        return fileResult.data;
      }
    }

    // 3. Fetch from network
    const data = await fetcher();

    // Write back to both caches
    this.memory.set(cacheKey, data);
    await this.file.set(category, key, data).catch(() => {
      // File cache write failures are non-fatal
    });

    return data;
  }

  async clear(category?: CacheCategory): Promise<void> {
    this.memory.clear();
    await this.file.clear(category);
  }

  async stats(): Promise<{
    memory: ReturnType<MemoryCache<unknown>["stats"]>;
    file: FileCacheStats;
  }> {
    return {
      memory: this.memory.stats(),
      file: await this.file.stats(),
    };
  }

  async switchVersion(version: string): Promise<void> {
    this.memory.clear();
    await this.file.switchVersion(version);
  }

  // --- Persisted registry cache (stale-while-revalidate) ---

  /** Absolute path of the single source-of-truth registry cache file. */
  getRegistryCachePath(): string {
    return join(this.baseDir, REGISTRY_CACHE_FILENAME);
  }

  /** Registry staleness window in milliseconds (SPARTAN_CACHE_TTL_HOURS, default 24h). */
  ttlMs(): number {
    const hours = Number(process.env.SPARTAN_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS);
    return hours * 60 * 60 * 1000;
  }

  /**
   * Read the registry cache file. Returns null when it is missing, unreadable, or
   * structurally invalid (so callers can fall back to the packaged snapshot without
   * throwing). Schema validation of `registry` is the caller's responsibility.
   */
  async readRegistryCache(): Promise<RegistryCacheFile | null> {
    try {
      const raw = await readFile(this.getRegistryCachePath(), "utf-8");
      const parsed = JSON.parse(raw) as Partial<RegistryCacheFile>;
      if (!parsed || typeof parsed.lastRefreshedAt !== "string" || parsed.registry == null) {
        return null;
      }
      return { lastRefreshedAt: parsed.lastRefreshedAt, registry: parsed.registry };
    } catch {
      // ENOENT or JSON parse error → treat as no cache.
      return null;
    }
  }

  /**
   * Atomically write the registry cache: temp file in the same directory then
   * rename(). A process killed mid-write never leaves a corrupt cache file.
   */
  async writeRegistryCache(registry: SpartanRegistry, lastRefreshedAt: string): Promise<void> {
    const target = this.getRegistryCachePath();
    await mkdir(this.baseDir, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    const payload: RegistryCacheFile = { lastRefreshedAt, registry };
    await writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
    await rename(tmp, target);
  }

  private lockPath(): string {
    return join(this.baseDir, REGISTRY_REFRESH_LOCK_FILENAME);
  }

  /**
   * Best-effort cross-process refresh lock. Returns true if the lock was acquired.
   * A lock whose owning PID is dead, or whose age exceeds `maxAgeMs`, is treated as
   * stale and overwritten so a process killed mid-refresh cannot deadlock refreshes.
   */
  async acquireRefreshLock(maxAgeMs = 2 * ANALOG_API_TIMEOUT_MS): Promise<boolean> {
    const path = this.lockPath();
    try {
      const raw = await readFile(path, "utf-8");
      const lock = JSON.parse(raw) as { pid?: number; startedAt?: string };
      const ageMs = Date.now() - Date.parse(lock.startedAt ?? "");
      const heldByLiveProcess = isPidAlive(lock.pid) && Number.isFinite(ageMs) && ageMs < maxAgeMs;
      if (heldByLiveProcess) return false;
    } catch {
      // No lock file or unreadable → proceed to acquire.
    }
    try {
      await mkdir(this.baseDir, { recursive: true });
      await writeFile(
        path,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        "utf-8",
      );
      return true;
    } catch {
      // If we cannot even write a lock, don't block the refresh.
      return true;
    }
  }

  async releaseRefreshLock(): Promise<void> {
    await rm(this.lockPath(), { force: true }).catch(() => {
      // Releasing a lock is best-effort.
    });
  }
}
