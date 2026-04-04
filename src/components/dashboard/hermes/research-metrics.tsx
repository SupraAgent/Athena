"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_COLORS, TOOLTIP_CONTENT_STYLE, CHART_DEFAULTS } from "@/lib/chart-config";

// ── Types ─────────────────────────────────────────────────────

type Experiment = {
  id: string;
  hypothesis: { description: string; source: string; expectedImpact: string };
  status: "running" | "kept" | "discarded";
  baselineScore: { value: number };
  resultScore: { value: number } | null;
  comparison: { delta: number; significant: boolean } | null;
  observedSessions: string[];
  sessionWindow: number;
  startedAt: string;
  completedAt: string | null;
};

type ResearchLog = {
  experiments: Experiment[];
  currentBaseline: { value: number } | null;
  totalImprovement: number;
  experimentsRun: number;
  experimentsKept: number;
  experimentsDiscarded: number;
};

type CostSummary = {
  totalCostUsd: number;
  callCount: number;
  dailyCosts: Array<{ date: string; costUsd: number; calls: number }>;
};

// ── Component ─────────────────────────────────────────────────

export function ResearchMetrics({
  researchLog,
  costSummary,
  enabled,
}: {
  researchLog: ResearchLog | null;
  costSummary: CostSummary | null;
  enabled: boolean;
}) {
  if (!enabled || !researchLog) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          AutoResearch
        </h3>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          AutoResearch is not enabled. Run <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">hermes research start</code> to begin self-improvement experiments.
        </p>
      </div>
    );
  }

  const activeExperiment = researchLog.experiments.find((e) => e.status === "running");
  const completedExperiments = researchLog.experiments.filter((e) => e.status !== "running");
  const keepRate = researchLog.experimentsRun > 0
    ? ((researchLog.experimentsKept / researchLog.experimentsRun) * 100).toFixed(0)
    : "0";

  // Chart data: experiment deltas
  const chartData = completedExperiments.map((exp, i) => ({
    name: `#${i + 1}`,
    delta: exp.comparison?.delta ?? 0,
    status: exp.status,
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          AutoResearch
        </h3>
        <span className="rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400">
          Active
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Experiments"
          value={researchLog.experimentsRun.toString()}
        />
        <StatCard
          label="Keep Rate"
          value={`${keepRate}%`}
        />
        <StatCard
          label="Improvement"
          value={formatDelta(researchLog.totalImprovement)}
          positive={researchLog.totalImprovement > 0}
        />
        <StatCard
          label="Baseline"
          value={researchLog.currentBaseline?.value.toFixed(3) ?? "—"}
        />
      </div>

      {/* Active experiment */}
      {activeExperiment && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400">
              Running Experiment
            </span>
            <span className="text-xs text-muted-foreground">
              {activeExperiment.observedSessions.length}/{activeExperiment.sessionWindow} sessions
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {activeExperiment.hypothesis.description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <SourceBadge source={activeExperiment.hypothesis.source} />
            <ImpactBadge impact={activeExperiment.hypothesis.expectedImpact} />
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{
                width: `${(activeExperiment.observedSessions.length / activeExperiment.sessionWindow) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Experiment delta chart */}
      {chartData.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Experiment Deltas
          </h4>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} {...CHART_DEFAULTS}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART_COLORS.axisText, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_COLORS.axisText, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  formatter={(value: number) => [value.toFixed(4), "Delta"]}
                />
                <Bar dataKey="delta" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.status === "kept" ? CHART_COLORS.completed : CHART_COLORS.failed}
                      opacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent experiments table */}
      {completedExperiments.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Experiments
          </h4>
          <div className="space-y-1.5">
            {completedExperiments.slice(-5).reverse().map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={exp.status} />
                  <span className="truncate text-foreground">
                    {exp.hypothesis.description}
                  </span>
                </div>
                <span className={`ml-2 whitespace-nowrap font-mono ${
                  (exp.comparison?.delta ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {formatDelta(exp.comparison?.delta ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost summary */}
      {costSummary && costSummary.callCount > 0 && (
        <div className="border-t border-white/5 pt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>LLM Cost: ${costSummary.totalCostUsd.toFixed(4)}</span>
            <span>{costSummary.callCount} API calls</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.02] p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "kept" ? "bg-green-500" : "bg-red-500";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

function SourceBadge({ source }: { source: string }) {
  const label = source.replace(/-/g, " ");
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  const styles: Record<string, string> = {
    high: "bg-red-500/10 text-red-400",
    medium: "bg-amber-500/10 text-amber-400",
    low: "bg-blue-500/10 text-blue-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[impact] ?? styles.low}`}>
      {impact}
    </span>
  );
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(3)}`;
}
