/**
 * Structured Event Log — append-only JSONL per day.
 *
 * Records all significant Hermes events: memory CRUD, hook executions,
 * extraction results, consolidation decisions. Stored in
 * .athena/hermes/logs/YYYY-MM-DD.jsonl
 *
 * Each line is a self-contained JSON object with a timestamp, event type,
 * and payload. Designed for post-hoc analysis and debugging.
 */

import * as fs from "fs/promises";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────

export type EventType =
  | "hook.session_start"
  | "hook.stop"
  | "hook.user_prompt"
  | "hook.pre_tool_use"
  | "memory.created"
  | "memory.updated"
  | "memory.deleted"
  | "memory.pruned"
  | "extraction.completed"
  | "consolidation.completed"
  | "correction.detected"
  | "correction.promoted"
  | "verification.sweep"
  | "verification.failed"
  | "session.scored"
  | "graduation.candidate"
  | "search.executed"
  | "error";

export type LogEvent = {
  timestamp: string;
  event: EventType;
  sessionId: string;
  payload: Record<string, unknown>;
};

// ── Log Writer ─────────────────────────────────────────────────

function logsDir(hermesDir: string): string {
  return path.join(hermesDir, "logs");
}

function todayLogFile(hermesDir: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logsDir(hermesDir), `${date}.jsonl`);
}

/** Append an event to today's log file. Non-blocking, never throws. */
export async function logEvent(
  hermesDir: string,
  event: EventType,
  sessionId: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const dir = logsDir(hermesDir);
    await fs.mkdir(dir, { recursive: true });

    const entry: LogEvent = {
      timestamp: new Date().toISOString(),
      event,
      sessionId,
      payload,
    };

    await fs.appendFile(
      todayLogFile(hermesDir),
      JSON.stringify(entry) + "\n",
      "utf-8"
    );
  } catch {
    // Logging must never block or crash the system
  }
}

// ── Log Reader ─────────────────────────────────────────────────

/** Read events from a specific date's log file. */
export async function readLog(
  hermesDir: string,
  date: string // YYYY-MM-DD
): Promise<LogEvent[]> {
  const filePath = path.join(logsDir(hermesDir), `${date}.jsonl`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as LogEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is LogEvent => e !== null);
  } catch {
    return [];
  }
}

/** List available log dates, most recent first. */
export async function listLogDates(hermesDir: string): Promise<string[]> {
  const dir = logsDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(".jsonl", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Read events filtered by type and/or session. */
export async function queryEvents(
  hermesDir: string,
  options: {
    date?: string;
    event?: EventType;
    sessionId?: string;
    limit?: number;
  } = {}
): Promise<LogEvent[]> {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  let events = await readLog(hermesDir, date);

  if (options.event) {
    events = events.filter((e) => e.event === options.event);
  }
  if (options.sessionId) {
    events = events.filter((e) => e.sessionId === options.sessionId);
  }
  if (options.limit) {
    events = events.slice(-options.limit);
  }

  return events;
}

/** Prune log files older than N days. */
export async function pruneOldLogs(
  hermesDir: string,
  retainDays = 30
): Promise<number> {
  const dir = logsDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retainDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let removed = 0;
    for (const f of files) {
      if (f.endsWith(".jsonl") && f.replace(".jsonl", "") < cutoffStr) {
        await fs.unlink(path.join(dir, f));
        removed++;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}
