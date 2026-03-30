import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { smartConsolidateHeuristic } from "../mem0-pipeline";
import { createMemory, loadMemories } from "../memory-store";
import type { ExtractedMemory } from "../llm-extract";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-mem0-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("smartConsolidateHeuristic", () => {
  it("ADDs all candidates when no existing memories", async () => {
    const candidates: ExtractedMemory[] = [
      { type: "fact", content: "Project uses Next.js 15 with App Router", relevance: 0.7 },
      { type: "decision", content: "Chose Supabase for authentication", relevance: 0.9 },
    ];

    const result = await smartConsolidateHeuristic(hermesDir, candidates, "ses_1");
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.noops).toBe(0);
    expect(result.deleted).toBe(0);

    const saved = await loadMemories(hermesDir);
    expect(saved.length).toBe(2);
    // All memories should have user scope by default
    expect(saved.every((m) => m.scope === "user")).toBe(true);
  });

  it("NOOPs near-duplicate candidates", async () => {
    // Create an existing memory
    await createMemory(hermesDir, "fact", "Project uses Next.js 15 with App Router", [], "ses_0", 0.7);

    const candidates: ExtractedMemory[] = [
      { type: "fact", content: "Project uses Next.js 15 with App Router", relevance: 0.7 },
    ];

    const result = await smartConsolidateHeuristic(hermesDir, candidates, "ses_1");
    expect(result.noops).toBe(1);
    expect(result.added).toBe(0);

    const saved = await loadMemories(hermesDir);
    expect(saved.length).toBe(1); // No new memory added
  });

  it("UPDATEs when candidate is similar but has new info", async () => {
    const original = await createMemory(hermesDir, "fact", "Uses Supabase for auth", [], "ses_0", 0.7);

    const candidates: ExtractedMemory[] = [
      { type: "fact", content: "Uses Supabase for auth with GitHub OAuth provider", relevance: 0.8 },
    ];

    const result = await smartConsolidateHeuristic(hermesDir, candidates, "ses_1");
    // Should UPDATE the existing memory since it has overlapping + new info
    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);

    const saved = await loadMemories(hermesDir);
    // Still only 1 memory (updated, not duplicated)
    expect(saved.length).toBe(1);
    // Content should reference GitHub OAuth (from candidate)
    expect(saved[0].content).toContain("GitHub OAuth");
    // ID should be the original (updated in place)
    expect(saved[0].id).toBe(original.id);
  });

  it("returns empty result for zero candidates", async () => {
    const result = await smartConsolidateHeuristic(hermesDir, [], "ses_1");
    expect(result.added).toBe(0);
    expect(result.decisions.length).toBe(0);
  });

  it("respects scope parameter", async () => {
    const candidates: ExtractedMemory[] = [
      { type: "fact", content: "Session-specific debugging note", relevance: 0.5 },
    ];

    const result = await smartConsolidateHeuristic(hermesDir, candidates, "ses_1", "session");
    expect(result.added).toBe(1);

    const saved = await loadMemories(hermesDir);
    expect(saved[0].scope).toBe("session");
  });
});
