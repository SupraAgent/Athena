/**
 * Vector Store Adapter — optional Chroma embedded integration.
 *
 * Tries to use chromadb (peer dependency) for real ONNX embeddings.
 * Falls back to the built-in TF-IDF semantic search if chromadb is not installed.
 *
 * Usage:
 *   const store = await createVectorStore(hermesDir);
 *   await store.upsert(memories);
 *   const results = await store.query("deployment", 5);
 */

import type { Memory } from "./types";
import { semanticSearch, buildIndex, findSimilar } from "./semantic";

// ── Types ──────────────────────────────────────────────────────

export type VectorSearchResult = {
  memory: Memory;
  score: number;
};

export type VectorStore = {
  /** Backend in use: "chroma" or "tfidf". */
  backend: "chroma" | "tfidf";
  /** Upsert memories into the store. */
  upsert: (memories: Memory[]) => Promise<void>;
  /** Search by query text. */
  query: (text: string, limit?: number) => Promise<VectorSearchResult[]>;
  /** Find similar to a target memory. */
  similar: (target: Memory, threshold?: number) => Promise<Memory[]>;
};

// ── TF-IDF Fallback ────────────────────────────────────────────

function createTfIdfStore(): VectorStore {
  const _memoryMap = new Map<string, Memory>();

  function getMemories(): Memory[] {
    return [..._memoryMap.values()];
  }

  return {
    backend: "tfidf",

    async upsert(memories: Memory[]) {
      // Merge by ID (true upsert, not replace)
      for (const m of memories) {
        _memoryMap.set(m.id, m);
      }
      buildIndex(getMemories());
    },

    async query(text: string, limit = 10): Promise<VectorSearchResult[]> {
      const results = semanticSearch(getMemories(), text, limit);
      return results.map((m, i) => ({
        memory: m,
        score: Math.max(0.1, 1 - (i * 0.15)), // rank-based approximation
      }));
    },

    async similar(target: Memory, threshold = 0.6): Promise<Memory[]> {
      return findSimilar(getMemories(), target, threshold);
    },
  };
}

// ── Chroma Adapter ─────────────────────────────────────────────

// Minimal interface for chromadb (optional peer dependency)
interface ChromaCollection {
  upsert(params: { ids: string[]; documents: string[]; metadatas: Record<string, unknown>[] }): Promise<void>;
  query(params: { queryTexts: string[]; nResults: number }): Promise<{
    ids: string[][];
    distances: number[][];
  }>;
}

async function createChromaStore(hermesDir: string): Promise<VectorStore | null> {
  try {
    // Dynamic require — chromadb is an optional peer dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromadb = require("chromadb");

    // Chroma embedded persistent mode uses PERSIST_DIRECTORY env var
    // or ChromaClient with path pointing to the HTTP server URL.
    // For local embedded use, set the env var and use default client.
    process.env.PERSIST_DIRECTORY = `${hermesDir}/chroma`;
    const client = new chromadb.ChromaClient();

    const collection: ChromaCollection = await client.getOrCreateCollection({
      name: "hermes_memories",
      metadata: { "hnsw:space": "cosine" },
    });

    let _memories: Memory[] = [];

    return {
      backend: "chroma",

      async upsert(memories: Memory[]) {
        _memories = memories;
        if (memories.length === 0) return;

        const ids = memories.map((m) => m.id);
        const documents = memories.map((m) => `${m.type}: ${m.content}`);
        const metadatas = memories.map((m) => ({
          type: m.type,
          source: m.source,
          relevance: m.relevance,
          scope: m.scope ?? "user",
          created_at: m.createdAt,
        }));

        await collection.upsert({ ids, documents, metadatas });
      },

      async query(text: string, limit = 10): Promise<VectorSearchResult[]> {
        const results = await collection.query({
          queryTexts: [text],
          nResults: Math.min(limit, _memories.length || 1),
        });

        const memById = new Map(_memories.map((m) => [m.id, m]));
        const output: VectorSearchResult[] = [];

        const ids = results.ids?.[0] ?? [];
        const distances = results.distances?.[0] ?? [];

        for (let i = 0; i < ids.length; i++) {
          const mem = memById.get(ids[i]);
          if (mem) {
            output.push({
              memory: mem,
              score: 1 - (distances[i] ?? 0),
            });
          }
        }

        return output;
      },

      async similar(target: Memory, threshold = 0.6): Promise<Memory[]> {
        const results = await collection.query({
          queryTexts: [`${target.type}: ${target.content}`],
          nResults: 10,
        });

        const memById = new Map(_memories.map((m) => [m.id, m]));
        const output: Memory[] = [];

        const ids = results.ids?.[0] ?? [];
        const distances = results.distances?.[0] ?? [];

        for (let i = 0; i < ids.length; i++) {
          const similarity = 1 - (distances[i] ?? 0);
          if (similarity >= threshold && ids[i] !== target.id) {
            const mem = memById.get(ids[i]);
            if (mem) output.push(mem);
          }
        }

        return output;
      },
    };
  } catch {
    // chromadb not installed or server not running — fall back to TF-IDF
    return null;
  }
}

// ── Factory ────────────────────────────────────────────────────

/** Create a vector store — uses Chroma if available, TF-IDF otherwise. */
export async function createVectorStore(hermesDir: string): Promise<VectorStore> {
  const chroma = await createChromaStore(hermesDir);
  if (chroma) return chroma;
  return createTfIdfStore();
}
