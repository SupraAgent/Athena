"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Memory = {
  id: string;
  type: string;
  content: string;
  tags: string[];
  scope: string;
  relevance: number;
  createdAt: string;
  updatedAt: string;
  source: string;
};

type TraceEntry = {
  filename: string;
  date: string;
  sessionId: string;
};

type Span = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  error?: string;
  attributes?: Record<string, unknown>;
};

const TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  decision: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  preference: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "project-context": "bg-green-500/20 text-green-400 border-green-500/30",
  pattern: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  pending: "bg-red-500/20 text-red-400 border-red-500/30",
  guidance: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "session-summary": "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "agent-heartbeat": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
};

const SCOPE_COLORS: Record<string, string> = {
  user: "bg-emerald-500/20 text-emerald-400",
  agent: "bg-violet-500/20 text-violet-400",
  session: "bg-orange-500/20 text-orange-400",
};

export default function HermesPage() {
  const [tab, setTab] = useState<"memories" | "traces">("memories");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<{ spans: Span[] } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tab === "memories") {
      setLoading(true);
      fetch("/api/hermes/memories")
        .then((r) => r.json())
        .then((data) => { setMemories(data.memories ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setLoading(true);
      fetch("/api/hermes/traces")
        .then((r) => r.json())
        .then((data) => { setTraces(data.traces ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [tab]);

  const filteredMemories = typeFilter === "all"
    ? memories
    : memories.filter((m) => m.type === typeFilter);

  const memoryTypes = [...new Set(memories.map((m) => m.type))];

  async function loadTrace(sessionId: string) {
    const res = await fetch(`/api/hermes/traces?sessionId=${sessionId}`);
    const data = await res.json();
    setSelectedTrace(data);
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Hermes</h1>
          <p className="text-gray-400">Session memory, traces, and observability</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["memories", "traces"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelectedTrace(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              {t === "memories" ? `Memories (${memories.length})` : "Traces"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-gray-500 text-center py-12">Loading...</div>
        ) : tab === "memories" ? (
          <>
            {/* Type filter chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1 rounded-full text-xs border ${
                  typeFilter === "all"
                    ? "bg-white/10 text-white border-white/20"
                    : "text-gray-500 border-gray-700 hover:border-gray-500"
                }`}
              >
                All ({memories.length})
              </button>
              {memoryTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    typeFilter === type
                      ? TYPE_COLORS[type] ?? "bg-white/10 text-white border-white/20"
                      : "text-gray-500 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  {type} ({memories.filter((m) => m.type === type).length})
                </button>
              ))}
            </div>

            {/* Memory cards */}
            <AnimatePresence mode="popLayout">
              <div className="space-y-3">
                {filteredMemories.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-gray-900/50 border border-gray-800 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex gap-2 items-center mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs border ${TYPE_COLORS[m.type] ?? "bg-gray-500/20 text-gray-400"}`}>
                            {m.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${SCOPE_COLORS[m.scope] ?? "bg-gray-500/20 text-gray-400"}`}>
                            {m.scope}
                          </span>
                          {m.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 rounded text-xs bg-gray-700/50 text-gray-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-gray-200 text-sm">{m.content}</p>
                        <div className="flex gap-4 mt-2 text-xs text-gray-600">
                          <span>Relevance: {m.relevance.toFixed(2)}</span>
                          <span>Source: {m.source}</span>
                          <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>

            {filteredMemories.length === 0 && (
              <div className="text-gray-600 text-center py-12">
                No memories found. Hermes will start collecting memories during your Claude Code sessions.
              </div>
            )}
          </>
        ) : selectedTrace ? (
          <>
            <button
              onClick={() => setSelectedTrace(null)}
              className="text-gray-500 hover:text-white text-sm mb-4"
            >
              &larr; Back to traces
            </button>
            <div className="space-y-2">
              {(selectedTrace.spans ?? []).map((span: Span) => (
                <div
                  key={span.id}
                  className={`bg-gray-900/50 border rounded-lg p-3 ${
                    span.status === "error" ? "border-red-500/30" : "border-gray-800"
                  } ${span.parent_id ? "ml-8" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      span.kind === "hook" ? "bg-blue-500/20 text-blue-400" :
                      span.kind === "llm" ? "bg-purple-500/20 text-purple-400" :
                      span.kind === "memory" ? "bg-green-500/20 text-green-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {span.kind}
                    </span>
                    <span className="text-gray-200 text-sm font-medium">{span.name}</span>
                    {span.duration_ms !== null && (
                      <span className="text-gray-600 text-xs">{span.duration_ms}ms</span>
                    )}
                    {span.status === "error" && (
                      <span className="text-red-400 text-xs">{span.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {traces.map((t) => (
              <button
                key={t.filename}
                onClick={() => loadTrace(t.sessionId)}
                className="w-full text-left bg-gray-900/50 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex justify-between">
                  <span className="text-gray-200 text-sm font-mono">{t.sessionId}</span>
                  <span className="text-gray-600 text-xs">{t.date}</span>
                </div>
              </button>
            ))}
            {traces.length === 0 && (
              <div className="text-gray-600 text-center py-12">
                No traces found. Session traces are recorded during Claude Code sessions.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
