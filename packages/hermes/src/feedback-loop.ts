/**
 * Feedback Loop — self-improvement feedback scoring for memories.
 *
 * Records positive/negative/neutral signals for memories, computes
 * aggregate scores, and adjusts memory relevance based on feedback.
 * Also detects implicit feedback from user prompts.
 *
 * Signals are stored in .athena/hermes/feedback.jsonl (append-only JSONL).
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { Memory } from "./types";
import { loadMemories, updateMemory } from "./memory-store";

// ── Types ──────────────────────────────────────────────────────

export type FeedbackSignal = {
  memoryId: string;
  signal: "positive" | "negative" | "neutral";
  reason: string;
  timestamp: string;
};

export type FeedbackScore = {
  memoryId: string;
  positiveCount: number;
  negativeCount: number;
  netScore: number;
  lastSignalAt: string;
};

export type FeedbackSummary = {
  totalSignals: number;
  averageScore: number;
  topMemories: FeedbackScore[];
  bottomMemories: FeedbackScore[];
};

// ── Paths ──────────────────────────────────────────────────────

function feedbackFile(hermesDir: string): string {
  return path.join(hermesDir, "feedback.jsonl");
}

// ── Signal Recording ───────────────────────────────────────────

/** Append a feedback signal to .athena/hermes/feedback.jsonl. */
export async function recordFeedback(
  hermesDir: string,
  signal: FeedbackSignal
): Promise<void> {
  const filePath = feedbackFile(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(signal) + "\n";
  await fs.appendFile(filePath, line, "utf-8");
}

/** Read and parse all feedback signals from the JSONL file. */
export async function loadFeedbackSignals(
  hermesDir: string
): Promise<FeedbackSignal[]> {
  const filePath = feedbackFile(hermesDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const signals: FeedbackSignal[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as FeedbackSignal;
        if (parsed.memoryId && parsed.signal && parsed.timestamp) {
          signals.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return signals;
  } catch {
    return [];
  }
}

// ── Score Computation ──────────────────────────────────────────

/** Group signals by memoryId and compute aggregate scores. Sorted by netScore descending. */
export function computeScores(signals: FeedbackSignal[]): FeedbackScore[] {
  const grouped = new Map<
    string,
    { positive: number; negative: number; lastSignalAt: string }
  >();

  for (const s of signals) {
    const existing = grouped.get(s.memoryId) ?? {
      positive: 0,
      negative: 0,
      lastSignalAt: s.timestamp,
    };

    if (s.signal === "positive") existing.positive++;
    if (s.signal === "negative") existing.negative++;

    // Track the most recent signal timestamp
    if (s.timestamp > existing.lastSignalAt) {
      existing.lastSignalAt = s.timestamp;
    }

    grouped.set(s.memoryId, existing);
  }

  const scores: FeedbackScore[] = [];
  for (const [memoryId, data] of grouped) {
    scores.push({
      memoryId,
      positiveCount: data.positive,
      negativeCount: data.negative,
      netScore: data.positive - data.negative,
      lastSignalAt: data.lastSignalAt,
    });
  }

  scores.sort((a, b) => b.netScore - a.netScore);
  return scores;
}

/** Get the feedback score for a single memory. */
export async function getMemoryScore(
  hermesDir: string,
  memoryId: string
): Promise<FeedbackScore> {
  const signals = await loadFeedbackSignals(hermesDir);
  const filtered = signals.filter((s) => s.memoryId === memoryId);
  const scores = computeScores(filtered);
  return (
    scores[0] ?? {
      memoryId,
      positiveCount: 0,
      negativeCount: 0,
      netScore: 0,
      lastSignalAt: "",
    }
  );
}

// ── Relevance Adjustment ───────────────────────────────────────

/**
 * Adjust memory relevance based on accumulated feedback scores.
 *
 * - Memories with netScore > 2: boost relevance by 0.1 (cap at 1.0)
 * - Memories with netScore < -2: decay relevance by 0.15 (floor at 0.1)
 *
 * Returns counts of adjusted, boosted, and decayed memories.
 */
export async function applyFeedbackToRelevance(
  hermesDir: string
): Promise<{ adjusted: number; boosted: number; decayed: number }> {
  const [memories, signals] = await Promise.all([
    loadMemories(hermesDir),
    loadFeedbackSignals(hermesDir),
  ]);

  const scores = computeScores(signals);
  const scoreMap = new Map<string, FeedbackScore>();
  for (const s of scores) {
    scoreMap.set(s.memoryId, s);
  }

  let adjusted = 0;
  let boosted = 0;
  let decayed = 0;

  for (const memory of memories) {
    const score = scoreMap.get(memory.id);
    if (!score) continue;

    if (score.netScore > 2) {
      const newRelevance = Math.min(1.0, memory.relevance + 0.1);
      if (newRelevance !== memory.relevance) {
        await updateMemory(hermesDir, memory.id, { relevance: newRelevance });
        adjusted++;
        boosted++;
      }
    } else if (score.netScore < -2) {
      const newRelevance = Math.max(0.1, memory.relevance - 0.15);
      if (newRelevance !== memory.relevance) {
        await updateMemory(hermesDir, memory.id, { relevance: newRelevance });
        adjusted++;
        decayed++;
      }
    }
  }

  return { adjusted, boosted, decayed };
}

// ── Summary ────────────────────────────────────────────────────

/** Generate a feedback summary with totals, average, and top/bottom memories. */
export async function getFeedbackSummary(
  hermesDir: string
): Promise<FeedbackSummary> {
  const signals = await loadFeedbackSignals(hermesDir);
  const scores = computeScores(signals);

  const totalSignals = signals.length;
  const averageScore =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s.netScore, 0) / scores.length
      : 0;

  // Top 5 by netScore (already sorted descending)
  const topMemories = scores.slice(0, 5);

  // Bottom 5 by netScore (lowest scores)
  const bottomMemories = scores
    .slice()
    .sort((a, b) => a.netScore - b.netScore)
    .slice(0, 5);

  return { totalSignals, averageScore, topMemories, bottomMemories };
}

// ── Implicit Feedback Detection ────────────────────────────────

/** Positive signal phrases. */
const POSITIVE_PATTERNS = [
  /\bthat was helpful\b/i,
  /\bgood memory\b/i,
  /\bexactly right\b/i,
  /\bthat'?s? (?:exactly |precisely )?(?:what I (?:needed|wanted))\b/i,
  /\bperfect(?:ly)?\b/i,
  /\bthanks?,? (?:that|this) (?:helps?|works?)\b/i,
  /\byes,? (?:that'?s?|exactly)\b/i,
  /\bcorrect memory\b/i,
];

/** Negative signal phrases. */
const NEGATIVE_PATTERNS = [
  /\bwrong\b/i,
  /\boutdated\b/i,
  /\bnot relevant\b/i,
  /\bnot (?:right|correct|accurate)\b/i,
  /\bthat(?:'?s| is) (?:old|stale|obsolete)\b/i,
  /\bforget (?:that|this)\b/i,
  /\bignore (?:that|this) (?:memory|context)\b/i,
  /\bthat(?:'?s| is) no longer (?:true|valid|applicable)\b/i,
];

/**
 * Detect implicit feedback from user prompts about recently-injected memories.
 *
 * Scans the prompt for positive/negative sentiment phrases and matches
 * them against memory content snippets found in the prompt.
 *
 * @param prompt - The user's current prompt text
 * @param memories - Recently-injected memories to check against
 * @returns Array of feedback signals detected from the prompt
 */
export function detectImplicitFeedback(
  prompt: string,
  memories: Memory[]
): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];
  const now = new Date().toISOString();
  const lowerPrompt = prompt.toLowerCase();

  // Determine overall sentiment of the prompt
  let sentiment: "positive" | "negative" | null = null;
  let matchedPhrase = "";

  for (const pattern of POSITIVE_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      sentiment = "positive";
      matchedPhrase = match[0];
      break;
    }
  }

  if (!sentiment) {
    for (const pattern of NEGATIVE_PATTERNS) {
      const match = prompt.match(pattern);
      if (match) {
        sentiment = "negative";
        matchedPhrase = match[0];
        break;
      }
    }
  }

  if (!sentiment) return signals;

  // Check which memories are referenced in the prompt by content snippet
  for (const memory of memories) {
    // Extract a meaningful snippet from the memory content (first 60 chars, trimmed to word boundary)
    const snippet = memory.content.slice(0, 60).replace(/\s+\S*$/, "").toLowerCase();
    if (snippet.length < 8) continue;

    if (lowerPrompt.includes(snippet)) {
      signals.push({
        memoryId: memory.id,
        signal: sentiment,
        reason: `Implicit: user said "${matchedPhrase}" with memory content in prompt`,
        timestamp: now,
      });
    }
  }

  // If no specific memory was referenced but sentiment is clear,
  // apply to all recently-injected memories (they were likely the context)
  if (signals.length === 0 && memories.length > 0) {
    for (const memory of memories) {
      signals.push({
        memoryId: memory.id,
        signal: sentiment,
        reason: `Implicit: user said "${matchedPhrase}" after memory injection`,
        timestamp: now,
      });
    }
  }

  return signals;
}
