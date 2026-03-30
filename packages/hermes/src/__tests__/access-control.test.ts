import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  defaultPolicy,
  checkAccess,
  filterAccessible,
  resolvePrincipal,
  loadPolicy,
  savePolicy,
} from "../access-control";
import type { AccessPolicy } from "../access-control";
import type { Memory } from "../types";

let tmpDir: string;

function makeMemory(overrides: Partial<Memory> & { id: string }): Memory {
  return {
    type: "fact",
    content: "test content",
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "test",
    relevance: 1,
    scope: "user",
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-acl-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("defaultPolicy", () => {
  it("returns admin level", () => {
    const policy = defaultPolicy();
    expect(policy.defaultLevel).toBe("admin");
    expect(policy.rules).toEqual([]);
  });
});

describe("checkAccess", () => {
  it("admin can do anything", () => {
    const policy = defaultPolicy(); // defaultLevel: admin
    const mem = makeMemory({ id: "m1" });
    expect(checkAccess(policy, "anyone", mem, "read")).toBe(true);
    expect(checkAccess(policy, "anyone", mem, "write")).toBe(true);
    expect(checkAccess(policy, "anyone", mem, "admin")).toBe(true);
  });

  it("read-only principal cannot write", () => {
    const policy: AccessPolicy = {
      rules: [{ principal: "agent:reader", level: "read" }],
      defaultLevel: "read",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const mem = makeMemory({ id: "m1" });
    expect(checkAccess(policy, "agent:reader", mem, "read")).toBe(true);
    expect(checkAccess(policy, "agent:reader", mem, "write")).toBe(false);
    expect(checkAccess(policy, "agent:reader", mem, "admin")).toBe(false);
  });

  it("rule with memoryTypes filter only applies to matching types", () => {
    const policy: AccessPolicy = {
      rules: [
        {
          principal: "agent:scoped",
          level: "write",
          memoryTypes: ["decision"],
        },
      ],
      defaultLevel: "read",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const decisionMem = makeMemory({ id: "d1", type: "decision" });
    const factMem = makeMemory({ id: "f1", type: "fact" });

    // Rule matches decision type -> write granted
    expect(checkAccess(policy, "agent:scoped", decisionMem, "write")).toBe(true);

    // Rule does not match fact type -> falls back to defaultLevel (read) -> write denied
    expect(checkAccess(policy, "agent:scoped", factMem, "write")).toBe(false);
  });
});

describe("filterAccessible", () => {
  it("filters out inaccessible memories", () => {
    const policy: AccessPolicy = {
      rules: [{ principal: "agent:reader", level: "read" }],
      defaultLevel: "read",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const memories = [
      makeMemory({ id: "m1" }),
      makeMemory({ id: "m2" }),
    ];

    // All readable
    const readable = filterAccessible(policy, "agent:reader", memories, "read");
    expect(readable).toHaveLength(2);

    // None writable (read-only principal, read default)
    const writable = filterAccessible(policy, "agent:reader", memories, "write");
    expect(writable).toHaveLength(0);
  });
});

describe("resolvePrincipal", () => {
  it("returns agent prefix when agentId provided", () => {
    expect(resolvePrincipal("sess-1", "my-agent")).toBe("agent:my-agent");
  });

  it("returns session prefix when no agentId", () => {
    expect(resolvePrincipal("sess-1")).toBe("session:sess-1");
  });
});

describe("loadPolicy", () => {
  it("returns default when file is missing", async () => {
    const policy = await loadPolicy(tmpDir);
    expect(policy.defaultLevel).toBe("admin");
    expect(policy.rules).toEqual([]);
  });
});

describe("savePolicy + loadPolicy", () => {
  it("round-trips a policy to disk", async () => {
    const policy: AccessPolicy = {
      rules: [
        {
          principal: "agent:bot",
          level: "write",
          memoryTypes: ["fact", "decision"],
        },
      ],
      defaultLevel: "read",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    };

    await savePolicy(tmpDir, policy);
    const loaded = await loadPolicy(tmpDir);

    expect(loaded.defaultLevel).toBe("read");
    expect(loaded.rules).toHaveLength(1);
    expect(loaded.rules[0].principal).toBe("agent:bot");
    expect(loaded.rules[0].level).toBe("write");
    expect(loaded.rules[0].memoryTypes).toEqual(["fact", "decision"]);
  });
});
