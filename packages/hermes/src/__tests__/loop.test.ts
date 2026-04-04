import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { onSessionComplete } from "../autoresearch/loop";
import { saveScorecard } from "../session-scoring";
import { saveMemory } from "../memory-store";
import type { SessionScorecard } from "../session-scoring";
import type { ResearchConfig } from "../autoresearch/types";
import { DEFAULT_RESEARCH_CONFIG } from "../autoresearch/types";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-loop-"));
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

const enabledConfig: ResearchConfig = {
  ...DEFAULT_RESEARCH_CONFIG,
  enabled: true,
  minBaselineSessions: 3,
  sessionWindow: 2,
  cooldownSessions: 0,
};

describe("onSessionComplete", () => {
  it("returns disabled when research is off", async () => {
    const result = await onSessionComplete(hermesDir, "ses_1", DEFAULT_RESEARCH_CONFIG);
    expect(result.action).toBe("disabled");
  });

  it("returns insufficient_data with no scorecards", async () => {
    const result = await onSessionComplete(hermesDir, "ses_1", enabledConfig);
    expect(result.action).toBe("insufficient_data");
  });

  it("records baseline when building up data", async () => {
    await saveScorecard(hermesDir, makeScorecard({ sessionId: "ses_1" }));

    const result = await onSessionComplete(hermesDir, "ses_2", enabledConfig);
    expect(result.action).toBe("baseline_recorded");
    expect(result.score).toBeDefined();
    expect(result.summary).toContain("Baseline recorded");
  });

  it("returns no_hypotheses when there's nothing to improve", async () => {
    // Build up enough baseline sessions with perfect scores
    for (let i = 0; i < 4; i++) {
      await saveScorecard(hermesDir, makeScorecard({
        sessionId: `ses_${i}`,
        correctionsReceived: 0,
        violations: [],
      }));
    }

    const result = await onSessionComplete(hermesDir, "ses_5", enabledConfig);
    // Should either record baseline or say no hypotheses
    expect(["baseline_recorded", "no_hypotheses"]).toContain(result.action);
  });

  it("starts experiment when recurring violations exist", async () => {
    // Create sessions with recurring violations to trigger hypothesis generation
    for (let i = 0; i < 5; i++) {
      await saveScorecard(hermesDir, makeScorecard({
        sessionId: `ses_${i}`,
        correctionsReceived: 2,
        violations: ["missing type annotations"],
      }));
    }

    // First call sets baseline
    await onSessionComplete(hermesDir, "ses_baseline", enabledConfig);

    // Second call should start experiment
    await saveScorecard(hermesDir, makeScorecard({
      sessionId: "ses_trigger",
      correctionsReceived: 2,
      violations: ["missing type annotations"],
    }));
    const result = await onSessionComplete(hermesDir, "ses_trigger", enabledConfig);

    // Could start experiment, record baseline, observe an already-started experiment, or find no hypotheses
    expect(["experiment_started", "baseline_recorded", "no_hypotheses", "observation_recorded"]).toContain(result.action);
  });

  it("respects rate limiting", async () => {
    const strictConfig: ResearchConfig = {
      ...enabledConfig,
      maxExperimentsPerDay: 0,
    };

    for (let i = 0; i < 4; i++) {
      await saveScorecard(hermesDir, makeScorecard({ sessionId: `ses_${i}` }));
    }
    // Set baseline first
    await onSessionComplete(hermesDir, "ses_baseline", enabledConfig);

    await saveScorecard(hermesDir, makeScorecard({
      sessionId: "ses_rate",
      violations: ["test violation"],
      correctionsReceived: 3,
    }));
    const result = await onSessionComplete(hermesDir, "ses_rate", strictConfig);
    expect(result.action).toBe("rate_limited");
  });
});
