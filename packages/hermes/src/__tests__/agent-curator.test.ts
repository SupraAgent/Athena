import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { agentCurateMemories } from "../agent-curator";
import { createMemory, loadMemories } from "../memory-store";

let tmpDir: string;
let hermesDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-agent-curator-"));
  hermesDir = path.join(tmpDir, ".athena", "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Helper to build a mock Anthropic API response
function mockApiResponse(
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >,
  stopReason: string = "end_turn"
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content, stop_reason: stopReason }),
    text: async () => JSON.stringify({ content, stop_reason: stopReason }),
  };
}

describe("agentCurateMemories", () => {
  it("adds memories via tool_use in a single turn", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        { type: "text", text: "I'll analyze this transcript and curate memories." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "add_memory",
          input: { type: "fact", content: "Project uses Next.js 15 with App Router", relevance: 0.8 },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "add_memory",
          input: { type: "decision", content: "Chose Vitest over Jest for testing", relevance: 0.9 },
        },
        {
          type: "tool_use",
          id: "toolu_3",
          name: "session_summary",
          input: { summary: "Set up testing framework", files_touched: ["vitest.config.ts"], unfinished: ["Add e2e tests"] },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      // Second call after tool results — model ends the turn
      mockApiResponse([
        { type: "text", text: "Done curating memories." },
      ], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "We decided to use Vitest for testing.", "ses_1", "test-key");

    expect(result.added).toBe(2);
    expect(result.method).toBe("agent");
    expect(result.summary).toBe("Set up testing framework");
    expect(result.filesTouched).toEqual(["vitest.config.ts"]);
    expect(result.unfinished).toEqual(["Add e2e tests"]);

    // Verify memories were actually persisted
    const memories = await loadMemories(hermesDir);
    expect(memories).toHaveLength(2);
    expect(memories.map((m) => m.type).sort()).toEqual(["decision", "fact"]);

    fetchSpy.mockRestore();
  });

  it("updates existing memories", async () => {
    const existing = await createMemory(hermesDir, "fact", "Project uses Next.js 14", [], "ses_0", 0.7);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "update_memory",
          input: { memory_id: existing.id, content: "Project uses Next.js 15 with App Router", relevance: 0.85 },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "session_summary",
          input: { summary: "Updated framework version info" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Upgraded to Next.js 15.", "ses_1", "test-key");

    expect(result.updated).toBe(1);
    expect(result.added).toBe(0);

    const memories = await loadMemories(hermesDir);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("Project uses Next.js 15 with App Router");

    fetchSpy.mockRestore();
  });

  it("deletes outdated memories", async () => {
    const old = await createMemory(hermesDir, "fact", "Using Webpack for bundling", [], "ses_0", 0.6);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "delete_memory",
          input: { memory_id: old.id, reason: "Project switched to Turbopack" },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "add_memory",
          input: { type: "fact", content: "Using Turbopack for bundling", relevance: 0.8 },
        },
        {
          type: "tool_use",
          id: "toolu_3",
          name: "session_summary",
          input: { summary: "Migrated bundler" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Switched from Webpack to Turbopack.", "ses_1", "test-key");

    expect(result.deleted).toBe(1);
    expect(result.added).toBe(1);

    const memories = await loadMemories(hermesDir);
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toContain("Turbopack");

    fetchSpy.mockRestore();
  });

  it("rejects invalid memory IDs for update/delete", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "update_memory",
          input: { memory_id: "nonexistent_id", content: "Should fail" },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "delete_memory",
          input: { memory_id: "also_fake", reason: "testing" },
        },
        {
          type: "tool_use",
          id: "toolu_3",
          name: "session_summary",
          input: { summary: "Attempted invalid operations" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Some transcript.", "ses_1", "test-key");

    // No actual updates or deletes should have happened
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);

    fetchSpy.mockRestore();
  });

  it("rejects invalid memory types", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "add_memory",
          input: { type: "invalid_type", content: "Should not be saved", relevance: 0.5 },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "session_summary",
          input: { summary: "Invalid type test" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Transcript.", "ses_1", "test-key");
    expect(result.added).toBe(0);

    fetchSpy.mockRestore();
  });

  it("respects max turns limit", async () => {
    // Mock 3 turns of tool_use responses — should stop after MAX_TURNS (3)
    const makeToolResponse = () =>
      mockApiResponse([
        {
          type: "tool_use",
          id: `toolu_${Math.random().toString(36).slice(2)}`,
          name: "add_memory",
          input: { type: "fact", content: `Memory from turn ${Date.now()}`, relevance: 0.5 },
        },
      ], "tool_use") as unknown as Response;

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeToolResponse())
      .mockResolvedValueOnce(makeToolResponse())
      .mockResolvedValueOnce(makeToolResponse());

    const result = await agentCurateMemories(hermesDir, "Long transcript.", "ses_1", "test-key");

    expect(result.turns).toBe(3);
    expect(result.added).toBe(3); // One per turn
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    fetchSpy.mockRestore();
  });

  it("sanitizes memory content", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "add_memory",
          input: {
            type: "fact",
            content: "Normal content <script>alert('xss')</script> with injection attempt",
            relevance: 0.7,
          },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "session_summary",
          input: { summary: "Sanitization test" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Test.", "ses_1", "test-key");
    expect(result.added).toBe(1);

    const memories = await loadMemories(hermesDir);
    expect(memories[0].content).not.toContain("<script>");

    fetchSpy.mockRestore();
  });

  it("handles API errors gracefully", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    await expect(
      agentCurateMemories(hermesDir, "Transcript.", "ses_1", "test-key")
    ).rejects.toThrow("Anthropic API error 500");

    fetchSpy.mockRestore();
  });

  it("returns result when model ends turn with no tool calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        { type: "text", text: "Nothing noteworthy in this session." },
      ], "end_turn") as unknown as Response
    );

    const result = await agentCurateMemories(hermesDir, "Hello world.", "ses_1", "test-key");

    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.turns).toBe(1);

    fetchSpy.mockRestore();
  });

  it("clamps relevance scores to 0-1 range", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockApiResponse([
        {
          type: "tool_use",
          id: "toolu_1",
          name: "add_memory",
          input: { type: "fact", content: "Over-relevant memory", relevance: 5.0 },
        },
        {
          type: "tool_use",
          id: "toolu_2",
          name: "add_memory",
          input: { type: "fact", content: "Under-relevant memory", relevance: -2.0 },
        },
        {
          type: "tool_use",
          id: "toolu_3",
          name: "session_summary",
          input: { summary: "Relevance clamping test" },
        },
      ], "tool_use") as unknown as Response
    ).mockResolvedValueOnce(
      mockApiResponse([], "end_turn") as unknown as Response
    );

    await agentCurateMemories(hermesDir, "Test.", "ses_1", "test-key");

    const memories = await loadMemories(hermesDir);
    expect(memories).toHaveLength(2);
    for (const m of memories) {
      expect(m.relevance).toBeGreaterThanOrEqual(0);
      expect(m.relevance).toBeLessThanOrEqual(1);
    }

    fetchSpy.mockRestore();
  });
});
