import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  startTrace,
  startSpan,
  endSpan,
  withSpan,
  flushTrace,
  loadTrace,
  getActiveTrace,
} from "../observability";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-obs-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("observability spans", () => {
  it("creates and ends spans with correct duration", () => {
    startTrace("ses_test");
    const span = startSpan("test-hook", "hook");
    expect(span.id).toMatch(/^span_/);
    expect(span.endedAt).toBeNull();

    endSpan(span);
    expect(span.endedAt).not.toBeNull();
    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.status).toBe("ok");
  });

  it("records errors on spans", () => {
    startTrace("ses_test");
    const span = startSpan("failing-op", "llm");
    endSpan(span, "API timeout");

    expect(span.status).toBe("error");
    expect(span.error).toBe("API timeout");
  });

  it("withSpan auto-closes on success", async () => {
    startTrace("ses_test");
    const result = await withSpan("compute", "memory", async () => {
      return 42;
    });

    expect(result).toBe(42);
    const trace = getActiveTrace();
    expect(trace!.spans).toHaveLength(1);
    expect(trace!.spans[0].status).toBe("ok");
  });

  it("withSpan auto-closes on error", async () => {
    startTrace("ses_test");
    await expect(
      withSpan("failing", "llm", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const trace = getActiveTrace();
    expect(trace!.spans[0].status).toBe("error");
    expect(trace!.spans[0].error).toBe("boom");
  });

  it("flushes trace to YAML file", async () => {
    startTrace("ses_flush");
    const span = startSpan("session-start", "hook", null, { mode: "whisper" });
    endSpan(span);

    const filePath = await flushTrace(hermesDir);
    expect(filePath).not.toBeNull();

    const files = await fs.readdir(path.join(hermesDir, "traces"));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("ses_flush");
  });

  it("loads trace from disk", async () => {
    startTrace("ses_load");
    const span = startSpan("test-span", "memory", null, { count: 5 });
    endSpan(span);
    await flushTrace(hermesDir);

    const loaded = await loadTrace(hermesDir, "ses_load");
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe("ses_load");
    expect(loaded!.spans).toHaveLength(1);
    expect(loaded!.spans[0].name).toBe("test-span");
    expect(loaded!.spans[0].attributes.count).toBe(5);
  });

  it("supports parent-child span relationships", () => {
    startTrace("ses_hierarchy");
    const parent = startSpan("session-start", "hook");
    const child = startSpan("load-memories", "io", parent.id);

    expect(child.parentId).toBe(parent.id);
    endSpan(child);
    endSpan(parent);

    const trace = getActiveTrace();
    expect(trace!.spans).toHaveLength(2);
  });
});
