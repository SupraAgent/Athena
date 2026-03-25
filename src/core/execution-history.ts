/**
 * Execution History Store — implements ExecutionLogger so it can be plugged
 * directly into the engine, and provides query/subscription APIs for React.
 */
import type {
  ExecutionLogger,
  ExecutionRecord,
  NodeExecutionEvent,
  ExecutionHistoryQuery,
  ExecutionHistoryResult,
  ExecutionStats,
  TimeSeriesBucket,
  SerializedHistory,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/** Keys matching these patterns will have their values redacted before storage. */
const SECRET_KEY_PATTERN = /token|key|secret|password|authorization/i;

/**
 * Deep-redact values in a record where the key looks like a secret.
 * Returns a new object — never mutates the input.
 */
function redactSecrets(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = "[REDACTED]";
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? redactSecrets(item as Record<string, unknown>)
          : item
      );
    } else if (value !== null && typeof value === "object") {
      result[key] = redactSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function computeStats(records: ExecutionRecord[]): ExecutionStats {
  const totalRuns = records.length;
  if (totalRuns === 0) {
    return {
      totalRuns: 0,
      successRate: 0,
      avgDurationMs: 0,
      failureCount: 0,
      runsByStatus: {},
    };
  }

  let completedCount = 0;
  let failureCount = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const runsByStatus: Record<string, number> = {};

  for (const r of records) {
    runsByStatus[r.status] = (runsByStatus[r.status] ?? 0) + 1;
    if (r.status === "completed") completedCount++;
    if (r.status === "failed") failureCount++;
    if (r.durationMs != null) {
      totalDuration += r.durationMs;
      durationCount++;
    }
  }

  return {
    totalRuns,
    successRate: completedCount / totalRuns,
    avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    failureCount,
    runsByStatus,
  };
}

function matchesQuery(record: ExecutionRecord, q: ExecutionHistoryQuery): boolean {
  if (q.workflowId && record.workflowId !== q.workflowId) return false;
  if (q.status && record.status !== q.status) return false;
  if (q.triggerType && record.triggerType !== q.triggerType) return false;

  if (q.tags && q.tags.length > 0) {
    const recordTags = new Set(record.tags ?? []);
    if (!q.tags.some((t) => recordTags.has(t))) return false;
  }

  if (q.dateRange) {
    const startedAt = record.startedAt;
    if (q.dateRange.start && startedAt < q.dateRange.start) return false;
    if (q.dateRange.end && startedAt > q.dateRange.end) return false;
  }

  if (q.search) {
    const needle = q.search.toLowerCase();
    // Search across all top-level fields AND node event data
    const parts = [
      record.runId,
      record.workflowId,
      record.status,
      record.triggerType ?? "",
      record.error ?? "",
      ...(record.tags ?? []),
    ];
    // Include node event details in search
    for (const evt of record.nodeEvents) {
      parts.push(evt.nodeId, evt.nodeType, evt.status);
      if (evt.error) parts.push(evt.error);
    }
    const haystack = parts.join(" ").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function getBucketKey(dateStr: string, bucketSize: "hour" | "day"): string {
  const d = new Date(dateStr);
  if (bucketSize === "day") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

// ── ExecutionHistoryStore ───────────────────────────────────────

export class ExecutionHistoryStore implements ExecutionLogger {
  private records: ExecutionRecord[] = [];
  private recordIndex = new Map<string, ExecutionRecord>();
  private subscribers = new Set<() => void>();
  private snapshotRef: ExecutionRecord[] = [];
  private maxRuns: number;

  constructor(opts?: { maxRuns?: number }) {
    this.maxRuns = opts?.maxRuns ?? 1000;
  }

  // ── ExecutionLogger implementation ────────────────────────────

  onWorkflowStart(runId: string, workflowId: string): void {
    // Guard against duplicate runIds — idempotent if already tracked
    if (this.recordIndex.has(runId)) return;

    const record: ExecutionRecord = {
      runId,
      workflowId,
      status: "running",
      startedAt: now(),
      nodeEvents: [],
    };
    this.records.unshift(record);
    this.recordIndex.set(runId, record);
    this.trimIfNeeded();
    this.notify();
  }

  onWorkflowComplete(runId: string, status: string, durationMs: number): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    record.status = status as ExecutionRecord["status"];
    record.completedAt = now();
    record.durationMs = durationMs;
    this.notify();
  }

  onNodeStart(runId: string, nodeId: string, nodeType: string, input: Record<string, unknown>): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    const event: NodeExecutionEvent = {
      nodeId,
      nodeType,
      status: "started",
      timestamp: now(),
      input: redactSecrets(input),
    };
    record.nodeEvents.push(event);
    this.notify();
  }

  onNodeComplete(runId: string, nodeId: string, output: Record<string, unknown>, durationMs: number): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    const event: NodeExecutionEvent = {
      nodeId,
      nodeType: this.findNodeType(record, nodeId),
      status: "completed",
      timestamp: now(),
      durationMs,
      output: redactSecrets(output),
    };
    record.nodeEvents.push(event);
    this.notify();
  }

  onNodeError(runId: string, nodeId: string, error: string, willRetry: boolean, attempt: number): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    const event: NodeExecutionEvent = {
      nodeId,
      nodeType: this.findNodeType(record, nodeId),
      status: "failed",
      timestamp: now(),
      error,
      attempt,
    };
    record.nodeEvents.push(event);
    if (!willRetry) {
      record.error = error;
    }
    this.notify();
  }

  onNodeSkipped(runId: string, nodeId: string, reason: string): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    const event: NodeExecutionEvent = {
      nodeId,
      nodeType: this.findNodeType(record, nodeId),
      status: "skipped",
      timestamp: now(),
      error: reason,
    };
    record.nodeEvents.push(event);
    this.notify();
  }

  onRetry(runId: string, nodeId: string, attempt: number, delayMs: number): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    const event: NodeExecutionEvent = {
      nodeId,
      nodeType: this.findNodeType(record, nodeId),
      status: "retried",
      timestamp: now(),
      durationMs: Math.round(delayMs),
      attempt,
    };
    record.nodeEvents.push(event);
    this.notify();
  }

  // ── Query methods ─────────────────────────────────────────────

  query(q: ExecutionHistoryQuery): ExecutionHistoryResult {
    const matching = this.records.filter((r) => matchesQuery(r, q));
    const stats = computeStats(matching);
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    const page = matching.slice(offset, offset + limit);
    return { records: page, total: matching.length, stats };
  }

  getRecord(runId: string): ExecutionRecord | undefined {
    return this.recordIndex.get(runId);
  }

  getStats(workflowId?: string): ExecutionStats {
    const subset = workflowId
      ? this.records.filter((r) => r.workflowId === workflowId)
      : this.records;
    return computeStats(subset);
  }

  getTimeSeries(
    bucketSize: "hour" | "day",
    range: { start: string; end: string }
  ): TimeSeriesBucket[] {
    const inRange = this.records.filter(
      (r) => r.startedAt >= range.start && r.startedAt <= range.end
    );

    const bucketMap = new Map<
      string,
      { total: number; completed: number; failed: number; durations: number[] }
    >();

    for (const r of inRange) {
      const key = getBucketKey(r.startedAt, bucketSize);
      let b = bucketMap.get(key);
      if (!b) {
        b = { total: 0, completed: 0, failed: 0, durations: [] };
        bucketMap.set(key, b);
      }
      b.total++;
      if (r.status === "completed") b.completed++;
      if (r.status === "failed") b.failed++;
      if (r.durationMs != null) b.durations.push(r.durationMs);
    }

    const result: TimeSeriesBucket[] = [];
    for (const [bucket, data] of bucketMap) {
      result.push({
        bucket,
        total: data.total,
        completed: data.completed,
        failed: data.failed,
        avgDurationMs:
          data.durations.length > 0
            ? Math.round(
                data.durations.reduce((a, b) => a + b, 0) / data.durations.length
              )
            : 0,
      });
    }

    return result.sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  // ── Persistence / hydration ───────────────────────────────────

  export(): SerializedHistory {
    return {
      version: 1,
      records: structuredClone(this.records),
      exportedAt: now(),
    };
  }

  static fromSnapshot(data: SerializedHistory, opts?: { maxRuns?: number }): ExecutionHistoryStore {
    const store = new ExecutionHistoryStore(opts);
    store.records = structuredClone(data.records);
    store.recordIndex.clear();
    for (const r of store.records) {
      store.recordIndex.set(r.runId, r);
    }
    store.trimIfNeeded();
    store.notify();
    return store;
  }

  clear(): void {
    this.records = [];
    this.recordIndex.clear();
    this.notify();
  }

  // ── Subscriber pattern (for useSyncExternalStore) ─────────────

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getSnapshot(): ExecutionRecord[] {
    return this.snapshotRef;
  }

  // ── Mutation helpers ──────────────────────────────────────────

  /** Attach metadata to a run (trigger type, tags) after start */
  annotateRun(
    runId: string,
    meta: { triggerType?: string; tags?: string[] }
  ): void {
    const record = this.recordIndex.get(runId);
    if (!record) return;
    if (meta.triggerType) record.triggerType = meta.triggerType;
    if (meta.tags) record.tags = [...(record.tags ?? []), ...meta.tags];
    this.notify();
  }

  // ── Internal ──────────────────────────────────────────────────

  private findNodeType(record: ExecutionRecord, nodeId: string): string {
    // Walk backwards to find the most recent event for this node to get its type
    for (let i = record.nodeEvents.length - 1; i >= 0; i--) {
      if (record.nodeEvents[i].nodeId === nodeId) {
        return record.nodeEvents[i].nodeType;
      }
    }
    return "unknown";
  }

  private trimIfNeeded(): void {
    while (this.records.length > this.maxRuns) {
      const removed = this.records.pop();
      if (removed) {
        this.recordIndex.delete(removed.runId);
      }
    }
  }

  private notify(): void {
    // Create a new array reference so useSyncExternalStore detects changes
    this.snapshotRef = [...this.records];
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch {
        // subscriber errors must not crash the store
      }
    }
  }
}
