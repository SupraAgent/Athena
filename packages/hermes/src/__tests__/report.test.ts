import { describe, it, expect } from "vitest";
import {
  formatResearchStatus,
  formatExperimentHistory,
  formatEffectivenessTrend,
} from "../autoresearch/report";
import type { ResearchLog, Experiment, EffectivenessScore } from "../autoresearch/types";

function makeScore(overrides: Partial<EffectivenessScore> = {}): EffectivenessScore {
  return {
    value: 0.7,
    corrections: 2,
    rulePassRate: 0.8,
    feedbackNet: 0.1,
    memoryPrecision: 0.6,
    sessionCount: 5,
    computedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: "exp_test",
    hypothesis: {
      id: "hyp_test",
      description: "Add guidance: run tests before commit",
      expectedImpact: "high",
      changes: [],
      rationale: "test",
      source: "recurring-violation",
    },
    baselineScore: makeScore({ value: 0.7 }),
    resultScore: null,
    status: "running",
    sessionWindow: 5,
    observedSessions: ["ses_1", "ses_2"],
    startedAt: "2026-04-01T00:00:00Z",
    completedAt: null,
    comparison: null,
    ...overrides,
  };
}

function makeLog(overrides: Partial<ResearchLog> = {}): ResearchLog {
  return {
    experiments: [],
    currentBaseline: null,
    totalImprovement: 0,
    startedAt: "2026-04-01T00:00:00Z",
    experimentsRun: 0,
    experimentsKept: 0,
    experimentsDiscarded: 0,
    ...overrides,
  };
}

describe("formatResearchStatus", () => {
  it("returns empty string for empty log", () => {
    expect(formatResearchStatus(makeLog())).toBe("");
  });

  it("shows active experiment progress", () => {
    const log = makeLog({
      experiments: [makeExperiment()],
      experimentsRun: 1,
    });
    const status = formatResearchStatus(log);
    expect(status).toContain("Experiment #1");
    expect(status).toContain("2/5 sessions observed");
    expect(status).toContain("run tests before commit");
  });

  it("shows last completed experiment", () => {
    const completed = makeExperiment({
      status: "kept",
      resultScore: makeScore({ value: 0.75 }),
      comparison: { delta: 0.05, improved: true, significant: true, components: { corrections: -1, rulePassRate: 0.1, feedbackNet: 0, memoryPrecision: 0 } },
    });
    const log = makeLog({
      experiments: [completed],
      experimentsRun: 1,
      experimentsKept: 1,
    });
    const status = formatResearchStatus(log);
    expect(status).toContain("KEPT");
    expect(status).toContain("+0.050");
  });

  it("shows overall stats", () => {
    const log = makeLog({
      experiments: [makeExperiment({ status: "kept" })],
      experimentsRun: 5,
      experimentsKept: 3,
      experimentsDiscarded: 2,
      totalImprovement: 0.12,
    });
    const status = formatResearchStatus(log);
    expect(status).toContain("5 experiments");
    expect(status).toContain("3 kept");
    expect(status).toContain("60%");
  });
});

describe("formatExperimentHistory", () => {
  it("handles empty history", () => {
    expect(formatExperimentHistory(makeLog())).toContain("No experiments run");
  });

  it("renders table with experiment data", () => {
    const exp = makeExperiment({
      status: "kept",
      resultScore: makeScore({ value: 0.75 }),
      comparison: { delta: 0.05, improved: true, significant: true, components: { corrections: -1, rulePassRate: 0.1, feedbackNet: 0, memoryPrecision: 0 } },
      observedSessions: ["ses_1", "ses_2", "ses_3", "ses_4", "ses_5"],
    });
    const log = makeLog({
      experiments: [exp],
      experimentsRun: 1,
      experimentsKept: 1,
    });
    const table = formatExperimentHistory(log);
    expect(table).toContain("KEPT");
    expect(table).toContain("+0.050");
    expect(table).toContain("5/5");
    expect(table).toContain("recurring violation");
  });
});

describe("formatEffectivenessTrend", () => {
  it("handles empty scores", () => {
    expect(formatEffectivenessTrend([])).toContain("No effectiveness data");
  });

  it("shows trend with min/max/avg", () => {
    const scores = [
      makeScore({ value: 0.6, computedAt: "2026-04-01T00:00:00Z" }),
      makeScore({ value: 0.7, computedAt: "2026-04-02T00:00:00Z" }),
      makeScore({ value: 0.8, computedAt: "2026-04-03T00:00:00Z" }),
    ];
    const trend = formatEffectivenessTrend(scores);
    expect(trend).toContain("Min: 0.600");
    expect(trend).toContain("Max: 0.800");
    expect(trend).toContain("Avg: 0.700");
  });
});
