/**
 * Session Scoring — tracks session quality metrics and trends.
 *
 * At session end, writes a scorecard to session-scores.jsonl.
 * After 5+ sessions, detects trends: corrections decreasing (system working),
 * corrections flat/increasing (rules need review), recurring violations
 * (need graduation to CLAUDE.md).
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logEvent } from "./event-log";

// ── Types ──────────────────────────────────────────────────────

export type SessionScorecard = {
  date: string;
  sessionId: string;
  /** Number of corrections detected this session. */
  correctionsReceived: number;
  /** Number of memories surfaced at session start. */
  memoriesSurfaced: number;
  /** Number of verification checks run. */
  rulesChecked: number;
  /** Number of verification checks that passed. */
  rulesPassed: number;
  /** Number of verification checks that failed. */
  rulesFailed: number;
  /** Violation descriptions (brief). */
  violations: string[];
  /** Number of new memories created this session. */
  memoriesCreated: number;
  /** Number of memories promoted (correction auto-promotion). */
  memoriesPromoted: number;
};

export type SessionTrend = {
  /** Number of sessions analyzed. */
  sessionCount: number;
  /** Average corrections per session. */
  avgCorrections: number;
  /** Corrections in most recent session. */
  recentCorrections: number;
  /** Direction of corrections over time. */
  direction: "improving" | "stable" | "degrading";
  /** Violations that recur across 3+ sessions. */
  recurringViolations: string[];
  /** One-line summary for context injection. */
  summary: string;
};

// ── Paths ──────────────────────────────────────────────────────

function scoresFile(hermesDir: string): string {
  return path.join(hermesDir, "session-scores.jsonl");
}

// ── Scorecard CRUD ─────────────────────────────────────────────

/** Append a session scorecard to session-scores.jsonl. */
export async function saveScorecard(
  hermesDir: string,
  scorecard: SessionScorecard
): Promise<void> {
  const filePath = scoresFile(hermesDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const line = JSON.stringify(scorecard) + "\n";
  await fs.appendFile(filePath, line, "utf-8");

  await logEvent(hermesDir, "session.scored", scorecard.sessionId, {
    correctionsReceived: scorecard.correctionsReceived,
    rulesChecked: scorecard.rulesChecked,
    rulesFailed: scorecard.rulesFailed,
  });
}

/** Load all session scorecards. */
export async function loadScorecards(hermesDir: string): Promise<SessionScorecard[]> {
  const filePath = scoresFile(hermesDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as SessionScorecard;
        } catch {
          return null;
        }
      })
      .filter((s): s is SessionScorecard => s !== null);
  } catch {
    return [];
  }
}

// ── Trend Analysis ─────────────────────────────────────────────

/** Analyze session trends from accumulated scorecards. */
export function analyzeTrend(scorecards: SessionScorecard[]): SessionTrend | null {
  if (scorecards.length < 3) return null;

  const recent = scorecards.slice(-5);
  const avgCorrections =
    recent.reduce((sum, s) => sum + s.correctionsReceived, 0) / recent.length;
  const recentCorrections = recent[recent.length - 1].correctionsReceived;

  // Determine direction by comparing first half vs second half averages
  const midpoint = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, midpoint);
  const secondHalf = recent.slice(midpoint);
  const firstAvg = firstHalf.reduce((s, c) => s + c.correctionsReceived, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, c) => s + c.correctionsReceived, 0) / secondHalf.length;

  let direction: SessionTrend["direction"];
  if (secondAvg < firstAvg - 0.5) {
    direction = "improving";
  } else if (secondAvg > firstAvg + 0.5) {
    direction = "degrading";
  } else {
    direction = "stable";
  }

  // Find recurring violations (appear in 3+ sessions)
  const violationCounts = new Map<string, number>();
  for (const s of scorecards) {
    for (const v of s.violations) {
      violationCounts.set(v, (violationCounts.get(v) ?? 0) + 1);
    }
  }
  const recurringViolations = [...violationCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([v]) => v);

  // Build summary line
  const totalSessions = scorecards.length;
  const dirLabel = direction === "improving" ? "down" : direction === "degrading" ? "up" : "stable";
  const passRate = recent.reduce((s, c) => s + c.rulesPassed, 0);
  const checkRate = recent.reduce((s, c) => s + c.rulesChecked, 0);
  const summary = `Session ${totalSessions}: ${recentCorrections} corrections (avg ${avgCorrections.toFixed(1)}, trending ${dirLabel}). ${passRate}/${checkRate} rules passing.`;

  return {
    sessionCount: totalSessions,
    avgCorrections,
    recentCorrections,
    direction,
    recurringViolations,
    summary,
  };
}

/** Format trend for context injection. Returns empty string if not enough data. */
export function formatTrend(trend: SessionTrend | null): string {
  if (!trend) return "";

  const lines = [trend.summary];

  if (trend.recurringViolations.length > 0) {
    lines.push(`Recurring violations (candidates for graduation): ${trend.recurringViolations.join(", ")}`);
  }

  if (trend.direction === "degrading") {
    lines.push("Corrections are increasing — consider running /hermes-consolidate or reviewing guidance memories.");
  }

  return lines.join("\n");
}
