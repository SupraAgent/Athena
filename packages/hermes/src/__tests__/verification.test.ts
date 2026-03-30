import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { runVerificationSweep, formatSweepResults, inferVerifyCheck } from "../verification";
import { createMemory, updateMemory, loadMemories } from "../memory-store";
import type { Memory, VerifyCheck } from "../types";

let tmpDir: string;
let hermesDir: string;
let repoRoot: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-verify-"));
  repoRoot = tmpDir;
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
  // Create a source directory for grep tests
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("runVerificationSweep", () => {
  it("returns all skipped when no memories have verify checks", async () => {
    await createMemory(hermesDir, "fact", "Uses TypeScript", ["ts"], "ses_1");
    await createMemory(hermesDir, "guidance", "Always use strict mode", ["ts"], "ses_1");

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.checked).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.violations).toHaveLength(0);
  });

  it("passes grep check when pattern is found", async () => {
    // Create a file with the expected pattern
    await fs.writeFile(path.join(tmpDir, "src", "utils.ts"), 'export type Result<T> = { data: T };\n');

    const mem = await createMemory(hermesDir, "guidance", "All exports use Result type", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "grep", pattern: "Result<T>", path: "src/" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fails grep check when pattern is not found", async () => {
    await fs.writeFile(path.join(tmpDir, "src", "utils.ts"), 'export function hello() {}\n');

    const mem = await createMemory(hermesDir, "guidance", "All exports use Result type", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "grep", pattern: "Result<T>", path: "src/" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.violations[0].memoryId).toBe(mem.id);
  });

  it("passes grep-zero check when pattern is absent", async () => {
    await fs.writeFile(path.join(tmpDir, "src", "api.ts"), 'const x = 1;\n');

    const mem = await createMemory(hermesDir, "guidance", "Never use console.log", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "grep-zero", pattern: "console\\.log", path: "src/" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.checked).toBe(1);
    expect(result.passed).toBe(1);
  });

  it("fails grep-zero check when pattern is found", async () => {
    await fs.writeFile(path.join(tmpDir, "src", "debug.ts"), 'console.log("test");\n');

    const mem = await createMemory(hermesDir, "guidance", "Never use console.log", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "grep-zero", pattern: "console\\.log", path: "src/" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.violations[0].detail).toContain("expected 0");
  });

  it("passes file-exists check when file is present", async () => {
    await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "");

    const mem = await createMemory(hermesDir, "fact", "Entry point exists", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "file-exists", pattern: "src/index.ts" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.passed).toBe(1);
  });

  it("fails file-exists check when file is missing", async () => {
    const mem = await createMemory(hermesDir, "fact", "Config must exist", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "file-exists", pattern: "src/config.ts" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.failed).toBe(1);
  });

  it("passes file-missing check when file is absent", async () => {
    const mem = await createMemory(hermesDir, "guidance", "Old config removed", [], "ses_1");
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "file-missing", pattern: "src/old-config.ts" },
    });

    const memories = await loadMemories(hermesDir);
    const result = await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    expect(result.passed).toBe(1);
  });

  it("decays relevance on verification failure", async () => {
    await fs.writeFile(path.join(tmpDir, "src", "api.ts"), "");

    const mem = await createMemory(hermesDir, "guidance", "Must have Result type", [], "ses_1", 0.8);
    await updateMemory(hermesDir, mem.id, {
      verify: { type: "grep", pattern: "Result<T>", path: "src/" },
    });

    const memories = await loadMemories(hermesDir);
    await runVerificationSweep(memories, repoRoot, hermesDir, "ses_2");

    // Reload and check relevance was decayed
    const updated = await loadMemories(hermesDir);
    const updatedMem = updated.find((m) => m.id === mem.id);
    expect(updatedMem?.relevance).toBeCloseTo(0.7, 5); // 0.8 - 0.1
  });
});

describe("formatSweepResults", () => {
  it("returns empty string when no violations", () => {
    const result = formatSweepResults({
      checked: 5, passed: 5, failed: 0, skipped: 2, violations: [],
    });
    expect(result).toBe("");
  });

  it("formats violations for context injection", () => {
    const result = formatSweepResults({
      checked: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      violations: [{
        memoryId: "mem_1",
        memoryContent: "Never use console.log",
        check: { type: "grep-zero", pattern: "console\\.log", path: "src/" },
        passed: false,
        detail: 'Found 2 match(es) for "console.log" in src/ (expected 0)',
      }],
    });

    expect(result).toContain("Verification Violations");
    expect(result).toContain("1 of 3 rules failed");
    expect(result).toContain("Never use console.log");
  });
});

describe("inferVerifyCheck", () => {
  it("infers grep-zero for 'don't use' corrections", () => {
    const check = inferVerifyCheck("don't use console.log in production code");
    expect(check).toEqual({
      type: "grep-zero",
      pattern: "console\\.log",
      path: "src/",
    });
  });

  it("infers grep-zero for 'never use' corrections", () => {
    const check = inferVerifyCheck("never use ternary operators");
    expect(check).toEqual({
      type: "grep-zero",
      pattern: "ternary operators",
      path: "src/",
    });
  });

  it("infers grep for 'always use' corrections", () => {
    const check = inferVerifyCheck("always use strict TypeScript");
    expect(check).toEqual({
      type: "grep",
      pattern: "strict TypeScript",
      path: "src/",
    });
  });

  it("returns null for unrecognizable corrections", () => {
    const check = inferVerifyCheck("the API is flaky on Tuesdays");
    expect(check).toBeNull();
  });
});
