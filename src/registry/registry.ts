import { readFile } from 'node:fs/promises';
import type { CacheManager } from '../cache/cache-manager.js';
import type { AnalogApiClient } from '../data/analog-api.js';
import { SpartanError, SpartanErrorCode } from '../errors/errors.js';
import { DEFAULT_CACHE_TTL_HOURS } from '../utils/constants.js';
import { maybeRefresh, type RefreshTarget } from './refresh.js';
import {
  type RegistryBlock,
  type RegistryComponent,
  type SpartanRegistry,
  spartanRegistrySchema,
} from './schema.js';

export interface SearchableItem {
  name: string;
  type: 'component' | 'block' | 'doc';
  category?: string;
  description?: string;
}

export interface RegistryLoaderOptions {
  /** Enables the persisted cache file (load precedence + SWR writes). */
  cacheManager?: CacheManager;
  /** Used by the background stale-while-revalidate refresh. */
  analogApi?: AnalogApiClient;
}

const EMPTY_REGISTRY: SpartanRegistry = {
  version: '0.0.0',
  generatedAt: new Date(0).toISOString(),
  spartanVersion: 'unknown',
  components: {},
  blocks: {},
  docs: [],
};

export class RegistryLoader implements RefreshTarget {
  private registry: SpartanRegistry | null = null;
  /** Runtime last-refresh timestamp (epoch ms). 0 = never refreshed → stale. */
  private lastRefreshedAtMs = 0;
  private lastRefreshedAtIso: string | null = null;
  private readonly cacheManager?: CacheManager;
  private readonly analogApi?: AnalogApiClient;

  constructor(
    private registryPath?: string,
    options: RegistryLoaderOptions = {},
  ) {
    this.cacheManager = options.cacheManager;
    this.analogApi = options.analogApi;
  }

  async initialize(): Promise<void> {
    // A custom path is the explicit, deterministic source (used in tests) — no
    // cache file, no background refresh.
    if (this.registryPath) {
      return this.loadFromFile(this.registryPath);
    }

    await this.loadDefault();
    this.scheduleBackgroundRefresh();
  }

  /** Load precedence: writable cache file → packaged registry.json → empty. */
  private async loadDefault(): Promise<void> {
    // 1. Writable cache file (preferred when present and schema-valid).
    if (this.cacheManager) {
      const cached = await this.cacheManager.readRegistryCache();
      if (cached) {
        const parsed = spartanRegistrySchema.safeParse(cached.registry);
        if (parsed.success) {
          this.registry = parsed.data;
          this.setLastRefreshedAt(cached.lastRefreshedAt);
          return;
        }
        // Invalid cache file → fall through to the packaged snapshot.
      }
    }

    // 2. Packaged registry.json (the permanent offline floor).
    const possiblePaths = [
      new URL('./registry.json', import.meta.url),
      new URL('../../src/registry/registry.json', import.meta.url),
    ];
    for (const pathUrl of possiblePaths) {
      try {
        const raw = await readFile(pathUrl, 'utf-8');
        this.registry = spartanRegistrySchema.parse(JSON.parse(raw));
        return;
      } catch {
        // Try next path.
      }
    }

    // 3. Empty registry.
    this.registry = { ...EMPTY_REGISTRY };
  }

  /** Fire-and-forget SWR refresh if the data is stale. */
  private scheduleBackgroundRefresh(): void {
    if (!this.cacheManager || !this.analogApi) return;
    void maybeRefresh({
      target: this,
      analogApi: this.analogApi,
      cacheManager: this.cacheManager,
      lastRefreshedAtMs: this.lastRefreshedAtMs,
      ttlMs: this.cacheManager.ttlMs(),
      now: Date.now(),
    });
  }

  private async loadFromFile(filePath: string): Promise<void> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.registry = spartanRegistrySchema.parse(parsed);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        this.registry = { ...EMPTY_REGISTRY };
        return;
      }
      throw new SpartanError('Failed to load registry', {
        code: SpartanErrorCode.CACHE_READ_ERROR,
        suggestion: "Run 'npm run generate-registry' to create the registry file.",
        cause: error,
      });
    }
  }

  private ensureLoaded(): SpartanRegistry {
    if (!this.registry) {
      throw new SpartanError('Registry not initialized. Call initialize() first.', {
        code: SpartanErrorCode.UNKNOWN_ERROR,
      });
    }
    return this.registry;
  }

  getComponent(name: string): RegistryComponent | null {
    const reg = this.ensureLoaded();
    return reg.components[name.toLowerCase()] ?? null;
  }

  listComponents(): RegistryComponent[] {
    const reg = this.ensureLoaded();
    return Object.values(reg.components);
  }

  listBlocks(): RegistryBlock[] {
    const reg = this.ensureLoaded();
    return Object.values(reg.blocks);
  }

  getBlock(category: string, variant: string): RegistryBlock | null {
    const reg = this.ensureLoaded();
    const key = `${category}/${variant}`;
    return reg.blocks[key] ?? null;
  }

  listDocs(): string[] {
    const reg = this.ensureLoaded();
    return reg.docs;
  }

  getSearchableItems(): SearchableItem[] {
    const reg = this.ensureLoaded();
    const items: SearchableItem[] = [];

    for (const comp of Object.values(reg.components)) {
      items.push({
        name: comp.name,
        type: 'component',
        category: comp.category,
        description: `${comp.brainAvailable ? 'Brain' : ''}${comp.brainAvailable && comp.helmAvailable ? ' + ' : ''}${comp.helmAvailable ? 'Helm' : ''} component`,
      });
    }

    for (const block of Object.values(reg.blocks)) {
      items.push({
        name: block.variant,
        type: 'block',
        category: block.category,
      });
    }

    for (const doc of reg.docs) {
      items.push({
        name: doc,
        type: 'doc',
      });
    }

    return items;
  }

  /**
   * Staleness is driven solely by the runtime `lastRefreshedAt` and the unified TTL
   * window (SPARTAN_CACHE_TTL_HOURS, default 24h). The packaged build-time
   * `generatedAt` is informational only and never drives this decision.
   */
  isStale(): boolean {
    const ttlMs =
      this.cacheManager?.ttlMs() ??
      Number(process.env.SPARTAN_CACHE_TTL_HOURS || DEFAULT_CACHE_TTL_HOURS) * 60 * 60 * 1000;
    return Date.now() - this.lastRefreshedAtMs > ttlMs;
  }

  getVersion(): string {
    return this.ensureLoaded().version;
  }

  getSpartanVersion(): string {
    return this.ensureLoaded().spartanVersion;
  }

  /** Build-time generation timestamp of the loaded registry (informational only). */
  getGeneratedAt(): string {
    return this.ensureLoaded().generatedAt;
  }

  /** Runtime last-refresh timestamp (ISO), or null if never refreshed at runtime. */
  getLastRefreshedAt(): string | null {
    return this.lastRefreshedAtIso;
  }

  getComponentCount(): number {
    return Object.keys(this.ensureLoaded().components).length;
  }

  getBlockCount(): number {
    return Object.keys(this.ensureLoaded().blocks).length;
  }

  // --- RefreshTarget ---

  /** Current in-memory registry (used as the base for a refresh). */
  getCurrentRegistry(): SpartanRegistry {
    return this.ensureLoaded();
  }

  /** Apply a refreshed registry and stamp the runtime last-refresh timestamp. */
  setRefreshed(registry: SpartanRegistry, lastRefreshedAt: string): void {
    this.registry = registry;
    this.setLastRefreshedAt(lastRefreshedAt);
  }

  setLastRefreshedAt(iso: string): void {
    this.lastRefreshedAtIso = iso;
    const ms = Date.parse(iso);
    this.lastRefreshedAtMs = Number.isFinite(ms) ? ms : 0;
  }

  /**
   * Replace the in-memory registry with fresh data and report the diff (used by the
   * explicit `spartan_registry_refresh` tool). Does NOT stamp the refresh timestamp —
   * callers pair this with `setLastRefreshedAt`.
   */
  updateRegistry(registry: SpartanRegistry): {
    added: string[];
    updated: string[];
    removed: string[];
  } {
    const old = this.ensureLoaded();
    const oldNames = new Set(Object.keys(old.components));
    const newNames = new Set(Object.keys(registry.components));

    const added = [...newNames].filter((n) => !oldNames.has(n));
    const removed = [...oldNames].filter((n) => !newNames.has(n));
    const updated: string[] = [];

    for (const name of newNames) {
      if (oldNames.has(name)) {
        const oldComp = old.components[name];
        const newComp = registry.components[name];
        if (JSON.stringify(oldComp) !== JSON.stringify(newComp)) {
          updated.push(name);
        }
      }
    }

    this.registry = registry;
    return { added, updated, removed };
  }
}
