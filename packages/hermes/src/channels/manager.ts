/**
 * Channel manager — registry, parallel fetch, caching, dedup.
 *
 * Follows the same cache-first pattern as remote-cache.ts:
 * hooks read from cache (instant), background worker refreshes it.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import type { Memory } from "../types";
import type {
  ChannelConfig,
  ChannelType,
  ChannelStatus,
  ChannelFetchResult,
  ChannelMemoryCandidate,
  ChannelCacheEntry,
  ChannelCacheFile,
  ExternalChannel,
} from "./channel";
import { GitHubChannel } from "./github";
import { SentryChannel } from "./sentry";
import { LinearChannel } from "./linear";
import { JiraChannel } from "./jira";
import { CompetitorChannel } from "./competitor";

// ── Registry ───────────────────────────────────────────────────

const DEFAULT_CHANNELS: ExternalChannel[] = [
  new GitHubChannel(),
  new SentryChannel(),
  new LinearChannel(),
  new JiraChannel(),
  new CompetitorChannel(),
];

/** Build a registry map from all known channels. */
export function getDefaultRegistry(): Map<ChannelType, ExternalChannel> {
  const map = new Map<ChannelType, ExternalChannel>();
  for (const ch of DEFAULT_CHANNELS) {
    map.set(ch.type, ch);
  }
  return map;
}

// ── Availability Check ─────────────────────────────────────────

/** Check availability of all configured channels in parallel. */
export async function checkAll(
  configs: ChannelConfig[],
  registry = getDefaultRegistry()
): Promise<Map<ChannelType, ChannelStatus>> {
  const results = new Map<ChannelType, ChannelStatus>();
  const checks = configs
    .filter((c) => c.enabled)
    .map(async (c) => {
      const channel = registry.get(c.type);
      if (!channel) {
        results.set(c.type, "unavailable");
        return;
      }
      const status = await channel.check();
      results.set(c.type, status);
    });
  await Promise.allSettled(checks);
  return results;
}

// ── Fetch All ──────────────────────────────────────────────────

/** Fetch data from all enabled+available channels in parallel. */
export async function fetchAll(
  configs: ChannelConfig[],
  registry = getDefaultRegistry()
): Promise<ChannelFetchResult[]> {
  const statuses = await checkAll(configs, registry);
  const fetches = configs
    .filter((c) => c.enabled && statuses.get(c.type) === "available")
    .map(async (c) => {
      const channel = registry.get(c.type)!;
      try {
        return await channel.fetch(c);
      } catch (err: unknown) {
        return {
          channel: c.type,
          memories: [],
          fetchedAt: new Date().toISOString(),
          errors: [String(err).slice(0, 200)],
        } satisfies ChannelFetchResult;
      }
    });
  const settled = await Promise.allSettled(fetches);
  return settled
    .filter((r): r is PromiseFulfilledResult<ChannelFetchResult> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── Candidate → Memory Conversion ──────────────────────────────

let counter = 0;

function channelMemoryId(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}_${counter++}`;
}

/** Convert a channel candidate into a Hermes Memory (session-scoped). */
export function candidateToMemory(
  candidate: ChannelMemoryCandidate,
  channelType: ChannelType,
  sessionId: string
): Memory {
  const now = new Date().toISOString();
  return {
    id: candidate.externalId ? `ch-${candidate.externalId}` : channelMemoryId(),
    type: "project-context",
    content: candidate.content,
    tags: candidate.tags,
    createdAt: now,
    updatedAt: now,
    source: `channel:${channelType}`,
    relevance: candidate.relevance,
    scope: "session",
    confidence: "observed",
  };
}

// ── Cache ──────────────────────────────────────────────────────

function cachePath(hermesDir: string): string {
  return path.join(hermesDir, "channel-cache.json");
}

/** Load channel cache from disk. */
export async function loadChannelCache(hermesDir: string): Promise<ChannelCacheFile> {
  try {
    const raw = await fs.readFile(cachePath(hermesDir), "utf-8");
    return JSON.parse(raw) as ChannelCacheFile;
  } catch {
    return { entries: [], lastRefreshAt: "" };
  }
}

/** Save channel cache to disk. */
export async function saveChannelCache(
  hermesDir: string,
  results: ChannelFetchResult[],
  configs: ChannelConfig[]
): Promise<void> {
  const cache = await loadChannelCache(hermesDir);

  for (const result of results) {
    // Find matching config for TTL
    const cfg = configs.find((c) => c.type === result.channel);
    const ttlMs = cfg?.ttlMs ?? 300000;

    // Replace existing entry
    cache.entries = cache.entries.filter((e) => e.channel !== result.channel);
    cache.entries.push({
      channel: result.channel,
      memories: result.memories,
      fetchedAt: result.fetchedAt,
      ttlMs,
    });
  }

  cache.lastRefreshAt = new Date().toISOString();
  await fs.mkdir(hermesDir, { recursive: true });
  await fs.writeFile(cachePath(hermesDir), JSON.stringify(cache, null, 2), "utf-8");
}

/** Load cached channel memories as Hermes Memory objects. Returns only non-stale entries. */
export async function loadCachedChannelMemories(
  hermesDir: string,
  configs: ChannelConfig[],
  sessionId: string
): Promise<Memory[]> {
  const cache = await loadChannelCache(hermesDir);
  const now = Date.now();
  const memories: Memory[] = [];
  const enabledTypes = new Set(configs.filter((c) => c.enabled).map((c) => c.type));

  for (const entry of cache.entries) {
    if (!enabledTypes.has(entry.channel)) continue;
    const age = now - new Date(entry.fetchedAt).getTime();
    if (age >= (entry.ttlMs || 300000)) continue;

    // Dedup by externalId
    const seen = new Set<string>();
    for (const candidate of entry.memories) {
      const key = candidate.externalId || candidate.content.slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      memories.push(candidateToMemory(candidate, entry.channel, sessionId));
    }
  }

  return memories;
}

/** Check if channel cache needs refreshing. */
export async function isChannelCacheStale(
  hermesDir: string,
  configs: ChannelConfig[]
): Promise<boolean> {
  const cache = await loadChannelCache(hermesDir);
  const now = Date.now();

  for (const cfg of configs.filter((c) => c.enabled)) {
    const entry = cache.entries.find((e) => e.channel === cfg.type);
    if (!entry) return true;
    const age = now - new Date(entry.fetchedAt).getTime();
    if (age >= (entry.ttlMs || cfg.ttlMs || 300000)) return true;
  }

  return false;
}

/** Spawn a background worker to refresh the channel cache. */
export function triggerChannelRefresh(
  hermesDir: string,
  configs: ChannelConfig[]
): void {
  if (configs.length === 0) return;

  const workerPath = path.join(__dirname, "channel-worker.js");
  const payload = JSON.stringify({ hermesDir, configs });

  try {
    const child = spawn("node", [workerPath, payload], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
  } catch {
    // Silent failure — channel refresh is best-effort
  }
}
