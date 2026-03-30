import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { ChannelConfig, ChannelMemoryCandidate } from "../channels/channel";
import {
  candidateToMemory,
  loadCachedChannelMemories,
  saveChannelCache,
  isChannelCacheStale,
  loadChannelCache,
  GitHubChannel,
  SentryChannel,
  LinearChannel,
  JiraChannel,
  CompetitorChannel,
  getDefaultRegistry,
} from "../channels";

// ── Helpers ────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-channels-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── candidateToMemory ──────────────────────────────────────────

describe("candidateToMemory", () => {
  it("converts a candidate to a session-scoped Memory", () => {
    const candidate: ChannelMemoryCandidate = {
      content: "[GitHub Issue #42] Fix login bug",
      tags: ["github", "issue", "bug"],
      relevance: 0.7,
      externalId: "gh-issue-42",
    };
    const mem = candidateToMemory(candidate, "github", "sess-1");
    expect(mem.id).toBe("ch-gh-issue-42");
    expect(mem.type).toBe("project-context");
    expect(mem.scope).toBe("session");
    expect(mem.source).toBe("channel:github");
    expect(mem.relevance).toBe(0.7);
    expect(mem.content).toBe("[GitHub Issue #42] Fix login bug");
    expect(mem.tags).toEqual(["github", "issue", "bug"]);
    expect(mem.confidence).toBe("observed");
  });

  it("generates an ID when no externalId is provided", () => {
    const candidate: ChannelMemoryCandidate = {
      content: "Some memory",
      tags: [],
      relevance: 0.5,
    };
    const mem = candidateToMemory(candidate, "sentry", "sess-2");
    expect(mem.id).toMatch(/^ch_/);
  });
});

// ── Cache operations ───────────────────────────────────────────

describe("channel cache", () => {
  const configs: ChannelConfig[] = [
    { type: "github", enabled: true, options: {}, ttlMs: 300000 },
    { type: "sentry", enabled: true, options: {}, ttlMs: 300000 },
  ];

  it("returns empty memories when no cache exists", async () => {
    const memories = await loadCachedChannelMemories(tmpDir, configs, "sess-1");
    expect(memories).toEqual([]);
  });

  it("saves and loads cache correctly", async () => {
    await saveChannelCache(tmpDir, [
      {
        channel: "github",
        memories: [
          { content: "Issue #1", tags: ["github"], relevance: 0.6, externalId: "gh-1" },
        ],
        fetchedAt: new Date().toISOString(),
        errors: [],
      },
    ], configs);

    const cache = await loadChannelCache(tmpDir);
    expect(cache.entries).toHaveLength(1);
    expect(cache.entries[0].channel).toBe("github");
    expect(cache.entries[0].memories).toHaveLength(1);
  });

  it("converts cached entries to Memory objects on load", async () => {
    await saveChannelCache(tmpDir, [
      {
        channel: "github",
        memories: [
          { content: "PR #5 title", tags: ["github", "pr"], relevance: 0.8, externalId: "gh-pr-5" },
        ],
        fetchedAt: new Date().toISOString(),
        errors: [],
      },
    ], configs);

    const memories = await loadCachedChannelMemories(tmpDir, configs, "sess-1");
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe("ch-gh-pr-5");
    expect(memories[0].scope).toBe("session");
    expect(memories[0].source).toBe("channel:github");
  });

  it("skips disabled channels", async () => {
    const disabledConfigs: ChannelConfig[] = [
      { type: "github", enabled: false, options: {}, ttlMs: 300000 },
    ];
    await saveChannelCache(tmpDir, [
      {
        channel: "github",
        memories: [
          { content: "Issue", tags: ["github"], relevance: 0.5, externalId: "gh-1" },
        ],
        fetchedAt: new Date().toISOString(),
        errors: [],
      },
    ], configs);

    const memories = await loadCachedChannelMemories(tmpDir, disabledConfigs, "sess-1");
    expect(memories).toEqual([]);
  });

  it("detects stale cache", async () => {
    // No cache at all = stale
    expect(await isChannelCacheStale(tmpDir, configs)).toBe(true);

    // Fresh cache = not stale
    await saveChannelCache(tmpDir, [
      { channel: "github", memories: [], fetchedAt: new Date().toISOString(), errors: [] },
      { channel: "sentry", memories: [], fetchedAt: new Date().toISOString(), errors: [] },
    ], configs);
    expect(await isChannelCacheStale(tmpDir, configs)).toBe(false);
  });

  it("deduplicates by externalId", async () => {
    await saveChannelCache(tmpDir, [
      {
        channel: "github",
        memories: [
          { content: "Issue #1 v1", tags: ["github"], relevance: 0.5, externalId: "gh-1" },
          { content: "Issue #1 v2", tags: ["github"], relevance: 0.6, externalId: "gh-1" },
        ],
        fetchedAt: new Date().toISOString(),
        errors: [],
      },
    ], configs);

    const memories = await loadCachedChannelMemories(tmpDir, configs, "sess-1");
    expect(memories).toHaveLength(1);
  });
});

// ── Registry ───────────────────────────────────────────────────

describe("getDefaultRegistry", () => {
  it("returns all 6 channel types", () => {
    const registry = getDefaultRegistry();
    expect(registry.size).toBe(6);
    expect(registry.has("github")).toBe(true);
    expect(registry.has("sentry")).toBe(true);
    expect(registry.has("linear")).toBe(true);
    expect(registry.has("jira")).toBe(true);
    expect(registry.has("competitor")).toBe(true);
    expect(registry.has("local-tasks")).toBe(true);
  });
});

// ── Channel instantiation ──────────────────────────────────────

describe("channel constructors", () => {
  it("GitHubChannel has correct type", () => {
    expect(new GitHubChannel().type).toBe("github");
  });
  it("SentryChannel has correct type", () => {
    expect(new SentryChannel().type).toBe("sentry");
  });
  it("LinearChannel has correct type", () => {
    expect(new LinearChannel().type).toBe("linear");
  });
  it("JiraChannel has correct type", () => {
    expect(new JiraChannel().type).toBe("jira");
  });
  it("CompetitorChannel has correct type", () => {
    expect(new CompetitorChannel().type).toBe("competitor");
  });
});

// ── Auth checks (no real credentials) ──────────────────────────

describe("channel check() without credentials", () => {
  it("SentryChannel returns auth-missing without env var", async () => {
    const old = process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_AUTH_TOKEN;
    const status = await new SentryChannel().check();
    expect(status).toBe("auth-missing");
    if (old) process.env.SENTRY_AUTH_TOKEN = old;
  });

  it("LinearChannel returns auth-missing without env var", async () => {
    const old = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    const status = await new LinearChannel().check();
    expect(status).toBe("auth-missing");
    if (old) process.env.LINEAR_API_KEY = old;
  });

  it("JiraChannel returns auth-missing without env vars", async () => {
    const oldToken = process.env.JIRA_API_TOKEN;
    const oldEmail = process.env.JIRA_USER_EMAIL;
    const oldUrl = process.env.JIRA_BASE_URL;
    delete process.env.JIRA_API_TOKEN;
    delete process.env.JIRA_USER_EMAIL;
    delete process.env.JIRA_BASE_URL;
    const status = await new JiraChannel().check();
    expect(status).toBe("auth-missing");
    if (oldToken) process.env.JIRA_API_TOKEN = oldToken;
    if (oldEmail) process.env.JIRA_USER_EMAIL = oldEmail;
    if (oldUrl) process.env.JIRA_BASE_URL = oldUrl;
  });

  it("CompetitorChannel is always available", async () => {
    const status = await new CompetitorChannel().check();
    expect(status).toBe("available");
  });
});
