/**
 * LRU cache for query embeddings.
 * Reduces API calls by caching recently used embeddings.
 */

import { logger } from "@mcp/shared/logger";

const log = logger.child({ module: "embedding-cache" });

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

export interface EmbeddingCacheOptions {
  maxSize?: number; // Maximum number of entries
  ttlMs?: number; // Time-to-live in milliseconds
}

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * LRU cache for embeddings with TTL support.
 */
export class EmbeddingCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(options: EmbeddingCacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Get an embedding from the cache.
   * Returns undefined if not found or expired.
   */
  get(query: string): number[] | undefined {
    const key = this.normalizeKey(query);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      log.debug("Cache entry expired", { query: key.slice(0, 50) });
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    log.debug("Cache hit", { query: key.slice(0, 50) });
    return entry.embedding;
  }

  /**
   * Store an embedding in the cache.
   */
  set(query: string, embedding: number[]): void {
    const key = this.normalizeKey(query);

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        log.debug("Evicted oldest entry", { key: oldestKey.slice(0, 50) });
      }
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a query is in the cache (not expired).
   */
  has(query: string): boolean {
    const key = this.normalizeKey(query);
    const entry = this.cache.get(key);

    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    log.debug("Cache cleared");
  }

  /**
   * Remove expired entries.
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      log.debug("Pruned expired entries", { count: pruned });
    }

    return pruned;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Get hit rate as a percentage.
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return (this.hits / total) * 100;
  }

  /**
   * Normalize the cache key.
   * Lowercases and trims whitespace for better hit rate.
   */
  private normalizeKey(query: string): string {
    return query.toLowerCase().trim();
  }
}

// Singleton instance for the application
let globalCache: EmbeddingCache | null = null;

/**
 * Get the global embedding cache instance.
 */
export function getEmbeddingCache(
  options?: EmbeddingCacheOptions,
): EmbeddingCache {
  if (!globalCache) {
    globalCache = new EmbeddingCache(options);
  }
  return globalCache;
}

/**
 * Reset the global cache (useful for testing).
 */
export function resetEmbeddingCache(): void {
  globalCache = null;
}
