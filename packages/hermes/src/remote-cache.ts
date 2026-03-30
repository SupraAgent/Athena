/**
 * Async remote source loading with local cache.
 *
 * Remote memories are fetched in the background and cached locally.
 * Hooks always read from cache (fast), never block on network I/O.
 * A background refresh updates the cache periodically.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import type { Memory, ExternalSource } from "./types";

// ── Cache structure ─────────────────────────────────────────────

type RemoteCache = {
  source: ExternalSource;
  memories: Memory[];
  fetchedAt: string;
  ttlMs: number;
};

type CacheFile = {
  caches: RemoteCache[];
  lastRefreshAt: string;
};

function cachePath(hermesDir: string): string {
  return path.join(hermesDir, "remote-cache.json");
}

/** Load cached remote memories. Returns empty if no cache or expired. */
export async function loadCachedRemoteMemories(
  hermesDir: string,
  sources: ExternalSource[],
  ttlMs = 300000 // 5 minutes default
): Promise<Memory[]> {
  try {
    const raw = await fs.readFile(cachePath(hermesDir), "utf-8");
    const cache = JSON.parse(raw) as CacheFile;
    const now = Date.now();
    const memories: Memory[] = [];

    for (const entry of cache.caches) {
      // Check if this source is still configured
      const sourceMatch = sources.find(
        (s) => s.repo === entry.source.repo && s.branch === entry.source.branch
      );
      if (!sourceMatch) continue;

      // Check TTL
      const age = now - new Date(entry.fetchedAt).getTime();
      if (age < (entry.ttlMs || ttlMs)) {
        memories.push(...entry.memories);
      }
    }

    return memories;
  } catch {
    return [];
  }
}

/** Save remote memories to the local cache. */
export async function saveCachedRemoteMemories(
  hermesDir: string,
  source: ExternalSource,
  memories: Memory[],
  ttlMs = 300000
): Promise<void> {
  let cache: CacheFile;
  try {
    const raw = await fs.readFile(cachePath(hermesDir), "utf-8");
    cache = JSON.parse(raw) as CacheFile;
  } catch {
    cache = { caches: [], lastRefreshAt: new Date().toISOString() };
  }

  // Replace existing entry for this source
  cache.caches = cache.caches.filter(
    (c) => !(c.source.repo === source.repo && c.source.branch === source.branch)
  );

  cache.caches.push({
    source,
    memories,
    fetchedAt: new Date().toISOString(),
    ttlMs,
  });

  cache.lastRefreshAt = new Date().toISOString();

  await fs.mkdir(hermesDir, { recursive: true });
  await fs.writeFile(cachePath(hermesDir), JSON.stringify(cache, null, 2), "utf-8");
}

/** Check if the cache needs refreshing. */
export async function isCacheStale(
  hermesDir: string,
  sources: ExternalSource[],
  ttlMs = 300000
): Promise<boolean> {
  try {
    const raw = await fs.readFile(cachePath(hermesDir), "utf-8");
    const cache = JSON.parse(raw) as CacheFile;
    const now = Date.now();

    // Check if any configured source is missing or stale
    for (const source of sources) {
      const entry = cache.caches.find(
        (c) => c.source.repo === source.repo && c.source.branch === source.branch
      );
      if (!entry) return true;

      const age = now - new Date(entry.fetchedAt).getTime();
      if (age >= (entry.ttlMs || ttlMs)) return true;
    }

    return false;
  } catch {
    return sources.length > 0;
  }
}

/**
 * Trigger a background cache refresh. Spawns a detached worker
 * that fetches remote memories and updates the cache.
 * Returns immediately — never blocks the calling hook.
 */
export function triggerBackgroundRefresh(
  hermesDir: string,
  sources: ExternalSource[]
): void {
  if (sources.length === 0) return;

  const workerPath = path.join(__dirname, "remote-worker.js");
  const payload = JSON.stringify({ hermesDir, sources });

  try {
    const child = spawn("node", [workerPath, payload], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
  } catch {
    // Silent failure — cache refresh is best-effort
  }
}
