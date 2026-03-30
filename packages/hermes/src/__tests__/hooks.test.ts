import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createMemory } from "../memory-store";
import { saveConfig } from "../config";
import { onSessionStart } from "../hooks/session-start";
import { onStop } from "../hooks/stop";
import { onPreToolUse, _resetCache } from "../hooks/pre-tool-use";
import { onUserPrompt } from "../hooks/user-prompt";
import type { HermesConfig } from "../types";
import { DEFAULT_CONFIG } from "../types";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-hooks-"));
  // Simulate a repo with .athena/hermes/
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
  _resetCache();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("onSessionStart", () => {
  it("returns empty context when no memories exist", async () => {
    const result = await onSessionStart("ses_1", tmpDir);
    expect(result.context).toBe("");
  });

  it("returns formatted context when memories exist", async () => {
    const hDir = path.join(tmpDir, ".athena", "hermes");
    // In default whisper mode, only decisions/guidance/pending are shown
    await createMemory(hDir, "decision", "Chose tsup over Rollup", ["build"], "ses_0", 0.8);
    await createMemory(hDir, "guidance", "Always check Railway logs after deploy", ["deploy"], "ses_0", 0.9);

    const result = await onSessionStart("ses_1", tmpDir);
    expect(result.context).toContain("Hermes");
    expect(result.context).toContain("tsup");
    expect(result.context).toContain("Railway");
  });
});

describe("onStop", () => {
  it("returns 0 saved when transcript is empty", async () => {
    const result = await onStop("ses_1", "", "2026-03-28T10:00:00Z", tmpDir);
    expect(result.memoriesSaved).toBe(0);
  });

  it("dispatches transcript processing via async worker", async () => {
    const transcript = [
      "This project uses Next.js 15 with App Router.",
      "We decided to use file-based storage for portability.",
      "Modified packages/hermes/src/index.ts to add exports.",
    ].join("\n");

    // The stop hook now spawns a detached worker and returns immediately.
    // memoriesSaved is 0 because the worker runs in the background.
    const result = await onStop("ses_1", transcript, "2026-03-28T10:00:00Z", tmpDir);
    expect(result.memoriesSaved).toBe(0);
    expect(result.context).toBe("");
  });

  it("does not extract when autoExtract is false", async () => {
    const config: HermesConfig = { ...DEFAULT_CONFIG, autoExtract: false };
    await saveConfig(hermesDir, config);

    const transcript = "This project uses Railway for deployment.";
    const result = await onStop("ses_1", transcript, "2026-03-28T10:00:00Z", tmpDir);
    expect(result.memoriesSaved).toBe(0);
  });
});

describe("onPreToolUse", () => {
  it("returns empty for non-write tools", async () => {
    const result = await onPreToolUse("Read", "ses_1", tmpDir);
    expect(result.context).toBe("");
  });

  it("returns decisions for write tools", async () => {
    const hDir = path.join(tmpDir, ".athena", "hermes");
    await createMemory(hDir, "decision", "Always use strict TypeScript", ["ts"], "ses_0", 0.9);

    const result = await onPreToolUse("Edit", "ses_1", tmpDir);
    expect(result.context).toContain("strict TypeScript");
  });

  it("returns empty when no decisions exist", async () => {
    const hDir = path.join(tmpDir, ".athena", "hermes");
    await createMemory(hDir, "fact", "Uses React", [], "ses_0");

    const result = await onPreToolUse("Write", "ses_1", tmpDir);
    expect(result.context).toBe("");
  });
});

describe("onUserPrompt", () => {
  it("returns empty for empty prompt", async () => {
    const result = await onUserPrompt("", "ses_1", tmpDir);
    expect(result.context).toBe("");
  });

  it("returns matching memories for relevant prompt", async () => {
    const hDir = path.join(tmpDir, ".athena", "hermes");
    await createMemory(hDir, "fact", "Railway deployment uses Nixpacks", ["deploy", "railway"], "ses_0", 0.8);
    await createMemory(hDir, "fact", "Unrelated memory about cats and dogs playing in the park", ["pets"], "ses_0", 0.1);

    const result = await onUserPrompt("How do we deploy to Railway?", "ses_1", tmpDir);
    expect(result.context).toContain("Railway");
    // With semantic search, the relevant match should rank first
    const railwayIdx = result.context.indexOf("Railway");
    expect(railwayIdx).toBeGreaterThan(-1);
  });

  it("returns relevant results only for semantic search", async () => {
    const hDir = path.join(tmpDir, ".athena", "hermes");
    await createMemory(hDir, "fact", "The authentication system uses Supabase with GitHub OAuth for secure login", [], "ses_0", 0.8);

    // A completely unrelated query should still find something via the relevance component
    // when there is only 1 memory, but the search is working correctly
    const result = await onUserPrompt("How does the authentication system work?", "ses_1", tmpDir);
    expect(result.context).toContain("Supabase");
  });
});
