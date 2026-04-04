import { describe, it, expect } from "vitest";
import {
  assignGroup,
  createABExperiment,
  recordABObservation,
  evaluateAB,
  formatABResult,
} from "../autoresearch/ab-testing";
import type { Hypothesis } from "../autoresearch/types";

const mockHypothesis: Hypothesis = {
  id: "hyp_test",
  description: "Test A/B hypothesis",
  expectedImpact: "medium",
  changes: [],
  rationale: "Testing",
  source: "recurring-violation",
};

describe("assignGroup", () => {
  it("returns control or treatment", () => {
    const group = assignGroup("ses_1", "exp_1");
    expect(["control", "treatment"]).toContain(group);
  });

  it("is deterministic", () => {
    const g1 = assignGroup("ses_1", "exp_1");
    const g2 = assignGroup("ses_1", "exp_1");
    expect(g1).toBe(g2);
  });

  it("different sessions get different assignments (statistical)", () => {
    const groups = new Set<string>();
    for (let i = 0; i < 20; i++) {
      groups.add(assignGroup(`ses_${i}`, "exp_1"));
    }
    // With 20 sessions, we should see both groups
    expect(groups.size).toBe(2);
  });

  it("different experiments can assign same session differently", () => {
    // Not guaranteed for any single session, but statistically likely over many
    const assignments = new Set<string>();
    for (let i = 0; i < 20; i++) {
      assignments.add(assignGroup("ses_fixed", `exp_${i}`));
    }
    expect(assignments.size).toBe(2);
  });
});

describe("createABExperiment", () => {
  it("creates with empty session lists", () => {
    const ab = createABExperiment("exp_1", mockHypothesis, 5);
    expect(ab.controlSessions).toEqual([]);
    expect(ab.treatmentSessions).toEqual([]);
    expect(ab.status).toBe("running");
    expect(ab.sessionsPerGroup).toBe(5);
  });
});

describe("recordABObservation", () => {
  it("assigns session to a group", () => {
    const ab = createABExperiment("exp_1", mockHypothesis, 3);
    const { group, ready } = recordABObservation(ab, "ses_1");
    expect(["control", "treatment"]).toContain(group);
    expect(ready).toBe(false);
    expect(ab.controlSessions.length + ab.treatmentSessions.length).toBe(1);
  });

  it("reports ready when both groups have enough sessions", () => {
    const ab = createABExperiment("exp_1", mockHypothesis, 1);

    // Add sessions until both groups have enough
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      ({ ready } = recordABObservation(ab, `ses_${i}`));
    }
    expect(ready).toBe(true);
    expect(ab.controlSessions.length).toBeGreaterThanOrEqual(1);
    expect(ab.treatmentSessions.length).toBeGreaterThanOrEqual(1);
  });

  it("does not add duplicate sessions", () => {
    const ab = createABExperiment("exp_1", mockHypothesis, 3);
    recordABObservation(ab, "ses_1");
    recordABObservation(ab, "ses_1");
    expect(ab.controlSessions.length + ab.treatmentSessions.length).toBe(1);
  });
});

describe("evaluateAB", () => {
  it("detects when treatment is better", () => {
    const control = [0.5, 0.52, 0.48, 0.51, 0.49];
    const treatment = [0.7, 0.72, 0.68, 0.71, 0.69];
    const result = evaluateAB(control, treatment);
    expect(result.treatmentWins).toBe(true);
    expect(result.effectSize).toBeGreaterThan(0);
  });

  it("detects no significant difference", () => {
    const control = [0.5, 0.52, 0.48, 0.51, 0.49];
    const treatment = [0.5, 0.51, 0.49, 0.50, 0.50];
    const result = evaluateAB(control, treatment);
    expect(result.effectSize).toBeLessThan(0.5);
  });

  it("handles insufficient data", () => {
    const result = evaluateAB([0.5], [0.7]);
    expect(result.treatmentWins).toBe(false);
    expect(result.significance).toBe(1);
  });

  it("handles equal distributions", () => {
    const data = [0.5, 0.5, 0.5, 0.5, 0.5];
    const result = evaluateAB(data, data);
    expect(result.effectSize).toBe(0);
    expect(result.treatmentWins).toBe(false);
  });
});

describe("formatABResult", () => {
  it("formats a result string", () => {
    const ab = createABExperiment("exp_1", mockHypothesis, 5);
    ab.controlSessions = ["s1", "s2", "s3", "s4", "s5"];
    ab.treatmentSessions = ["s6", "s7", "s8", "s9", "s10"];

    const result = { treatmentWins: true, effectSize: 0.8, significance: 0.05 };
    const formatted = formatABResult(ab, result);
    expect(formatted).toContain("A/B Test");
    expect(formatted).toContain("Treatment WINS");
    expect(formatted).toContain("5 sessions");
  });
});
