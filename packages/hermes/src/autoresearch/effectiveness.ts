/**
 * Effectiveness Scoring — composite metric for agent quality.
 *
 * Combines session scoring (corrections, rule pass rate),
 * feedback loop (positive/negative signals), and memory precision
 * into a single 0-1 score that autoresearch optimizes.
 *
 * Formula:
 *   score = (1 - correctionRate) × 0.4
 *         + rulePassRate × 0.3
 *         + normalizedFeedback × 0.2
 *         + memoryPrecision × 0.1
 */

import type { SessionScorecard } from "../session-scoring";
import type { FeedbackScore } from "../feedback-loop";
import type { EffectivenessScore, ScoreComparison } from "./types";

// ── Score Weights ─────────────────────────────────────────────

const WEIGHT_CORRECTIONS = 0.4;
const WEIGHT_RULE_PASS = 0.3;
const WEIGHT_FEEDBACK = 0.2;
const WEIGHT_PRECISION = 0.1;

/** Maximum corrections per session before the correction component bottoms out at 0. */
const MAX_CORRECTIONS_PER_SESSION = 10;

// ── Computation ───────────────────────────────────────────────

/**
 * Compute a composite effectiveness score from session scorecards and feedback.
 *
 * @param scorecards - Session scorecards in the observation window
 * @param feedbackScores - Aggregated feedback scores per memory
 * @returns Composite effectiveness score, or null if no scorecards
 */
export function computeEffectiveness(
  scorecards: SessionScorecard[],
  feedbackScores: FeedbackScore[] = []
): EffectivenessScore | null {
  if (scorecards.length === 0) return null;

  // 1. Correction rate: avg corrections per session, normalized to 0-1 (lower corrections = higher score)
  const totalCorrections = scorecards.reduce((s, c) => s + c.correctionsReceived, 0);
  const avgCorrections = totalCorrections / scorecards.length;
  const correctionComponent = Math.max(0, 1 - avgCorrections / MAX_CORRECTIONS_PER_SESSION);

  // 2. Rule pass rate: fraction of rules that passed across all sessions
  const totalChecked = scorecards.reduce((s, c) => s + c.rulesChecked, 0);
  const totalPassed = scorecards.reduce((s, c) => s + c.rulesPassed, 0);
  const rulePassRate = totalChecked > 0 ? totalPassed / totalChecked : 1.0;

  // 3. Feedback: normalized net score across all memories (-1 to 1, then shifted to 0-1)
  let feedbackNet = 0;
  if (feedbackScores.length > 0) {
    const totalNet = feedbackScores.reduce((s, f) => s + f.netScore, 0);
    const maxPossible = feedbackScores.length * 5; // assume max 5 signals per memory
    feedbackNet = maxPossible > 0 ? totalNet / maxPossible : 0;
  }
  const feedbackComponent = Math.max(0, Math.min(1, (feedbackNet + 1) / 2));

  // 4. Memory precision: ratio of memories surfaced to corrections (proxy for relevance)
  //    More surfaced memories per correction = better precision
  const totalSurfaced = scorecards.reduce((s, c) => s + c.memoriesSurfaced, 0);
  const memoryPrecision = totalSurfaced > 0
    ? Math.max(0, 1 - totalCorrections / Math.max(totalSurfaced, 1))
    : 0.5; // neutral if no memories surfaced

  // Composite score
  const value =
    correctionComponent * WEIGHT_CORRECTIONS +
    rulePassRate * WEIGHT_RULE_PASS +
    feedbackComponent * WEIGHT_FEEDBACK +
    memoryPrecision * WEIGHT_PRECISION;

  return {
    value: clamp01(value),
    corrections: avgCorrections,
    rulePassRate: clamp01(rulePassRate),
    feedbackNet,
    memoryPrecision: clamp01(memoryPrecision),
    sessionCount: scorecards.length,
    computedAt: new Date().toISOString(),
  };
}

// ── Comparison ────────────────────────────────────────────────

/**
 * Compare two effectiveness scores to decide keep/discard.
 *
 * @param baseline - Score before the experiment
 * @param result - Score after the experiment
 * @param minImprovement - Minimum delta to consider significant (default 0.02)
 */
export function compareScores(
  baseline: EffectivenessScore,
  result: EffectivenessScore,
  minImprovement = 0.02
): ScoreComparison {
  const delta = result.value - baseline.value;
  return {
    delta,
    improved: delta > 0,
    significant: delta >= minImprovement,
    components: {
      corrections: result.corrections - baseline.corrections,
      rulePassRate: result.rulePassRate - baseline.rulePassRate,
      feedbackNet: result.feedbackNet - baseline.feedbackNet,
      memoryPrecision: result.memoryPrecision - baseline.memoryPrecision,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
