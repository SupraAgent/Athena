import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { logEvent, readLog, listLogDates, queryEvents, pruneOldLogs } from "../event-log";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-log-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("event log", () => {
  it("logs events to JSONL file", async () => {
    await logEvent(hermesDir, "memory.created", "ses_1", { type: "fact", content: "test" });
    await logEvent(hermesDir, "hook.session_start", "ses_1", { mode: "whisper" });

    const today = new Date().toISOString().slice(0, 10);
    const events = await readLog(hermesDir, today);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("memory.created");
    expect(events[1].event).toBe("hook.session_start");
  });

  it("lists available log dates", async () => {
    await logEvent(hermesDir, "memory.created", "ses_1", {});
    const dates = await listLogDates(hermesDir);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBe(new Date().toISOString().slice(0, 10));
  });

  it("queries events by type and session", async () => {
    await logEvent(hermesDir, "memory.created", "ses_1", {});
    await logEvent(hermesDir, "memory.deleted", "ses_2", {});
    await logEvent(hermesDir, "memory.created", "ses_2", {});

    const created = await queryEvents(hermesDir, { event: "memory.created" });
    expect(created).toHaveLength(2);

    const ses2 = await queryEvents(hermesDir, { sessionId: "ses_2" });
    expect(ses2).toHaveLength(2);
  });

  it("returns empty for missing date", async () => {
    const events = await readLog(hermesDir, "2020-01-01");
    expect(events).toHaveLength(0);
  });

  it("prunes old log files", async () => {
    // Create a fake old log file
    const logsDir = path.join(hermesDir, "logs");
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(path.join(logsDir, "2020-01-01.jsonl"), "{}\n", "utf-8");
    await logEvent(hermesDir, "memory.created", "ses_1", {});

    const removed = await pruneOldLogs(hermesDir, 1);
    expect(removed).toBe(1);

    const dates = await listLogDates(hermesDir);
    expect(dates).toHaveLength(1); // Only today remains
  });
});
