import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { generateHypothesesHeuristic, prioritizeHypotheses } from "../autoresearch/hypotheses";
import { saveScorecard } from "../session-scoring";
import { recordFeedback } from "../feedback-loop";
import { saveMemory } from "../memory-store";
import type { SessionScorecard } from "../session-scoring";
import type { Memory } from "../types";
import type { Hypothesis } from "../autoresearch/types";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-hypotheses-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(path.join(hermesDir, "memories"), { recursive: true });
  await fs.mkdir(path.join(hermesDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(hermesDir, "research"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

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

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: `mem_test_${Math.random().toString(36).slice(2, 8)}`,
    type: "guidance",
    content: "Test memory content",
    tags: [],
    createdAt: now,
    updatedAt: now,
    source: "ses_1",
    relevance: 0.7,
    scope: "user",
    ...overrides,
  };
}

describe("generateHypothesesHeuristic", () => {
  it("returns empty array with no data", async () => {
    const hypotheses = await generateHypothesesHeuristic(hermesDir);
    expect(hypotheses).toEqual([]);
  });

  it("generates hypothesis from recurring violations", async () => {
    // Create 3+ sessions with the same violation
    for (let i = 0; i < 4; i++) {
      await saveScorecard(hermesDir, makeScorecard({
        sessionId: `ses_${i}`,
        violations: ["console.log found in production code"],
        correctionsReceived: 1,
      }));
    }

    const hypotheses = await generateHypothesesHeuristic(hermesDir);
    const violation = hypotheses.find((h) => h.source === "recurring-violation");
    expect(violation).toBeDefined();
    expect(violation!.description).toContain("console.log");
    expect(violation!.expectedImpact).toBe("high");
    expect(violation!.changes[0].action).toBe("add");
  });

  it("generates hypothesis from negative feedback", async () => {
    const mem = makeMemory({ content: "Always use var for declarations" });
    await saveMemory(hermesDir, mem);

    // Record enough negative feedback
    for (let i = 0; i < 4; i++) {
      await recordFeedback(hermesDir, {
        memoryId: mem.id,
        signal: "negative",
        reason: "outdated advice",
        timestamp: new Date().toISOString(),
      });
    }

    // Need some scorecards for trend analysis
    for (let i = 0; i < 3; i++) {
      await saveScorecard(hermesDir, makeScorecard({ sessionId: `ses_${i}` }));
    }

    const hypotheses = await generateHypothesesHeuristic(hermesDir);
    const negFeedback = hypotheses.find((h) => h.source === "negative-feedback");
    expect(negFeedback).toBeDefined();
    expect(negFeedback!.changes[0].action).toBe("delete");
  });

  it("generates hypothesis from correction patterns", async () => {
    for (let i = 0; i < 3; i++) {
      await saveScorecard(hermesDir, makeScorecard({
        sessionId: `ses_${i}`,
        correctionsReceived: 4,
        violations: ["missing type annotations"],
      }));
    }

    const hypotheses = await generateHypothesesHeuristic(hermesDir);
    const correction = hypotheses.find((h) => h.source === "correction-pattern");
    expect(correction).toBeDefined();
    expect(correction!.expectedImpact).toBe("high");
  });
});

describe("prioritizeHypotheses", () => {
  it("sorts by expected impact: high > medium > low", () => {
    const hypotheses: Hypothesis[] = [
      {
        id: "h1", description: "low", expectedImpact: "low",
        changes: [], rationale: "", source: "retrieval-miss",
      },
      {
        id: "h2", description: "high", expectedImpact: "high",
        changes: [], rationale: "", source: "recurring-violation",
      },
      {
        id: "h3", description: "medium", expectedImpact: "medium",
        changes: [], rationale: "", source: "negative-feedback",
      },
    ];

    const sorted = prioritizeHypotheses(hypotheses);
    expect(sorted[0].expectedImpact).toBe("high");
    expect(sorted[1].expectedImpact).toBe("medium");
    expect(sorted[2].expectedImpact).toBe("low");
  });
});
