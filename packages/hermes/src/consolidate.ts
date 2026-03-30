/**
 * Memory consolidation — merge redundant memories, resolve conflicts,
 * and compress the memory store over time.
 *
 * Two modes:
 * - Heuristic: TF-IDF similarity-based merging (no API key needed)
 * - LLM: Uses Claude to intelligently consolidate groups of related memories
 */

import type { Memory, MemoryType } from "./types";
import {
  loadMemories,
  deleteMemory,
  createMemory,
  saveMemory,
} from "./memory-store";
import { findSimilar } from "./semantic";

/** Result of a consolidation pass. */
export type ConsolidationResult = {
  merged: number;
  removed: number;
  conflicts: ConflictPair[];
  method: "heuristic" | "llm";
};

/** A detected conflict between two memories. */
export type ConflictPair = {
  a: Memory;
  b: Memory;
  reason: string;
};

// ── Heuristic Consolidation ─────────────────────────────────────

/** Detect potential conflicts (contradictory memories of the same type). */
function detectConflicts(memories: Memory[]): ConflictPair[] {
  const conflicts: ConflictPair[] = [];
  const byType = new Map<MemoryType, Memory[]>();

  for (const m of memories) {
    const list = byType.get(m.type) ?? [];
    list.push(m);
    byType.set(m.type, list);
  }

  // Check decisions and facts for contradictions
  for (const type of ["decision", "fact", "preference"] as MemoryType[]) {
    const mems = byType.get(type) ?? [];
    for (let i = 0; i < mems.length; i++) {
      for (let j = i + 1; j < mems.length; j++) {
        if (isContradiction(mems[i], mems[j])) {
          conflicts.push({
            a: mems[i],
            b: mems[j],
            reason: `Potential contradiction in ${type} memories`,
          });
        }
      }
    }
  }

  return conflicts;
}

/** Simple contradiction detection via negation patterns. */
function isContradiction(a: Memory, b: Memory): boolean {
  const aNorm = a.content.toLowerCase();
  const bNorm = b.content.toLowerCase();

  // Check for explicit negation patterns
  const negationPairs = [
    [/\buse\b/, /\bdon't use\b|never use\b|stopped using\b/],
    [/\bchose\b/, /\bremoved\b|replaced\b|switched from\b/],
    [/\balways\b/, /\bnever\b/],
    [/\benabled?\b/, /\bdisabled?\b/],
  ];

  for (const [pos, neg] of negationPairs) {
    if ((pos.test(aNorm) && neg.test(bNorm)) || (neg.test(aNorm) && pos.test(bNorm))) {
      // Check they share at least one meaningful word
      const aWords = new Set(aNorm.split(/\s+/).filter((w) => w.length > 3));
      const bWords = bNorm.split(/\s+/).filter((w) => w.length > 3);
      if (bWords.some((w) => aWords.has(w))) {
        return true;
      }
    }
  }

  return false;
}

/** Merge two similar memories into one (keeps the more recent, higher-relevance one). */
function mergePair(a: Memory, b: Memory): { keep: Memory; remove: Memory } {
  // Keep the one with higher relevance, or the more recent one
  const aScore = a.relevance + (new Date(a.updatedAt).getTime() / 1e15);
  const bScore = b.relevance + (new Date(b.updatedAt).getTime() / 1e15);

  if (aScore >= bScore) {
    // Boost the kept memory's relevance slightly
    a.relevance = Math.min(1, a.relevance + 0.05);
    a.updatedAt = new Date().toISOString();
    // Merge tags
    const allTags = new Set([...a.tags, ...b.tags]);
    a.tags = [...allTags];
    return { keep: a, remove: b };
  } else {
    b.relevance = Math.min(1, b.relevance + 0.05);
    b.updatedAt = new Date().toISOString();
    const allTags = new Set([...a.tags, ...b.tags]);
    b.tags = [...allTags];
    return { keep: b, remove: a };
  }
}

/** Run heuristic consolidation: find similar memories and merge them. */
export async function consolidateHeuristic(
  hermesDir: string,
  similarityThreshold = 0.6
): Promise<ConsolidationResult> {
  const memories = await loadMemories(hermesDir);
  if (memories.length < 2) {
    return { merged: 0, removed: 0, conflicts: [], method: "heuristic" };
  }

  const conflicts = detectConflicts(memories);
  const toRemove = new Set<string>();
  let merged = 0;

  // Find and merge similar memory groups
  for (const mem of memories) {
    if (toRemove.has(mem.id)) continue;

    const similar = findSimilar(memories, mem, similarityThreshold);
    for (const sim of similar) {
      if (toRemove.has(sim.id)) continue;

      // Don't merge across types unless both are facts
      if (mem.type !== sim.type && !(mem.type === "fact" && sim.type === "fact")) {
        continue;
      }

      const { keep, remove } = mergePair(mem, sim);
      toRemove.add(remove.id);
      await saveMemory(hermesDir, keep);
      merged++;
    }
  }

  // Delete merged memories
  let removed = 0;
  for (const id of toRemove) {
    if (await deleteMemory(hermesDir, id)) removed++;
  }

  return { merged, removed, conflicts, method: "heuristic" };
}

// ── LLM Consolidation ──────────────────────────────────────────

const CONSOLIDATION_PROMPT = `You are a memory consolidation system. Given a group of related memories, merge them into fewer, higher-quality memories.

Rules:
- Merge redundant/overlapping memories into single entries
- Resolve contradictions by keeping the most recent information
- Preserve all unique, non-redundant information
- Each consolidated memory should be a single concise sentence
- Assign relevance 0.0-1.0 based on importance
- Flag any unresolvable contradictions

Respond with ONLY valid JSON:
{
  "consolidated": [
    {"type": "decision", "content": "...", "relevance": 0.9}
  ],
  "removed_ids": ["mem_abc", "mem_def"],
  "conflicts": [
    {"ids": ["mem_1", "mem_2"], "reason": "Contradictory: one says use X, other says removed X"}
  ]
}`;

/** Run LLM-powered consolidation. */
export async function consolidateWithLLM(
  hermesDir: string,
  apiKey: string
): Promise<ConsolidationResult> {
  const memories = await loadMemories(hermesDir);
  if (memories.length < 3) {
    return { merged: 0, removed: 0, conflicts: [], method: "llm" };
  }

  // Format memories for the LLM
  const memoryDump = memories.map((m) =>
    `[${m.id}] [${m.type}] ${m.content} (relevance: ${m.relevance}, updated: ${m.updatedAt})`
  ).join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `${CONSOLIDATION_PROMPT}\n\nMemories to consolidate:\n${memoryDump}`,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    consolidated?: Array<{ type: string; content: string; relevance: number }>;
    removed_ids?: string[];
    conflicts?: Array<{ ids: string[]; reason: string }>;
  };

  // Remove old memories
  const removedIds = new Set(parsed.removed_ids ?? []);
  let removed = 0;
  for (const id of removedIds) {
    if (await deleteMemory(hermesDir, id)) removed++;
  }

  // Create consolidated memories
  let merged = 0;
  const validTypes = new Set([
    "fact", "decision", "preference", "project-context",
    "pattern", "pending", "guidance",
  ]);

  for (const mem of parsed.consolidated ?? []) {
    if (validTypes.has(mem.type) && mem.content?.length > 5) {
      await createMemory(
        hermesDir,
        mem.type as MemoryType,
        mem.content.slice(0, 300),
        [],
        "consolidation",
        Math.max(0, Math.min(1, mem.relevance ?? 0.7))
      );
      merged++;
    }
  }

  // Parse conflicts
  const conflicts: ConflictPair[] = [];
  const memById = new Map(memories.map((m) => [m.id, m]));
  for (const c of parsed.conflicts ?? []) {
    if (c.ids.length >= 2) {
      const a = memById.get(c.ids[0]);
      const b = memById.get(c.ids[1]);
      if (a && b) {
        conflicts.push({ a, b, reason: c.reason });
      }
    }
  }

  return { merged, removed, conflicts, method: "llm" };
}

/** Run consolidation — LLM if API key available, otherwise heuristic. */
export async function consolidateMemories(
  hermesDir: string,
  apiKey?: string
): Promise<ConsolidationResult> {
  if (apiKey) {
    try {
      return await consolidateWithLLM(hermesDir, apiKey);
    } catch {
      // Fall back to heuristic
    }
  }
  return consolidateHeuristic(hermesDir);
}
