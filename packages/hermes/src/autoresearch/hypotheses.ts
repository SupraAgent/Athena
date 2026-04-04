/**
 * Hypothesis Generation — the "brain" of autoresearch.
 *
 * Analyzes patterns in session data to propose what to try next.
 * Two modes:
 *   - Heuristic: pattern-match recurring violations, negative feedback,
 *     correction patterns, and retrieval misses
 *   - LLM: send research log + recent data to Claude Haiku for ideas
 */

import * as crypto from "crypto";
import type { Memory } from "../types";
import type { SessionScorecard } from "../session-scoring";
import { analyzeTrend, loadScorecards } from "../session-scoring";
import { loadFeedbackSignals, computeScores } from "../feedback-loop";
import { loadMemories } from "../memory-store";
import { loadResearchLog } from "./experiment-store";
import type { Hypothesis, MemoryDelta, ResearchLog } from "./types";

// ── ID Generation ─────────────────────────────────────────────

function hypothesisId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  return `hyp_${ts}_${rand}`;
}

// ── Heuristic Hypothesis Generation ───────────────────────────

/**
 * Generate hypotheses by analyzing session data patterns.
 *
 * Looks at four signal sources:
 * 1. Recurring violations from trend analysis → propose guidance memories
 * 2. Negative feedback memories → propose removal or update
 * 3. Correction patterns → propose new rules
 * 4. Memory surfaced with no positive feedback → retrieval tuning
 */
export async function generateHypothesesHeuristic(
  hermesDir: string
): Promise<Hypothesis[]> {
  const [scorecards, feedbackSignals, memories, researchLog] = await Promise.all([
    loadScorecards(hermesDir),
    loadFeedbackSignals(hermesDir),
    loadMemories(hermesDir),
    loadResearchLog(hermesDir),
  ]);

  const hypotheses: Hypothesis[] = [];
  const alreadyTested = new Set(
    researchLog.experiments.map((e) => e.hypothesis.description)
  );

  // 1. Recurring violations → propose guidance memories
  const trend = analyzeTrend(scorecards);
  if (trend?.recurringViolations.length) {
    for (const violation of trend.recurringViolations) {
      const desc = `Add guidance: "${violation}"`;
      if (alreadyTested.has(desc)) continue;

      const newMemory = makeGuidanceMemory(violation);
      hypotheses.push({
        id: hypothesisId(),
        description: desc,
        expectedImpact: "high",
        changes: [{
          action: "add",
          memoryId: newMemory.id,
          before: null,
          after: newMemory,
        }],
        rationale: `Violation "${violation}" recurs across 3+ sessions. Adding a guidance memory should prevent it.`,
        source: "recurring-violation",
      });
    }
  }

  // 2. Negative feedback → propose removing/updating low-scoring memories
  const feedbackScores = computeScores(feedbackSignals);
  const negativeMems = feedbackScores.filter((f) => f.netScore <= -3);
  for (const neg of negativeMems.slice(0, 3)) {
    const mem = memories.find((m) => m.id === neg.memoryId);
    if (!mem) continue;

    const desc = `Remove low-scoring memory: "${mem.content.slice(0, 60)}"`;
    if (alreadyTested.has(desc)) continue;

    hypotheses.push({
      id: hypothesisId(),
      description: desc,
      expectedImpact: "medium",
      changes: [{
        action: "delete",
        memoryId: mem.id,
        before: mem,
        after: null,
      }],
      rationale: `Memory has net feedback score of ${neg.netScore} (${neg.negativeCount} negative signals). Removing may improve precision.`,
      source: "negative-feedback",
    });
  }

  // 3. Correction patterns → propose new rules from high-correction sessions
  const highCorrectionSessions = scorecards.filter((s) => s.correctionsReceived >= 3);
  if (highCorrectionSessions.length >= 2) {
    // Find common violations across high-correction sessions
    const violationCounts = new Map<string, number>();
    for (const s of highCorrectionSessions) {
      for (const v of s.violations) {
        violationCounts.set(v, (violationCounts.get(v) ?? 0) + 1);
      }
    }

    for (const [violation, count] of violationCounts) {
      if (count < 2) continue;
      const desc = `Add rule for correction pattern: "${violation}"`;
      if (alreadyTested.has(desc)) continue;

      const newMemory = makeGuidanceMemory(violation);
      newMemory.relevance = 0.9; // High relevance for correction-derived rules

      hypotheses.push({
        id: hypothesisId(),
        description: desc,
        expectedImpact: "high",
        changes: [{
          action: "add",
          memoryId: newMemory.id,
          before: null,
          after: newMemory,
        }],
        rationale: `Appears in ${count} high-correction sessions. A proactive rule should reduce corrections.`,
        source: "correction-pattern",
      });
    }
  }

  // 4. Retrieval misses — memories surfaced many times but never got positive feedback
  const surfacedIds = new Set(
    feedbackSignals.map((s) => s.memoryId)
  );
  const positiveMems = new Set(
    feedbackScores.filter((f) => f.positiveCount > 0).map((f) => f.memoryId)
  );
  const neverPositive = memories.filter(
    (m) => surfacedIds.has(m.id) && !positiveMems.has(m.id) && m.relevance > 0.5
  );

  if (neverPositive.length >= 3) {
    // Propose lowering relevance of memories that are surfaced but never helpful
    const topUnhelpful = neverPositive.slice(0, 3);
    const desc = `Lower relevance of ${topUnhelpful.length} unhelpful memories`;
    if (!alreadyTested.has(desc)) {
      hypotheses.push({
        id: hypothesisId(),
        description: desc,
        expectedImpact: "low",
        changes: topUnhelpful.map((m) => ({
          action: "update" as const,
          memoryId: m.id,
          before: m,
          after: { ...m, relevance: Math.max(0.2, m.relevance - 0.3) },
        })),
        rationale: `${topUnhelpful.length} memories are surfaced frequently but never receive positive feedback. Lowering relevance may improve precision.`,
        source: "retrieval-miss",
      });
    }
  }

  return prioritizeHypotheses(hypotheses);
}

/**
 * Generate hypotheses using an LLM (Claude Haiku).
 *
 * Sends the research log, recent scorecards, and feedback data
 * to the LLM and asks for experiment ideas.
 */
export async function generateHypothesesLLM(
  hermesDir: string,
  apiKey: string
): Promise<Hypothesis[]> {
  const [scorecards, feedbackSignals, memories, researchLog] = await Promise.all([
    loadScorecards(hermesDir),
    loadFeedbackSignals(hermesDir),
    loadMemories(hermesDir),
    loadResearchLog(hermesDir),
  ]);

  const feedbackScores = computeScores(feedbackSignals);
  const trend = analyzeTrend(scorecards);

  // Build context for the LLM
  const context = buildLLMContext(researchLog, scorecards.slice(-10), feedbackScores, memories, trend);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are an AI research assistant analyzing agent effectiveness data. Based on the data below, suggest 1-3 experiments to improve the agent's effectiveness.

Each experiment should modify the agent's guidance memories (add, update, or delete).

${context}

Respond in JSON format:
\`\`\`json
[{
  "description": "short experiment description",
  "expectedImpact": "high" | "medium" | "low",
  "action": "add" | "update" | "delete",
  "memoryContent": "the guidance memory content to add/update",
  "targetMemorySnippet": "first 60 chars of memory to update/delete (if applicable)",
  "rationale": "why this should help"
}]
\`\`\``,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) return [];

    const suggestions = JSON.parse(jsonMatch[1]) as Array<{
      description: string;
      expectedImpact: "high" | "medium" | "low";
      action: "add" | "update" | "delete";
      memoryContent: string;
      targetMemorySnippet?: string;
      rationale: string;
    }>;

    const hypotheses: Hypothesis[] = [];
    for (const s of suggestions) {
      const changes: MemoryDelta[] = [];

      if (s.action === "add") {
        const newMem = makeGuidanceMemory(s.memoryContent);
        changes.push({ action: "add", memoryId: newMem.id, before: null, after: newMem });
      } else if (s.action === "delete" && s.targetMemorySnippet) {
        const target = memories.find((m) =>
          m.content.slice(0, 60).toLowerCase().includes(s.targetMemorySnippet!.toLowerCase())
        );
        if (target) {
          changes.push({ action: "delete", memoryId: target.id, before: target, after: null });
        }
      } else if (s.action === "update" && s.targetMemorySnippet) {
        const target = memories.find((m) =>
          m.content.slice(0, 60).toLowerCase().includes(s.targetMemorySnippet!.toLowerCase())
        );
        if (target) {
          const updated = { ...target, content: s.memoryContent };
          changes.push({ action: "update", memoryId: target.id, before: target, after: updated });
        }
      }

      if (changes.length > 0) {
        hypotheses.push({
          id: hypothesisId(),
          description: s.description,
          expectedImpact: s.expectedImpact,
          changes,
          rationale: s.rationale,
          source: "llm-suggested",
        });
      }
    }

    return prioritizeHypotheses(hypotheses);
  } catch {
    // LLM not available — return empty
    return [];
  }
}

/**
 * Generate hypotheses: try LLM first, fall back to heuristic.
 */
export async function generateHypotheses(
  hermesDir: string,
  apiKey?: string
): Promise<Hypothesis[]> {
  if (apiKey) {
    const llmHypotheses = await generateHypothesesLLM(hermesDir, apiKey);
    if (llmHypotheses.length > 0) return llmHypotheses;
  }
  return generateHypothesesHeuristic(hermesDir);
}

// ── Prioritization ────────────────────────────────────────────

/** Sort hypotheses by expected impact (high > medium > low). */
export function prioritizeHypotheses(hypotheses: Hypothesis[]): Hypothesis[] {
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...hypotheses].sort(
    (a, b) => (impactOrder[a.expectedImpact] ?? 2) - (impactOrder[b.expectedImpact] ?? 2)
  );
}

// ── Helpers ───────────────────────────────────────────────────

function makeGuidanceMemory(content: string): Memory {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  const now = new Date().toISOString();

  return {
    id: `mem_${ts}_${rand}`,
    type: "guidance",
    content,
    tags: ["autoresearch", "experiment"],
    createdAt: now,
    updatedAt: now,
    source: "autoresearch",
    relevance: 0.8,
    scope: "user",
    confidence: "observed",
  };
}

function buildLLMContext(
  researchLog: ResearchLog,
  recentCards: SessionScorecard[],
  feedbackScores: ReturnType<typeof computeScores>,
  memories: Memory[],
  trend: ReturnType<typeof analyzeTrend>
): string {
  const parts: string[] = [];

  // Research history
  if (researchLog.experiments.length > 0) {
    parts.push("## Past Experiments");
    for (const exp of researchLog.experiments.slice(-5)) {
      const status = exp.status === "kept" ? "KEPT" : exp.status === "discarded" ? "DISCARDED" : "RUNNING";
      const delta = exp.comparison ? ` (delta: ${exp.comparison.delta.toFixed(3)})` : "";
      parts.push(`- [${status}] ${exp.hypothesis.description}${delta}`);
    }
  }

  // Current trend
  if (trend) {
    parts.push(`\n## Session Trend\n${trend.summary}`);
    if (trend.recurringViolations.length > 0) {
      parts.push(`Recurring violations: ${trend.recurringViolations.join(", ")}`);
    }
  }

  // Recent session data
  parts.push("\n## Recent Sessions");
  for (const card of recentCards.slice(-5)) {
    parts.push(`- ${card.date}: ${card.correctionsReceived} corrections, ${card.rulesPassed}/${card.rulesChecked} rules passed`);
  }

  // Bottom feedback
  const negative = feedbackScores.filter((f) => f.netScore < 0).slice(0, 5);
  if (negative.length > 0) {
    parts.push("\n## Low-Scoring Memories (by feedback)");
    for (const f of negative) {
      const mem = memories.find((m) => m.id === f.memoryId);
      if (mem) {
        parts.push(`- [score: ${f.netScore}] ${mem.content.slice(0, 80)}`);
      }
    }
  }

  // Current guidance memories
  const guidance = memories.filter((m) => m.type === "guidance").slice(0, 10);
  if (guidance.length > 0) {
    parts.push("\n## Current Guidance Memories");
    for (const m of guidance) {
      parts.push(`- [rel: ${m.relevance}] ${m.content.slice(0, 80)}`);
    }
  }

  return parts.join("\n");
}
