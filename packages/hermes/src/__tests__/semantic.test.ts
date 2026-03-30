import { describe, it, expect, beforeEach } from "vitest";
import {
  buildIndex,
  semanticSearch,
  findSimilar,
  _resetSemanticCache,
} from "../semantic";
import type { Memory } from "../types";

function makeMem(
  id: string,
  content: string,
  tags: string[] = [],
  relevance = 0.5
): Memory {
  return {
    id,
    type: "fact",
    content,
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "test",
    relevance,
    scope: "user",
  };
}

beforeEach(() => {
  _resetSemanticCache();
});

describe("buildIndex", () => {
  it("creates an index with correct number of vectors", () => {
    const mems = [makeMem("m1", "React components"), makeMem("m2", "Node server")];
    const idx = buildIndex(mems);
    expect(idx.memories).toHaveLength(2);
    expect(idx.vectors).toHaveLength(2);
    expect(idx.tokenized).toHaveLength(2);
  });
});

describe("semanticSearch", () => {
  it("returns empty array for empty query", () => {
    const mems = [makeMem("m1", "React hooks guide")];
    expect(semanticSearch(mems, "")).toEqual([]);
    expect(semanticSearch(mems, "   ")).toEqual([]);
  });

  it("returns empty array when no memories match", () => {
    // Use relevance=0 so the relevance component alone can't push score above minScore
    const mems = [makeMem("m1", "Python Django deployment", [], 0)];
    const results = semanticSearch(mems, "quantum entanglement physics");
    expect(results).toHaveLength(0);
  });

  it("ranks exact keyword matches higher", () => {
    const mems = [
      makeMem("m1", "Database migration scripts for PostgreSQL", ["db"], 0.5),
      makeMem("m2", "React component testing patterns", ["react"], 0.5),
      makeMem("m3", "PostgreSQL indexing and query optimization", ["db", "postgres"], 0.5),
    ];
    const results = semanticSearch(mems, "PostgreSQL database optimization");
    expect(results.length).toBeGreaterThan(0);
    // PostgreSQL-related memories should come first
    expect(results[0].content).toContain("PostgreSQL");
  });

  it("returns empty for empty memories array", () => {
    expect(semanticSearch([], "anything")).toEqual([]);
  });
});

describe("findSimilar", () => {
  it("finds memories above the similarity threshold", () => {
    const mems = [
      makeMem("m1", "React hooks useState useEffect"),
      makeMem("m2", "React hooks custom hook patterns"),
      makeMem("m3", "Python Django REST API design"),
    ];
    const target = makeMem("target", "React hooks best practices");
    const similar = findSimilar(mems, target, 0.3);
    // Should find the React-related memories, not the Python one
    expect(similar.length).toBeGreaterThanOrEqual(1);
    expect(similar.every((m) => m.id !== "target")).toBe(true);
    expect(similar.some((m) => m.content.includes("React"))).toBe(true);
  });

  it("excludes the target memory itself", () => {
    const target = makeMem("m1", "React hooks");
    const mems = [target, makeMem("m2", "React hooks guide")];
    const similar = findSimilar(mems, target, 0.1);
    expect(similar.every((m) => m.id !== target.id)).toBe(true);
  });

  it("returns empty array for empty memories", () => {
    const target = makeMem("t", "anything");
    expect(findSimilar([], target)).toEqual([]);
  });
});
