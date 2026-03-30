/**
 * Bidirectional cross-repo memory relay with conflict resolution.
 *
 * Enables syncing memories between Athena projects via the relay
 * directory (.athena/hermes/relay/). Pull ingests remote memories,
 * push prepares local memories for consumption by peers.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as YAML from "yaml";
import type { Memory, ExternalSource } from "./types";

/** Atomic write: temp file + rename. */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}
import { loadMemories, saveMemory } from "./memory-store";
import { loadRemoteMemories } from "./memory-store";
import { findSimilar } from "./semantic";
import { sanitizeContent } from "./sanitize";

// ── Types ──────────────────────────────────────────────────────

export type RelayConflict = {
  localMemory: Memory;
  remoteMemory: Memory;
  resolution: "local-wins" | "remote-wins" | "merge" | "skip";
};

export type RelaySyncResult = {
  pushed: number;
  pulled: number;
  conflicts: RelayConflict[];
  errors: string[];
};

export type RelayManifest = {
  lastSyncAt: string;
  peers: {
    repo: string;
    lastPulledAt: string;
    lastPushedAt: string;
    memoryCount: number;
  }[];
};

export type ConflictStrategy =
  | "last-write-wins"
  | "local-priority"
  | "remote-priority";

// ── Conflict Detection ─────────────────────────────────────────

/**
 * Detect conflicts between local and remote memory sets.
 *
 * Two kinds of conflict:
 * 1. Same ID, different content — direct conflict.
 * 2. Different IDs but high semantic similarity (>threshold) — merge candidate.
 */
export function detectConflicts(
  local: Memory[],
  remote: Memory[],
  threshold = 0.8
): RelayConflict[] {
  const conflicts: RelayConflict[] = [];
  const localById = new Map(local.map((m) => [m.id, m]));
  const matchedRemoteIds = new Set<string>();

  // Pass 1: ID-based conflicts
  for (const remoteMem of remote) {
    const localMem = localById.get(remoteMem.id);
    if (localMem) {
      matchedRemoteIds.add(remoteMem.id);
      // Only flag as conflict if content actually differs
      if (localMem.content.trim() !== remoteMem.content.trim()) {
        conflicts.push({
          localMemory: localMem,
          remoteMemory: remoteMem,
          resolution: "skip", // default — caller resolves
        });
      }
    }
  }

  // Pass 2: Semantic similarity conflicts (merge candidates)
  const unmatchedRemote = remote.filter((m) => !matchedRemoteIds.has(m.id));
  for (const remoteMem of unmatchedRemote) {
    const similar = findSimilar(local, remoteMem, threshold);
    if (similar.length > 0) {
      conflicts.push({
        localMemory: similar[0],
        remoteMemory: remoteMem,
        resolution: "merge",
      });
    }
  }

  return conflicts;
}

// ── Conflict Resolution ────────────────────────────────────────

/**
 * Resolve a conflict using the specified strategy.
 * Returns the winning memory (potentially with merged metadata).
 */
export function resolveConflict(
  conflict: RelayConflict,
  strategy: ConflictStrategy = "last-write-wins"
): Memory {
  const { localMemory, remoteMemory } = conflict;

  switch (strategy) {
    case "last-write-wins": {
      const localTime = new Date(localMemory.updatedAt).getTime();
      const remoteTime = new Date(remoteMemory.updatedAt).getTime();
      return remoteTime > localTime ? remoteMemory : localMemory;
    }

    case "local-priority":
      return localMemory;

    case "remote-priority":
      return remoteMemory;

    default:
      return localMemory;
  }
}

// ── Relay Manifest ─────────────────────────────────────────────

function manifestPath(hermesDir: string): string {
  return path.join(hermesDir, "relay", "manifest.yaml");
}

/** Load the relay manifest, returning defaults if none exists. */
export async function loadRelayManifest(
  hermesDir: string
): Promise<RelayManifest> {
  try {
    const raw = await fs.readFile(manifestPath(hermesDir), "utf-8");
    const parsed = YAML.parse(raw);
    return {
      lastSyncAt: parsed?.lastSyncAt ?? new Date(0).toISOString(),
      peers: Array.isArray(parsed?.peers) ? parsed.peers : [],
    };
  } catch {
    return { lastSyncAt: new Date(0).toISOString(), peers: [] };
  }
}

/** Persist the relay manifest to disk. */
export async function saveRelayManifest(
  hermesDir: string,
  manifest: RelayManifest
): Promise<void> {
  const filePath = manifestPath(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = `# Hermes Relay Manifest\n${YAML.stringify(manifest)}`;
  await atomicWriteFile(filePath, content);
}

// ── Helpers ────────────────────────────────────────────────────

/** Update a peer entry in the manifest, creating it if absent. */
function upsertPeer(
  manifest: RelayManifest,
  repo: string,
  update: Partial<RelayManifest["peers"][number]>
): void {
  const existing = manifest.peers.find((p) => p.repo === repo);
  if (existing) {
    Object.assign(existing, update);
  } else {
    manifest.peers.push({
      repo,
      lastPulledAt: new Date(0).toISOString(),
      lastPushedAt: new Date(0).toISOString(),
      memoryCount: 0,
      ...update,
    });
  }
}

/** Create an empty sync result. */
function emptySyncResult(): RelaySyncResult {
  return { pushed: 0, pulled: 0, conflicts: [], errors: [] };
}

// ── Sync Operations ────────────────────────────────────────────

/**
 * Pull remote memories from configured external sources.
 * Detects conflicts against local memories and resolves with last-write-wins.
 * New (non-conflicting) remote memories are saved locally after sanitization.
 */
export async function pullRemoteMemories(
  hermesDir: string,
  sources: ExternalSource[],
  strategy: ConflictStrategy = "last-write-wins"
): Promise<RelaySyncResult> {
  const result = emptySyncResult();
  const local = await loadMemories(hermesDir);
  const localIds = new Set(local.map((m) => m.id));
  const manifest = await loadRelayManifest(hermesDir);
  const now = new Date().toISOString();

  for (const source of sources) {
    try {
      const remote = await loadRemoteMemories(source);
      if (remote.length === 0) continue;

      // Sanitize all incoming content
      const sanitized = remote.map((m) => ({
        ...m,
        content: sanitizeContent(m.content),
      }));

      // Detect conflicts
      const conflicts = detectConflicts(local, sanitized);
      const conflictRemoteIds = new Set(
        conflicts.map((c) => c.remoteMemory.id)
      );

      // Resolve conflicts
      for (const conflict of conflicts) {
        const resolved = resolveConflict(conflict, strategy);
        conflict.resolution =
          resolved.id === conflict.localMemory.id
            ? "local-wins"
            : "remote-wins";

        if (conflict.resolution === "remote-wins") {
          await saveMemory(hermesDir, resolved);
          result.pulled++;
        }
        result.conflicts.push(conflict);
      }

      // Save new (non-conflicting) remote memories
      for (const mem of sanitized) {
        if (!localIds.has(mem.id) && !conflictRemoteIds.has(mem.id)) {
          await saveMemory(hermesDir, mem);
          result.pulled++;
        }
      }

      // Update manifest
      upsertPeer(manifest, source.repo, {
        lastPulledAt: now,
        memoryCount: remote.length,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `Unknown error from ${source.repo}`;
      result.errors.push(msg);
    }
  }

  manifest.lastSyncAt = now;
  await saveRelayManifest(hermesDir, manifest);
  return result;
}

/**
 * Prepare local user-scope memories for push to a target repo.
 * Writes a relay file at .athena/hermes/relay/{sourceRepo}.yaml
 * that the target repo can ingest. Actual git push is left to the caller.
 */
export async function pushLocalMemories(
  hermesDir: string,
  targetRepo: string,
  targetBranch: string
): Promise<RelaySyncResult> {
  const result = emptySyncResult();

  try {
    const local = await loadMemories(hermesDir);
    const userMemories = local.filter((m) => (m.scope ?? "user") === "user");

    if (userMemories.length === 0) return result;

    // Derive a safe filename from the source repo context
    const sourceLabel = path
      .basename(path.resolve(hermesDir, "../.."))
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const relayDir = path.join(hermesDir, "relay");
    await fs.mkdir(relayDir, { recursive: true });

    const relayData = {
      source: sourceLabel,
      targetRepo,
      targetBranch,
      exportedAt: new Date().toISOString(),
      memories: userMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        tags: m.tags,
        created_at: m.createdAt,
        updated_at: m.updatedAt,
        source: m.source,
        relevance: m.relevance,
        scope: m.scope,
      })),
    };

    const filePath = path.join(relayDir, `${sourceLabel}.yaml`);
    const content = `# Hermes Relay Export — ${sourceLabel}\n${YAML.stringify(relayData)}`;
    await atomicWriteFile(filePath, content);

    result.pushed = userMemories.length;

    // Update manifest
    const manifest = await loadRelayManifest(hermesDir);
    const now = new Date().toISOString();
    upsertPeer(manifest, targetRepo, {
      lastPushedAt: now,
      memoryCount: userMemories.length,
    });
    manifest.lastSyncAt = now;
    await saveRelayManifest(hermesDir, manifest);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown error during push";
    result.errors.push(msg);
  }

  return result;
}

/**
 * Run a full bidirectional sync: pull from all sources, then push local
 * memories. Aggregates results from both directions.
 */
export async function syncBidirectional(
  hermesDir: string,
  sources: ExternalSource[],
  strategy: ConflictStrategy = "last-write-wins"
): Promise<RelaySyncResult> {
  const result = emptySyncResult();

  // Pull phase
  const pullResult = await pullRemoteMemories(hermesDir, sources, strategy);
  result.pulled += pullResult.pulled;
  result.conflicts.push(...pullResult.conflicts);
  result.errors.push(...pullResult.errors);

  // Push phase — push to each configured source
  for (const source of sources) {
    try {
      const pushResult = await pushLocalMemories(
        hermesDir,
        source.repo,
        source.branch
      );
      result.pushed += pushResult.pushed;
      result.errors.push(...pushResult.errors);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Push failed for ${source.repo}`;
      result.errors.push(msg);
    }
  }

  return result;
}
