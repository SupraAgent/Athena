import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  detectConflicts,
  resolveConflict,
  loadRelayManifest,
  saveRelayManifest,
} from "../relay-sync";
import type { RelayConflict, RelayManifest } from "../relay-sync";
import type { Memory } from "../types";

let tmpDir: string;

function makeMemory(overrides: Partial<Memory> & { id: string; content: string }): Memory {
  return {
    type: "fact",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "test",
    relevance: 1,
    scope: "user",
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-relay-sync-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("detectConflicts", () => {
  it("returns empty for no overlap", () => {
    const local = [makeMemory({ id: "a", content: "local content" })];
    const remote = [makeMemory({ id: "b", content: "remote content" })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts).toEqual([]);
  });

  it("detects ID-based conflict when same id has different content", () => {
    const local = [makeMemory({ id: "shared", content: "local version" })];
    const remote = [makeMemory({ id: "shared", content: "remote version" })];
    const conflicts = detectConflicts(local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].localMemory.id).toBe("shared");
    expect(conflicts[0].remoteMemory.id).toBe("shared");
    expect(conflicts[0].resolution).toBe("skip");
  });
});

describe("resolveConflict", () => {
  it("last-write-wins picks the newer memory", () => {
    const conflict: RelayConflict = {
      localMemory: makeMemory({
        id: "m1",
        content: "old",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      remoteMemory: makeMemory({
        id: "m1",
        content: "new",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
      resolution: "skip",
    };
    const winner = resolveConflict(conflict, "last-write-wins");
    expect(winner.content).toBe("new");
  });

  it("local-priority always picks local", () => {
    const conflict: RelayConflict = {
      localMemory: makeMemory({
        id: "m1",
        content: "local",
        updatedAt: "2025-01-01T00:00:00.000Z",
      }),
      remoteMemory: makeMemory({
        id: "m1",
        content: "remote",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
      resolution: "skip",
    };
    const winner = resolveConflict(conflict, "local-priority");
    expect(winner.content).toBe("local");
  });
});

describe("loadRelayManifest", () => {
  it("returns default when file is missing", async () => {
    const manifest = await loadRelayManifest(tmpDir);
    expect(manifest.lastSyncAt).toBe(new Date(0).toISOString());
    expect(manifest.peers).toEqual([]);
  });
});

describe("saveRelayManifest + loadRelayManifest", () => {
  it("round-trips a manifest to disk", async () => {
    const manifest: RelayManifest = {
      lastSyncAt: "2026-03-01T00:00:00.000Z",
      peers: [
        {
          repo: "org/other-repo",
          lastPulledAt: "2026-03-01T00:00:00.000Z",
          lastPushedAt: "2026-02-15T00:00:00.000Z",
          memoryCount: 5,
        },
      ],
    };

    await saveRelayManifest(tmpDir, manifest);
    const loaded = await loadRelayManifest(tmpDir);

    expect(loaded.lastSyncAt).toBe(manifest.lastSyncAt);
    expect(loaded.peers).toHaveLength(1);
    expect(loaded.peers[0].repo).toBe("org/other-repo");
    expect(loaded.peers[0].memoryCount).toBe(5);
  });
});
