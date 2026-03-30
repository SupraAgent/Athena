import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  initManifest,
  loadManifest,
  saveManifest,
  isPeerActive,
  filterActivePeers,
} from "../discovery";
import type { DiscoveryManifest } from "../discovery";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-discovery-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("initManifest", () => {
  it("creates manifest file", async () => {
    const manifest = await initManifest(tmpDir, "org/my-repo", {
      branch: "main",
      displayName: "My Repo",
    });

    expect(manifest.repoId).toBe("org/my-repo");
    expect(manifest.branch).toBe("main");
    expect(manifest.displayName).toBe("My Repo");
    expect(manifest.capabilities).toContain("memories");

    // Verify file was written
    const filePath = path.join(tmpDir, "hermes-discovery.yaml");
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
  });
});

describe("loadManifest", () => {
  it("returns null when missing", async () => {
    const result = await loadManifest(tmpDir);
    expect(result).toBeNull();
  });
});

describe("saveManifest + loadManifest", () => {
  it("round-trips a manifest to disk", async () => {
    const manifest: DiscoveryManifest = {
      repoId: "org/test-repo",
      branch: "develop",
      memoryPath: ".athena/hermes/memories",
      capabilities: ["memories", "relay"],
      updatedAt: "2026-01-01T00:00:00.000Z",
      displayName: "Test",
      description: "A test repo",
    };

    await saveManifest(tmpDir, manifest);
    const loaded = await loadManifest(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.repoId).toBe("org/test-repo");
    expect(loaded!.branch).toBe("develop");
    expect(loaded!.capabilities).toEqual(["memories", "relay"]);
    expect(loaded!.displayName).toBe("Test");
    expect(loaded!.description).toBe("A test repo");
  });
});

describe("isPeerActive", () => {
  it("returns true for recent manifest", () => {
    const manifest: DiscoveryManifest = {
      repoId: "org/active",
      branch: "main",
      memoryPath: ".athena/hermes/memories",
      capabilities: ["memories"],
      updatedAt: new Date().toISOString(), // just now
    };
    expect(isPeerActive(manifest)).toBe(true);
  });

  it("returns false for stale manifest", () => {
    const manifest: DiscoveryManifest = {
      repoId: "org/stale",
      branch: "main",
      memoryPath: ".athena/hermes/memories",
      capabilities: ["memories"],
      updatedAt: "2020-01-01T00:00:00.000Z", // very old
    };
    expect(isPeerActive(manifest)).toBe(false);
  });
});

describe("filterActivePeers", () => {
  it("filters out stale peers", () => {
    const manifests: DiscoveryManifest[] = [
      {
        repoId: "org/active",
        branch: "main",
        memoryPath: ".athena/hermes/memories",
        capabilities: ["memories"],
        updatedAt: new Date().toISOString(),
      },
      {
        repoId: "org/stale",
        branch: "main",
        memoryPath: ".athena/hermes/memories",
        capabilities: ["memories"],
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ];

    const active = filterActivePeers(manifests);
    expect(active).toHaveLength(1);
    expect(active[0].repoId).toBe("org/active");
  });
});
