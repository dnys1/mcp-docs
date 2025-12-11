import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  EmbeddingCache,
  getEmbeddingCache,
  resetEmbeddingCache,
} from "./embedding-cache.js";

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache({ maxSize: 3, ttlMs: 1000 });
  });

  describe("get/set", () => {
    test("stores and retrieves embeddings", () => {
      const embedding = [0.1, 0.2, 0.3];
      cache.set("test query", embedding);

      const result = cache.get("test query");
      expect(result).toEqual(embedding);
    });

    test("returns undefined for missing key", () => {
      const result = cache.get("nonexistent");
      expect(result).toBeUndefined();
    });

    test("normalizes keys (lowercase, trim)", () => {
      const embedding = [0.1, 0.2, 0.3];
      cache.set("  TEST QUERY  ", embedding);

      expect(cache.get("test query")).toEqual(embedding);
      expect(cache.get("TEST QUERY")).toEqual(embedding);
      expect(cache.get("  test query  ")).toEqual(embedding);
    });
  });

  describe("LRU eviction", () => {
    test("evicts oldest entry when at capacity", () => {
      cache.set("query1", [1]);
      cache.set("query2", [2]);
      cache.set("query3", [3]);
      cache.set("query4", [4]); // Should evict query1

      expect(cache.get("query1")).toBeUndefined();
      expect(cache.get("query2")).toEqual([2]);
      expect(cache.get("query3")).toEqual([3]);
      expect(cache.get("query4")).toEqual([4]);
    });

    test("accessing entry moves it to most recent", () => {
      cache.set("query1", [1]);
      cache.set("query2", [2]);
      cache.set("query3", [3]);

      // Access query1, making it most recently used
      cache.get("query1");

      // Add new entry, should evict query2 (now oldest)
      cache.set("query4", [4]);

      expect(cache.get("query1")).toEqual([1]); // Still present
      expect(cache.get("query2")).toBeUndefined(); // Evicted
    });
  });

  describe("TTL expiration", () => {
    test("returns undefined for expired entries", async () => {
      const shortTtlCache = new EmbeddingCache({ ttlMs: 50 });
      shortTtlCache.set("query", [1, 2, 3]);

      expect(shortTtlCache.get("query")).toEqual([1, 2, 3]);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(shortTtlCache.get("query")).toBeUndefined();
    });

    test("has() returns false for expired entries", async () => {
      const shortTtlCache = new EmbeddingCache({ ttlMs: 50 });
      shortTtlCache.set("query", [1, 2, 3]);

      expect(shortTtlCache.has("query")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(shortTtlCache.has("query")).toBe(false);
    });
  });

  describe("prune", () => {
    test("removes expired entries", async () => {
      const shortTtlCache = new EmbeddingCache({ ttlMs: 50 });
      shortTtlCache.set("query1", [1]);
      shortTtlCache.set("query2", [2]);

      await new Promise((resolve) => setTimeout(resolve, 60));

      shortTtlCache.set("query3", [3]); // Fresh entry

      const pruned = shortTtlCache.prune();

      expect(pruned).toBe(2);
      expect(shortTtlCache.getStats().size).toBe(1);
    });
  });

  describe("clear", () => {
    test("removes all entries and resets stats", () => {
      cache.set("query1", [1]);
      cache.set("query2", [2]);
      cache.get("query1"); // Hit
      cache.get("missing"); // Miss

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
    });
  });

  describe("statistics", () => {
    test("tracks hits and misses", () => {
      cache.set("query", [1, 2, 3]);

      cache.get("query"); // Hit
      cache.get("query"); // Hit
      cache.get("missing"); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    test("calculates hit rate", () => {
      cache.set("query", [1, 2, 3]);

      cache.get("query"); // Hit
      cache.get("query"); // Hit
      cache.get("missing"); // Miss
      cache.get("missing"); // Miss

      expect(cache.getHitRate()).toBe(50);
    });

    test("returns 0 hit rate when no requests", () => {
      expect(cache.getHitRate()).toBe(0);
    });
  });
});

describe("Global cache", () => {
  afterEach(() => {
    resetEmbeddingCache();
  });

  test("getEmbeddingCache returns singleton", () => {
    const cache1 = getEmbeddingCache();
    const cache2 = getEmbeddingCache();

    expect(cache1).toBe(cache2);
  });

  test("resetEmbeddingCache creates new instance", () => {
    const cache1 = getEmbeddingCache();
    cache1.set("query", [1, 2, 3]);

    resetEmbeddingCache();

    const cache2 = getEmbeddingCache();
    expect(cache2.get("query")).toBeUndefined();
  });
});
