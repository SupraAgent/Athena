import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";
import type { Memory, MemoryType, SessionSummary } from "./types";

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

// ── Paths ───────────────────────────────────────────────────────

function memoriesDir(hermesDir: string): string {
  return path.join(hermesDir, "memories");
}

function sessionsDir(hermesDir: string): string {
  return path.join(hermesDir, "sessions");
}

function memoryFilePath(hermesDir: string, id: string): string {
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
  };
  return `# Hermes Memory — ${m.type}\n${YAML.stringify(doc)}`;
}

function yamlToMemory(raw: string): Memory | null {
  try {
    const parsed = YAML.parse(raw);
    if (!parsed?.id || !parsed?.type || !parsed?.content) return null;
    return {
      id: parsed.id,
      type: parsed.type as MemoryType,
      content: parsed.content,
      tags: parsed.tags ?? [],
      createdAt: parsed.created_at ?? new Date().toISOString(),
      updatedAt: parsed.updated_at ?? new Date().toISOString(),
      source: parsed.source ?? "unknown",
      relevance: parsed.relevance ?? 0.5,
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

/** Load all memories from .athena/hermes/memories/ */
export async function loadMemories(hermesDir: string): Promise<Memory[]> {
  const dir = memoriesDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    const yamlFiles = files.filter((f) => f.endsWith(".yaml"));
    const results = await Promise.all(
      yamlFiles.map(async (f) => {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        return yamlToMemory(raw);
      })
    );
    return results.filter((m): m is Memory => m !== null);
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
  relevance = 0.7
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
  };
  await saveMemory(hermesDir, memory);
  return memory;
}

/** Save a session summary. */
export async function saveSessionSummary(
  hermesDir: string,
  summary: SessionSummary
): Promise<void> {
  const dir = sessionsDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });
  const date = summary.endedAt.slice(0, 10);
  const filename = `${date}-${summary.sessionId}.yaml`;
  await fs.writeFile(path.join(dir, filename), sessionToYaml(summary), "utf-8");
}

// ── Search ──────────────────────────────────────────────────────

/** Simple keyword + tag search. Returns matches sorted by relevance. */
export function searchMemories(
  memories: Memory[],
  query: string,
  limit = 10
): Memory[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return memories.slice(0, limit);

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
