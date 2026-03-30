"use client";

const TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500",
  decision: "bg-purple-500",
  guidance: "bg-green-500",
  preference: "bg-amber-500",
  pattern: "bg-cyan-500",
  pending: "bg-orange-500",
  "project-context": "bg-indigo-500",
  "session-summary": "bg-gray-500",
  "agent-heartbeat": "bg-pink-500",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  observed: "bg-white/20",
  confirmed: "bg-green-500/60",
  graduated: "bg-purple-500/60",
};

export function MemoryOverview({
  memoriesByType,
  avgRelevance,
  activeMemories,
  confidenceCounts,
  topTags,
}: {
  memoriesByType: Record<string, number>;
  avgRelevance: number;
  activeMemories: number;
  confidenceCounts: Record<string, number>;
  topTags: { tag: string; count: number }[];
}) {
  const types = Object.entries(memoriesByType)
    .sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...types.map(([, c]) => c), 1);
  const totalConfidence = Object.values(confidenceCounts).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Memory Overview
      </h3>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{activeMemories}</span>
        <span className="text-xs text-muted-foreground">active memories</span>
      </div>

      {/* Type breakdown */}
      {types.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {types.map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-24 truncate text-xs text-muted-foreground">{type}</span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${TYPE_COLORS[type] ?? "bg-white/30"}`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right text-xs text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Confidence lifecycle */}
      <div className="mt-4">
        <div className="text-xs text-muted-foreground mb-1.5">Confidence lifecycle</div>
        <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
          {Object.entries(confidenceCounts).map(([level, count]) =>
            count > 0 ? (
              <div
                key={level}
                className={`${CONFIDENCE_COLORS[level] ?? "bg-white/20"}`}
                style={{ width: `${(count / totalConfidence) * 100}%` }}
                title={`${level}: ${count}`}
              />
            ) : null
          )}
        </div>
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
          {Object.entries(confidenceCounts).map(([level, count]) => (
            <span key={level}>{level} {count}</span>
          ))}
        </div>
      </div>

      {/* Avg relevance */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Avg relevance</span>
        <span className="text-sm font-medium text-foreground">
          {(avgRelevance * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500/60"
          style={{ width: `${avgRelevance * 100}%` }}
        />
      </div>

      {/* Top tags */}
      {topTags.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-muted-foreground mb-1.5">Top tags</div>
          <div className="flex flex-wrap gap-1">
            {topTags.slice(0, 6).map((t) => (
              <span
                key={t.tag}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {t.tag} ({t.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
