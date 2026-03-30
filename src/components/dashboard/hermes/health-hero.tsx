"use client";

type Trend = {
  sessionCount: number;
  avgCorrections: number;
  recentCorrections: number;
  direction: "improving" | "stable" | "degrading";
  recurringViolations: string[];
  summary: string;
} | null;

const DIRECTION_STYLES = {
  improving: { bg: "bg-green-500/20", text: "text-green-400", label: "Improving" },
  stable: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Stable" },
  degrading: { bg: "bg-red-500/20", text: "text-red-400", label: "Needs Attention" },
} as const;

export function HealthHero({
  healthScore,
  trend,
  activeMemories,
}: {
  healthScore: number;
  trend: Trend;
  activeMemories: number;
}) {
  const direction = trend?.direction ?? "stable";
  const style = DIRECTION_STYLES[direction];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (healthScore / 100) * circumference;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Self-Evolution Health
          </h3>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-4xl font-bold text-foreground">{healthScore}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            {trend && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                {style.label}
              </span>
            )}
          </div>
          {trend && (
            <p className="mt-2 text-sm text-muted-foreground">{trend.summary}</p>
          )}
          {!trend && (
            <p className="mt-2 text-sm text-muted-foreground">
              {activeMemories} memories stored. Run more sessions to see trends.
            </p>
          )}
          {trend?.recurringViolations && trend.recurringViolations.length > 0 && (
            <p className="mt-1 text-xs text-red-400/80">
              Recurring: {trend.recurringViolations.join(", ")}
            </p>
          )}
        </div>
        {/* SVG ring gauge */}
        <svg width="100" height="100" className="shrink-0">
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={healthScore >= 70 ? "hsl(158, 64%, 52%)" : healthScore >= 40 ? "hsl(30, 90%, 55%)" : "hsl(0, 72%, 60%)"}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="transition-all duration-700"
          />
          <text x="50" y="54" textAnchor="middle" className="fill-foreground text-lg font-bold">
            {healthScore}
          </text>
        </svg>
      </div>
    </div>
  );
}
