/**
 * Mem0-style Smart Consolidation Pipeline
 *
 * For each extracted memory candidate, searches existing memories for
 * similar entries, then decides: ADD, UPDATE, DELETE, or NOOP.
 *
 * Two modes:
 * - LLM: Calls Claude Haiku to decide action per candidate (highest quality)
 * - Heuristic: Uses TF-IDF similarity scoring (zero-dependency fallback)
 */

import type { Memory, MemoryType, MemoryScope } from "./types";
import type { ExtractedMemory } from "./llm-extract";
import { findSimilar, _resetSemanticCache } from "./semantic";
import {
  loadMemories,
  createMemory,
  updateMemory,
  deleteMemory,
} from "./memory-store";
import { sanitizeContent } from "./sanitize";

// ── Types ──────────────────────────────────────────────────────

/** Action the pipeline decides for each candidate. */
export type Mem0Action = "ADD" | "UPDATE" | "DELETE" | "NOOP";

/** Decision for a single candidate memory. */
export type Mem0Decision = {
  action: Mem0Action;
  candidate: ExtractedMemory;
  /** ID of the existing memory to update/delete (if applicable). */
  targetId?: string;
  /** Merged content for UPDATE actions. */
  mergedContent?: string;
  /** Reason for the decision (for logging). */
  reason: string;
};

/** Result of running the full pipeline. */
export type Mem0PipelineResult = {
  decisions: Mem0Decision[];
  added: number;
  updated: number;
  deleted: number;
  noops: number;
  method: "llm" | "heuristic";
};

// ── Heuristic Pipeline ────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.55;
const HIGH_SIMILARITY_THRESHOLD = 0.85;

/** Decide action for a single candidate using heuristic similarity. */
function heuristicDecide(
  candidate: ExtractedMemory,
  existing: Memory[]
): Mem0Decision {
  if (existing.length === 0) {
    return { action: "ADD", candidate, reason: "No existing memories" };
  }

  // Create a temporary Memory object for similarity comparison
  const tempMemory: Memory = {
    id: "temp",
    type: candidate.type,
    content: candidate.content,
    tags: [],
    createdAt: "",
    updatedAt: "",
    source: "",
    relevance: candidate.relevance,
    scope: "user",
  };

  const similar = findSimilar(existing, tempMemory, SIMILARITY_THRESHOLD);

  if (similar.length === 0) {
    return { action: "ADD", candidate, reason: "No similar memories found" };
  }

  const topMatch = similar[0];
  const topSimilarity = computeOverlap(candidate.content, topMatch.content);

  // Near-duplicate — NOOP
  if (topSimilarity > HIGH_SIMILARITY_THRESHOLD) {
    return {
      action: "NOOP",
      candidate,
      targetId: topMatch.id,
      reason: `Near-duplicate of ${topMatch.id} (${(topSimilarity * 100).toFixed(0)}% overlap)`,
    };
  }

  // Check for contradiction (supersedes/replaces existing)
  if (isSuperseding(candidate, topMatch)) {
    return {
      action: "UPDATE",
      candidate,
      targetId: topMatch.id,
      mergedContent: candidate.content,
      reason: `Supersedes ${topMatch.id} — newer information`,
    };
  }

  // Moderate similarity — UPDATE (merge information)
  return {
    action: "UPDATE",
    candidate,
    targetId: topMatch.id,
    mergedContent: mergeContent(topMatch.content, candidate.content),
    reason: `Merging with ${topMatch.id} (${(topSimilarity * 100).toFixed(0)}% overlap)`,
  };
}

/** Compute word-level overlap ratio between two texts. */
function computeOverlap(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length >= 2));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length >= 2));
  if (aWords.size === 0 && bWords.size === 0) return 1;
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap++;
  }
  const union = new Set([...aWords, ...bWords]).size;
  return union === 0 ? 0 : overlap / union;
}

/** Check if a candidate supersedes (contradicts/replaces) an existing memory. */
function isSuperseding(candidate: ExtractedMemory, existing: Memory): boolean {
  const cNorm = candidate.content.toLowerCase();
  const eNorm = existing.content.toLowerCase();

  // Same type + newer info with negation patterns
  if (candidate.type !== existing.type) return false;

  const supersedingPatterns = [
    [/\bswitched (?:to|from)\b/, /\buse\b|\busing\b|\bchose\b/],
    [/\breplaced\b|\bremoved\b/, /\buse\b|\badded\b/],
    [/\bno longer\b|\bstopped\b/, /\balways\b|\buse\b/],
    [/\binstead of\b/, /\bchose\b|\bdecided\b/],
    [/\bmigrated (?:to|from)\b/, /\buse\b|\busing\b/],
    [/\bdeprecated\b/, /\buse\b|\badded\b|\benabled?\b/],
    [/\bdropped\b/, /\buse\b|\badded\b|\bchose\b/],
  ];

  for (const [newPattern, oldPattern] of supersedingPatterns) {
    if (newPattern.test(cNorm) && oldPattern.test(eNorm)) {
      // Check they share a meaningful topic word (3+ chars for tech terms like API, CSS)
      const cWords = new Set(cNorm.split(/\s+/).filter((w) => w.length >= 3));
      const eWords = eNorm.split(/\s+/).filter((w) => w.length >= 3);
      if (eWords.some((w) => cWords.has(w))) return true;
    }
  }

  return false;
}

/** Merge two pieces of content, keeping unique information from both. */
function mergeContent(existing: string, candidate: string): string {
  // Strip any prior "(previously: ...)" to prevent nested accumulation
  const cleanExisting = existing.replace(/\s*\(previously:[\s\S]*\)$/, "").trim();
  // If candidate is substantially longer, it likely contains more info
  if (candidate.length > cleanExisting.length * 1.5) return candidate;
  // If existing is longer, append only truly new info from candidate
  if (cleanExisting.length > candidate.length * 1.5) return cleanExisting;
  // Similar length — combine, preferring candidate (newer)
  const combined = `${candidate} (previously: ${cleanExisting})`;
  return combined.length <= 300 ? combined : candidate;
}

/** Run heuristic pipeline for all candidates. */
export async function smartConsolidateHeuristic(
  hermesDir: string,
  candidates: ExtractedMemory[],
  sessionId: string,
  scope: MemoryScope = "user"
): Promise<Mem0PipelineResult> {
  const allExisting = await loadMemories(hermesDir);
  // Filter by scope to prevent cross-scope contamination
  const snapshot = allExisting.filter((m) => (m.scope ?? "user") === scope);
  const decisions: Mem0Decision[] = [];
  let added = 0, updated = 0, deleted = 0, noops = 0;

  // Reset semantic cache to ensure fresh comparisons
  _resetSemanticCache();

  for (const candidate of candidates) {
    // Compare only against the original snapshot, not newly-added memories
    const decision = heuristicDecide(candidate, snapshot);
    decisions.push(decision);

    switch (decision.action) {
      case "ADD": {
        await createMemory(
          hermesDir, candidate.type, sanitizeContent(candidate.content),
          [], sessionId, candidate.relevance, scope
        );
        added++;
        break;
      }
      case "UPDATE": {
        if (decision.targetId && decision.mergedContent) {
          await updateMemory(hermesDir, decision.targetId, {
            content: sanitizeContent(decision.mergedContent),
            relevance: Math.min(1, candidate.relevance + 0.05),
          });
          updated++;
        }
        break;
      }
      case "DELETE": {
        if (decision.targetId) {
          await deleteMemory(hermesDir, decision.targetId);
          deleted++;
        }
        break;
      }
      case "NOOP":
        noops++;
        break;
    }
  }

  return { decisions, added, updated, deleted, noops, method: "heuristic" };
}

// ── LLM Pipeline ──────────────────────────────────────────────

const MEM0_PROMPT = `You are a memory management system. For each candidate memory, decide what action to take relative to the existing memories.

Actions:
- ADD: New information, no similar existing memory
- UPDATE: Similar existing memory found — merge or replace with better version
- DELETE: Candidate contradicts or invalidates an existing memory (mark the existing one for deletion)
- NOOP: Duplicate or already captured — skip

For each candidate, respond with the action and reasoning.

Respond with ONLY valid JSON:
{
  "decisions": [
    {
      "candidateIndex": 0,
      "action": "ADD|UPDATE|DELETE|NOOP",
      "targetId": "mem_xxx (for UPDATE/DELETE, null for ADD/NOOP)",
      "mergedContent": "merged text (for UPDATE only, null otherwise)",
      "reason": "brief explanation"
    }
  ]
}`;

/** Run LLM-powered pipeline for all candidates. */
export async function smartConsolidateLLM(
  hermesDir: string,
  candidates: ExtractedMemory[],
  sessionId: string,
  apiKey: string,
  scope: MemoryScope = "user"
): Promise<Mem0PipelineResult> {
  const existing = await loadMemories(hermesDir);

  // Format existing memories for context
  const existingDump = existing.slice(0, 50).map((m) =>
    `[${m.id}] [${m.type}] ${m.content}`
  ).join("\n");

  const candidateDump = candidates.map((c, i) =>
    `[${i}] [${c.type}] ${c.content} (relevance: ${c.relevance})`
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
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `${MEM0_PROMPT}\n\nExisting memories:\n${existingDump}\n\nCandidate memories:\n${candidateDump}`,
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
    decisions?: Array<{
      candidateIndex: number;
      action: string;
      targetId?: string | null;
      mergedContent?: string | null;
      reason: string;
    }>;
  };

  // Build a set of valid target IDs for validation
  const validIds = new Set(existing.map((m) => m.id));

  const decisions: Mem0Decision[] = [];
  let added = 0, updated = 0, deleted = 0, noops = 0;

  for (const d of parsed.decisions ?? []) {
    const candidate = candidates[d.candidateIndex];
    if (!candidate) continue;

    const action = (["ADD", "UPDATE", "DELETE", "NOOP"].includes(d.action)
      ? d.action
      : "NOOP") as Mem0Action;

    // Validate targetId — reject hallucinated IDs from the LLM
    const targetId = d.targetId && validIds.has(d.targetId) ? d.targetId : undefined;
    if ((action === "UPDATE" || action === "DELETE") && !targetId) {
      decisions.push({
        action: "NOOP", candidate,
        reason: `Invalid targetId "${d.targetId}" — skipped`,
      });
      noops++;
      continue;
    }

    const decision: Mem0Decision = {
      action,
      candidate,
      targetId,
      mergedContent: d.mergedContent ? sanitizeContent(d.mergedContent) : undefined,
      reason: d.reason,
    };
    decisions.push(decision);

    switch (action) {
      case "ADD": {
        await createMemory(
          hermesDir, candidate.type, sanitizeContent(candidate.content),
          [], sessionId, candidate.relevance, scope
        );
        added++;
        break;
      }
      case "UPDATE": {
        if (decision.targetId) {
          const content = decision.mergedContent ?? sanitizeContent(candidate.content);
          await updateMemory(hermesDir, decision.targetId, {
            content: content.slice(0, 300),
            relevance: Math.min(1, candidate.relevance + 0.05),
          });
          updated++;
        }
        break;
      }
      case "DELETE": {
        if (decision.targetId) {
          await deleteMemory(hermesDir, decision.targetId);
          deleted++;
        }
        break;
      }
      case "NOOP":
        noops++;
        break;
    }
  }

  return { decisions, added, updated, deleted, noops, method: "llm" };
}

/** Run smart consolidation — LLM if API key available, heuristic fallback. */
export async function smartConsolidate(
  hermesDir: string,
  candidates: ExtractedMemory[],
  sessionId: string,
  apiKey?: string,
  scope: MemoryScope = "user"
): Promise<Mem0PipelineResult> {
  if (candidates.length === 0) {
    return { decisions: [], added: 0, updated: 0, deleted: 0, noops: 0, method: "heuristic" };
  }

  if (apiKey) {
    try {
      return await smartConsolidateLLM(hermesDir, candidates, sessionId, apiKey, scope);
    } catch {
      // Fall back to heuristic
    }
  }

  return smartConsolidateHeuristic(hermesDir, candidates, sessionId, scope);
}
