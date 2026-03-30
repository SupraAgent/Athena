/**
 * Cross-repo Memory Discovery Protocol.
 *
 * Allows Hermes instances across repos to discover each other
 * via a shared manifest file committed to each repo. Enables
 * automatic source registration when repos are cloned nearby.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "yaml";
import type { ExternalSource } from "./types";

/** Atomic write: temp file + rename. */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}
import { loadConfig, saveConfig, getHermesDir } from "./config";

// ── Types ──────────────────────────────────────────────────────

/** A Hermes discovery manifest published by each repo. */
export type DiscoveryManifest = {
  /** Unique repo identifier (e.g., "org/repo-name"). */
  repoId: string;
  /** Branch where memories are stored. */
  branch: string;
  /** Relative path to the hermes memory directory. */
  memoryPath: string;
  /** Capabilities this instance offers. */
  capabilities: DiscoveryCapability[];
  /** When this manifest was last updated. */
  updatedAt: string;
  /** Optional: friendly name for this repo's Hermes instance. */
  displayName?: string;
  /** Optional: description of what memories this repo contributes. */
  description?: string;
};

export type DiscoveryCapability =
  | "memories"
  | "relay"
  | "events"
  | "traces"
  | "metrics";

/** Result of a discovery scan. */
export type DiscoveryScanResult = {
  found: DiscoveryManifest[];
  alreadyRegistered: string[];
  newlyDiscovered: string[];
  errors: string[];
};

// ── Manifest Management ────────────────────────────────────────

const MANIFEST_FILE = "hermes-discovery.yaml";

/** Get the discovery manifest path for a repo. */
function manifestPath(hermesDir: string): string {
  return path.join(hermesDir, MANIFEST_FILE);
}

/** Load this repo's discovery manifest. */
export async function loadManifest(
  hermesDir: string
): Promise<DiscoveryManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(hermesDir), "utf-8");
    return yaml.parse(raw) as DiscoveryManifest;
  } catch {
    return null;
  }
}

/** Save/update this repo's discovery manifest. */
export async function saveManifest(
  hermesDir: string,
  manifest: DiscoveryManifest
): Promise<void> {
  manifest.updatedAt = new Date().toISOString();
  await fs.mkdir(hermesDir, { recursive: true });
  await atomicWriteFile(manifestPath(hermesDir), yaml.stringify(manifest));
}

/** Initialize a discovery manifest for this repo. */
export async function initManifest(
  hermesDir: string,
  repoId: string,
  opts?: { branch?: string; displayName?: string; description?: string }
): Promise<DiscoveryManifest> {
  const manifest: DiscoveryManifest = {
    repoId,
    branch: opts?.branch ?? "main",
    memoryPath: ".athena/hermes/memories",
    capabilities: ["memories", "relay", "events"],
    updatedAt: new Date().toISOString(),
    displayName: opts?.displayName,
    description: opts?.description,
  };
  await saveManifest(hermesDir, manifest);
  return manifest;
}

// ── Discovery Scanning ─────────────────────────────────────────

/**
 * Scan sibling directories for Hermes instances.
 *
 * Looks for `.athena/hermes/hermes-discovery.yaml` in directories
 * at the same level as the current repo. This allows repos cloned
 * into the same workspace to auto-discover each other.
 */
export async function scanSiblingRepos(
  repoRoot: string
): Promise<DiscoveryScanResult> {
  const parentDir = path.dirname(repoRoot);
  const result: DiscoveryScanResult = {
    found: [],
    alreadyRegistered: [],
    newlyDiscovered: [],
    errors: [],
  };

  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== path.basename(repoRoot));

    for (const dir of dirs) {
      const siblingHermesDir = path.join(parentDir, dir.name, ".athena", "hermes");
      const siblingManifestPath = path.join(siblingHermesDir, MANIFEST_FILE);

      try {
        const raw = await fs.readFile(siblingManifestPath, "utf-8");
        const manifest = yaml.parse(raw) as DiscoveryManifest;
        if (manifest?.repoId) {
          result.found.push(manifest);
        }
      } catch {
        // No manifest in this sibling — skip
      }
    }
  } catch (err) {
    result.errors.push(`Failed to scan siblings: ${String(err)}`);
  }

  return result;
}

/**
 * Scan and auto-register discovered repos as external sources.
 *
 * Only registers repos that aren't already in the config.
 * Returns the scan result with classification.
 */
export async function discoverAndRegister(
  hermesDir: string,
  repoRoot: string
): Promise<DiscoveryScanResult> {
  const config = await loadConfig(hermesDir);
  const existingRepos = new Set(config.sources.map((s) => s.repo));

  const scanResult = await scanSiblingRepos(repoRoot);

  for (const manifest of scanResult.found) {
    if (existingRepos.has(manifest.repoId)) {
      scanResult.alreadyRegistered.push(manifest.repoId);
    } else {
      scanResult.newlyDiscovered.push(manifest.repoId);

      // Auto-register as external source
      const newSource: ExternalSource = {
        repo: manifest.repoId,
        branch: manifest.branch,
        path: manifest.memoryPath,
      };
      config.sources.push(newSource);
    }
  }

  // Save updated config if new sources were added
  if (scanResult.newlyDiscovered.length > 0) {
    await saveConfig(hermesDir, config);
  }

  return scanResult;
}

// ── Peer Health Check ──────────────────────────────────────────

/** Check if a discovered peer is still active (manifest updated recently). */
export function isPeerActive(
  manifest: DiscoveryManifest,
  maxAgeDays = 30
): boolean {
  const age = Date.now() - new Date(manifest.updatedAt).getTime();
  return age < maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Filter active peers from a list of discovered manifests. */
export function filterActivePeers(
  manifests: DiscoveryManifest[],
  maxAgeDays = 30
): DiscoveryManifest[] {
  return manifests.filter((m) => isPeerActive(m, maxAgeDays));
}
