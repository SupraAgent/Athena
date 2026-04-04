import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  estimateCost,
  recordCost,
  trackLLMCall,
  loadCostRecords,
  checkBudget,
  getCostSummary,
  formatCostSummary,
  DEFAULT_COST_BUDGET,
} from "../autoresearch/cost-tracker";
import type { CostRecord } from "../autoresearch/cost-tracker";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-cost-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(path.join(hermesDir, "research"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("estimateCost", () => {
  it("estimates haiku pricing correctly", () => {
    // 1M input tokens @ $0.80 + 1M output tokens @ $4.00 = $4.80
    const cost = estimateCost("claude-haiku-4-5-20251001", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(4.80, 1);
  });

  it("uses fallback pricing for unknown models", () => {
    const cost = estimateCost("unknown-model", 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it("handles zero tokens", () => {
    expect(estimateCost("claude-haiku-4-5-20251001", 0, 0)).toBe(0);
  });
});

describe("recordCost / loadCostRecords", () => {
  it("records and loads cost records", async () => {
    await recordCost(hermesDir, {
      timestamp: new Date().toISOString(),
      experimentId: "exp_1",
      operation: "hypothesis-generation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 500,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
      sessionId: "ses_1",
    });

    const records = await loadCostRecords(hermesDir);
    expect(records).toHaveLength(1);
    expect(records[0].experimentId).toBe("exp_1");
  });

  it("returns empty array when no file exists", async () => {
    expect(await loadCostRecords(hermesDir)).toEqual([]);
  });
});

describe("trackLLMCall", () => {
  it("creates and records a cost record", async () => {
    const record = await trackLLMCall(hermesDir, {
      experimentId: "exp_1",
      operation: "consolidation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1000,
      outputTokens: 500,
      sessionId: "ses_1",
    });

    expect(record.estimatedCostUsd).toBeGreaterThan(0);
    expect(record.operation).toBe("consolidation");

    const loaded = await loadCostRecords(hermesDir);
    expect(loaded).toHaveLength(1);
  });
});

describe("checkBudget", () => {
  it("allows calls when within budget", async () => {
    const result = await checkBudget(hermesDir);
    expect(result.allowed).toBe(true);
  });

  it("blocks when daily limit exceeded", async () => {
    // Record a big cost
    await recordCost(hermesDir, {
      timestamp: new Date().toISOString(),
      experimentId: null,
      operation: "other",
      model: "claude-opus-4-6",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 1.00,
      sessionId: "ses_1",
    });

    const result = await checkBudget(hermesDir, { ...DEFAULT_COST_BUDGET, dailyLimitUsd: 0.50 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily budget");
  });

  it("blocks when experiment limit exceeded", async () => {
    await recordCost(hermesDir, {
      timestamp: new Date().toISOString(),
      experimentId: "exp_1",
      operation: "hypothesis-generation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0.15,
      sessionId: "ses_1",
    });

    // Use a generous daily limit but tight per-experiment limit
    const budget = { ...DEFAULT_COST_BUDGET, dailyLimitUsd: 10.00, perExperimentLimitUsd: 0.10 };
    const result = await checkBudget(hermesDir, budget, "exp_1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Experiment budget");
  });
});

describe("getCostSummary", () => {
  it("returns empty summary with no records", async () => {
    const summary = await getCostSummary(hermesDir);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.callCount).toBe(0);
    expect(summary.dailyCosts).toHaveLength(7);
  });

  it("aggregates costs correctly", async () => {
    await trackLLMCall(hermesDir, {
      experimentId: "exp_1",
      operation: "hypothesis-generation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1000,
      outputTokens: 500,
      sessionId: "ses_1",
    });
    await trackLLMCall(hermesDir, {
      experimentId: "exp_1",
      operation: "consolidation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 2000,
      outputTokens: 800,
      sessionId: "ses_2",
    });

    const summary = await getCostSummary(hermesDir);
    expect(summary.callCount).toBe(2);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
    expect(Object.keys(summary.byOperation)).toHaveLength(2);
    expect(summary.byExperiment["exp_1"].calls).toBe(2);
  });
});

describe("formatCostSummary", () => {
  it("formats a summary", async () => {
    await trackLLMCall(hermesDir, {
      operation: "hypothesis-generation",
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1000,
      outputTokens: 500,
      sessionId: "ses_1",
    });

    const summary = await getCostSummary(hermesDir);
    const formatted = formatCostSummary(summary);
    expect(formatted).toContain("Cost Report");
    expect(formatted).toContain("Total:");
    expect(formatted).toContain("hypothesis-generation");
  });
});
