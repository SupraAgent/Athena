import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { loadConfig, resolveMode, getOrCreateThread } from "../config";
import type { HermesConfig, HermesMode } from "../types";
import { DEFAULT_CONFIG } from "../types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-config-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.HERMES_MODE;
});

describe("loadConfig", () => {
  it("returns defaults when config file does not exist", async () => {
    const config = await loadConfig(tmpDir);
    expect(config.maxMemories).toBe(DEFAULT_CONFIG.maxMemories);
    expect(config.autoExtract).toBe(DEFAULT_CONFIG.autoExtract);
    expect(config.contextLimit).toBe(DEFAULT_CONFIG.contextLimit);
    expect(config.mode).toBe("whisper");
    expect(config.sources).toEqual([]);
    expect(config.agents).toEqual([]);
  });

  it("loads partial config and fills in defaults", async () => {
    const yaml = `max_memories: 100\nmode: full\n`;
    await fs.writeFile(path.join(tmpDir, "hermes.yaml"), yaml, "utf-8");

    const config = await loadConfig(tmpDir);
    expect(config.maxMemories).toBe(100);
    expect(config.mode).toBe("full");
    // Defaults for unspecified fields
    expect(config.autoExtract).toBe(DEFAULT_CONFIG.autoExtract);
    expect(config.contextLimit).toBe(DEFAULT_CONFIG.contextLimit);
  });

  it("ignores invalid mode values and falls back to default", async () => {
    const yaml = `mode: banana\n`;
    await fs.writeFile(path.join(tmpDir, "hermes.yaml"), yaml, "utf-8");

    const config = await loadConfig(tmpDir);
    expect(config.mode).toBe(DEFAULT_CONFIG.mode);
  });
});

describe("resolveMode", () => {
  it("returns config mode when no env var is set", () => {
    delete process.env.HERMES_MODE;
    const config = { ...DEFAULT_CONFIG, mode: "full" as HermesMode };
    expect(resolveMode(config)).toBe("full");
  });

  it("prefers HERMES_MODE env var over config", () => {
    process.env.HERMES_MODE = "off";
    const config = { ...DEFAULT_CONFIG, mode: "full" as HermesMode };
    expect(resolveMode(config)).toBe("off");
  });

  it("ignores invalid env var values and falls back to config", () => {
    process.env.HERMES_MODE = "invalid";
    const config = { ...DEFAULT_CONFIG, mode: "whisper" as HermesMode };
    expect(resolveMode(config)).toBe("whisper");
  });

  it("defaults to whisper when config mode is undefined", () => {
    delete process.env.HERMES_MODE;
    const config = { ...DEFAULT_CONFIG, mode: undefined as unknown as HermesMode };
    expect(resolveMode(config)).toBe("whisper");
  });
});

describe("getOrCreateThread", () => {
  it("creates a new thread for a new session ID", async () => {
    const thread = await getOrCreateThread(tmpDir, "ses_test_1");
    expect(thread.threadId).toMatch(/^thread_/);
    expect(thread.sessionIds).toContain("ses_test_1");
    expect(thread.lastInjectedMemoryIds).toEqual([]);
    expect(thread.lastInjectedHash).toBe("");
  });

  it("returns existing thread for a known session ID", async () => {
    const first = await getOrCreateThread(tmpDir, "ses_test_2");
    const second = await getOrCreateThread(tmpDir, "ses_test_2");
    expect(second.threadId).toBe(first.threadId);
  });

  it("updates lastActiveAt on re-access", async () => {
    const first = await getOrCreateThread(tmpDir, "ses_test_3");
    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    const second = await getOrCreateThread(tmpDir, "ses_test_3");
    expect(new Date(second.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.lastActiveAt).getTime()
    );
  });
});
