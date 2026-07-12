/**
 * Short-lived metadata cache with in-flight request deduplication.
 *
 * Queueing an item and starting its download both need metadata; this cache
 * guarantees the extractor runs once per URL, concurrent requests share one
 * promise, and entries expire so stale data is refreshed.
 */

export interface MetadataCacheOptions<T> {
  fetcher: (url: string) => Promise<T>;
  /** How long a successful result stays fresh. */
  ttlMs?: number;
  /** Results for which this returns true are not cached (e.g. fallbacks). */
  isCacheable?: (value: T) => boolean;
  now?: () => number;
  maxEntries?: number;
}

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

export class MetadataCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly fetcher: (url: string) => Promise<T>;
  private readonly ttlMs: number;
  private readonly isCacheable: (value: T) => boolean;
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: MetadataCacheOptions<T>) {
    this.fetcher = options.fetcher;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.isCacheable = options.isCacheable ?? (() => true);
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 50;
  }

  /**
   * Returns fresh cached metadata, joins an in-flight request for the same
   * URL, or starts a new fetch. `forceRefresh` bypasses the cache (used after
   * an extractor failure) but still deduplicates concurrent refreshes.
   */
  get(url: string, options: { forceRefresh?: boolean } = {}): Promise<T> {
    if (!options.forceRefresh) {
      const entry = this.entries.get(url);
      if (entry && this.now() - entry.fetchedAt < this.ttlMs) {
        return Promise.resolve(entry.value);
      }
    }

    const pending = this.inFlight.get(url);
    if (pending) return pending;

    const request = this.fetcher(url)
      .then((value) => {
        if (this.isCacheable(value)) {
          this.entries.set(url, { value, fetchedAt: this.now() });
          this.prune();
        } else {
          this.entries.delete(url);
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(url);
      });

    this.inFlight.set(url, request);
    return request;
  }

  /** Fresh cached value without triggering a fetch. */
  peek(url: string): T | undefined {
    const entry = this.entries.get(url);
    if (!entry) return undefined;
    if (this.now() - entry.fetchedAt >= this.ttlMs) return undefined;
    return entry.value;
  }

  invalidate(url: string) {
    this.entries.delete(url);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }

  hasInFlight(url: string) {
    return this.inFlight.has(url);
  }

  private prune() {
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].fetchedAt - b[1].fetchedAt,
    );
    while (sorted.length > this.maxEntries) {
      const oldest = sorted.shift();
      if (oldest) this.entries.delete(oldest[0]);
    }
  }
}
