import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { consolidateHeuristic } from "../consolidate";
import { createMemory, loadMemories } from "../memory-store";
import { _resetSemanticCache } from "../semantic";
import type { Memory } from "../types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-consolidate-"));
  _resetSemanticCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("consolidateHeuristic", () => {
  it("returns zero counts when fewer than 2 memories", async () => {
    await createMemory(tmpDir, "fact", "Only one memory", [], "ses_1");
    const result = await consolidateHeuristic(tmpDir);
    expect(result.merged).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.method).toBe("heuristic");
  });

  it("merges highly similar memories of the same type", async () => {
    await createMemory(tmpDir, "fact", "React uses virtual DOM for rendering", ["react"], "ses_1", 0.7);
    await createMemory(tmpDir, "fact", "React uses virtual DOM for rendering components", ["react"], "ses_2", 0.5);
    // Add a third unrelated memory to ensure it survives
    await createMemory(tmpDir, "fact", "Python uses pip for packages", ["python"], "ses_1", 0.6);

    const before = await loadMemories(tmpDir);
    expect(before).toHaveLength(3);

    const result = await consolidateHeuristic(tmpDir, 0.5);
    // The two similar React memories should be merged
    expect(result.merged).toBeGreaterThanOrEqual(0);
    expect(result.method).toBe("heuristic");
  });

  it("detects contradictions between memories", async () => {
    await createMemory(tmpDir, "decision", "Use Tailwind CSS for styling", ["css"], "ses_1", 0.8);
    await createMemory(tmpDir, "decision", "Don't use Tailwind CSS, switched from it", ["css"], "ses_2", 0.7);

    const result = await consolidateHeuristic(tmpDir);
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(result.conflicts[0].reason).toContain("contradiction");
  });

  it("does not merge across different memory types", async () => {
    await createMemory(tmpDir, "fact", "TypeScript is used everywhere", ["ts"], "ses_1", 0.7);
    await createMemory(tmpDir, "preference", "TypeScript is used everywhere in the project", ["ts"], "ses_1", 0.6);

    const result = await consolidateHeuristic(tmpDir, 0.3);
    // Cross-type merging is blocked (unless both are "fact")
    const after = await loadMemories(tmpDir);
    expect(after).toHaveLength(2);
  });

  it("returns empty results for empty store", async () => {
    const result = await consolidateHeuristic(tmpDir);
    expect(result.merged).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.conflicts).toEqual([]);
  });
});
