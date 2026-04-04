import { describe, it, expect } from "vitest";
import { computeEffectiveness, compareScores } from "../autoresearch/effectiveness";
import type { SessionScorecard } from "../session-scoring";
import type { FeedbackScore } from "../feedback-loop";
import type { EffectivenessScore } from "../autoresearch/types";

// ── Helpers ───────────────────────────────────────────────────

function makeScorecard(overrides: Partial<SessionScorecard> = {}): SessionScorecard {
  return {
    date: "2026-04-01",
    sessionId: "ses_1",
    correctionsReceived: 0,
    memoriesSurfaced: 5,
    rulesChecked: 3,
    rulesPassed: 3,
    rulesFailed: 0,
    violations: [],
    memoriesCreated: 1,
    memoriesPromoted: 0,
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<FeedbackScore> = {}): FeedbackScore {
  return {
    memoryId: "mem_1",
    positiveCount: 3,
    negativeCount: 0,
    netScore: 3,
    lastSignalAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("computeEffectiveness", () => {
  it("returns null for empty scorecards", () => {
    expect(computeEffectiveness([])).toBeNull();
  });

  it("returns perfect score for zero corrections and all rules passing", () => {
    const cards = [makeScorecard()];
    const score = computeEffectiveness(cards)!;
    expect(score.value).toBeGreaterThan(0.8);
    expect(score.corrections).toBe(0);
    expect(score.rulePassRate).toBe(1);
    expect(score.sessionCount).toBe(1);
  });

  it("returns lower score with more corrections", () => {
    const good = computeEffectiveness([makeScorecard({ correctionsReceived: 0 })])!;
    const bad = computeEffectiveness([makeScorecard({ correctionsReceived: 5 })])!;
    expect(good.value).toBeGreaterThan(bad.value);
  });

  it("returns lower score with rule failures", () => {
    const good = computeEffectiveness([
      makeScorecard({ rulesChecked: 10, rulesPassed: 10, rulesFailed: 0 }),
    ])!;
    const bad = computeEffectiveness([
      makeScorecard({ rulesChecked: 10, rulesPassed: 5, rulesFailed: 5 }),
    ])!;
    expect(good.value).toBeGreaterThan(bad.value);
  });

  it("incorporates feedback scores", () => {
    const cards = [makeScorecard()];
    const positiveFeedback = [makeFeedback({ netScore: 5 })];
    const negativeFeedback = [makeFeedback({ netScore: -5 })];

    const withPositive = computeEffectiveness(cards, positiveFeedback)!;
    const withNegative = computeEffectiveness(cards, negativeFeedback)!;
    expect(withPositive.value).toBeGreaterThan(withNegative.value);
  });

  it("averages across multiple sessions", () => {
    const cards = [
      makeScorecard({ correctionsReceived: 0 }),
      makeScorecard({ correctionsReceived: 4 }),
    ];
    const score = computeEffectiveness(cards)!;
    expect(score.corrections).toBe(2);
    expect(score.sessionCount).toBe(2);
  });

  it("clamps score between 0 and 1", () => {
    // Extreme bad case
    const terrible = computeEffectiveness([
      makeScorecard({
        correctionsReceived: 20,
        rulesChecked: 10,
        rulesPassed: 0,
        rulesFailed: 10,
        memoriesSurfaced: 0,
      }),
    ])!;
    expect(terrible.value).toBeGreaterThanOrEqual(0);
    expect(terrible.value).toBeLessThanOrEqual(1);
  });

  it("handles zero rules checked gracefully", () => {
    const score = computeEffectiveness([
      makeScorecard({ rulesChecked: 0, rulesPassed: 0, rulesFailed: 0 }),
    ])!;
    expect(score.rulePassRate).toBe(1); // no rules = assumed passing
  });
});

describe("compareScores", () => {
  const baseline: EffectivenessScore = {
    value: 0.7,
    corrections: 2,
    rulePassRate: 0.8,
    feedbackNet: 0.1,
    memoryPrecision: 0.6,
    sessionCount: 5,
    computedAt: "2026-04-01T00:00:00Z",
  };

  it("detects improvement", () => {
    const result: EffectivenessScore = { ...baseline, value: 0.75, corrections: 1 };
    const cmp = compareScores(baseline, result);
    expect(cmp.improved).toBe(true);
    expect(cmp.delta).toBeCloseTo(0.05);
  });

  it("detects significant improvement above threshold", () => {
    const result: EffectivenessScore = { ...baseline, value: 0.73 };
    const cmp = compareScores(baseline, result, 0.02);
    expect(cmp.significant).toBe(true);
  });

  it("detects non-significant improvement below threshold", () => {
    const result: EffectivenessScore = { ...baseline, value: 0.71 };
    const cmp = compareScores(baseline, result, 0.02);
    expect(cmp.improved).toBe(true);
    expect(cmp.significant).toBe(false);
  });

  it("detects degradation", () => {
    const result: EffectivenessScore = { ...baseline, value: 0.65 };
    const cmp = compareScores(baseline, result);
    expect(cmp.improved).toBe(false);
    expect(cmp.delta).toBeCloseTo(-0.05);
  });

  it("reports per-component deltas", () => {
    const result: EffectivenessScore = {
      ...baseline,
      value: 0.8,
      corrections: 1,
      rulePassRate: 0.9,
    };
    const cmp = compareScores(baseline, result);
    expect(cmp.components.corrections).toBe(-1); // fewer corrections = negative delta
    expect(cmp.components.rulePassRate).toBeCloseTo(0.1);
  });
});
