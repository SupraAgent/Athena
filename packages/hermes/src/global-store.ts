/**
 * Global cross-project memory store.
 *
 * Stores memories in ~/.hermes/ (or HERMES_HOME) so knowledge
 * learned in one repo is available in all others.
 */

import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as YAML from "yaml";
import type { Memory, GlobalHermesConfig } from "./types";
import { DEFAULT_GLOBAL_CONFIG } from "./types";
import { loadMemories, saveMemory, deleteMemory, createMemory, pruneMemories } from "./memory-store";
import { findSimilar } from "./semantic";

// ── Atomic write (same pattern as config.ts) ─────────────────────

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ── Paths ────────────────────────────────────────────────────────

/**
 * Resolve the global hermes home directory. Override via HERMES_HOME env var.
 * Validates the path to prevent directory traversal attacks.
 */
export function getGlobalHermesDir(): string {
  const raw = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
  const resolved = path.resolve(raw);
  // Block obvious traversal: must be an absolute path under home or /tmp
  const home = os.homedir();
  const tmp = os.tmpdir();
  if (!resolved.startsWith(home) && !resolved.startsWith(tmp) && !resolved.startsWith("/tmp")) {
    throw new Error(
      `HERMES_HOME must be under the home directory or tmp. Got: ${resolved}`
    );
  }
  return resolved;
}

/** Ensure the global directory and memories subdirectory exist. */
export async function ensureGlobalDir(): Promise<string> {
  const dir = getGlobalHermesDir();
  await fs.mkdir(path.join(dir, "memories"), { recursive: true });
  return dir;
}

// ── Global Config ────────────────────────────────────────────────

const VALID_CONFLICT_STRATEGIES = new Set(["local-priority", "global-priority", "last-write-wins"]);

/** Load ~/.hermes/hermes.yaml config, returning defaults if not found. */
export async function loadGlobalConfig(): Promise<GlobalHermesConfig> {
  const configPath = path.join(getGlobalHermesDir(), "hermes.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = YAML.parse(raw);
    const strategy = parsed?.conflict_strategy;
    return {
      maxMemories: parsed?.max_memories ?? DEFAULT_GLOBAL_CONFIG.maxMemories,
      conflictStrategy: VALID_CONFLICT_STRATEGIES.has(strategy)
        ? (strategy as GlobalHermesConfig["conflictStrategy"])
        : DEFAULT_GLOBAL_CONFIG.conflictStrategy,
      enabled: parsed?.enabled !== false,
    };
  } catch (err: unknown) {
    // ENOENT is expected (not initialized yet). Anything else is a real problem.
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_GLOBAL_CONFIG };
    }
    process.stderr.write(`[hermes] Warning: failed to read global config: ${err instanceof Error ? err.message : String(err)}\n`);
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
}

/** Save ~/.hermes/hermes.yaml config (atomic write). */
export async function saveGlobalConfig(config: GlobalHermesConfig): Promise<void> {
  const dir = await ensureGlobalDir();
  const doc = {
    max_memories: config.maxMemories,
    conflict_strategy: config.conflictStrategy,
    enabled: config.enabled,
  };
  const content = `# Hermes Global Configuration\n${YAML.stringify(doc)}`;
  await atomicWriteFile(path.join(dir, "hermes.yaml"), content);
}

// ── CRUD (delegates to memory-store with global dir) ─────────────

/** Load all global memories from ~/.hermes/memories/. */
export async function loadGlobalMemories(): Promise<Memory[]> {
  const dir = getGlobalHermesDir();
  try {
    return await loadMemories(dir);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    process.stderr.write(`[hermes] Warning: failed to load global memories: ${err instanceof Error ? err.message : String(err)}\n`);
    return [];
  }
}

/** Save a memory to the global store with scope: "global". Enforces maxMemories limit. */
export async function saveGlobalMemory(memory: Memory): Promise<void> {
  const dir = await ensureGlobalDir();
  await saveMemory(dir, { ...memory, scope: "global" });
  // Enforce maxMemories limit
  const config = await loadGlobalConfig();
  await pruneMemories(dir, config.maxMemories);
}

/** Create a new memory directly in the global store. */
export async function createGlobalMemory(
  type: Memory["type"],
  content: string,
  tags: string[] = [],
  source = "cli",
  relevance = 0.8
): Promise<Memory> {
  const dir = await ensureGlobalDir();
  const mem = await createMemory(dir, type, content, tags, source, relevance, "global");
  // Enforce maxMemories limit
  const config = await loadGlobalConfig();
  await pruneMemories(dir, config.maxMemories);
  return mem;
}

/** Delete a memory from the global store. */
export async function deleteGlobalMemory(id: string): Promise<boolean> {
  const dir = getGlobalHermesDir();
  return deleteMemory(dir, id);
}

// ── Promote ──────────────────────────────────────────────────────

/** Copy a local memory to the global store. Dedup check via semantic similarity. */
export async function promoteToGlobal(
  hermesDir: string,
  memoryId: string
): Promise<Memory | null> {
  const locals = await loadMemories(hermesDir);
  const target = locals.find((m) => m.id === memoryId);
  if (!target) return null;

  const globals = await loadGlobalMemories();

  // Check for semantic duplicates
  const similar = findSimilar(globals, target, 0.8);
  if (similar.length > 0) {
    const existing = similar[0];
    // Update existing global memory if target is newer or same age (prefer incoming)
    if (new Date(target.updatedAt) >= new Date(existing.updatedAt)) {
      const updated: Memory = {
        ...existing,
        content: target.content,
        tags: [...new Set([...existing.tags, ...target.tags])],
        updatedAt: new Date().toISOString(),
        relevance: Math.max(existing.relevance, target.relevance),
      };
      await saveGlobalMemory(updated);
      return updated;
    }
    return existing;
  }

  // No duplicate — create new global copy
  const globalCopy: Memory = {
    ...target,
    scope: "global",
    updatedAt: new Date().toISOString(),
  };
  await saveGlobalMemory(globalCopy);
  return globalCopy;
}

// ── Conflict Resolution ──────────────────────────────────────────

/**
 * Merge global memories into local memories using a conflict strategy.
 * Returns the merged list with conflicts resolved.
 */
export function mergeGlobalWithLocal(
  localMemories: Memory[],
  globalMemories: Memory[],
  strategy: GlobalHermesConfig["conflictStrategy"] = "last-write-wins"
): Memory[] {
  if (globalMemories.length === 0) return localMemories;
  if (localMemories.length === 0) return globalMemories;

  // Build a map of local memory content fingerprints for fast dedup
  const localContentSet = new Set(localMemories.map((m) => m.content.toLowerCase().trim()));

  const merged = [...localMemories];

  for (const gm of globalMemories) {
    // Exact content dedup
    if (localContentSet.has(gm.content.toLowerCase().trim())) continue;

    // Check semantic similarity against local memories
    const similar = findSimilar(localMemories, gm, 0.8);
    if (similar.length > 0) {
      const local = similar[0];
      switch (strategy) {
        case "local-priority":
          // Local wins — skip this global memory
          break;
        case "global-priority":
          // Global wins — replace local with global
          const localIdx = merged.findIndex((m) => m.id === local.id);
          if (localIdx >= 0) merged[localIdx] = gm;
          break;
        case "last-write-wins": {
          const localTime = new Date(local.updatedAt).getTime();
          const globalTime = new Date(gm.updatedAt).getTime();
          if (globalTime > localTime) {
            const idx = merged.findIndex((m) => m.id === local.id);
            if (idx >= 0) merged[idx] = gm;
          }
          break;
        }
      }
    } else {
      // No conflict — add global memory
      merged.push(gm);
    }
  }

  return merged;
}

// ── Status ───────────────────────────────────────────────────────

export type GlobalStatus = {
  dir: string;
  exists: boolean;
  config: GlobalHermesConfig;
  memoryCount: number;
  typeCounts: Record<string, number>;
};

/** Get global store status. */
export async function getGlobalStatus(): Promise<GlobalStatus> {
  const dir = getGlobalHermesDir();
  let exists = false;
  try {
    await fs.access(dir);
    exists = true;
  } catch {
    // not initialized
  }

  const config = await loadGlobalConfig();
  const memories = exists ? await loadGlobalMemories() : [];
  const typeCounts: Record<string, number> = {};
  for (const m of memories) {
    typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1;
  }

  return { dir, exists, config, memoryCount: memories.length, typeCounts };
}
