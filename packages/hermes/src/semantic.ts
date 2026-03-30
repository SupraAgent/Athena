/**
 * Semantic search for Hermes memories.
 *
 * Uses BM25 ranking for search queries and TF-IDF cosine similarity for
 * deduplication. Zero-dependency local semantic search — no API keys,
 * no external services, no embeddings models required.
 * Runs in ~5ms for 200 memories — fast enough for hook hot paths.
 *
 * Upgrade path: swap in real embeddings (Anthropic/OpenAI) via the
 * `computeEmbedding` function for higher quality semantic matching.
 */

import type { Memory } from "./types";
import { expandQuery } from "./synonyms";

// ── BM25 Parameters ───────────────────────────────────────────
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// ── Synonym expansion weight (applied to expanded-only terms) ──
const SYNONYM_WEIGHT = 0.5;

// ── Tokenizer ─────────────────────────────────────────────────

/** Tokenize text into normalized unigrams and bigrams. */
function tokenize(text: string): string[] {
  const unigrams = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(stem);

  // Generate adjacent bigrams
  const tokens = [...unigrams];
  for (let i = 0; i < unigrams.length - 1; i++) {
    tokens.push(`${unigrams[i]}_${unigrams[i + 1]}`);
  }

  return tokens;
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

// ── BM25 Scoring ──────────────────────────────────────────────

/**
 * Okapi BM25 score for a single term in a document.
 *
 * @param tf    — raw term frequency in the document
 * @param df    — number of documents containing the term
 * @param docLen    — length (token count) of the document
 * @param avgDocLen — average document length across the corpus
 * @param corpusSize — total number of documents in the corpus
 */
export function bm25Score(
  tf: number,
  df: number,
  docLen: number,
  avgDocLen: number,
  corpusSize: number
): number {
  // IDF component with floor at 0 to avoid negative scores
  const idf = Math.max(
    0,
    Math.log((corpusSize - df + 0.5) / (df + 0.5) + 1)
  );
  // TF saturation
  const tfNorm =
    (tf * (BM25_K1 + 1)) /
    (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgDocLen)));
  return idf * tfNorm;
}

// ── TF-IDF (kept for findSimilar / dedup) ─────────────────────

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
  /** Raw term frequency counts per document (for BM25). */
  rawTf: Map<string, number>[];
  /** Document frequency: how many docs contain each term. */
  df: Map<string, number>;
  /** Average document length in tokens. */
  avgDocLen: number;
  builtAt: number;
};

// ── In-process cache ────────────────────────────────────────────
let _cachedIndex: SemanticIndex | null = null;
let _cachedContentHash = "";
const INDEX_TTL_MS = 10000; // 10 seconds

/** Fast content fingerprint: count + concatenated IDs + updatedAt timestamps. */
function contentFingerprint(memories: Memory[]): string {
  return memories.map((m) => `${m.id}:${m.updatedAt}`).join("|");
}

/** Build a semantic index from memories. Cached for 10s, invalidated on content change. */
export function buildIndex(memories: Memory[]): SemanticIndex {
  const fingerprint = contentFingerprint(memories);
  if (
    _cachedIndex &&
    _cachedContentHash === fingerprint &&
    Date.now() - _cachedIndex.builtAt < INDEX_TTL_MS
  ) {
    return _cachedIndex;
  }

  const tokenized = memories.map((m) =>
    tokenize(`${m.content} ${m.tags.join(" ")} ${m.type}`)
  );
  const idf = inverseDocFrequency(tokenized);
  const vectors = tokenized.map((tokens) => tfidfVector(termFrequency(tokens), idf));

  // Pre-compute raw term frequencies and document frequencies for BM25
  const rawTf: Map<string, number>[] = tokenized.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    return tf;
  });

  const df = new Map<string, number>();
  for (const doc of tokenized) {
    const seen = new Set(doc);
    for (const term of seen) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const totalLen = tokenized.reduce((sum, t) => sum + t.length, 0);
  const avgDocLen = tokenized.length > 0 ? totalLen / tokenized.length : 1;

  _cachedIndex = {
    memories,
    tokenized,
    idf,
    vectors,
    rawTf,
    df,
    avgDocLen,
    builtAt: Date.now(),
  };
  _cachedContentHash = fingerprint;
  return _cachedIndex;
}

/** Reset the index cache (for testing). */
export function _resetSemanticCache(): void {
  _cachedIndex = null;
  _cachedContentHash = "";
}

/**
 * Semantic search: find memories most similar to a query.
 *
 * Uses BM25 ranking combined with keyword overlap and memory relevance
 * scores for robust retrieval. Query is expanded with developer-term
 * synonyms (at reduced weight) before scoring.
 */
export function semanticSearch(
  memories: Memory[],
  query: string,
  limit = 10,
  minScore = 0.05
): Memory[] {
  if (memories.length === 0 || !query.trim()) return [];

  const index = buildIndex(memories);
  const baseTokens = tokenize(query);
  if (baseTokens.length === 0) return [];

  // Expand with synonyms — track which tokens are originals vs expansions
  const expandedTokens = expandQuery(baseTokens);
  const originalSet = new Set(baseTokens);

  const corpusSize = index.memories.length;

  const scored = index.memories.map((mem, i) => {
    const docLen = index.tokenized[i].length;
    const docRawTf = index.rawTf[i];

    // BM25 score across query terms
    let bm25 = 0;
    for (const token of expandedTokens) {
      const tf = docRawTf.get(token) ?? 0;
      if (tf === 0) continue;
      const termDf = index.df.get(token) ?? 0;
      let termScore = bm25Score(tf, termDf, docLen, index.avgDocLen, corpusSize);
      // Down-weight synonym-only terms
      if (!originalSet.has(token)) {
        termScore *= SYNONYM_WEIGHT;
      }
      bm25 += termScore;
    }

    // Normalize BM25 to roughly 0-1 range (heuristic cap)
    const bm25Norm = bm25 > 0 ? Math.min(1, bm25 / (expandedTokens.length * 2)) : 0;

    // Keyword overlap boost (exact substring matching on original tokens)
    const memText = mem.content.toLowerCase();
    let keywordHits = 0;
    for (const token of baseTokens) {
      if (memText.includes(token)) keywordHits++;
    }
    const keywordScore = baseTokens.length > 0 ? keywordHits / baseTokens.length : 0;

    // Combined score: 55% BM25 + 25% keyword + 20% relevance
    const score = bm25Norm * 0.55 + keywordScore * 0.25 + mem.relevance * 0.2;
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
 * Uses TF-IDF cosine similarity (not BM25) for pairwise comparison.
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
