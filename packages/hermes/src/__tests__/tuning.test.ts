import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  TUNABLE_PARAMS,
  loadTuningOverrides,
  saveTuningOverrides,
  getEffectiveValue,
  getAllEffectiveValues,
  generateTuningHypothesis,
  applyTuningChange,
  revertTuningChange,
  formatTuningStatus,
} from "../autoresearch/tuning";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-tuning-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(path.join(hermesDir, "research"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("TUNABLE_PARAMS", () => {
  it("has all expected groups", () => {
    const groups = new Set(TUNABLE_PARAMS.map((p) => p.group));
    expect(groups).toContain("bm25");
    expect(groups).toContain("search-weights");
    expect(groups).toContain("ranking");
    expect(groups).toContain("thresholds");
    expect(groups).toContain("budget");
  });

  it("all params have valid bounds", () => {
    for (const p of TUNABLE_PARAMS) {
      expect(p.min).toBeLessThanOrEqual(p.defaultValue);
      expect(p.max).toBeGreaterThanOrEqual(p.defaultValue);
      expect(p.step).toBeGreaterThan(0);
    }
  });
});

describe("loadTuningOverrides / saveTuningOverrides", () => {
  it("returns empty when no file exists", async () => {
    const overrides = await loadTuningOverrides(hermesDir);
    expect(overrides).toEqual({});
  });

  it("round-trips overrides", async () => {
    await saveTuningOverrides(hermesDir, { "bm25.k1": 1.5, "ranking.recencyWeight": 0.3 });
    const loaded = await loadTuningOverrides(hermesDir);
    expect(loaded["bm25.k1"]).toBe(1.5);
    expect(loaded["ranking.recencyWeight"]).toBe(0.3);
  });
});

describe("getEffectiveValue", () => {
  it("returns override when present", () => {
    expect(getEffectiveValue("bm25.k1", { "bm25.k1": 1.8 })).toBe(1.8);
  });

  it("returns default when no override", () => {
    expect(getEffectiveValue("bm25.k1", {})).toBe(1.2);
  });
});

describe("getAllEffectiveValues", () => {
  it("returns all params with defaults", () => {
    const values = getAllEffectiveValues({});
    expect(values["bm25.k1"]).toBe(1.2);
    expect(values["bm25.b"]).toBe(0.75);
    expect(values["budget.tokenBudget"]).toBe(2000);
  });

  it("applies overrides", () => {
    const values = getAllEffectiveValues({ "bm25.k1": 2.0 });
    expect(values["bm25.k1"]).toBe(2.0);
    expect(values["bm25.b"]).toBe(0.75); // still default
  });
});

describe("generateTuningHypothesis", () => {
  it("generates a hypothesis for an untried param", () => {
    const hyp = generateTuningHypothesis({}, new Set());
    expect(hyp).not.toBeNull();
    expect(hyp!.description).toContain("Tune");
    expect(hyp!.source).toBe("retrieval-miss");
  });

  it("returns null when all params have been tried", () => {
    const allKeys = new Set(TUNABLE_PARAMS.map((p) => p.key));
    const hyp = generateTuningHypothesis({}, allKeys);
    expect(hyp).toBeNull();
  });
});

describe("applyTuningChange / revertTuningChange", () => {
  it("applies and reverts a change", async () => {
    const { oldValue, newValue } = await applyTuningChange(hermesDir, "bm25.k1", 1.8);
    expect(oldValue).toBe(1.2);
    expect(newValue).toBe(1.8);

    let overrides = await loadTuningOverrides(hermesDir);
    expect(overrides["bm25.k1"]).toBe(1.8);

    await revertTuningChange(hermesDir, "bm25.k1", 1.2);
    overrides = await loadTuningOverrides(hermesDir);
    expect(overrides["bm25.k1"]).toBeUndefined(); // reverted to default = removed
  });
});

describe("formatTuningStatus", () => {
  it("shows defaults message when no overrides", () => {
    expect(formatTuningStatus({})).toContain("defaults");
  });

  it("shows overrides", () => {
    const status = formatTuningStatus({ "bm25.k1": 1.8 });
    expect(status).toContain("BM25 K1");
    expect(status).toContain("1.8");
  });
});
