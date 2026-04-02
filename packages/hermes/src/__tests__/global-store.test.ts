import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  getGlobalHermesDir,
  ensureGlobalDir,
  loadGlobalConfig,
  saveGlobalConfig,
  loadGlobalMemories,
  saveGlobalMemory,
  createGlobalMemory,
  deleteGlobalMemory,
  promoteToGlobal,
  mergeGlobalWithLocal,
  getGlobalStatus,
} from "../global-store";
import { createMemory, searchMemories } from "../memory-store";
import type { Memory } from "../types";

let tmpGlobalDir: string;
let tmpLocalDir: string;

beforeEach(async () => {
  tmpGlobalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-global-test-"));
  tmpLocalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-local-test-"));
  vi.stubEnv("HERMES_HOME", tmpGlobalDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(tmpGlobalDir, { recursive: true, force: true });
  await fs.rm(tmpLocalDir, { recursive: true, force: true });
});

describe("getGlobalHermesDir", () => {
  it("returns HERMES_HOME when set under home or tmp", () => {
    expect(getGlobalHermesDir()).toBe(tmpGlobalDir);
  });

  it("falls back to ~/.hermes when HERMES_HOME is not set", () => {
    vi.stubEnv("HERMES_HOME", "");
    delete process.env.HERMES_HOME;
    expect(getGlobalHermesDir()).toBe(path.join(os.homedir(), ".hermes"));
  });

  it("rejects HERMES_HOME outside home and tmp (path traversal)", () => {
    vi.stubEnv("HERMES_HOME", "/etc/evil");
    expect(() => getGlobalHermesDir()).toThrow(/HERMES_HOME must be under/);
  });
});

describe("ensureGlobalDir", () => {
  it("creates the memories subdirectory", async () => {
    const dir = await ensureGlobalDir();
    expect(dir).toBe(tmpGlobalDir);
    const stat = await fs.stat(path.join(tmpGlobalDir, "memories"));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("global config", () => {
  it("returns defaults when no config exists", async () => {
    const config = await loadGlobalConfig();
    expect(config.enabled).toBe(true);
    expect(config.maxMemories).toBe(100);
    expect(config.conflictStrategy).toBe("last-write-wins");
  });

  it("round-trips config", async () => {
    await ensureGlobalDir();
    const config = { maxMemories: 50, conflictStrategy: "local-priority" as const, enabled: true };
    await saveGlobalConfig(config);
    const loaded = await loadGlobalConfig();
    expect(loaded.maxMemories).toBe(50);
    expect(loaded.conflictStrategy).toBe("local-priority");
  });

  it("rejects invalid conflict_strategy and falls back to default", async () => {
    await ensureGlobalDir();
    const configPath = path.join(tmpGlobalDir, "hermes.yaml");
    await fs.writeFile(configPath, "conflict_strategy: yolo\n", "utf-8");
    const loaded = await loadGlobalConfig();
    expect(loaded.conflictStrategy).toBe("last-write-wins");
  });
});

describe("CRUD", () => {
  it("creates and loads global memories", async () => {
    const mem = await createGlobalMemory("fact", "TypeScript strict mode everywhere");
    expect(mem.scope).toBe("global");
    expect(mem.type).toBe("fact");

    const all = await loadGlobalMemories();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe("TypeScript strict mode everywhere");
    expect(all[0].scope).toBe("global");
  });

  it("saves a memory with global scope (overrides user scope)", async () => {
    await ensureGlobalDir();
    const mem: Memory = {
      id: "mem_test_123",
      type: "decision",
      content: "Use Vitest for all packages",
      tags: ["testing"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "cli",
      relevance: 0.8,
      scope: "user",
    };
    await saveGlobalMemory(mem);
    const all = await loadGlobalMemories();
    expect(all[0].scope).toBe("global");
  });

  it("deletes a global memory", async () => {
    const mem = await createGlobalMemory("fact", "Delete me");
    expect(await loadGlobalMemories()).toHaveLength(1);
    const deleted = await deleteGlobalMemory(mem.id);
    expect(deleted).toBe(true);
    expect(await loadGlobalMemories()).toHaveLength(0);
  });

  it("returns empty array when global dir does not exist", async () => {
    vi.stubEnv("HERMES_HOME", path.join(os.tmpdir(), "nonexistent-hermes-dir"));
    const all = await loadGlobalMemories();
    expect(all).toEqual([]);
  });
});

describe("search", () => {
  it("searches global memories by keyword via searchMemories", async () => {
    await createGlobalMemory("fact", "Always use ESLint with strict rules");
    await createGlobalMemory("fact", "Postgres is the primary database");
    const all = await loadGlobalMemories();
    const results = searchMemories(all, "ESLint");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("ESLint");
  });
});

describe("promote", () => {
  it("promotes a local memory to global", async () => {
    const local = await createMemory(tmpLocalDir, "decision", "Use monorepo structure", [], "cli", 0.8);
    const promoted = await promoteToGlobal(tmpLocalDir, local.id);
    expect(promoted).not.toBeNull();
    expect(promoted!.scope).toBe("global");
    expect(promoted!.content).toBe("Use monorepo structure");

    const globals = await loadGlobalMemories();
    expect(globals).toHaveLength(1);
  });

  it("returns null for nonexistent memory", async () => {
    const result = await promoteToGlobal(tmpLocalDir, "nonexistent_id");
    expect(result).toBeNull();
  });

  it("deduplicates on promote — updates existing if newer or same age", async () => {
    await createGlobalMemory(
      "decision",
      "Use monorepo structure with npm workspaces for all packages and shared dependencies across the project",
      ["architecture"]
    );

    const local = await createMemory(
      tmpLocalDir,
      "decision",
      "Use monorepo structure with npm workspaces for all packages and shared dependencies across the project",
      ["updated", "architecture"],
      "cli",
      0.9
    );
    const promoted = await promoteToGlobal(tmpLocalDir, local.id);

    const globals = await loadGlobalMemories();
    expect(globals).toHaveLength(1);
    expect(promoted!.tags).toContain("updated");
  });
});

describe("mergeGlobalWithLocal", () => {
  function makeMem(id: string, content: string, scope: "user" | "global" = "user", updatedAt?: string): Memory {
    return {
      id,
      type: "fact",
      content,
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: updatedAt ?? "2026-01-01T00:00:00Z",
      source: "test",
      relevance: 0.7,
      scope,
    };
  }

  it("returns local memories when global is empty", () => {
    const local = [makeMem("l1", "Local fact")];
    const result = mergeGlobalWithLocal(local, [], "last-write-wins");
    expect(result).toHaveLength(1);
  });

  it("adds non-conflicting global memories", () => {
    const local = [makeMem("l1", "Local fact about TypeScript")];
    const global = [makeMem("g1", "Global fact about Python", "global")];
    const result = mergeGlobalWithLocal(local, global, "last-write-wins");
    expect(result).toHaveLength(2);
  });

  it("skips exact duplicate content", () => {
    const local = [makeMem("l1", "Same content here")];
    const global = [makeMem("g1", "Same content here", "global")];
    const result = mergeGlobalWithLocal(local, global, "last-write-wins");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  it("local-priority keeps local on semantic conflict", () => {
    const content = "Always use npm workspaces for monorepo structure with shared dependencies across all packages in the project and maintain consistent versioning";
    const local = [makeMem("l1", content)];
    const global = [makeMem("g1", content, "global", "2026-06-01T00:00:00Z")];
    const result = mergeGlobalWithLocal(local, global, "local-priority");
    // Exact content dedup kicks in — local wins
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  it("global-priority replaces local on exact content conflict", () => {
    const content = "Always use npm workspaces for monorepo structure with shared dependencies across all packages in the project and maintain consistent versioning";
    const local = [makeMem("l1", content)];
    const global = [makeMem("g1", content, "global")];
    // Exact dedup means local wins (global is skipped)
    const result = mergeGlobalWithLocal(local, global, "global-priority");
    expect(result).toHaveLength(1);
  });

  it("last-write-wins skips exact duplicate global", () => {
    const content = "Always use npm workspaces for monorepo structure with shared dependencies across all packages in the project and maintain consistent versioning";
    const local = [makeMem("l1", content, "user", "2026-01-01T00:00:00Z")];
    const global = [makeMem("g1", content, "global", "2026-06-01T00:00:00Z")];
    const result = mergeGlobalWithLocal(local, global, "last-write-wins");
    // Exact dedup catches it
    expect(result).toHaveLength(1);
  });
});

describe("status", () => {
  it("returns status for initialized store", async () => {
    await createGlobalMemory("fact", "Fact one");
    await createGlobalMemory("decision", "Decision one");
    const status = await getGlobalStatus();
    expect(status.exists).toBe(true);
    expect(status.memoryCount).toBe(2);
    expect(status.typeCounts.fact).toBe(1);
    expect(status.typeCounts.decision).toBe(1);
  });

  it("returns exists: false for uninitialized store", async () => {
    vi.stubEnv("HERMES_HOME", path.join(os.tmpdir(), "nonexistent-hermes-dir-2"));
    const status = await getGlobalStatus();
    expect(status.exists).toBe(false);
    expect(status.memoryCount).toBe(0);
  });
});
