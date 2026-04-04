/**
 * A/B Testing — run parallel experiments on different memory scopes.
 *
 * Instead of one experiment at a time, A/B testing splits sessions
 * into control (no change) and treatment (with change) groups.
 * After enough sessions, compares effectiveness between groups.
 *
 * Implementation: uses memory scopes to isolate experiments.
 * Control group sees default memories, treatment group sees modified.
 * Session assignment is deterministic based on session ID hash.
 */

import * as crypto from "crypto";
import type { Experiment, EffectivenessScore, Hypothesis } from "./types";
import type { SessionScorecard } from "../session-scoring";

// ── Types ─────────────────────────────────────────────────────

export type ABGroup = "control" | "treatment";

export type ABExperiment = {
  /** Base experiment this A/B test wraps. */
  experimentId: string;
  /** The hypothesis being tested. */
  hypothesis: Hypothesis;
  /** Sessions assigned to control. */
  controlSessions: string[];
  /** Sessions assigned to treatment. */
  treatmentSessions: string[];
  /** Control group scorecards. */
  controlScores: EffectivenessScore | null;
  /** Treatment group scorecards. */
  treatmentScores: EffectivenessScore | null;
  /** Statistical significance (p-value approximation). */
  significance: number | null;
  /** Required sessions per group. */
  sessionsPerGroup: number;
  /** Status of the A/B test. */
  status: "running" | "completed";
  startedAt: string;
  completedAt: string | null;
};

export type ABResult = {
  experiment: ABExperiment;
  /** Whether treatment is statistically better than control. */
  treatmentWins: boolean;
  /** Effect size (Cohen's d approximation). */
  effectSize: number;
  /** Human-readable summary. */
  summary: string;
};

// ── Session Assignment ────────────────────────────────────────

/**
 * Deterministically assign a session to control or treatment.
 *
 * Uses a hash of the session ID + experiment ID to ensure:
 * - Same session always gets the same assignment
 * - Different experiments get different splits
 * - ~50/50 split over many sessions
 */
export function assignGroup(sessionId: string, experimentId: string): ABGroup {
  const hash = crypto.createHash("sha256")
    .update(`${experimentId}:${sessionId}`)
    .digest("hex");
  // Use first byte of hash — even = control, odd = treatment
  const byte = parseInt(hash.slice(0, 2), 16);
  return byte % 2 === 0 ? "control" : "treatment";
}

// ── A/B Experiment Lifecycle ──────────────────────────────────

/** Create a new A/B experiment wrapper. */
export function createABExperiment(
  experimentId: string,
  hypothesis: Hypothesis,
  sessionsPerGroup: number = 5
): ABExperiment {
  return {
    experimentId,
    hypothesis,
    controlSessions: [],
    treatmentSessions: [],
    controlScores: null,
    treatmentScores: null,
    significance: null,
    sessionsPerGroup,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

/** Record a session observation for an A/B experiment. */
export function recordABObservation(
  ab: ABExperiment,
  sessionId: string
): { group: ABGroup; ready: boolean } {
  const group = assignGroup(sessionId, ab.experimentId);

  if (group === "control") {
    if (!ab.controlSessions.includes(sessionId)) {
      ab.controlSessions.push(sessionId);
    }
  } else {
    if (!ab.treatmentSessions.includes(sessionId)) {
      ab.treatmentSessions.push(sessionId);
    }
  }

  const ready =
    ab.controlSessions.length >= ab.sessionsPerGroup &&
    ab.treatmentSessions.length >= ab.sessionsPerGroup;

  return { group, ready };
}

// ── Statistical Analysis ──────────────────────────────────────

/**
 * Evaluate an A/B experiment by comparing control vs treatment scores.
 *
 * Uses a simple effect size calculation (difference in means normalized
 * by pooled variance). This is a lightweight approximation, not a
 * full statistical test.
 */
export function evaluateAB(
  controlScores: number[],
  treatmentScores: number[]
): { treatmentWins: boolean; effectSize: number; significance: number } {
  if (controlScores.length < 2 || treatmentScores.length < 2) {
    return { treatmentWins: false, effectSize: 0, significance: 1 };
  }

  const controlMean = mean(controlScores);
  const treatmentMean = mean(treatmentScores);
  const controlVar = variance(controlScores);
  const treatmentVar = variance(treatmentScores);

  // Pooled standard deviation
  const n1 = controlScores.length;
  const n2 = treatmentScores.length;
  const pooledStd = Math.sqrt(
    ((n1 - 1) * controlVar + (n2 - 1) * treatmentVar) / (n1 + n2 - 2)
  );

  // Cohen's d
  const effectSize = pooledStd > 0
    ? (treatmentMean - controlMean) / pooledStd
    : 0;

  // Approximate p-value using Welch's t-test
  const se = Math.sqrt(controlVar / n1 + treatmentVar / n2);
  const t = se > 0 ? (treatmentMean - controlMean) / se : 0;

  // Degrees of freedom (Welch-Satterthwaite)
  const num = (controlVar / n1 + treatmentVar / n2) ** 2;
  const den =
    (controlVar / n1) ** 2 / (n1 - 1) +
    (treatmentVar / n2) ** 2 / (n2 - 1);
  const df = den > 0 ? num / den : 1;

  // Approximate p-value from t-distribution (two-tailed)
  const significance = approximatePValue(Math.abs(t), df);

  return {
    treatmentWins: treatmentMean > controlMean && significance < 0.1,
    effectSize,
    significance,
  };
}

/** Format A/B test result for display. */
export function formatABResult(ab: ABExperiment, result: ReturnType<typeof evaluateAB>): string {
  const lines: string[] = [];
  lines.push(`**A/B Test:** ${ab.hypothesis.description}`);
  lines.push(`  Control: ${ab.controlSessions.length} sessions | Treatment: ${ab.treatmentSessions.length} sessions`);

  if (ab.controlScores && ab.treatmentScores) {
    lines.push(`  Control score: ${ab.controlScores.value.toFixed(3)} | Treatment score: ${ab.treatmentScores.value.toFixed(3)}`);
  }

  lines.push(`  Effect size (Cohen's d): ${result.effectSize.toFixed(3)}`);
  lines.push(`  Significance (p): ${result.significance.toFixed(3)}`);
  lines.push(`  Result: ${result.treatmentWins ? "Treatment WINS" : "No significant difference"}`);

  return lines.join("\n");
}

// ── Math Helpers ──────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

/**
 * Approximate two-tailed p-value from t-statistic and df.
 * Uses a rough approximation — good enough for our purposes.
 */
function approximatePValue(t: number, df: number): number {
  // Use the incomplete beta function approximation
  // For large df, approximate with normal distribution
  if (df > 30) {
    // Normal approximation
    const z = t;
    return 2 * (1 - normalCDF(z));
  }

  // For small df, use a rough lookup
  // These are approximate critical values for two-tailed tests
  if (t > 4.0) return 0.001;
  if (t > 3.0) return 0.01;
  if (t > 2.5) return 0.02;
  if (t > 2.0) return 0.05;
  if (t > 1.7) return 0.1;
  if (t > 1.3) return 0.2;
  if (t > 1.0) return 0.3;
  return 0.5;
}

/** Standard normal CDF approximation (Abramowitz and Stegun). */
function normalCDF(z: number): number {
  if (z < 0) return 1 - normalCDF(-z);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422802 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}
