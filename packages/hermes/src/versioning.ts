/**
 * Memory Version History — append-only JSONL per memory.
 *
 * Tracks previous content versions when memories are updated,
 * enabling rollback and audit trails.
 *
 * Stored in .athena/hermes/versions/{memoryId}.jsonl
 */

import * as fs from "fs/promises";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────

export type MemoryVersion = {
  version: number;
  content: string;
  updatedAt: string;
  source: string;
};

// ── Paths ──────────────────────────────────────────────────────

function versionsDir(hermesDir: string): string {
  return path.join(hermesDir, "versions");
}

function versionFile(hermesDir: string, memoryId: string): string {
  return path.join(versionsDir(hermesDir), `${memoryId}.jsonl`);
}

// ── Version Operations ─────────────────────────────────────────

/** Record a version before an update. */
export async function versionMemory(
  hermesDir: string,
  memoryId: string,
  previousContent: string,
  source: string
): Promise<void> {
  const dir = versionsDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });

  const filePath = versionFile(hermesDir, memoryId);
  const history = await getMemoryHistory(hermesDir, memoryId);
  const version = history.length + 1;

  const entry: MemoryVersion = {
    version,
    content: previousContent,
    updatedAt: new Date().toISOString(),
    source,
  };

  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

/** Get the full version history for a memory. */
export async function getMemoryHistory(
  hermesDir: string,
  memoryId: string
): Promise<MemoryVersion[]> {
  try {
    const raw = await fs.readFile(versionFile(hermesDir, memoryId), "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line) as MemoryVersion; }
        catch { return null; }
      })
      .filter((v): v is MemoryVersion => v !== null);
  } catch {
    return [];
  }
}

/** Get a specific version's content. */
export async function getVersion(
  hermesDir: string,
  memoryId: string,
  version: number
): Promise<MemoryVersion | null> {
  const history = await getMemoryHistory(hermesDir, memoryId);
  return history.find((v) => v.version === version) ?? null;
}
