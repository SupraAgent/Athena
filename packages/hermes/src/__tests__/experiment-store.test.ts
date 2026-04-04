import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  loadResearchLog,
  saveResearchLog,
  createExperiment,
  recordSessionObservation,
  completeExperiment,
  getActiveExperiment,
  updateBaseline,
  countExperimentsToday,
  getLastCompletedExperiment,
} from "../autoresearch/experiment-store";
import type { Hypothesis, EffectivenessScore } from "../autoresearch/types";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-expstore-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
  // event-log needs logs dir
  await fs.mkdir(path.join(hermesDir, "logs"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Helpers ───────────────────────────────────────────────────

function makeBaseline(overrides: Partial<EffectivenessScore> = {}): EffectivenessScore {
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

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: "hyp_test",
    description: "Add guidance: always run tests before commit",
    expectedImpact: "high",
    changes: [],
    rationale: "Recurring violation: tests not run",
    source: "recurring-violation",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("loadResearchLog / saveResearchLog", () => {
  it("returns empty log when none exists", async () => {
    const log = await loadResearchLog(hermesDir);
    expect(log.experiments).toEqual([]);
    expect(log.currentBaseline).toBeNull();
    expect(log.experimentsRun).toBe(0);
  });

  it("round-trips a research log", async () => {
    const log = await loadResearchLog(hermesDir);
    log.totalImprovement = 0.05;
    log.experimentsRun = 3;
    await saveResearchLog(hermesDir, log);

    const loaded = await loadResearchLog(hermesDir);
    expect(loaded.totalImprovement).toBe(0.05);
    expect(loaded.experimentsRun).toBe(3);
  });
});

describe("createExperiment", () => {
  it("creates an experiment and updates the research log", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline(),
      5,
      "ses_1"
    );

    expect(exp.id).toMatch(/^exp_/);
    expect(exp.status).toBe("running");
    expect(exp.hypothesis.description).toContain("tests before commit");
    expect(exp.observedSessions).toEqual([]);

    const log = await loadResearchLog(hermesDir);
    expect(log.experiments).toHaveLength(1);
    expect(log.experimentsRun).toBe(1);
  });
});

describe("recordSessionObservation", () => {
  it("adds session to observed list", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline(),
      5,
      "ses_1"
    );

    const updated = await recordSessionObservation(hermesDir, exp.id, "ses_2");
    expect(updated!.observedSessions).toEqual(["ses_2"]);

    await recordSessionObservation(hermesDir, exp.id, "ses_3");
    const log = await loadResearchLog(hermesDir);
    expect(log.experiments[0].observedSessions).toEqual(["ses_2", "ses_3"]);
  });

  it("returns null for non-existent experiment", async () => {
    const result = await recordSessionObservation(hermesDir, "exp_nonexistent", "ses_1");
    expect(result).toBeNull();
  });
});

describe("completeExperiment", () => {
  it("keeps experiment when improvement is significant", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline({ value: 0.7 }),
      5,
      "ses_1"
    );

    const result = await completeExperiment(
      hermesDir,
      exp.id,
      makeBaseline({ value: 0.75 }),
      0.02,
      "ses_2"
    );

    expect(result!.decision).toBe("kept");
    expect(result!.experiment.status).toBe("kept");
    expect(result!.experiment.comparison!.significant).toBe(true);

    const log = await loadResearchLog(hermesDir);
    expect(log.experimentsKept).toBe(1);
    expect(log.currentBaseline!.value).toBe(0.75);
    expect(log.totalImprovement).toBeCloseTo(0.05);
  });

  it("discards experiment when improvement is not significant", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline({ value: 0.7 }),
      5,
      "ses_1"
    );

    const result = await completeExperiment(
      hermesDir,
      exp.id,
      makeBaseline({ value: 0.71 }),
      0.02,
      "ses_2"
    );

    expect(result!.decision).toBe("discarded");
    expect(result!.experiment.status).toBe("discarded");

    const log = await loadResearchLog(hermesDir);
    expect(log.experimentsDiscarded).toBe(1);
  });

  it("returns null for non-existent experiment", async () => {
    const result = await completeExperiment(
      hermesDir,
      "exp_nonexistent",
      makeBaseline(),
      0.02,
      "ses_1"
    );
    expect(result).toBeNull();
  });
});

describe("getActiveExperiment", () => {
  it("returns null when no experiments exist", async () => {
    expect(await getActiveExperiment(hermesDir)).toBeNull();
  });

  it("returns the running experiment", async () => {
    await createExperiment(hermesDir, makeHypothesis(), makeBaseline(), 5, "ses_1");
    const active = await getActiveExperiment(hermesDir);
    expect(active).not.toBeNull();
    expect(active!.status).toBe("running");
  });

  it("returns null after experiment is completed", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline({ value: 0.7 }),
      5,
      "ses_1"
    );
    await completeExperiment(hermesDir, exp.id, makeBaseline({ value: 0.75 }), 0.02, "ses_2");
    expect(await getActiveExperiment(hermesDir)).toBeNull();
  });
});

describe("updateBaseline", () => {
  it("persists the baseline score", async () => {
    const baseline = makeBaseline({ value: 0.85 });
    await updateBaseline(hermesDir, baseline, "ses_1");

    const log = await loadResearchLog(hermesDir);
    expect(log.currentBaseline!.value).toBe(0.85);
  });
});

describe("countExperimentsToday", () => {
  it("counts experiments started today", async () => {
    await createExperiment(hermesDir, makeHypothesis(), makeBaseline(), 5, "ses_1");
    await createExperiment(hermesDir, makeHypothesis({ id: "hyp_2" }), makeBaseline(), 5, "ses_2");
    expect(await countExperimentsToday(hermesDir)).toBe(2);
  });
});

describe("getLastCompletedExperiment", () => {
  it("returns null when none completed", async () => {
    await createExperiment(hermesDir, makeHypothesis(), makeBaseline(), 5, "ses_1");
    expect(await getLastCompletedExperiment(hermesDir)).toBeNull();
  });

  it("returns the most recently completed experiment", async () => {
    const exp = await createExperiment(
      hermesDir,
      makeHypothesis(),
      makeBaseline({ value: 0.7 }),
      5,
      "ses_1"
    );
    await completeExperiment(hermesDir, exp.id, makeBaseline({ value: 0.75 }), 0.02, "ses_2");

    const last = await getLastCompletedExperiment(hermesDir);
    expect(last).not.toBeNull();
    expect(last!.status).toBe("kept");
  });
});
