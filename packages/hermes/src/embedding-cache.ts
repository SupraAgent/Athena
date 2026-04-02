/**
 * Embedding Cache — persistent disk cache for memory embeddings.
 *
 * Stores embeddings keyed by `memoryId:contentHash` so re-embedding
 * is only needed when content changes. Uses atomic writes to prevent
 * corruption from concurrent hook invocations.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// ── Types ──────────────────────────────────────────────────────

export type EmbeddingCacheEntry = {
  /** The embedding vector. */
  vector: number[];
  /** ISO timestamp of when this embedding was computed. */
  cachedAt: string;
};

export type EmbeddingCacheData = Record<string, EmbeddingCacheEntry>;

// ── Cache Key ──────────────────────────────────────────────────

/** Generate a stable cache key for a memory: `memoryId:shortHash(content)`. */
export function cacheKey(memoryId: string, content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  return `${memoryId}:${hash}`;
}

// ── Load / Save ────────────────────────────────────────────────

function cachePath(hermesDir: string): string {
  return path.join(hermesDir, "embeddings.json");
}

/** Load embedding cache from disk. Returns empty map if not found. */
export async function loadEmbeddingCache(hermesDir: string): Promise<Map<string, EmbeddingCacheEntry>> {
  try {
    const raw = await fs.readFile(cachePath(hermesDir), "utf-8");
    const data: EmbeddingCacheData = JSON.parse(raw);
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

/** Save embedding cache to disk (atomic write). */
export async function saveEmbeddingCache(
  hermesDir: string,
  cache: Map<string, EmbeddingCacheEntry>
): Promise<void> {
  const data: EmbeddingCacheData = Object.fromEntries(cache);
  const content = JSON.stringify(data);
  const filePath = cachePath(hermesDir);
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

/** Remove stale entries (memories that no longer exist). */
export function pruneStaleEntries(
  cache: Map<string, EmbeddingCacheEntry>,
  currentMemoryIds: Set<string>
): Map<string, EmbeddingCacheEntry> {
  const pruned = new Map<string, EmbeddingCacheEntry>();
  for (const [key, entry] of cache) {
    const memoryId = key.split(":")[0];
    if (currentMemoryIds.has(memoryId)) {
      pruned.set(key, entry);
    }
  }
  return pruned;
}

// ── Cosine Similarity ──────────────────────────────────────────

/** Cosine similarity between two vectors. Returns 0 if either is zero-length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
