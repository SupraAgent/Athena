/**
 * Verification Sweep Engine — machine-checkable memory verification.
 *
 * At session start, runs every memory's `verify` check against the codebase.
 * Passes silently; failures surface as violations. Memories without verify
 * checks are skipped (not penalized).
 *
 * Inspired by the "self-evolving system" pattern: a rule without a
 * verification check is a wish; a rule with one is a guardrail.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { Memory, VerifyCheck } from "./types";
import { updateMemory } from "./memory-store";
import { logEvent } from "./event-log";

// ── Types ──────────────────────────────────────────────────────

export type VerifyResult = {
  memoryId: string;
  memoryContent: string;
  check: VerifyCheck;
  passed: boolean;
  detail: string;
};

export type SweepResult = {
  checked: number;
  passed: number;
  failed: number;
  skipped: number;
  violations: VerifyResult[];
};

// ── Grep Implementation ────────────────────────────────────────

/**
 * Simple recursive grep — searches files for a pattern.
 * Returns count of matching lines. Uses string matching (not full regex)
 * for safety, but supports basic regex via new RegExp().
 */
async function grepCount(pattern: string, searchPath: string): Promise<number> {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gm");
  } catch {
    // Fall back to literal string match if regex is invalid
    regex = new RegExp(escapeRegex(pattern), "gm");
  }

  const stat = await fs.stat(searchPath).catch(() => null);
  if (!stat) return 0;

  if (stat.isFile()) {
    return grepFile(regex, searchPath);
  }

  // Directory: walk and count
  return grepDir(regex, searchPath);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2",
  ".ttf", ".eot", ".otf", ".zip", ".gz", ".tar", ".pdf",
  ".mp3", ".mp4", ".avi", ".mov", ".webm", ".svg",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  ".athena", ".claude",
]);

async function grepFile(regex: RegExp, filePath: string): Promise<number> {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return 0;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const matches = content.match(regex);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

async function grepDir(regex: RegExp, dirPath: string, depth = 0): Promise<number> {
  if (depth > 8) return 0; // Prevent runaway recursion

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0;

    for (const entry of entries) {
      if (entry.name.startsWith(".") && SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await grepDir(regex, full, depth + 1);
      } else if (entry.isFile()) {
        total += await grepFile(regex, full);
      }
    }

    return total;
  } catch {
    return 0;
  }
}

// ── Check Execution ────────────────────────────────────────────

/** Execute a single verify check against the repo. */
async function executeCheck(check: VerifyCheck, repoRoot: string): Promise<{ passed: boolean; detail: string }> {
  const resolvePath = (p?: string) => p ? path.resolve(repoRoot, p) : repoRoot;

  switch (check.type) {
    case "grep": {
      // grep: pattern exists (1+ matches expected)
      const count = await grepCount(check.pattern, resolvePath(check.path));
      return {
        passed: count > 0,
        detail: `Found ${count} match(es) for "${check.pattern}" in ${check.path ?? "."}`,
      };
    }

    case "grep-zero": {
      // grep-zero: pattern must NOT exist (0 matches expected)
      const count = await grepCount(check.pattern, resolvePath(check.path));
      return {
        passed: count === 0,
        detail: count === 0
          ? `No matches for "${check.pattern}" in ${check.path ?? "."} (expected)`
          : `Found ${count} match(es) for "${check.pattern}" in ${check.path ?? "."} (expected 0)`,
      };
    }

    case "file-exists": {
      const exists = await fs.stat(resolvePath(check.pattern)).then(() => true, () => false);
      return {
        passed: exists,
        detail: exists ? `File exists: ${check.pattern}` : `File missing: ${check.pattern}`,
      };
    }

    case "file-missing": {
      const exists = await fs.stat(resolvePath(check.pattern)).then(() => true, () => false);
      return {
        passed: !exists,
        detail: exists ? `File still exists: ${check.pattern} (expected removed)` : `File absent: ${check.pattern} (expected)`,
      };
    }

    default:
      return { passed: true, detail: `Unknown check type: ${(check as VerifyCheck).type}` };
  }
}

// ── Verification Sweep ─────────────────────────────────────────

/**
 * Run verification sweep on all memories with verify checks.
 *
 * - Memories without verify: skipped (not penalized)
 * - Passing checks: silent
 * - Failing checks: returned as violations, relevance decayed by 0.1
 */
export async function runVerificationSweep(
  memories: Memory[],
  repoRoot: string,
  hermesDir: string,
  sessionId: string
): Promise<SweepResult> {
  const verifiable = memories.filter((m) => m.verify);
  const skipped = memories.length - verifiable.length;
  const violations: VerifyResult[] = [];
  let passed = 0;

  for (const memory of verifiable) {
    const check = memory.verify!;
    try {
      const result = await executeCheck(check, repoRoot);
      const verifyResult: VerifyResult = {
        memoryId: memory.id,
        memoryContent: memory.content.slice(0, 120),
        check,
        passed: result.passed,
        detail: result.detail,
      };

      if (result.passed) {
        passed++;
      } else {
        violations.push(verifyResult);
        // Decay relevance on failure (floor at 0.1)
        const newRelevance = Math.max(0.1, memory.relevance - 0.1);
        if (newRelevance !== memory.relevance) {
          await updateMemory(hermesDir, memory.id, { relevance: newRelevance });
        }
        // Log violation event
        await logEvent(hermesDir, "verification.failed", sessionId, {
          memoryId: memory.id,
          check,
          detail: result.detail,
        });
      }
    } catch {
      // Check execution failed — skip, don't penalize
    }
  }

  // Log sweep summary
  await logEvent(hermesDir, "verification.sweep", sessionId, {
    checked: verifiable.length,
    passed,
    failed: violations.length,
    skipped,
  });

  return {
    checked: verifiable.length,
    passed,
    failed: violations.length,
    skipped,
    violations,
  };
}

// ── Formatting ─────────────────────────────────────────────────

/** Format sweep results for context injection. Returns empty string if all pass. */
export function formatSweepResults(result: SweepResult): string {
  if (result.violations.length === 0) return "";

  const lines = [
    "# Hermes \u2014 Verification Violations",
    `_${result.failed} of ${result.checked} rules failed verification._`,
    "",
  ];

  for (const v of result.violations) {
    lines.push(`- **VIOLATION**: ${v.memoryContent}`);
    lines.push(`  Check: \`${v.check.type}\` \u2014 ${v.detail}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Auto-generate a verify check from a correction pattern.
 * Returns null if no check can be inferred.
 */
export function inferVerifyCheck(correction: string, context?: string): VerifyCheck | null {
  // "don't use X" / "never use X" / "stop using X" → grep-zero for X
  const dontUseMatch = correction.match(
    /(?:don'?t|never|stop|avoid)\s+(?:use|using|import|importing|add|adding)\s+["'`]?([^"'`]+?)["'`]?(?:\s+(?:in|for|when|because|anywhere)\b|$)/i
  );
  if (dontUseMatch) {
    return {
      type: "grep-zero",
      pattern: escapeRegex(dontUseMatch[1].trim()),
      path: "src/",
    };
  }

  // "always use X" / "must use X" → grep for X
  const alwaysUseMatch = correction.match(
    /(?:always|must|should)\s+(?:use|import|include)\s+["'`]?([^"'`]+?)["'`]?(?:\s+(?:in|for|when|because|anywhere)\b|$)/i
  );
  if (alwaysUseMatch) {
    return {
      type: "grep",
      pattern: escapeRegex(alwaysUseMatch[1].trim()),
      path: "src/",
    };
  }

  return null;
}
