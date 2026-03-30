/**
 * Git-aware memory aging.
 *
 * Detects when files referenced by memories have been modified, renamed,
 * or deleted — and adjusts memory relevance accordingly.
 *
 * - If a referenced file was deleted: decay relevance by 50%
 * - If a referenced file was recently modified: boost relevance by 10%
 * - If a memory hasn't been accessed in 30+ days: decay by 20%
 */

import { execFileSync } from "child_process";
import type { Memory } from "./types";
import { loadMemories, saveMemory } from "./memory-store";

/** Extract file paths from memory content. */
function extractFilePaths(content: string): string[] {
  const paths: string[] = [];

  // Match common file path patterns
  const patterns = [
    /[`"']?([\w/.@-]+\/[\w/.@-]+\.[a-zA-Z]{1,10})[`"']?/g,
    /(?:src|packages|lib|components|hooks|app|pages)\/[\w/.@-]+\.[a-zA-Z]{1,10}/g,
  ];

  for (const pattern of patterns) {
    const fresh = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = fresh.exec(content)) !== null) {
      const p = (match[1] ?? match[0]).replace(/[`"']/g, "");
      if (p.includes("/") && !p.startsWith("http")) {
        paths.push(p);
      }
    }
  }

  return [...new Set(paths)];
}

/** Check if a file exists in the current git repo. */
function fileExistsInRepo(filePath: string, repoRoot: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", filePath], {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Get the last modification time of a file via git log. */
function getLastModified(filePath: string, repoRoot: string): Date | null {
  try {
    const output = execFileSync("git", [
      "log", "-1", "--format=%aI", "--", filePath,
    ], {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    return output ? new Date(output) : null;
  } catch {
    return null;
  }
}

// ── Branch Context Awareness ──────────────────────────────────

/** Get the current git branch name. Returns null if not in a repo. */
export function getCurrentBranch(repoRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim() || null;
  } catch {
    return null;
  }
}

/** Get files changed on the current branch vs main/master. */
export function getBranchFiles(repoRoot: string): string[] {
  const branch = getCurrentBranch(repoRoot);
  if (!branch || branch === "main" || branch === "master") return [];

  // Try main, then master as base
  for (const base of ["main", "master"]) {
    try {
      const output = execFileSync(
        "git",
        ["diff", "--name-only", `${base}...${branch}`],
        {
          cwd: repoRoot,
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }
      ).trim();
      return output ? output.split("\n").filter(Boolean) : [];
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Compute a relevance boost for a memory based on current branch context.
 * Memories referencing files changed on the current branch get a boost.
 *
 * @returns boost value 0-0.2 to add to relevance score
 */
export function branchBoost(memory: Memory, branchFiles: string[]): number {
  if (branchFiles.length === 0) return 0;

  const filePaths = extractFilePaths(memory.content);
  if (filePaths.length === 0) return 0;

  let matches = 0;
  for (const fp of filePaths) {
    if (branchFiles.some((bf) => bf.endsWith(fp) || fp.endsWith(bf))) {
      matches++;
    }
  }

  if (matches === 0) return 0;
  // Scale: 1 match = 0.1, 2+ = 0.15, 3+ = 0.2
  return Math.min(0.2, 0.05 + matches * 0.05);
}

/** Result of an aging pass. */
export type AgingResult = {
  processed: number;
  decayed: number;
  boosted: number;
  staleFiles: string[];
};

/**
 * Run a git-aware aging pass on all memories.
 *
 * - Decays memories referencing deleted files
 * - Boosts memories referencing recently-modified files
 * - Decays memories that haven't been updated in 30+ days
 */
export async function ageMemories(
  hermesDir: string,
  repoRoot: string
): Promise<AgingResult> {
  const memories = await loadMemories(hermesDir);
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  let decayed = 0;
  let boosted = 0;
  const staleFiles: string[] = [];

  for (const mem of memories) {
    // Skip session summaries and heartbeats
    if (mem.type === "session-summary" || mem.type === "agent-heartbeat") continue;

    let changed = false;
    const filePaths = extractFilePaths(mem.content);

    // Check referenced files
    for (const fp of filePaths) {
      if (!fileExistsInRepo(fp, repoRoot)) {
        // File was deleted — decay relevance
        mem.relevance = Math.max(0.1, mem.relevance * 0.5);
        staleFiles.push(fp);
        changed = true;
        decayed++;
        break; // One decay per memory per pass
      }

      const lastMod = getLastModified(fp, repoRoot);
      if (lastMod && now - lastMod.getTime() < sevenDaysMs) {
        // File was recently modified — boost relevance
        mem.relevance = Math.min(1, mem.relevance + 0.1);
        changed = true;
        boosted++;
        break;
      }
    }

    // Time-based decay for old, unaccessed memories
    const ageMs = now - new Date(mem.updatedAt).getTime();
    if (ageMs > thirtyDaysMs && !changed) {
      mem.relevance = Math.max(0.1, mem.relevance * 0.8);
      changed = true;
      decayed++;
    }

    if (changed) {
      mem.updatedAt = new Date().toISOString();
      await saveMemory(hermesDir, mem);
    }
  }

  return {
    processed: memories.length,
    decayed,
    boosted,
    staleFiles: [...new Set(staleFiles)],
  };
}
