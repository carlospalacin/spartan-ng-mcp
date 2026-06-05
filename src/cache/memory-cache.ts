export interface CacheStats {
  entries: number;
  maxEntries: number;
  ttlMs: number;
  hitRate: string;
}

export class MemoryCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly maxEntries: number = 200,
    private readonly ttlMs: number = 5 * 60 * 1000,
  ) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  set(key: string, data: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : "N/A",
    };
  }
}
