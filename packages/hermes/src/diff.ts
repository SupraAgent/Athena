/**
 * Memory diffing — detect changes since last injection and produce deltas.
 * Inspired by claude-subconscious's block diffing approach.
 */

import * as crypto from "crypto";
import type { Memory, MemoryType } from "./types";
import { MEMORY_BLOCK_LABELS } from "./types";

/** Compute a hash of memory content for change detection. */
export function hashMemories(memories: Memory[]): string {
  const content = memories
    .map((m) => `${m.id}:${m.content}:${m.updatedAt}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Diff result for a single memory block type. */
export type BlockDiff = {
  type: MemoryType;
  label: string;
  added: string[];
  removed: string[];
  unchanged: number;
};

/** Compute diffs between previous and current memory sets. */
export function diffMemories(
  previous: Memory[],
  current: Memory[]
): BlockDiff[] {
  const prevById = new Map(previous.map((m) => [m.id, m]));
  const currById = new Map(current.map((m) => [m.id, m]));

  // Group by type
  const allTypes = new Set<MemoryType>([
    ...previous.map((m) => m.type),
    ...current.map((m) => m.type),
  ]);

  const diffs: BlockDiff[] = [];

  for (const type of allTypes) {
    const prevOfType = previous.filter((m) => m.type === type);
    const currOfType = current.filter((m) => m.type === type);

    const prevIds = new Set(prevOfType.map((m) => m.id));
    const currIds = new Set(currOfType.map((m) => m.id));

    const added = currOfType
      .filter((m) => !prevIds.has(m.id))
      .map((m) => m.content);

    const removed = prevOfType
      .filter((m) => !currIds.has(m.id))
      .map((m) => m.content);

    // Check for content changes in shared IDs
    for (const m of currOfType) {
      if (prevIds.has(m.id)) {
        const prev = prevById.get(m.id);
        if (prev && prev.content !== m.content) {
          removed.push(prev.content);
          added.push(m.content);
        }
      }
    }

    const unchanged = currOfType.filter(
      (m) => prevIds.has(m.id) && prevById.get(m.id)?.content === m.content
    ).length;

    if (added.length > 0 || removed.length > 0) {
      diffs.push({
        type,
        label: MEMORY_BLOCK_LABELS[type] ?? type,
        added,
        removed,
        unchanged,
      });
    }
  }

  return diffs;
}

/** Format diffs as a markdown update block. */
export function formatDiffBlock(diffs: BlockDiff[]): string {
  if (diffs.length === 0) return "";

  const lines = ["# Hermes — Memory Update", ""];

  for (const diff of diffs) {
    lines.push(`## ${diff.label}`);
    for (const r of diff.removed) {
      lines.push(`- ~~${r}~~`);
    }
    for (const a of diff.added) {
      lines.push(`+ ${a}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Format full memory blocks (for first injection in full mode). */
export function formatFullBlocks(memories: Memory[]): string {
  if (memories.length === 0) return "";

  const grouped: Record<string, Memory[]> = {};
  for (const m of memories) {
    (grouped[m.type] ??= []).push(m);
  }

  const lines = [
    "# Hermes — Persistent Memory",
    `_${memories.length} memories loaded._`,
    "",
  ];

  for (const [type, mems] of Object.entries(grouped)) {
    const label = MEMORY_BLOCK_LABELS[type as MemoryType] ?? type;
    lines.push(`## ${label}`);
    for (const m of mems) {
      const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
      lines.push(`- ${m.content}${tags}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
