# MiroFish Analysis for Hermes Integration

**Date:** 2026-04-02
**Repo:** https://github.com/666ghj/MiroFish
**License:** AGPL-3.0
**Stars:** 48k+ | **Language:** Python 57% / Vue.js 41%

## What MiroFish Is

MiroFish is a multi-agent prediction engine that builds high-fidelity digital simulations from real-world data (news, policy, financial signals). It populates simulations with thousands of autonomous agents that have independent personalities, long-term memory, and behavioral logic. Users inject variables to "rehearse the future" and deduce trajectories.

### Core Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Knowledge Graph | Zep Cloud GraphRAG | Entity/relationship extraction and storage |
| Agent Memory | Zep Cloud graph.add() | Persistent behavioral memory with temporal updates |
| Simulation | OASIS (CAMEL-AI) | Dual-platform parallel agent simulation (Twitter/Reddit) |
| Report Agent | ReACT pattern | Multi-tool agent for post-simulation analysis |
| LLM | OpenAI-compatible API | Entity extraction, profile generation, report writing |
| Frontend | Vue.js | Simulation configuration and visualization |

### Key Services

- **`graph_builder.py`** - GraphRAG construction: text chunking, ontology config, batch episode submission to Zep, async processing with node/edge retrieval
- **`zep_graph_memory_updater.py`** - Converts agent activities to natural language, batches and writes to Zep graph (thread-safe queue, retry with exponential backoff)
- **`simulation_manager.py`** - Multi-agent lifecycle (CREATED -> PREPARING -> READY -> RUNNING -> COMPLETED), dual in-memory + JSON persistence
- **`report_agent.py`** - ReACT agent with 4 tools: insight_forge (deep analysis), panorama_search (broad retrieval), quick_search (verification), interview_agents (live OASIS API calls)

## What Hermes Can Use

### 1. GraphRAG for Memory Relationships (HIGH VALUE)

**MiroFish approach:** Uses Zep Cloud to build knowledge graphs from text, extracting entities and relationships automatically. Ontologies define entity types and their attributes via Pydantic models.

**Hermes opportunity:** Hermes currently has NO explicit graph structure. Memories are flat documents with tags and similarity-based grouping. Adding a lightweight GraphRAG layer would enable:

- **Entity extraction from memories** - Automatically identify files, functions, people, decisions, and their relationships
- **Relationship edges** - "Decision X was made because of Context Y" or "File A depends on Pattern B"
- **Traversal queries** - "What decisions affected this file?" or "What context led to this preference?"

**Implementation path:**
```
Option A: Local-first graph (recommended)
- Build adjacency lists in .athena/hermes/graph.json
- Extract entities via LLM (already have Anthropic integration)
- Use existing semantic search as fallback
- No new dependencies

Option B: Zep Cloud integration
- Direct integration like MiroFish
- Higher quality extraction but adds external dependency
- Free tier available (limited monthly quota)

Option C: Lightweight ontology
- Define entity types for Hermes domain (File, Decision, Preference, Person, Tool)
- Extract relationships during consolidation pipeline
- Store as edge list alongside memories
```

### 2. Temporal Memory with Decay and Validity Windows (MEDIUM VALUE)

**MiroFish approach:** Graph edges have `valid_at` and `expired_at` temporal fields. Activities are timestamped and processed sequentially with temporal awareness.

**Hermes opportunity:** Hermes has `git-aging.ts` for file-aware decay but no explicit temporal validity windows on memories themselves. Adding:

- **Valid-from / expires-at fields** on memories for time-scoped context (e.g., "merge freeze until April 5")
- **Automatic expiration sweep** during session-start
- **Temporal queries** - "What was true about X on date Y?"

**Implementation path:**
```typescript
// Add to Memory type
interface Memory {
  // ... existing fields
  validFrom?: string;   // ISO date - memory becomes active
  expiresAt?: string;   // ISO date - memory auto-decays
  temporalType?: 'permanent' | 'time-bound' | 'recurring';
}
```

### 3. ReACT Agent Pattern for Memory Curation (MEDIUM VALUE)

**MiroFish approach:** The report agent uses a structured ReACT loop with minimum tool-call enforcement, conflict detection, and section-by-section persistence. It has 4 specialized tools and structured logging.

**Hermes opportunity:** Hermes has `agent-curator.ts` using Anthropic tool_use API, but it's relatively simple compared to MiroFish's pattern. Adopting:

- **Minimum tool-call enforcement** - Ensures the curator actually examines memories before making decisions (prevents shallow analysis)
- **Structured logging with JSONL** - MiroFish logs every agent action for debugging; Hermes could log curation decisions
- **Progress tracking via JSON files** - Non-blocking status updates during long curation runs

### 4. Batched Graph Updates with Retry (LOW-MEDIUM VALUE)

**MiroFish approach:** `ZepGraphMemoryUpdater` uses thread-safe queues, platform-specific buffers, batch thresholds (5 items), and exponential backoff (3 retries, 2s base).

**Hermes opportunity:** Currently Hermes writes memories individually with atomic file writes. For cross-project sync (`relay-sync.ts`) and channel updates, a batched pipeline would improve:

- **Throughput** for bulk memory operations (e.g., importing from global store)
- **Reliability** with retry logic for remote operations
- **Efficiency** by coalescing related updates

### 5. Multi-Agent Simulation for Memory Testing (LOW VALUE - FUTURE)

**MiroFish approach:** Full OASIS-based multi-agent simulation with dual-platform parallel execution.

**Hermes opportunity:** Not directly applicable now, but the agent orchestration patterns (lifecycle states, inter-process communication, dual-layer state management) could inform Hermes's planned multi-agent coordination features. The `AgentConfig` system in Hermes already has `reportsTo` hierarchy - MiroFish's patterns could help implement actual agent-to-agent communication.

## What to Skip

| MiroFish Feature | Why Skip |
|-----------------|----------|
| Zep Cloud dependency | Hermes is local-first; adding a cloud dependency contradicts the architecture |
| Vue.js frontend | Athena uses Next.js/React |
| OASIS simulation framework | Overkill for memory management |
| Twitter/Reddit platform simulation | Not relevant to developer memory |
| Docker deployment | Hermes runs as npm package in Claude Code hooks |

## Recommended Roadmap

### Phase 1: Local GraphRAG (2-3 weeks)
1. Add entity extraction to the Mem0 consolidation pipeline (reuse existing LLM client)
2. Define ontology: `File`, `Decision`, `Preference`, `Person`, `Tool`, `Pattern`
3. Store graph as `graph.json` with nodes and typed edges
4. Add `traverseGraph(entityId, depth)` and `relatedMemories(memoryId)` APIs
5. Integrate into session-start hook for richer context injection

### Phase 2: Temporal Memory (1 week)
1. Add `validFrom`, `expiresAt`, `temporalType` to Memory type
2. Add expiration sweep to session-start verification
3. Update CLI commands to support time-bound memories (`/hermes-remember --expires 2026-04-10`)

### Phase 3: Enhanced Curation Agent (1-2 weeks)
1. Add minimum-analysis enforcement to agent-curator
2. Add JSONL action logging for curation decisions
3. Add graph-aware curation (detect orphaned entities, broken relationships)

## Key Takeaways

1. **GraphRAG is the biggest win.** MiroFish proves that extracting entities and relationships from unstructured text into a queryable graph dramatically improves context retrieval. Hermes's flat memory model leaves relational information implicit - making it explicit would improve search quality and enable new query types.

2. **Temporal validity is a quick win.** Many Hermes memories are inherently time-scoped (sprint deadlines, merge freezes, temporary workarounds). Explicit temporal fields would prevent stale context from polluting sessions.

3. **The ReACT pattern works for curation.** MiroFish's minimum-tool-call enforcement and structured logging are directly portable to Hermes's agent curator without major architectural changes.

4. **Stay local-first.** MiroFish's dependency on Zep Cloud is its biggest architectural weakness for our use case. All adaptations should work offline with optional cloud enhancement - matching Hermes's existing pattern of Voyage API (optional) -> ONNX (optional) -> TF-IDF (always available).
