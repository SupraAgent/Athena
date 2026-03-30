import { describe, it, expect } from "vitest";
import { hashMemories, diffMemories, formatDiffBlock } from "../diff";
import type { Memory } from "../types";

function makeMem(id: string, content: string, type: Memory["type"] = "fact"): Memory {
  return {
    id,
    type,
    content,
    tags: [],
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-28T10:00:00Z",
    source: "test",
    relevance: 0.5,
    scope: "user",
  };
}

describe("hashMemories", () => {
  it("produces a deterministic hash for same input", () => {
    const mems = [makeMem("m1", "React hooks"), makeMem("m2", "Node server")];
    const h1 = hashMemories(mems);
    const h2 = hashMemories(mems);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it("produces different hashes for different content", () => {
    const a = [makeMem("m1", "content A")];
    const b = [makeMem("m1", "content B")];
    expect(hashMemories(a)).not.toBe(hashMemories(b));
  });

  it("is order-independent (sorted internally)", () => {
    const a = [makeMem("m1", "first"), makeMem("m2", "second")];
    const b = [makeMem("m2", "second"), makeMem("m1", "first")];
    expect(hashMemories(a)).toBe(hashMemories(b));
  });
});

describe("diffMemories", () => {
  it("detects added memories", () => {
    const prev: Memory[] = [];
    const curr = [makeMem("m1", "New fact")];
    const diffs = diffMemories(prev, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].added).toContain("New fact");
    expect(diffs[0].removed).toHaveLength(0);
  });

  it("detects removed memories", () => {
    const prev = [makeMem("m1", "Old fact")];
    const curr: Memory[] = [];
    const diffs = diffMemories(prev, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].removed).toContain("Old fact");
    expect(diffs[0].added).toHaveLength(0);
  });

  it("returns empty array when nothing changed", () => {
    const mems = [makeMem("m1", "Same content")];
    const diffs = diffMemories(mems, mems);
    expect(diffs).toHaveLength(0);
  });

  it("detects content changes in existing memories", () => {
    const prev = [makeMem("m1", "Original content")];
    const curr = [makeMem("m1", "Updated content")];
    const diffs = diffMemories(prev, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].added).toContain("Updated content");
    expect(diffs[0].removed).toContain("Original content");
  });
});

describe("formatDiffBlock", () => {
  it("returns empty string for no diffs", () => {
    expect(formatDiffBlock([])).toBe("");
  });

  it("formats added and removed entries as markdown", () => {
    const diffs = diffMemories(
      [makeMem("m1", "Removed item")],
      [makeMem("m2", "Added item")]
    );
    const block = formatDiffBlock(diffs);
    expect(block).toContain("# Hermes");
    expect(block).toContain("+ Added item");
    expect(block).toContain("~~Removed item~~");
  });
});
