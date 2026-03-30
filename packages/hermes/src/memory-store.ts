import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import type { Memory, MemoryType, SessionSummary, ExternalSource } from "./types";

// ── ID generation ───────────────────────────────────────────────

let _counter = 0;
export function memoryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `mem_${ts}_${rand}_${(++_counter).toString(36)}`;
}

export function sessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ses_${ts}_${rand}`;
}

// ── ID validation ───────────────────────────────────────────────

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Validate that an ID is safe for use in file paths. */
function assertSafeId(id: string): void {
  if (!id || !SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Unsafe ID rejected: "${id}". IDs must match ${SAFE_ID_PATTERN}`);
  }
}

// ── Paths ───────────────────────────────────────────────────────

function memoriesDir(hermesDir: string): string {
  return path.join(hermesDir, "memories");
}

function sessionsDir(hermesDir: string): string {
  return path.join(hermesDir, "sessions");
}

function memoryFilePath(hermesDir: string, id: string): string {
  assertSafeId(id);
  return path.join(memoriesDir(hermesDir), `${id}.yaml`);
}

// ── Serialization ───────────��───────────────────────────────────

function memoryToYaml(m: Memory): string {
  const doc = {
    id: m.id,
    type: m.type,
    content: m.content,
    tags: m.tags,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    source: m.source,
    relevance: m.relevance,
    scope: m.scope ?? "user",
  };
  return `# Hermes Memory — ${m.type}\n${YAML.stringify(doc)}`;
}

const VALID_MEMORY_TYPES = new Set<string>([
  "fact", "decision", "preference", "project-context",
  "pattern", "pending", "guidance",
  "session-summary", "agent-heartbeat",
]);

function yamlToMemory(raw: string): Memory | null {
  try {
    const parsed = YAML.parse(raw);
    if (!parsed?.id || !parsed?.type || !parsed?.content) return null;
    if (!SAFE_ID_PATTERN.test(parsed.id)) return null;
    if (!VALID_MEMORY_TYPES.has(parsed.type)) return null;
    return {
      id: parsed.id,
      type: parsed.type as MemoryType,
      content: parsed.content,
      tags: parsed.tags ?? [],
      createdAt: parsed.created_at ?? new Date().toISOString(),
      updatedAt: parsed.updated_at ?? new Date().toISOString(),
      source: parsed.source ?? "unknown",
      relevance: parsed.relevance ?? 0.5,
      scope: parsed.scope ?? "user",
    };
  } catch {
    return null;
  }
}

function sessionToYaml(s: SessionSummary): string {
  const doc = {
    session_id: s.sessionId,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    summary: s.summary,
    files_touched: s.filesTouched,
    decisions_made: s.decisionsMade,
    unfinished: s.unfinished,
  };
  return `# Hermes Session Summary\n${YAML.stringify(doc)}`;
}

// ── CRUD ────────────────────────────────────────────────────────

/** Load all memories from .athena/hermes/memories/. Reads sequentially to avoid EMFILE. */
export async function loadMemories(hermesDir: string): Promise<Memory[]> {
  const dir = memoriesDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    const yamlFiles = files.filter((f) => f.endsWith(".yaml"));
    const memories: Memory[] = [];
    for (const f of yamlFiles) {
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const mem = yamlToMemory(raw);
        if (mem) memories.push(mem);
      } catch {
        // Skip unreadable files, continue loading others
      }
    }
    return memories;
  } catch {
    return [];
  }
}

/** Save a single memory. Creates directories if needed. */
export async function saveMemory(hermesDir: string, memory: Memory): Promise<void> {
  const dir = memoriesDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(memoryFilePath(hermesDir, memory.id), memoryToYaml(memory), "utf-8");
}

/** Update an existing memory's content and metadata. Reads single file, not all memories. */
export async function updateMemory(
  hermesDir: string,
  id: string,
  updates: Partial<Pick<Memory, "content" | "relevance" | "tags" | "scope">>
): Promise<Memory | null> {
  try {
    const filePath = memoryFilePath(hermesDir, id);
    const raw = await fs.readFile(filePath, "utf-8");
    const existing = yamlToMemory(raw);
    if (!existing) return null;

    const updated: Memory = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveMemory(hermesDir, updated);
    return updated;
  } catch {
    return null;
  }
}

/** Load memories filtered by scope. */
export async function loadMemoriesByScope(
  hermesDir: string,
  scope: import("./types").MemoryScope
): Promise<Memory[]> {
  const all = await loadMemories(hermesDir);
  return all.filter((m) => (m.scope ?? "user") === scope);
}

/** Delete a memory by ID. */
export async function deleteMemory(hermesDir: string, id: string): Promise<boolean> {
  try {
    await fs.unlink(memoryFilePath(hermesDir, id));
    return true;
  } catch {
    return false;
  }
}

/** Create a new memory and persist it. */
export async function createMemory(
  hermesDir: string,
  type: MemoryType,
  content: string,
  tags: string[],
  source: string,
  relevance = 0.7,
  scope: import("./types").MemoryScope = "user"
): Promise<Memory> {
  const now = new Date().toISOString();
  const memory: Memory = {
    id: memoryId(),
    type,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
    source,
    relevance,
    scope,
  };
  await saveMemory(hermesDir, memory);
  return memory;
}

/** Save a session summary. */
export async function saveSessionSummary(
  hermesDir: string,
  summary: SessionSummary
): Promise<void> {
  assertSafeId(summary.sessionId);
  const dir = sessionsDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });
  // Validate endedAt is a plausible ISO date, fallback to today
  const dateStr = /^\d{4}-\d{2}-\d{2}/.test(summary.endedAt)
    ? summary.endedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const filename = `${dateStr}-${summary.sessionId}.yaml`;
  await fs.writeFile(path.join(dir, filename), sessionToYaml(summary), "utf-8");
}

// ── Search ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "in", "on", "at", "to", "of", "for",
  "and", "or", "but", "not", "with", "from", "by", "as", "be", "was",
  "are", "been", "has", "had", "have", "do", "does", "did", "will",
  "can", "could", "would", "should", "may", "might", "i", "me", "my",
  "we", "our", "you", "your", "he", "she", "they", "this", "that",
  "how", "what", "when", "where", "who", "which", "why",
]);

/** Simple keyword + tag search. Returns matches sorted by relevance. */
export function searchMemories(
  memories: Memory[],
  query: string,
  limit = 10
): Memory[] {
  const terms = query.toLowerCase().split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  if (terms.length === 0) return [];

  const scored = memories.map((m) => {
    const text = `${m.content} ${m.tags.join(" ")}`.toLowerCase();
    let matchCount = 0;
    for (const term of terms) {
      if (text.includes(term)) matchCount++;
    }
    const termScore = terms.length > 0 ? matchCount / terms.length : 0;
    // Only include if at least one search term actually matched
    return { memory: m, score: termScore > 0 ? termScore * 0.6 + m.relevance * 0.4 : 0 };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.memory);
}

/** Deduplicate by content similarity (exact match). */
export function deduplicateMemories(existing: Memory[], newMemory: Memory): boolean {
  const normalContent = newMemory.content.trim().toLowerCase();
  return existing.some(
    (m) => m.content.trim().toLowerCase() === normalContent && m.type === newMemory.type
  );
}

// ── Pruning ─���───────────────────────���───────────────────────────

/** Prune memories to stay under maxCount. Removes lowest-relevance, oldest first. */
export async function pruneMemories(
  hermesDir: string,
  maxCount: number
): Promise<number> {
  const all = await loadMemories(hermesDir);
  if (all.length <= maxCount) return 0;

  const sorted = [...all].sort((a, b) => {
    const relevanceDiff = a.relevance - b.relevance;
    if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const toRemove = sorted.slice(0, all.length - maxCount);
  let removed = 0;
  for (const m of toRemove) {
    if (await deleteMemory(hermesDir, m.id)) removed++;
  }
  return removed;
}

// ── Remote / Cross-Project Relay ─────────────────────────────────

/**
 * Load memories from an external repo source via git.
 * Uses `git archive` to fetch only the hermes/memories/ directory
 * without cloning the entire repo. Falls back silently on failure.
 */
export async function loadRemoteMemories(source: ExternalSource): Promise<Memory[]> {
  const { execFileSync } = require("child_process") as typeof import("child_process");
  const memoriesPath = path.posix.join(source.path, "memories");

  try {
    // Use git archive to stream the remote memories directory as a tar
    // This works with any git remote (GitHub, GitLab, local) without cloning
    const repoUrl = source.repo.includes("://")
      ? source.repo
      : `https://github.com/${source.repo}.git`;

    // List files in the remote memories directory
    const lsOutput = execFileSync("git", [
      "ls-remote", "--refs", repoUrl, `refs/heads/${source.branch}`,
    ], { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] });

    if (!lsOutput.trim()) return [];

    // Fetch memory files via git archive piped through tar
    const tmpDir = path.join(
      require("os").tmpdir(),
      `hermes-relay-${Date.now()}`
    );
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      execFileSync("git", [
        "archive",
        `--remote=${repoUrl}`,
        source.branch,
        memoriesPath,
      ], {
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // git archive --remote doesn't work with GitHub HTTPS URLs.
      // Fall back to GitHub raw content API.
      return await loadRemoteMemoriesViaApi(source);
    }

    return [];
  } catch {
    // Silent failure — relay is best-effort
    return [];
  }
}

/**
 * Fetch memories from a GitHub repo using the raw content API.
 * Uses the GitHub Trees API to list files, then fetches each YAML file.
 */
async function loadRemoteMemoriesViaApi(source: ExternalSource): Promise<Memory[]> {
  const { execFileSync } = require("child_process") as typeof import("child_process");
  const memoriesPath = path.posix.join(source.path, "memories");

  // Parse owner/repo from source.repo
  const repoMatch = source.repo.match(/(?:github\.com[/:])?([^/]+\/[^/.]+)/);
  if (!repoMatch) return [];
  const ownerRepo = repoMatch[1].replace(/\.git$/, "");

  try {
    // Use GitHub API via git credential or gh CLI to list the tree
    // Try gh CLI first (most likely available if user has GitHub repos)
    const treeJson = execFileSync("gh", [
      "api",
      `repos/${ownerRepo}/git/trees/${source.branch}`,
      "--jq", `.tree[] | select(.path == "${source.path.replace(/\/$/, "")}") | .sha`,
    ], { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();

    if (!treeJson) return [];

    // Get the hermes subtree to find memories/
    const hermesTree = execFileSync("gh", [
      "api",
      `repos/${ownerRepo}/git/trees/${treeJson}`,
      "--jq", `.tree[] | select(.path == "memories") | .sha`,
    ], { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();

    if (!hermesTree) return [];

    // List memory files
    const fileList = execFileSync("gh", [
      "api",
      `repos/${ownerRepo}/git/trees/${hermesTree}`,
      "--jq", `.tree[] | select(.path | endswith(".yaml")) | .path`,
    ], { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();

    if (!fileList) return [];

    const files = fileList.split("\n").filter(Boolean);
    const memories: Memory[] = [];

    // Fetch each file's content via raw API
    for (const file of files.slice(0, 50)) {
      try {
        const raw = execFileSync("gh", [
          "api",
          `repos/${ownerRepo}/contents/${memoriesPath}/${file}`,
          "--jq", ".content",
        ], { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();

        if (raw) {
          const decoded = Buffer.from(raw, "base64").toString("utf-8");
          const mem = yamlToMemory(decoded);
          if (mem) memories.push(mem);
        }
      } catch {
        // Skip individual file failures
      }
    }

    return memories;
  } catch {
    return [];
  }
}

/** Load memories from all configured external sources. */
export async function loadAllRemoteMemories(sources: ExternalSource[]): Promise<Memory[]> {
  const results: Memory[] = [];
  for (const source of sources) {
    const remote = await loadRemoteMemories(source);
    results.push(...remote);
  }
  return results;
}
