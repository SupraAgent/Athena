/**
 * Rule Graduation — promotes high-confidence memories to permanent rules.
 *
 * Lifecycle: observed → confirmed → graduated
 *
 * Memories that stay at relevance >= 0.9 for 10+ sessions and pass
 * verification consistently become candidates for graduation into
 * CLAUDE.md rules or .claude/rules/ files.
 *
 * This module identifies candidates and tracks graduation history.
 * Actual graduation (writing to CLAUDE.md) requires user approval.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { Memory, MemoryConfidence } from "./types";
import { loadMemories, updateMemory } from "./memory-store";
import { loadScorecards } from "./session-scoring";
import { logEvent } from "./event-log";

// ── Types ──────────────────────────────────────────────────────

export type GraduationCandidate = {
  memoryId: string;
  content: string;
  confidence: MemoryConfidence;
  relevance: number;
  correctionCount: number;
  sessionsActive: number;
  hasVerify: boolean;
  reason: string;
};

export type GraduationResult = {
  candidates: GraduationCandidate[];
  alreadyGraduated: number;
  /** Memories that should be upgraded from observed → confirmed. */
  confirmations: string[];
};

// ── Graduation Log ─────────────────────────────────────────────

function graduationLogFile(hermesDir: string): string {
  return path.join(hermesDir, "graduation-log.jsonl");
}

type GraduationLogEntry = {
  timestamp: string;
  memoryId: string;
  content: string;
  action: "graduated" | "rejected" | "confirmed";
  destination?: string;
};

/** Append to graduation log. */
async function appendGraduationLog(
  hermesDir: string,
  entry: GraduationLogEntry
): Promise<void> {
  const filePath = graduationLogFile(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

/** Load graduation log entries. */
export async function loadGraduationLog(
  hermesDir: string
): Promise<GraduationLogEntry[]> {
  const filePath = graduationLogFile(hermesDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try { return JSON.parse(l) as GraduationLogEntry; }
        catch { return null; }
      })
      .filter((e): e is GraduationLogEntry => e !== null);
  } catch {
    return [];
  }
}

// ── Confidence Lifecycle ───────────────────────────────────────

/**
 * Scan memories and auto-promote confidence levels based on evidence.
 *
 * - observed + correctionCount >= 2 → confirmed
 * - observed + verify passes in 5+ sessions → confirmed
 * - confirmed + relevance >= 0.9 for 10+ sessions + has verify → graduation candidate
 */
export async function findGraduationCandidates(
  hermesDir: string,
  sessionId: string
): Promise<GraduationResult> {
  const memories = await loadMemories(hermesDir);
  const scorecards = await loadScorecards(hermesDir);
  const graduationLog = await loadGraduationLog(hermesDir);

  // IDs that were already graduated or rejected
  const previouslyHandled = new Set(
    graduationLog
      .filter((e) => e.action === "graduated" || e.action === "rejected")
      .map((e) => e.memoryId)
  );

  const candidates: GraduationCandidate[] = [];
  const confirmations: string[] = [];
  let alreadyGraduated = 0;

  // Count sessions where each memory's verification passed
  // (by checking scorecards for violations mentioning the memory content)
  const sessionCount = scorecards.length;

  for (const mem of memories) {
    // Skip non-rule types
    if (!["guidance", "decision", "pattern", "fact"].includes(mem.type)) continue;

    const confidence = mem.confidence ?? "observed";
    const correctionCount = mem.correctionCount ?? 0;

    // Already graduated — count it
    if (confidence === "graduated") {
      alreadyGraduated++;
      continue;
    }

    // Auto-confirm: observed memories with strong evidence
    if (confidence === "observed") {
      const shouldConfirm =
        correctionCount >= 2 ||
        (mem.relevance >= 0.8 && sessionCount >= 5 && mem.verify);

      if (shouldConfirm) {
        confirmations.push(mem.id);
        await updateMemory(hermesDir, mem.id, { confidence: "confirmed" });
        await appendGraduationLog(hermesDir, {
          timestamp: new Date().toISOString(),
          memoryId: mem.id,
          content: mem.content.slice(0, 100),
          action: "confirmed",
        });
        await logEvent(hermesDir, "graduation.candidate", sessionId, {
          memoryId: mem.id,
          transition: "observed → confirmed",
        });
      }
      continue;
    }

    // Graduation candidate: confirmed memories with strong track record
    if (confidence === "confirmed") {
      if (previouslyHandled.has(mem.id)) continue;

      const isCandidate =
        mem.relevance >= 0.9 &&
        sessionCount >= 10 &&
        mem.verify != null;

      // Evidence-based fast-track: memories from kept autoresearch experiments
      // can graduate with lower thresholds (they've been empirically validated)
      const isResearchValidated = await isExperimentValidated(hermesDir, mem.id);
      const isFastTrack =
        isResearchValidated &&
        mem.relevance >= 0.8 &&
        sessionCount >= 5;

      if (isCandidate || isFastTrack) {
        const reason = buildReason(mem, correctionCount, sessionCount, isFastTrack);
        candidates.push({
          memoryId: mem.id,
          content: mem.content,
          confidence,
          relevance: mem.relevance,
          correctionCount,
          sessionsActive: sessionCount,
          hasVerify: !!mem.verify,
          reason,
        });

        await logEvent(hermesDir, "graduation.candidate", sessionId, {
          memoryId: mem.id,
          transition: isFastTrack
            ? "confirmed → graduation candidate (research fast-track)"
            : "confirmed → graduation candidate",
        });
      }
    }
  }

  return { candidates, alreadyGraduated, confirmations };
}

function buildReason(mem: Memory, correctionCount: number, sessionCount: number, fastTrack = false): string {
  const parts: string[] = [];
  if (fastTrack) parts.push("research-validated");
  if (correctionCount >= 2) parts.push(`corrected ${correctionCount}x`);
  if (mem.relevance >= 0.9) parts.push(`relevance ${mem.relevance}`);
  if (mem.verify) parts.push("has verify check");
  parts.push(`${sessionCount} sessions active`);
  return parts.join(", ");
}

/**
 * Check if a memory was part of a kept autoresearch experiment.
 * Memories validated by experiments have empirical evidence of effectiveness.
 */
async function isExperimentValidated(hermesDir: string, memoryId: string): Promise<boolean> {
  try {
    const { loadResearchLog } = await import("./autoresearch/experiment-store");
    const log = await loadResearchLog(hermesDir);
    return log.experiments.some(
      (exp) =>
        exp.status === "kept" &&
        exp.hypothesis.changes.some((c) => c.memoryId === memoryId)
    );
  } catch {
    return false;
  }
}

// ── Graduation Actions ─────────────────────────────────────────

/** Mark a memory as graduated (after user approval). */
export async function graduateMemory(
  hermesDir: string,
  memoryId: string,
  destination: string
): Promise<void> {
  await updateMemory(hermesDir, memoryId, { confidence: "graduated" });
  await appendGraduationLog(hermesDir, {
    timestamp: new Date().toISOString(),
    memoryId,
    content: "", // Will be filled by caller
    action: "graduated",
    destination,
  });
}

/** Mark a graduation candidate as rejected (won't be re-proposed). */
export async function rejectGraduation(
  hermesDir: string,
  memoryId: string,
  content: string
): Promise<void> {
  await appendGraduationLog(hermesDir, {
    timestamp: new Date().toISOString(),
    memoryId,
    content: content.slice(0, 100),
    action: "rejected",
  });
}

/** Format graduation candidates for display. */
export function formatCandidates(result: GraduationResult): string {
  if (result.candidates.length === 0 && result.confirmations.length === 0) {
    return "";
  }

  const lines: string[] = [];

  if (result.confirmations.length > 0) {
    lines.push(`_${result.confirmations.length} memories auto-confirmed (observed → confirmed)._`);
  }

  if (result.candidates.length > 0) {
    lines.push("");
    lines.push("## Graduation Candidates");
    lines.push(`_${result.candidates.length} memories ready for promotion to permanent rules._`);
    lines.push("");

    for (const c of result.candidates) {
      lines.push(`- **${c.content.slice(0, 80)}**`);
      lines.push(`  Reason: ${c.reason}`);
      lines.push("");
    }
  }

  if (result.alreadyGraduated > 0) {
    lines.push(`_${result.alreadyGraduated} memories already graduated._`);
  }

  return lines.join("\n");
}
