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
  /** Backend in use: "chroma" | "tfidf" | "anthropic". */
  backend: "chroma" | "tfidf" | "anthropic";
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

// ── Anthropic Embeddings Adapter ──────────────────────────────

/**
 * Create a vector store backed by Anthropic's embedding API.
 * Requires ANTHROPIC_API_KEY env var or config.anthropicApiKey.
 *
 * Uses voyage-3 model via Anthropic's partner embedding endpoint.
 * Falls back to TF-IDF if the API key is not set or requests fail.
 */
async function createAnthropicStore(apiKey: string): Promise<VectorStore | null> {
  if (!apiKey) return null;

  const EMBEDDING_MODEL = "voyage-3";
  const EMBEDDING_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

  // In-memory embedding cache
  const embeddingCache = new Map<string, number[]>();
  let _memories: Memory[] = [];

  async function getEmbeddings(texts: string[]): Promise<number[][]> {
    // Check cache first, only request uncached
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    const results: (number[] | null)[] = texts.map((t) => {
      const cached = embeddingCache.get(t);
      return cached ?? null;
    });

    for (let i = 0; i < texts.length; i++) {
      if (!results[i]) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    if (uncachedTexts.length > 0) {
      // Batch in chunks of 128 (API limit)
      for (let start = 0; start < uncachedTexts.length; start += 128) {
        const batch = uncachedTexts.slice(start, start + 128);
        try {
          const resp = await fetch(EMBEDDING_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: batch,
              input_type: "document",
            }),
          });

          if (!resp.ok) return [];

          const data = (await resp.json()) as {
            data: { embedding: number[] }[];
          };

          for (let j = 0; j < data.data.length; j++) {
            const globalIdx = uncachedIndices[start + j];
            const embedding = data.data[j].embedding;
            results[globalIdx] = embedding;
            embeddingCache.set(texts[globalIdx], embedding);
          }
        } catch {
          return [];
        }
      }
    }

    return results.filter((r): r is number[] => r !== null);
  }

  function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  function magnitude(v: number[]): number {
    return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  }

  function cosine(a: number[], b: number[]): number {
    const denom = magnitude(a) * magnitude(b);
    return denom === 0 ? 0 : dotProduct(a, b) / denom;
  }

  // Verify API access with a tiny test
  try {
    const test = await getEmbeddings(["test"]);
    if (test.length === 0) return null;
  } catch {
    return null;
  }

  return {
    backend: "anthropic",

    async upsert(memories: Memory[]) {
      _memories = memories;
      if (memories.length === 0) return;
      const texts = memories.map((m) => `${m.type}: ${m.content}`);
      await getEmbeddings(texts);
    },

    async query(text: string, limit = 10): Promise<VectorSearchResult[]> {
      const queryEmb = await getEmbeddings([text]);
      if (queryEmb.length === 0) return [];

      const memTexts = _memories.map((m) => `${m.type}: ${m.content}`);
      const memEmbs = await getEmbeddings(memTexts);
      if (memEmbs.length !== _memories.length) return [];

      const scored = _memories.map((m, i) => ({
        memory: m,
        score: cosine(queryEmb[0], memEmbs[i]),
      }));

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .filter((s) => s.score > 0);
    },

    async similar(target: Memory, threshold = 0.6): Promise<Memory[]> {
      const targetEmb = await getEmbeddings([`${target.type}: ${target.content}`]);
      if (targetEmb.length === 0) return [];

      const memTexts = _memories.map((m) => `${m.type}: ${m.content}`);
      const memEmbs = await getEmbeddings(memTexts);
      if (memEmbs.length !== _memories.length) return [];

      return _memories
        .map((m, i) => ({ memory: m, score: cosine(targetEmb[0], memEmbs[i]) }))
        .filter((s) => s.score >= threshold && s.memory.id !== target.id)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.memory);
    },
  };
}

// ── Factory ────────────────────────────────────────────────────

/**
 * Create a vector store — priority: Anthropic embeddings > Chroma > TF-IDF.
 *
 * Set VOYAGE_API_KEY env var to use Anthropic/Voyage embeddings.
 * Install chromadb to use Chroma. Otherwise falls back to BM25/TF-IDF.
 */
export async function createVectorStore(hermesDir: string): Promise<VectorStore> {
  // Try Anthropic/Voyage embeddings first
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (voyageKey) {
    const anthropic = await createAnthropicStore(voyageKey);
    if (anthropic) return anthropic;
  }

  // Then try Chroma
  const chroma = await createChromaStore(hermesDir);
  if (chroma) return chroma;

  // Default: TF-IDF/BM25
  return createTfIdfStore();
}
