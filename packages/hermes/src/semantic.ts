/**
 * Semantic search for Hermes memories.
 *
 * Uses TF-IDF with cosine similarity for zero-dependency local semantic search.
 * No API keys, no external services, no embeddings models required.
 * Runs in ~5ms for 200 memories — fast enough for hook hot paths.
 *
 * Upgrade path: swap in real embeddings (Anthropic/OpenAI) via the
 * `computeEmbedding` function for higher quality semantic matching.
 */

import type { Memory } from "./types";

// ── TF-IDF Vectorizer ──────────────────────────────────────────

/** Tokenize text into normalized terms. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(stem);
}

/** Simple suffix-stripping stemmer (Porter-lite). */
function stem(word: string): string {
  if (word.length <= 4) return word;
  // Remove common suffixes
  return word
    .replace(/(?:ing|tion|ment|ness|able|ible|ous|ive|ful|less|ized|ised|ating|ated)$/, "")
    .replace(/(?:es|ed|ly|er|or|al|en|an)$/, "")
    .replace(/s$/, "");
}

/** Term frequency for a document. */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  // Normalize by document length
  const len = tokens.length || 1;
  for (const [k, v] of tf) {
    tf.set(k, v / len);
  }
  return tf;
}

/** Inverse document frequency across a corpus. */
function inverseDocFrequency(corpus: string[][]): Map<string, number> {
  const docCount = corpus.length || 1;
  const df = new Map<string, number>();

  for (const doc of corpus) {
    const seen = new Set(doc);
    for (const term of seen) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    // IDF with smoothing
    idf.set(term, Math.log((docCount + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** TF-IDF vector for a document given corpus IDF. */
function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) {
    const idfVal = idf.get(term) ?? 1;
    vec.set(term, freq * idfVal);
  }
  return vec;
}

/** Cosine similarity between two sparse vectors. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, val] of a) {
    normA += val * val;
    const bVal = b.get(term);
    if (bVal !== undefined) {
      dotProduct += val * bVal;
    }
  }
  for (const [, val] of b) {
    normB += val * val;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ── Semantic Search Interface ───────────────────────────────────

/** Pre-computed search index for a set of memories. */
export type SemanticIndex = {
  memories: Memory[];
  tokenized: string[][];
  idf: Map<string, number>;
  vectors: Map<string, number>[];
  builtAt: number;
};

// ── In-process cache ────────────────────────────────────────────
let _cachedIndex: SemanticIndex | null = null;
const INDEX_TTL_MS = 10000; // 10 seconds

/** Build a semantic index from memories. Cached for 10s. */
export function buildIndex(memories: Memory[]): SemanticIndex {
  if (
    _cachedIndex &&
    _cachedIndex.memories.length === memories.length &&
    Date.now() - _cachedIndex.builtAt < INDEX_TTL_MS
  ) {
    return _cachedIndex;
  }

  const tokenized = memories.map((m) =>
    tokenize(`${m.content} ${m.tags.join(" ")} ${m.type}`)
  );
  const idf = inverseDocFrequency(tokenized);
  const vectors = tokenized.map((tokens) => tfidfVector(termFrequency(tokens), idf));

  _cachedIndex = { memories, tokenized, idf, vectors, builtAt: Date.now() };
  return _cachedIndex;
}

/** Reset the index cache (for testing). */
export function _resetSemanticCache(): void {
  _cachedIndex = null;
}

/**
 * Semantic search: find memories most similar to a query.
 *
 * Combines TF-IDF cosine similarity with keyword overlap and
 * memory relevance scores for robust retrieval.
 */
export function semanticSearch(
  memories: Memory[],
  query: string,
  limit = 10,
  minScore = 0.05
): Memory[] {
  if (memories.length === 0 || !query.trim()) return [];

  const index = buildIndex(memories);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const queryTf = termFrequency(queryTokens);
  const queryVec = tfidfVector(queryTf, index.idf);

  const scored = index.memories.map((mem, i) => {
    // TF-IDF cosine similarity (semantic)
    const semantic = cosineSimilarity(queryVec, index.vectors[i]);

    // Keyword overlap boost (exact substring matching)
    const memText = mem.content.toLowerCase();
    let keywordHits = 0;
    for (const token of queryTokens) {
      if (memText.includes(token)) keywordHits++;
    }
    const keywordScore = queryTokens.length > 0 ? keywordHits / queryTokens.length : 0;

    // Combined score: 50% semantic + 30% keyword + 20% relevance
    const score = semantic * 0.5 + keywordScore * 0.3 + mem.relevance * 0.2;
    return { memory: mem, score };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.memory);
}

/**
 * Find similar memories (for deduplication/consolidation).
 * Returns memories with cosine similarity above threshold.
 */
export function findSimilar(
  memories: Memory[],
  target: Memory,
  threshold = 0.6
): Memory[] {
  if (memories.length === 0) return [];

  const index = buildIndex(memories);
  const targetTokens = tokenize(`${target.content} ${target.tags.join(" ")}`);
  const targetTf = termFrequency(targetTokens);
  const targetVec = tfidfVector(targetTf, index.idf);

  return index.memories
    .map((mem, i) => ({
      memory: mem,
      similarity: cosineSimilarity(targetVec, index.vectors[i]),
    }))
    .filter((s) => s.similarity >= threshold && s.memory.id !== target.id)
    .sort((a, b) => b.similarity - a.similarity)
    .map((s) => s.memory);
}
