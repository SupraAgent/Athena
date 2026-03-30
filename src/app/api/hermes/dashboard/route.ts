import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as path from "path";

const HERMES_DIR = path.join(process.cwd(), ".athena", "hermes");

export async function GET() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const {
      getDashboardMetrics,
      loadScorecards,
      analyzeTrend,
      loadMemories,
      loadGraduationLog,
      getFeedbackSummary,
      queryEvents,
      listLogDates,
    } = await import("@supra/hermes");

    // Run data fetches in parallel
    const [metrics, scorecards, memories, graduationLog, feedback, logDates] =
      await Promise.all([
        getDashboardMetrics(HERMES_DIR),
        loadScorecards(HERMES_DIR),
        loadMemories(HERMES_DIR),
        loadGraduationLog(HERMES_DIR),
        getFeedbackSummary(HERMES_DIR),
        listLogDates(HERMES_DIR),
      ]);

    // Trend analysis
    const trend = analyzeTrend(scorecards);

    // Confidence breakdown (read-only — no side effects)
    const confidenceCounts: Record<string, number> = {
      observed: 0,
      confirmed: 0,
      graduated: 0,
    };
    const ruleTypes = new Set(["guidance", "decision", "pattern", "fact"]);
    const candidates: Array<{
      memoryId: string;
      content: string;
      confidence: string;
      relevance: number;
      correctionCount: number;
      hasVerify: boolean;
      reason: string;
    }> = [];
    let alreadyGraduated = 0;

    const handledIds = new Set(
      graduationLog
        .filter((e) => e.action === "graduated" || e.action === "rejected")
        .map((e) => e.memoryId)
    );

    for (const mem of memories) {
      const conf = mem.confidence ?? "observed";
      if (conf in confidenceCounts) {
        confidenceCounts[conf]++;
      }

      if (!ruleTypes.has(mem.type)) continue;
      if (conf === "graduated") {
        alreadyGraduated++;
        continue;
      }

      // Read-only candidate detection (matches graduation.ts logic but no writes)
      if (
        conf === "confirmed" &&
        !handledIds.has(mem.id) &&
        mem.relevance >= 0.9 &&
        scorecards.length >= 10 &&
        mem.verify
      ) {
        const parts: string[] = [];
        if ((mem.correctionCount ?? 0) >= 2) parts.push(`corrected ${mem.correctionCount}x`);
        parts.push(`relevance ${mem.relevance}`);
        if (mem.verify) parts.push("has verify check");
        parts.push(`${scorecards.length} sessions`);

        candidates.push({
          memoryId: mem.id,
          content: mem.content,
          confidence: conf,
          relevance: mem.relevance,
          correctionCount: mem.correctionCount ?? 0,
          hasVerify: true,
          reason: parts.join(", "),
        });
      }
    }

    // Recent verification sweep from event log
    let verification = { checked: 0, passed: 0, failed: 0, skipped: 0, violations: [] as Array<{ memoryContent: string; detail: string }> };
    if (logDates.length > 0) {
      const recentDate = logDates[0];
      const events = await queryEvents(HERMES_DIR, { date: recentDate });
      const sweeps = events.filter((e) => e.event === "verification.sweep");
      const lastSweep = sweeps[sweeps.length - 1];
      if (lastSweep?.payload) {
        verification.checked = (lastSweep.payload.checked as number) ?? 0;
        verification.passed = (lastSweep.payload.passed as number) ?? 0;
        verification.failed = (lastSweep.payload.failed as number) ?? 0;
        verification.skipped = (lastSweep.payload.skipped as number) ?? 0;
      }
      const failures = events.filter((e) => e.event === "verification.failed");
      verification.violations = failures.slice(-5).map((e) => ({
        memoryContent: String(e.payload?.memoryId ?? "").slice(0, 80),
        detail: String(e.payload?.detail ?? ""),
      }));
    }

    // Recent events (last 20)
    const recentEvents: Array<{ timestamp: string; event: string; detail: string }> = [];
    for (const date of logDates.slice(0, 3)) {
      const events = await queryEvents(HERMES_DIR, { date });
      for (const e of events) {
        recentEvents.push({
          timestamp: e.timestamp,
          event: e.event,
          detail: JSON.stringify(e.payload).slice(0, 100),
        });
      }
      if (recentEvents.length >= 20) break;
    }
    recentEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return NextResponse.json({
      metrics,
      trend,
      scorecards: scorecards.slice(-30), // Last 30 for chart
      graduation: { candidates, alreadyGraduated },
      confidenceCounts,
      verification,
      feedback,
      recentEvents: recentEvents.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({
      metrics: {
        activeMemories: 0,
        memoriesByType: {},
        memoriesByScope: {},
        avgRelevance: 0,
        sessionsLast7Days: 0,
        avgSessionDurationMs: 0,
        topTags: [],
        healthScore: 0,
      },
      trend: null,
      scorecards: [],
      graduation: { candidates: [], alreadyGraduated: 0 },
      confidenceCounts: { observed: 0, confirmed: 0, graduated: 0 },
      verification: { checked: 0, passed: 0, failed: 0, skipped: 0, violations: [] },
      feedback: { totalSignals: 0, averageScore: 0, topMemories: [], bottomMemories: [] },
      recentEvents: [],
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
