import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  cacheKey,
  loadEmbeddingCache,
  saveEmbeddingCache,
  pruneStaleEntries,
  cosineSimilarity,
  type EmbeddingCacheEntry,
} from "../embedding-cache";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-embed-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("cacheKey", () => {
  it("generates stable keys for same content", () => {
    const k1 = cacheKey("mem_abc", "hello world");
    const k2 = cacheKey("mem_abc", "hello world");
    expect(k1).toBe(k2);
  });

  it("generates different keys for different content", () => {
    const k1 = cacheKey("mem_abc", "hello world");
    const k2 = cacheKey("mem_abc", "goodbye world");
    expect(k1).not.toBe(k2);
  });

  it("includes memory ID as prefix", () => {
    const k = cacheKey("mem_xyz", "test");
    expect(k.startsWith("mem_xyz:")).toBe(true);
  });

  it("generates different keys for different memory IDs", () => {
    const k1 = cacheKey("mem_a", "same content");
    const k2 = cacheKey("mem_b", "same content");
    expect(k1).not.toBe(k2);
  });
});

describe("loadEmbeddingCache / saveEmbeddingCache", () => {
  it("returns empty map when no cache file exists", async () => {
    const cache = await loadEmbeddingCache(tmpDir);
    expect(cache.size).toBe(0);
  });

  it("round-trips cache data to disk", async () => {
    const cache = new Map<string, EmbeddingCacheEntry>();
    cache.set("mem_1:abc123", {
      vector: [0.1, 0.2, 0.3],
      cachedAt: "2026-01-01T00:00:00Z",
    });
    cache.set("mem_2:def456", {
      vector: [0.4, 0.5, 0.6],
      cachedAt: "2026-01-02T00:00:00Z",
    });

    await saveEmbeddingCache(tmpDir, cache);
    const loaded = await loadEmbeddingCache(tmpDir);

    expect(loaded.size).toBe(2);
    expect(loaded.get("mem_1:abc123")!.vector).toEqual([0.1, 0.2, 0.3]);
    expect(loaded.get("mem_2:def456")!.vector).toEqual([0.4, 0.5, 0.6]);
  });

  it("overwrites existing cache", async () => {
    const cache1 = new Map<string, EmbeddingCacheEntry>();
    cache1.set("k1", { vector: [1], cachedAt: "2026-01-01T00:00:00Z" });
    await saveEmbeddingCache(tmpDir, cache1);

    const cache2 = new Map<string, EmbeddingCacheEntry>();
    cache2.set("k2", { vector: [2], cachedAt: "2026-01-02T00:00:00Z" });
    await saveEmbeddingCache(tmpDir, cache2);

    const loaded = await loadEmbeddingCache(tmpDir);
    expect(loaded.size).toBe(1);
    expect(loaded.has("k2")).toBe(true);
    expect(loaded.has("k1")).toBe(false);
  });
});

describe("pruneStaleEntries", () => {
  it("keeps entries for existing memories", () => {
    const cache = new Map<string, EmbeddingCacheEntry>();
    cache.set("mem_a:hash1", { vector: [1], cachedAt: "2026-01-01T00:00:00Z" });
    cache.set("mem_b:hash2", { vector: [2], cachedAt: "2026-01-01T00:00:00Z" });

    const pruned = pruneStaleEntries(cache, new Set(["mem_a", "mem_b"]));
    expect(pruned.size).toBe(2);
  });

  it("removes entries for deleted memories", () => {
    const cache = new Map<string, EmbeddingCacheEntry>();
    cache.set("mem_a:hash1", { vector: [1], cachedAt: "2026-01-01T00:00:00Z" });
    cache.set("mem_b:hash2", { vector: [2], cachedAt: "2026-01-01T00:00:00Z" });
    cache.set("mem_c:hash3", { vector: [3], cachedAt: "2026-01-01T00:00:00Z" });

    const pruned = pruneStaleEntries(cache, new Set(["mem_a"]));
    expect(pruned.size).toBe(1);
    expect(pruned.has("mem_a:hash1")).toBe(true);
  });

  it("handles empty current set", () => {
    const cache = new Map<string, EmbeddingCacheEntry>();
    cache.set("mem_a:hash1", { vector: [1], cachedAt: "2026-01-01T00:00:00Z" });

    const pruned = pruneStaleEntries(cache, new Set());
    expect(pruned.size).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for zero-length vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles non-unit vectors correctly", () => {
    const sim = cosineSimilarity([2, 4], [1, 2]);
    expect(sim).toBeCloseTo(1); // Same direction, different magnitudes
  });
});
