/**
 * Session Observability — hierarchical spans for tracing hook execution,
 * memory operations, and LLM calls within Hermes.
 *
 * Writes YAML trace files to .athena/hermes/traces/ for post-session analysis.
 * Inspired by AgentOps and OpenTelemetry span patterns.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as YAML from "yaml";

// ── Types ──────────────────────────────────────────────────────

export type SpanKind = "hook" | "memory" | "llm" | "search" | "pipeline" | "io";

export type Span = {
  id: string;
  parentId: string | null;
  name: string;
  kind: SpanKind;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  attributes: Record<string, string | number | boolean>;
  status: "ok" | "error";
  error?: string;
};

export type SessionTrace = {
  sessionId: string;
  startedAt: string;
  spans: Span[];
};

// ── Span Builder ───────────────────────────────────────────────

/** Session-keyed trace map — safe for concurrent hooks. */
const _traces = new Map<string, SessionTrace>();
let _spanCounter = 0;

function spanId(sessionId: string): string {
  return `span_${sessionId.slice(0, 8)}_${Date.now().toString(36)}_${(++_spanCounter).toString(36)}`;
}

/** Initialize a trace for a session. */
export function startTrace(sessionId: string): SessionTrace {
  const trace: SessionTrace = {
    sessionId,
    startedAt: new Date().toISOString(),
    spans: [],
  };
  _traces.set(sessionId, trace);
  return trace;
}

/** Get the active trace for a session (or null if not started). */
export function getActiveTrace(sessionId?: string): SessionTrace | null {
  if (sessionId) return _traces.get(sessionId) ?? null;
  // Backward compat: return the most recently created trace
  const entries = [..._traces.values()];
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

/** Start a span and return it. Call `endSpan` when done. */
export function startSpan(
  name: string,
  kind: SpanKind,
  parentId: string | null = null,
  attributes: Record<string, string | number | boolean> = {},
  sessionId?: string
): Span {
  const sid = sessionId ?? [..._traces.keys()].pop() ?? "unknown";
  const span: Span = {
    id: spanId(sid),
    parentId,
    name,
    kind,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    attributes,
    status: "ok",
  };

  const trace = _traces.get(sid);
  if (trace) {
    trace.spans.push(span);
  }

  return span;
}

/** End a span, recording duration and optional error. */
export function endSpan(span: Span, error?: string): void {
  span.endedAt = new Date().toISOString();
  span.durationMs = new Date(span.endedAt).getTime() - new Date(span.startedAt).getTime();
  if (error) {
    span.status = "error";
    span.error = error;
  }
}

/** Convenience: run a function within a span, auto-closing on success or error. */
export async function withSpan<T>(
  name: string,
  kind: SpanKind,
  fn: (span: Span) => Promise<T>,
  parentId: string | null = null,
  attributes: Record<string, string | number | boolean> = {},
  sessionId?: string
): Promise<T> {
  const span = startSpan(name, kind, parentId, attributes, sessionId);
  try {
    const result = await fn(span);
    endSpan(span);
    return result;
  } catch (err) {
    endSpan(span, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

// ── Persistence ────────────────────────────────────────────────

function tracesDir(hermesDir: string): string {
  return path.join(hermesDir, "traces");
}

/** Flush a session's trace to disk. If no sessionId, flushes the most recent. */
export async function flushTrace(hermesDir: string, sessionId?: string): Promise<string | null> {
  const sid = sessionId ?? [..._traces.keys()].pop();
  if (!sid) return null;

  const trace = _traces.get(sid);
  _traces.delete(sid); // Always clean up state

  if (!trace || trace.spans.length === 0) return null;

  const dir = tracesDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });

  const dateStr = trace.startedAt.slice(0, 10);
  const filename = `${dateStr}-${trace.sessionId}.yaml`;
  const filePath = path.join(dir, filename);

  const doc = {
    session_id: trace.sessionId,
    started_at: trace.startedAt,
    span_count: trace.spans.length,
    spans: trace.spans.map((s) => ({
      id: s.id,
      parent_id: s.parentId,
      name: s.name,
      kind: s.kind,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_ms: s.durationMs,
      status: s.status,
      error: s.error,
      attributes: Object.keys(s.attributes).length > 0 ? s.attributes : undefined,
    })),
  };

  await fs.writeFile(filePath, `# Hermes Session Trace\n${YAML.stringify(doc)}`, "utf-8");
  return filePath;
}

/** Load a session trace from disk. */
export async function loadTrace(hermesDir: string, sessionId: string): Promise<SessionTrace | null> {
  const dir = tracesDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    const match = files.find((f) => f.endsWith(`-${sessionId}.yaml`));
    if (!match) return null;

    const raw = await fs.readFile(path.join(dir, match), "utf-8");
    const parsed = YAML.parse(raw);
    if (!parsed?.session_id) return null;

    return {
      sessionId: parsed.session_id,
      startedAt: parsed.started_at,
      spans: (parsed.spans ?? []).map((s: Record<string, unknown>) => ({
        id: s.id,
        parentId: s.parent_id ?? null,
        name: s.name,
        kind: s.kind,
        startedAt: s.started_at,
        endedAt: s.ended_at ?? null,
        durationMs: s.duration_ms ?? null,
        attributes: (s.attributes as Record<string, string | number | boolean>) ?? {},
        status: s.status ?? "ok",
        error: s.error,
      })),
    };
  } catch {
    return null;
  }
}

/** List all traces, most recent first. */
export async function listTraces(hermesDir: string): Promise<string[]> {
  const dir = tracesDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
