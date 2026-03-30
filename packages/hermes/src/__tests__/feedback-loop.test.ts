import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  recordFeedback,
  loadFeedbackSignals,
  computeScores,
  getMemoryScore,
  detectImplicitFeedback,
} from "../feedback-loop";
import type { FeedbackSignal } from "../feedback-loop";
import type { Memory } from "../types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-feedback-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeMemory(overrides: Partial<Memory> & { id: string; content: string }): Memory {
  return {
    type: "fact",
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "test",
    relevance: 0.8,
    scope: "user",
    ...overrides,
  };
}

describe("recordFeedback + loadFeedbackSignals", () => {
  it("round-trip: records and loads signals", async () => {
    const signal: FeedbackSignal = {
      memoryId: "mem_abc",
      signal: "positive",
      reason: "helpful",
      timestamp: "2026-03-30T00:00:00.000Z",
    };

    await recordFeedback(tmpDir, signal);
    const signals = await loadFeedbackSignals(tmpDir);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual(signal);
  });
});

describe("computeScores", () => {
  it("groups by memoryId and computes netScore", () => {
    const signals: FeedbackSignal[] = [
      { memoryId: "m1", signal: "positive", reason: "", timestamp: "2026-01-01T00:00:00Z" },
      { memoryId: "m1", signal: "positive", reason: "", timestamp: "2026-01-02T00:00:00Z" },
      { memoryId: "m1", signal: "negative", reason: "", timestamp: "2026-01-03T00:00:00Z" },
      { memoryId: "m2", signal: "negative", reason: "", timestamp: "2026-01-01T00:00:00Z" },
    ];

    const scores = computeScores(signals);

    expect(scores).toHaveLength(2);
    // m1: 2 positive - 1 negative = 1
    const m1 = scores.find((s) => s.memoryId === "m1")!;
    expect(m1.positiveCount).toBe(2);
    expect(m1.negativeCount).toBe(1);
    expect(m1.netScore).toBe(1);
    expect(m1.lastSignalAt).toBe("2026-01-03T00:00:00Z");

    // m2: 0 positive - 1 negative = -1
    const m2 = scores.find((s) => s.memoryId === "m2")!;
    expect(m2.netScore).toBe(-1);
  });

  it("returns empty for no signals", () => {
    const scores = computeScores([]);
    expect(scores).toEqual([]);
  });
});

describe("getMemoryScore", () => {
  it("returns zero score for unknown ID", async () => {
    const score = await getMemoryScore(tmpDir, "nonexistent");
    expect(score.memoryId).toBe("nonexistent");
    expect(score.positiveCount).toBe(0);
    expect(score.negativeCount).toBe(0);
    expect(score.netScore).toBe(0);
  });
});

describe("detectImplicitFeedback", () => {
  it("detects positive phrase", () => {
    const memories = [
      makeMemory({ id: "m1", content: "The project uses React for the frontend layer" }),
    ];
    const signals = detectImplicitFeedback("that was helpful, thanks!", memories);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("positive");
  });

  it("detects negative phrase", () => {
    const memories = [
      makeMemory({ id: "m1", content: "The project uses Vue for the frontend layer" }),
    ];
    const signals = detectImplicitFeedback("that's outdated information", memories);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("negative");
  });

  it("returns empty for neutral prompt", () => {
    const memories = [
      makeMemory({ id: "m1", content: "The project uses Svelte for the frontend layer" }),
    ];
    const signals = detectImplicitFeedback("What files should I edit?", memories);
    expect(signals).toHaveLength(0);
  });
});
