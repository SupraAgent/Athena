import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  loadMemories,
  saveMemory,
  deleteMemory,
  createMemory,
  searchMemories,
  deduplicateMemories,
  pruneMemories,
  saveSessionSummary,
  memoryId,
  sessionId,
} from "../memory-store";
import type { Memory, SessionSummary } from "../types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ID generation", () => {
  it("memoryId returns unique IDs with mem_ prefix", () => {
    const a = memoryId();
    const b = memoryId();
    expect(a).toMatch(/^mem_/);
    expect(b).toMatch(/^mem_/);
    expect(a).not.toBe(b);
  });

  it("sessionId returns unique IDs with ses_ prefix", () => {
    const a = sessionId();
    const b = sessionId();
    expect(a).toMatch(/^ses_/);
    expect(a).not.toBe(b);
  });
});

describe("CRUD operations", () => {
  it("loadMemories returns empty array for nonexistent dir", async () => {
    const result = await loadMemories(path.join(tmpDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("createMemory persists and loadMemories reads it back", async () => {
    const mem = await createMemory(tmpDir, "fact", "Next.js uses App Router", ["nextjs"], "ses_1");
    expect(mem.id).toMatch(/^mem_/);
    expect(mem.type).toBe("fact");

    const loaded = await loadMemories(tmpDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("Next.js uses App Router");
    expect(loaded[0].tags).toEqual(["nextjs"]);
  });

  it("saveMemory overwrites existing memory", async () => {
    const mem = await createMemory(tmpDir, "fact", "original", [], "ses_1");
    mem.content = "updated";
    mem.updatedAt = new Date().toISOString();
    await saveMemory(tmpDir, mem);

    const loaded = await loadMemories(tmpDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("updated");
  });

  it("deleteMemory removes the file", async () => {
    const mem = await createMemory(tmpDir, "fact", "to delete", [], "ses_1");
    const deleted = await deleteMemory(tmpDir, mem.id);
    expect(deleted).toBe(true);

    const loaded = await loadMemories(tmpDir);
    expect(loaded).toHaveLength(0);
  });

  it("deleteMemory returns false for nonexistent ID", async () => {
    const deleted = await deleteMemory(tmpDir, "nonexistent_id");
    expect(deleted).toBe(false);
  });
});

describe("searchMemories", () => {
  function makeMem(content: string, tags: string[] = [], relevance = 0.5): Memory {
    return {
      id: memoryId(),
      type: "fact",
      content,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "test",
      relevance,
    };
  }

  it("returns matching memories sorted by relevance", () => {
    const memories = [
      makeMem("Deploy target is Railway", ["deploy", "railway"], 0.9),
      makeMem("Uses React 19", ["react"], 0.5),
      makeMem("Railway runs on Docker", ["railway", "docker"], 0.7),
    ];

    const results = searchMemories(memories, "railway deploy");
    expect(results).toHaveLength(2);
    expect(results[0].content).toContain("Railway");
  });

  it("returns empty array for no matches", () => {
    const memories = [makeMem("Unrelated content", [], 0.5)];
    const results = searchMemories(memories, "xyz123 nonexistent");
    expect(results).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    const memories = Array.from({ length: 20 }, (_, i) =>
      makeMem(`Memory about topic ${i}`, ["topic"], 0.5)
    );
    const results = searchMemories(memories, "topic", 5);
    expect(results).toHaveLength(5);
  });
});

describe("deduplicateMemories", () => {
  it("detects exact content duplicates", () => {
    const existing: Memory[] = [{
      id: "mem_1", type: "fact", content: "Uses TypeScript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    }];
    const newMem: Memory = {
      id: "mem_2", type: "fact", content: "Uses TypeScript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    };
    expect(deduplicateMemories(existing, newMem)).toBe(true);
  });

  it("is case-insensitive", () => {
    const existing: Memory[] = [{
      id: "mem_1", type: "fact", content: "uses typescript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    }];
    const newMem: Memory = {
      id: "mem_2", type: "fact", content: "Uses TypeScript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    };
    expect(deduplicateMemories(existing, newMem)).toBe(true);
  });

  it("allows different content", () => {
    const existing: Memory[] = [{
      id: "mem_1", type: "fact", content: "Uses TypeScript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    }];
    const newMem: Memory = {
      id: "mem_2", type: "fact", content: "Uses JavaScript",
      tags: [], createdAt: "", updatedAt: "", source: "", relevance: 0.5,
    };
    expect(deduplicateMemories(existing, newMem)).toBe(false);
  });
});

describe("pruneMemories", () => {
  it("removes lowest-relevance memories when over limit", async () => {
    await createMemory(tmpDir, "fact", "Low relevance", [], "ses_1", 0.1);
    await createMemory(tmpDir, "fact", "Medium relevance", [], "ses_1", 0.5);
    await createMemory(tmpDir, "fact", "High relevance", [], "ses_1", 0.9);

    const removed = await pruneMemories(tmpDir, 2);
    expect(removed).toBe(1);

    const remaining = await loadMemories(tmpDir);
    expect(remaining).toHaveLength(2);
    expect(remaining.every((m) => m.relevance >= 0.5)).toBe(true);
  });

  it("does nothing when under limit", async () => {
    await createMemory(tmpDir, "fact", "Only one", [], "ses_1");
    const removed = await pruneMemories(tmpDir, 10);
    expect(removed).toBe(0);
  });
});

describe("saveSessionSummary", () => {
  it("creates a session summary YAML file", async () => {
    const summary: SessionSummary = {
      sessionId: "ses_test",
      startedAt: "2026-03-28T10:00:00Z",
      endedAt: "2026-03-28T11:00:00Z",
      summary: "Built the Hermes module",
      filesTouched: ["packages/hermes/src/index.ts"],
      decisionsMade: ["File-based storage for portability"],
      unfinished: [],
    };
    await saveSessionSummary(tmpDir, summary);

    const files = await fs.readdir(path.join(tmpDir, "sessions"));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("ses_test");
    expect(files[0]).toContain("2026-03-28");
  });
});
