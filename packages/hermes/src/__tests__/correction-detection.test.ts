import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { onUserPrompt } from "../hooks/user-prompt";
import { createMemory, loadMemories, updateMemory } from "../memory-store";
import { saveConfig } from "../config";
import { DEFAULT_CONFIG } from "../types";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-correction-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("correction detection", () => {
  it("saves a first-time correction as guidance with observed confidence", async () => {
    await onUserPrompt(
      "No, don't do that. You should never use console.log in production code",
      "ses_1",
      tmpDir
    );

    const memories = await loadMemories(hermesDir);
    const corrections = memories.filter(
      (m) => m.type === "guidance" && m.tags.includes("correction")
    );

    expect(corrections.length).toBe(1);
    expect(corrections[0].confidence).toBe("observed");
    expect(corrections[0].correctionCount).toBe(1);
    expect(corrections[0].relevance).toBe(0.65);
  });

  it("auto-promotes a repeat correction to confirmed with relevance 1.0", async () => {
    // First correction — create an existing guidance memory that looks like a correction
    // The content needs to match what the regex extracts from the prompt below
    const mem = await createMemory(
      hermesDir, "guidance",
      "stop using any type in this project because it breaks type safety",
      ["self-improvement", "correction"],
      "ses_0", 0.65
    );
    await updateMemory(hermesDir, mem.id, {
      correctionCount: 1,
      confidence: "observed",
    });

    // Second correction — same pattern, uses "No, don't" which matches CORRECTION_PATTERNS[0]
    // Regex captures: "stop using any type in this project"
    await onUserPrompt(
      "No, don't stop using any type in this project because it breaks type safety, I already told you",
      "ses_2",
      tmpDir
    );

    const memories = await loadMemories(hermesDir);
    const correctionMem = memories.find((m) => m.id === mem.id);

    expect(correctionMem).toBeDefined();
    expect(correctionMem!.relevance).toBe(1.0);
    expect(correctionMem!.confidence).toBe("confirmed");
    expect(correctionMem!.correctionCount).toBe(2);
    expect(correctionMem!.tags).toContain("verified-rule");
  });

  it("does not create duplicate corrections", async () => {
    // Create existing correction — the pattern the regex will extract
    await createMemory(
      hermesDir, "guidance",
      "stop using any type in this project",
      ["self-improvement", "correction"],
      "ses_0", 0.65
    );

    // Try to add the same correction — "No, don't" + "stop using any ..."
    await onUserPrompt(
      "No, don't stop using any type in this project, I told you already",
      "ses_1",
      tmpDir
    );

    const memories = await loadMemories(hermesDir);
    const corrections = memories.filter(
      (m) => m.type === "guidance" && m.tags.includes("correction")
    );

    // Should still be 1 memory (updated, not duplicated)
    expect(corrections.length).toBe(1);
  });
});
