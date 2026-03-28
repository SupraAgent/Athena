import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import {
  getWorkspaces,
  createWorkspace,
  saveWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  setStorageKeys,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  renameWorkspace,
  loadWorkspace,
} from "../use-workspaces";

// ── localStorage mock ─────────────────────────────────────────

function mockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) delete store[key];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    _store: store,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function node(id: string): Node {
  return { id, type: "actionNode", position: { x: 0, y: 0 }, data: { label: id } };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

// ── Tests ─────────────────────────────────────────────────────

describe("workspace CRUD", () => {
  let storage: ReturnType<typeof mockLocalStorage>;

  beforeEach(() => {
    storage = mockLocalStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true });
    // Reset to default keys before each test
    setStorageKeys("athena:workspaces", "athena:active-workspace");
  });

  it("getWorkspaces returns empty array when nothing stored", () => {
    expect(getWorkspaces()).toEqual([]);
  });

  it("createWorkspace persists and returns workspace", () => {
    const nodes = [node("a")];
    const edges: Edge[] = [];
    const ws = createWorkspace("My Flow", nodes, edges);
    expect(ws).not.toBeNull();

    expect(ws!.name).toBe("My Flow");
    expect(ws!.id).toMatch(/^ws-/);
    expect(ws!.nodes).toEqual(nodes);

    const all = getWorkspaces();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(ws!.id);
  });

  it("saveWorkspace updates an existing workspace", () => {
    const ws = createWorkspace("Test", [node("a")], []);
    expect(ws).not.toBeNull();
    const newNodes = [node("a"), node("b")];
    const newEdges = [edge("a", "b")];

    const ok = saveWorkspace(ws!.id, newNodes, newEdges);

    expect(ok).toBe(true);
    const loaded = getWorkspaces().find((w) => w.id === ws!.id);
    expect(loaded!.nodes).toHaveLength(2);
    expect(loaded!.edges).toHaveLength(1);
  });

  it("saveWorkspace creates a recovered workspace for unknown ID", () => {
    const ok = saveWorkspace("unknown-id", [node("x")], []);

    expect(ok).toBe(true);
    const all = getWorkspaces();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Recovered Build");
  });

  it("deleteWorkspace removes workspace and clears active ID if matching", () => {
    const ws = createWorkspace("ToDelete", [node("a")], []);
    expect(ws).not.toBeNull();
    setActiveWorkspaceId(ws!.id);

    deleteWorkspace(ws!.id);

    expect(getWorkspaces()).toHaveLength(0);
    expect(getActiveWorkspaceId()).toBeNull();
  });

  it("duplicateWorkspace creates a copy with (copy) suffix", () => {
    const ws = createWorkspace("Original", [node("a"), node("b")], [edge("a", "b")]);
    expect(ws).not.toBeNull();

    const copy = duplicateWorkspace(ws!.id);

    expect(copy).not.toBeNull();
    expect(copy!.name).toBe("Original (copy)");
    expect(copy!.id).not.toBe(ws!.id);
    expect(copy!.nodes).toHaveLength(2);
    expect(getWorkspaces()).toHaveLength(2);
  });

  it("duplicateWorkspace returns null for non-existent ID", () => {
    expect(duplicateWorkspace("nope")).toBeNull();
  });

  it("renameWorkspace updates the name", () => {
    const ws = createWorkspace("Old Name", [], []);
    expect(ws).not.toBeNull();
    renameWorkspace(ws!.id, "New Name");

    const loaded = loadWorkspace(ws!.id);
    expect(loaded!.name).toBe("New Name");
  });

  it("loadWorkspace returns null for unknown ID", () => {
    expect(loadWorkspace("nope")).toBeNull();
  });
});

// ── Prefix isolation ──────────────────────────────────────────

describe("setStorageKeys prefix isolation", () => {
  let storage: ReturnType<typeof mockLocalStorage>;

  beforeEach(() => {
    storage = mockLocalStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true });
  });

  it("isolates workspaces by storage key prefix", () => {
    setStorageKeys("prefix-a:workspaces", "prefix-a:active");
    createWorkspace("WS-A", [node("a")], []);

    setStorageKeys("prefix-b:workspaces", "prefix-b:active");
    createWorkspace("WS-B", [node("b")], []);

    // Switch back to prefix-a
    setStorageKeys("prefix-a:workspaces", "prefix-a:active");
    const aList = getWorkspaces();
    expect(aList).toHaveLength(1);
    expect(aList[0].name).toBe("WS-A");

    setStorageKeys("prefix-b:workspaces", "prefix-b:active");
    const bList = getWorkspaces();
    expect(bList).toHaveLength(1);
    expect(bList[0].name).toBe("WS-B");
  });
});

// ── saveAll quota error ───────────────────────────────────────

describe("saveAll returns false on quota error", () => {
  let storage: ReturnType<typeof mockLocalStorage>;

  beforeEach(() => {
    storage = mockLocalStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true });
    setStorageKeys("athena:workspaces", "athena:active-workspace");
  });

  it("saveWorkspace returns false when localStorage.setItem throws", () => {
    // First create a workspace successfully
    createWorkspace("WS", [node("a")], []);

    // Now make setItem throw to simulate quota exceeded
    storage.setItem.mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    const ok = saveWorkspace("some-id", [node("b")], []);
    expect(ok).toBe(false);
  });
});
