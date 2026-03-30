/**
 * Metrics Aggregation — observability metrics collection, aggregation,
 * and dashboard computation for Hermes.
 *
 * Collects metrics from memories, session traces, and event logs,
 * then aggregates into time series and dashboard snapshots.
 * Snapshots are persisted as YAML in .athena/hermes/metrics/.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

import { loadMemories } from "./memory-store";
import { listTraces, loadTrace } from "./observability";
import { readLog, listLogDates } from "./event-log";

// ── Types ──────────────────────────────────────────────────────

export type MetricPoint = {
  name: string;
  value: number;
  timestamp: string;
  labels: Record<string, string>;
};

export type MetricSeries = {
  name: string;
  points: MetricPoint[];
  aggregation: "sum" | "avg" | "max" | "min" | "count" | "p95";
};

export type MetricsSnapshot = {
  capturedAt: string;
  sessionCount: number;
  memoryCount: number;
  series: MetricSeries[];
};

export type DashboardMetrics = {
  activeMemories: number;
  memoriesByType: Record<string, number>;
  memoriesByScope: Record<string, number>;
  avgRelevance: number;
  sessionsLast7Days: number;
  avgSessionDurationMs: number;
  topTags: { tag: string; count: number }[];
  healthScore: number;
};

// ── Metric Collection ─────────────────────────────────────────

/** Collect metrics derived from the memory store. */
export async function collectMemoryMetrics(hermesDir: string): Promise<MetricPoint[]> {
  const memories = await loadMemories(hermesDir);
  const now = new Date().toISOString();
  const points: MetricPoint[] = [];

  // Total count
  points.push({ name: "memory.total", value: memories.length, timestamp: now, labels: {} });

  // Count by type
  const byType: Record<string, number> = {};
  for (const m of memories) {
    byType[m.type] = (byType[m.type] ?? 0) + 1;
  }
  for (const [type, count] of Object.entries(byType)) {
    points.push({ name: "memory.count_by_type", value: count, timestamp: now, labels: { type } });
  }

  // Count by scope
  const byScope: Record<string, number> = {};
  for (const m of memories) {
    const scope = m.scope ?? "user";
    byScope[scope] = (byScope[scope] ?? 0) + 1;
  }
  for (const [scope, count] of Object.entries(byScope)) {
    points.push({ name: "memory.count_by_scope", value: count, timestamp: now, labels: { scope } });
  }

  // Average relevance
  if (memories.length > 0) {
    const avgRelevance = memories.reduce((sum, m) => sum + (m.relevance ?? 0), 0) / memories.length;
    points.push({ name: "memory.avg_relevance", value: avgRelevance, timestamp: now, labels: {} });
  }

  return points;
}

/** Collect metrics derived from session traces. */
export async function collectSessionMetrics(hermesDir: string): Promise<MetricPoint[]> {
  const traceFiles = await listTraces(hermesDir);
  const now = new Date().toISOString();
  const points: MetricPoint[] = [];

  points.push({ name: "session.total_traces", value: traceFiles.length, timestamp: now, labels: {} });

  const durations: number[] = [];
  const spanCounts: number[] = [];

  for (const file of traceFiles) {
    // Extract sessionId from filename: YYYY-MM-DD-{sessionId}.yaml
    const sessionId = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.yaml$/, "");
    const trace = await loadTrace(hermesDir, sessionId);
    if (!trace) continue;

    spanCounts.push(trace.spans.length);

    // Compute session duration from first span start to last span end
    const starts = trace.spans.map((s) => new Date(s.startedAt).getTime());
    const ends = trace.spans
      .filter((s) => s.endedAt)
      .map((s) => new Date(s.endedAt!).getTime());

    if (starts.length > 0 && ends.length > 0) {
      const duration = Math.max(...ends) - Math.min(...starts);
      durations.push(duration);
    }
  }

  if (durations.length > 0) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    points.push({ name: "session.avg_duration_ms", value: avgDuration, timestamp: now, labels: {} });
  }

  if (spanCounts.length > 0) {
    const avgSpans = spanCounts.reduce((a, b) => a + b, 0) / spanCounts.length;
    points.push({ name: "session.avg_spans_per_session", value: avgSpans, timestamp: now, labels: {} });
  }

  return points;
}

/** Collect metrics derived from the event log. */
export async function collectEventMetrics(
  hermesDir: string,
  days: number = 7
): Promise<MetricPoint[]> {
  const allDates = await listLogDates(hermesDir);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recentDates = allDates.filter((d) => d >= cutoffStr);
  const points: MetricPoint[] = [];

  for (const date of recentDates) {
    const events = await readLog(hermesDir, date);

    // Events per day
    points.push({
      name: "events.daily_count",
      value: events.length,
      timestamp: `${date}T00:00:00.000Z`,
      labels: { date },
    });

    // Events by type for this day
    const byType: Record<string, number> = {};
    for (const e of events) {
      byType[e.event] = (byType[e.event] ?? 0) + 1;
    }
    for (const [type, count] of Object.entries(byType)) {
      points.push({
        name: "events.count_by_type",
        value: count,
        timestamp: `${date}T00:00:00.000Z`,
        labels: { type, date },
      });
    }
  }

  return points;
}

// ── Aggregation ───────────────────────────────────────────────

/** Aggregate an array of metric points using the specified method. */
export function aggregate(
  points: MetricPoint[],
  method: MetricSeries["aggregation"]
): number {
  if (points.length === 0) return 0;

  const values = points.map((p) => p.value);

  switch (method) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "max":
      return Math.max(...values);
    case "min":
      return Math.min(...values);
    case "count":
      return values.length;
    case "p95": {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.ceil(sorted.length * 0.95) - 1;
      return sorted[Math.max(0, idx)];
    }
  }
}

/** Group points into time buckets and return as a MetricSeries. */
export function buildTimeSeries(
  points: MetricPoint[],
  bucketMinutes: number = 60
): MetricSeries {
  if (points.length === 0) {
    return { name: "", points: [], aggregation: "avg" };
  }

  const name = points[0].name;
  const bucketMs = bucketMinutes * 60 * 1000;

  // Group points into buckets
  const buckets = new Map<number, MetricPoint[]>();
  for (const p of points) {
    const ts = new Date(p.timestamp).getTime();
    const bucketKey = Math.floor(ts / bucketMs) * bucketMs;
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.push(p);
    } else {
      buckets.set(bucketKey, [p]);
    }
  }

  // Average each bucket into a single point
  const bucketedPoints: MetricPoint[] = [];
  for (const [bucketKey, bucketPoints] of buckets) {
    const avgValue = bucketPoints.reduce((s, p) => s + p.value, 0) / bucketPoints.length;
    bucketedPoints.push({
      name,
      value: avgValue,
      timestamp: new Date(bucketKey).toISOString(),
      labels: {},
    });
  }

  // Sort by timestamp
  bucketedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { name, points: bucketedPoints, aggregation: "avg" };
}

// ── Dashboard ─────────────────────────────────────────────────

/** Compute comprehensive dashboard metrics for UI display. */
export async function getDashboardMetrics(hermesDir: string): Promise<DashboardMetrics> {
  const memories = await loadMemories(hermesDir);

  // Memories by type
  const memoriesByType: Record<string, number> = {};
  for (const m of memories) {
    memoriesByType[m.type] = (memoriesByType[m.type] ?? 0) + 1;
  }

  // Memories by scope
  const memoriesByScope: Record<string, number> = {};
  for (const m of memories) {
    const scope = m.scope ?? "user";
    memoriesByScope[scope] = (memoriesByScope[scope] ?? 0) + 1;
  }

  // Average relevance
  const avgRelevance =
    memories.length > 0
      ? memories.reduce((sum, m) => sum + (m.relevance ?? 0), 0) / memories.length
      : 0;

  // Top tags
  const tagCounts = new Map<string, number>();
  for (const m of memories) {
    for (const tag of m.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Session metrics from traces (last 7 days)
  const traceFiles = await listTraces(hermesDir);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const recentTraces = traceFiles.filter((f) => f.slice(0, 10) >= sevenDaysAgoStr);

  const durations: number[] = [];
  for (const file of recentTraces) {
    const sessionId = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.yaml$/, "");
    const trace = await loadTrace(hermesDir, sessionId);
    if (!trace) continue;

    const starts = trace.spans.map((s) => new Date(s.startedAt).getTime());
    const ends = trace.spans
      .filter((s) => s.endedAt)
      .map((s) => new Date(s.endedAt!).getTime());

    if (starts.length > 0 && ends.length > 0) {
      durations.push(Math.max(...ends) - Math.min(...starts));
    }
  }

  const avgSessionDurationMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // Health score: 0-100
  // Factors: memory count > 0 (25), recent session activity (25), avg relevance > 0.5 (25), no stale memories (25)
  let healthScore = 0;

  // Has memories
  if (memories.length > 0) healthScore += 25;

  // Recent session activity (at least 1 trace in last 7 days)
  if (recentTraces.length > 0) healthScore += 25;

  // Average relevance above 0.5
  if (avgRelevance > 0.5) healthScore += 25;

  // No stale memories (all updated within last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
  const staleCount = memories.filter((m) => m.updatedAt < thirtyDaysAgoStr).length;
  if (staleCount === 0 || memories.length === 0) healthScore += 25;

  return {
    activeMemories: memories.length,
    memoriesByType,
    memoriesByScope,
    avgRelevance,
    sessionsLast7Days: recentTraces.length,
    avgSessionDurationMs,
    topTags,
    healthScore,
  };
}

// ── Snapshot Persistence ──────────────────────────────────────

function metricsDir(hermesDir: string): string {
  return path.join(hermesDir, "metrics");
}

/** Capture a full metrics snapshot and persist to disk. */
export async function captureSnapshot(hermesDir: string): Promise<MetricsSnapshot> {
  const [memoryPoints, sessionPoints, eventPoints] = await Promise.all([
    collectMemoryMetrics(hermesDir),
    collectSessionMetrics(hermesDir),
    collectEventMetrics(hermesDir),
  ]);

  const allPoints = [...memoryPoints, ...sessionPoints, ...eventPoints];

  // Build series grouped by metric name
  const byName = new Map<string, MetricPoint[]>();
  for (const p of allPoints) {
    const existing = byName.get(p.name);
    if (existing) {
      existing.push(p);
    } else {
      byName.set(p.name, [p]);
    }
  }

  const series: MetricSeries[] = [...byName.entries()].map(([name, points]) => ({
    name,
    points,
    aggregation: "avg" as const,
  }));

  const memories = await loadMemories(hermesDir);
  const traceFiles = await listTraces(hermesDir);

  const snapshot: MetricsSnapshot = {
    capturedAt: new Date().toISOString(),
    sessionCount: traceFiles.length,
    memoryCount: memories.length,
    series,
  };

  // Persist
  const dir = metricsDir(hermesDir);
  await fs.mkdir(dir, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = path.join(dir, `${dateStr}.yaml`);
  await fs.writeFile(
    filePath,
    `# Hermes Metrics Snapshot\n${yaml.stringify(snapshot)}`,
    "utf-8"
  );

  return snapshot;
}

/** Load a previously captured snapshot by date (YYYY-MM-DD). */
export async function loadSnapshot(
  hermesDir: string,
  date: string
): Promise<MetricsSnapshot | null> {
  const filePath = path.join(metricsDir(hermesDir), `${date}.yaml`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = yaml.parse(raw);
    if (!parsed?.capturedAt) return null;
    return parsed as MetricsSnapshot;
  } catch {
    return null;
  }
}

/** List all available snapshot dates, most recent first. */
export async function listSnapshots(hermesDir: string): Promise<string[]> {
  const dir = metricsDir(hermesDir);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(".yaml", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
