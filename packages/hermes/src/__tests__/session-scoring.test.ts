import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  saveScorecard,
  loadScorecards,
  analyzeTrend,
  formatTrend,
} from "../session-scoring";
import type { SessionScorecard, SessionTrend } from "../session-scoring";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-scoring-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeScorecard(overrides: Partial<SessionScorecard> = {}): SessionScorecard {
  return {
    date: "2026-03-30",
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

describe("saveScorecard / loadScorecards", () => {
  it("saves and loads scorecards", async () => {
    await saveScorecard(hermesDir, makeScorecard({ sessionId: "ses_1" }));
    await saveScorecard(hermesDir, makeScorecard({ sessionId: "ses_2", correctionsReceived: 2 }));

    const loaded = await loadScorecards(hermesDir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].sessionId).toBe("ses_1");
    expect(loaded[1].correctionsReceived).toBe(2);
  });

  it("returns empty array when no file exists", async () => {
    const loaded = await loadScorecards(hermesDir);
    expect(loaded).toEqual([]);
  });
});

describe("analyzeTrend", () => {
  it("returns null with fewer than 3 sessions", () => {
    const result = analyzeTrend([makeScorecard(), makeScorecard()]);
    expect(result).toBeNull();
  });

  it("detects improving trend when corrections decrease", () => {
    const cards = [
      makeScorecard({ correctionsReceived: 4 }),
      makeScorecard({ correctionsReceived: 3 }),
      makeScorecard({ correctionsReceived: 2 }),
      makeScorecard({ correctionsReceived: 1 }),
      makeScorecard({ correctionsReceived: 0 }),
    ];
    const trend = analyzeTrend(cards)!;
    expect(trend.direction).toBe("improving");
    expect(trend.avgCorrections).toBe(2);
    expect(trend.recentCorrections).toBe(0);
  });

  it("detects degrading trend when corrections increase", () => {
    const cards = [
      makeScorecard({ correctionsReceived: 0 }),
      makeScorecard({ correctionsReceived: 1 }),
      makeScorecard({ correctionsReceived: 2 }),
      makeScorecard({ correctionsReceived: 3 }),
      makeScorecard({ correctionsReceived: 4 }),
    ];
    const trend = analyzeTrend(cards)!;
    expect(trend.direction).toBe("degrading");
  });

  it("detects stable trend", () => {
    const cards = [
      makeScorecard({ correctionsReceived: 1 }),
      makeScorecard({ correctionsReceived: 1 }),
      makeScorecard({ correctionsReceived: 1 }),
    ];
    const trend = analyzeTrend(cards)!;
    expect(trend.direction).toBe("stable");
  });

  it("finds recurring violations across 3+ sessions", () => {
    const cards = [
      makeScorecard({ violations: ["console.log found"] }),
      makeScorecard({ violations: ["console.log found"] }),
      makeScorecard({ violations: ["console.log found", "missing index"] }),
    ];
    const trend = analyzeTrend(cards)!;
    expect(trend.recurringViolations).toContain("console.log found");
    expect(trend.recurringViolations).not.toContain("missing index");
  });

  it("includes summary line", () => {
    const cards = [
      makeScorecard({ correctionsReceived: 3 }),
      makeScorecard({ correctionsReceived: 2 }),
      makeScorecard({ correctionsReceived: 1 }),
    ];
    const trend = analyzeTrend(cards)!;
    expect(trend.summary).toContain("Session 3");
    expect(trend.summary).toContain("rules passing");
  });
});

describe("formatTrend", () => {
  it("returns empty for null trend", () => {
    expect(formatTrend(null)).toBe("");
  });

  it("includes degrading warning", () => {
    const trend: SessionTrend = {
      sessionCount: 5,
      avgCorrections: 3,
      recentCorrections: 4,
      direction: "degrading",
      recurringViolations: [],
      summary: "Session 5: 4 corrections (avg 3.0, trending up). 3/3 rules passing.",
    };
    const formatted = formatTrend(trend);
    expect(formatted).toContain("Corrections are increasing");
  });

  it("includes recurring violations", () => {
    const trend: SessionTrend = {
      sessionCount: 10,
      avgCorrections: 1,
      recentCorrections: 0,
      direction: "improving",
      recurringViolations: ["console.log found"],
      summary: "Session 10: 0 corrections (avg 1.0, trending down). 8/8 rules passing.",
    };
    const formatted = formatTrend(trend);
    expect(formatted).toContain("graduation");
    expect(formatted).toContain("console.log found");
  });
});
