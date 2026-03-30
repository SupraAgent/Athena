import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  findGraduationCandidates,
  graduateMemory,
  rejectGraduation,
  loadGraduationLog,
  formatCandidates,
} from "../graduation";
import { createMemory, updateMemory, loadMemories } from "../memory-store";
import { saveScorecard } from "../session-scoring";
import type { SessionScorecard } from "../session-scoring";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-grad-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeScorecard(i: number): SessionScorecard {
  return {
    date: `2026-03-${String(i).padStart(2, "0")}`,
    sessionId: `ses_${i}`,
    correctionsReceived: 0,
    memoriesSurfaced: 5,
    rulesChecked: 3,
    rulesPassed: 3,
    rulesFailed: 0,
    violations: [],
    memoriesCreated: 1,
    memoriesPromoted: 0,
  };
}

describe("findGraduationCandidates", () => {
  it("auto-confirms observed memories with correctionCount >= 2", async () => {
    const mem = await createMemory(hermesDir, "guidance", "Never use any type", ["correction"], "ses_1", 0.8);
    await updateMemory(hermesDir, mem.id, {
      confidence: "observed",
      correctionCount: 2,
    });

    const result = await findGraduationCandidates(hermesDir, "ses_5");
    expect(result.confirmations).toContain(mem.id);

    // Verify confidence was updated
    const memories = await loadMemories(hermesDir);
    const updated = memories.find((m) => m.id === mem.id);
    expect(updated?.confidence).toBe("confirmed");
  });

  it("identifies confirmed memories as graduation candidates when criteria met", async () => {
    // Create enough scorecards (10+)
    for (let i = 1; i <= 12; i++) {
      await saveScorecard(hermesDir, makeScorecard(i));
    }

    const mem = await createMemory(hermesDir, "guidance", "Always validate inputs with zod", [], "ses_1", 0.95);
    await updateMemory(hermesDir, mem.id, {
      confidence: "confirmed",
      correctionCount: 3,
      verify: { type: "grep", pattern: "z\\.object", path: "src/" },
    });

    const result = await findGraduationCandidates(hermesDir, "ses_13");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].memoryId).toBe(mem.id);
    expect(result.candidates[0].hasVerify).toBe(true);
  });

  it("skips already graduated memories", async () => {
    const mem = await createMemory(hermesDir, "guidance", "Graduated rule", [], "ses_1", 1.0);
    await updateMemory(hermesDir, mem.id, { confidence: "graduated" });

    const result = await findGraduationCandidates(hermesDir, "ses_5");
    expect(result.alreadyGraduated).toBe(1);
    expect(result.candidates).toHaveLength(0);
  });

  it("skips previously rejected candidates", async () => {
    for (let i = 1; i <= 12; i++) {
      await saveScorecard(hermesDir, makeScorecard(i));
    }

    const mem = await createMemory(hermesDir, "guidance", "Some rule", [], "ses_1", 0.95);
    await updateMemory(hermesDir, mem.id, {
      confidence: "confirmed",
      verify: { type: "grep", pattern: "foo", path: "src/" },
    });

    // Reject it
    await rejectGraduation(hermesDir, mem.id, "Some rule");

    const result = await findGraduationCandidates(hermesDir, "ses_13");
    expect(result.candidates).toHaveLength(0);
  });

  it("does not consider non-rule memory types", async () => {
    for (let i = 1; i <= 12; i++) {
      await saveScorecard(hermesDir, makeScorecard(i));
    }

    const mem = await createMemory(hermesDir, "session-summary", "Session was productive", [], "ses_1", 1.0);
    await updateMemory(hermesDir, mem.id, {
      confidence: "confirmed",
      verify: { type: "grep", pattern: "x", path: "src/" },
    });

    const result = await findGraduationCandidates(hermesDir, "ses_13");
    expect(result.candidates).toHaveLength(0);
  });
});

describe("graduateMemory / rejectGraduation", () => {
  it("marks memory as graduated and logs it", async () => {
    const mem = await createMemory(hermesDir, "guidance", "Test rule", [], "ses_1");
    await graduateMemory(hermesDir, mem.id, "CLAUDE.md");

    const memories = await loadMemories(hermesDir);
    const updated = memories.find((m) => m.id === mem.id);
    expect(updated?.confidence).toBe("graduated");

    const log = await loadGraduationLog(hermesDir);
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("graduated");
    expect(log[0].destination).toBe("CLAUDE.md");
  });

  it("logs rejections", async () => {
    await rejectGraduation(hermesDir, "mem_fake", "Some rule text");

    const log = await loadGraduationLog(hermesDir);
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("rejected");
  });
});

describe("formatCandidates", () => {
  it("returns empty for no candidates or confirmations", () => {
    expect(formatCandidates({ candidates: [], alreadyGraduated: 0, confirmations: [] })).toBe("");
  });

  it("formats candidates with reasons", () => {
    const result = formatCandidates({
      candidates: [{
        memoryId: "mem_1",
        content: "Always use strict TypeScript mode",
        confidence: "confirmed",
        relevance: 0.95,
        correctionCount: 3,
        sessionsActive: 12,
        hasVerify: true,
        reason: "corrected 3x, relevance 0.95, has verify check, 12 sessions active",
      }],
      alreadyGraduated: 2,
      confirmations: [],
    });

    expect(result).toContain("Graduation Candidates");
    expect(result).toContain("strict TypeScript");
    expect(result).toContain("2 memories already graduated");
  });
});
