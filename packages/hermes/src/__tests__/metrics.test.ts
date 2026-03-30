import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as yaml from "yaml";
import { aggregate, buildTimeSeries, collectMemoryMetrics } from "../metrics";
import type { MetricPoint } from "../metrics";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-metrics-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makePoint(name: string, value: number, timestamp: string): MetricPoint {
  return { name, value, timestamp, labels: {} };
}

describe("aggregate", () => {
  it("sum", () => {
    const points = [
      makePoint("x", 10, "2026-01-01T00:00:00Z"),
      makePoint("x", 20, "2026-01-01T01:00:00Z"),
      makePoint("x", 30, "2026-01-01T02:00:00Z"),
    ];
    expect(aggregate(points, "sum")).toBe(60);
  });

  it("avg", () => {
    const points = [
      makePoint("x", 10, "2026-01-01T00:00:00Z"),
      makePoint("x", 20, "2026-01-01T01:00:00Z"),
      makePoint("x", 30, "2026-01-01T02:00:00Z"),
    ];
    expect(aggregate(points, "avg")).toBe(20);
  });

  it("p95", () => {
    const points = Array.from({ length: 100 }, (_, i) =>
      makePoint("x", i + 1, `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`)
    );
    expect(aggregate(points, "p95")).toBe(95);
  });

  it("returns 0 for empty array", () => {
    expect(aggregate([], "sum")).toBe(0);
    expect(aggregate([], "avg")).toBe(0);
    expect(aggregate([], "p95")).toBe(0);
  });
});

describe("buildTimeSeries", () => {
  it("groups into buckets", () => {
    const points = [
      makePoint("m", 10, "2026-01-01T00:05:00Z"),
      makePoint("m", 20, "2026-01-01T00:30:00Z"),
      makePoint("m", 30, "2026-01-01T01:15:00Z"),
    ];
    // 60-minute buckets: first two in same bucket, third in next
    const series = buildTimeSeries(points, 60);
    expect(series.name).toBe("m");
    expect(series.points).toHaveLength(2);
    // First bucket averages 10 and 20
    expect(series.points[0].value).toBe(15);
    // Second bucket has just 30
    expect(series.points[1].value).toBe(30);
  });
});

describe("collectMemoryMetrics", () => {
  it("returns points from memories", async () => {
    // Create a memory YAML file in the temp dir
    const memoriesPath = path.join(tmpDir, "memories");
    await fs.mkdir(memoriesPath, { recursive: true });

    const memoryDoc = {
      id: "mem_test1",
      type: "fact",
      content: "Test memory content",
      tags: ["test"],
      created_at: "2026-03-30T00:00:00.000Z",
      updated_at: "2026-03-30T00:00:00.000Z",
      source: "test-session",
      relevance: 0.9,
      scope: "user",
    };

    await fs.writeFile(
      path.join(memoriesPath, "mem_test1.yaml"),
      `# Hermes Memory — fact\n${yaml.stringify(memoryDoc)}`,
      "utf-8"
    );

    const points = await collectMemoryMetrics(tmpDir);

    // Should have at least memory.total and memory.count_by_type
    const totalPoint = points.find((p) => p.name === "memory.total");
    expect(totalPoint).toBeDefined();
    expect(totalPoint!.value).toBe(1);

    const byTypePoint = points.find(
      (p) => p.name === "memory.count_by_type" && p.labels.type === "fact"
    );
    expect(byTypePoint).toBeDefined();
    expect(byTypePoint!.value).toBe(1);

    const byScopePoint = points.find(
      (p) => p.name === "memory.count_by_scope" && p.labels.scope === "user"
    );
    expect(byScopePoint).toBeDefined();
    expect(byScopePoint!.value).toBe(1);

    const relevancePoint = points.find((p) => p.name === "memory.avg_relevance");
    expect(relevancePoint).toBeDefined();
    expect(relevancePoint!.value).toBe(0.9);
  });
});
