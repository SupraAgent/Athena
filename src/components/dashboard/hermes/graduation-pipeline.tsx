"use client";

type Candidate = {
  memoryId: string;
  content: string;
  confidence: string;
  relevance: number;
  correctionCount: number;
  hasVerify: boolean;
  reason: string;
};

export function GraduationPipeline({
  candidates,
  alreadyGraduated,
  confidenceCounts,
}: {
  candidates: Candidate[];
  alreadyGraduated: number;
  confidenceCounts: Record<string, number>;
}) {
  const stages = [
    { label: "Observed", count: confidenceCounts.observed ?? 0, color: "bg-white/20" },
    { label: "Confirmed", count: confidenceCounts.confirmed ?? 0, color: "bg-green-500/50" },
    { label: "Graduated", count: alreadyGraduated, color: "bg-purple-500/50" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Graduation Pipeline
      </h3>

      {/* Pipeline stages */}
      <div className="mt-4 flex gap-2">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className="flex-1 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center"
          >
            <div className="text-xl font-bold text-foreground">{stage.count}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{stage.label}</div>
            <div className={`mx-auto mt-1.5 h-1 w-8 rounded-full ${stage.color}`} />
          </div>
        ))}
      </div>

      {/* Arrow indicators between stages */}
      <div className="mt-2 flex justify-around px-8 text-muted-foreground/30">
        <span className="text-xs">&rarr;</span>
        <span className="text-xs">&rarr;</span>
      </div>

      {/* Candidates */}
      {candidates.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-amber-400/80 mb-1.5">
            Ready for graduation ({candidates.length})
          </div>
          <div className="space-y-1.5">
            {candidates.slice(0, 3).map((c) => (
              <div
                key={c.memoryId}
                className="rounded bg-amber-500/5 border border-amber-500/10 px-2.5 py-2"
              >
                <div className="text-xs text-foreground/90 line-clamp-2">
                  {c.content}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {c.reason}
                </div>
              </div>
            ))}
            {candidates.length > 3 && (
              <div className="text-[10px] text-muted-foreground text-center">
                + {candidates.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {candidates.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          No candidates ready. Memories need confirmed confidence, high relevance, and a verify check.
        </p>
      )}
    </div>
  );
}
