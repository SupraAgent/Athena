"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, TOOLTIP_CONTENT_STYLE, CHART_DEFAULTS } from "@/lib/chart-config";

type Scorecard = {
  date: string;
  correctionsReceived: number;
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  memoriesCreated: number;
};

export function SessionHistory({ scorecards }: { scorecards: Scorecard[] }) {
  if (scorecards.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Session History
        </h3>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No sessions recorded yet. Session data appears after your first session with Hermes active.
        </p>
      </div>
    );
  }

  const data = scorecards.map((s, i) => ({
    session: i + 1,
    corrections: s.correctionsReceived,
    rulesPassed: s.rulesPassed,
    rulesFailed: s.rulesFailed,
    memoriesCreated: s.memoriesCreated,
  }));

  const totalCorrections = scorecards.reduce((s, c) => s + c.correctionsReceived, 0);
  const avgCorrections = scorecards.length > 0
    ? (totalCorrections / scorecards.length).toFixed(1)
    : "0";
  const totalRulesChecked = scorecards.reduce((s, c) => s + c.rulesChecked, 0);
  const totalRulesPassed = scorecards.reduce((s, c) => s + c.rulesPassed, 0);
  const passRate = totalRulesChecked > 0
    ? ((totalRulesPassed / totalRulesChecked) * 100).toFixed(0)
    : "—";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Session History
      </h3>

      {/* Chart */}
      <div className="mt-4 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="corrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="session"
              tick={{ fill: CHART_COLORS.axisText, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={20}
            />
            <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} />
            <Area
              type="monotone"
              dataKey="corrections"
              stroke={CHART_COLORS.primary}
              fill="url(#corrGrad)"
              {...CHART_DEFAULTS}
              name="Corrections"
            />
            <Area
              type="monotone"
              dataKey="rulesFailed"
              stroke={CHART_COLORS.failed}
              fill="none"
              {...CHART_DEFAULTS}
              name="Rules Failed"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-foreground">{scorecards.length}</div>
          <div className="text-[10px] text-muted-foreground">Sessions</div>
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{avgCorrections}</div>
          <div className="text-[10px] text-muted-foreground">Avg Corrections</div>
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{passRate}%</div>
          <div className="text-[10px] text-muted-foreground">Rule Pass Rate</div>
        </div>
      </div>
    </div>
  );
}
