"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  simulateRound,
  applyRound,
  calcWeightedOverall,
  generateCPOReaction,
  type ImprovementDraft,
  type CPOPersona,
  type Round,
} from "@/lib/improvement";
import {
  generateAthenaFiles,
  generateCommitMessage,
} from "@/lib/supraloop-config";
import { LoadingProgress } from "@/components/ui/loading-progress";
import { generateGapWorkflow } from "@supra/builder";

type Props = {
  draft: ImprovementDraft;
  onChange: (patch: Partial<ImprovementDraft>) => void;
  /** Callback to push a generated workflow onto the builder canvas */
  onGenerateWorkflow?: (workflow: { nodes: import("@xyflow/react").Node[]; edges: import("@xyflow/react").Edge[] }) => void;
};

type AIBrief = {
  decision: string;
  rationale: string;
  implementationSteps: string[];
  acceptanceCriteria: string[];
  estimatedScoreImpact: number;
  filesLikelyChanged: string[];
};

async function fetchAIBrief(
  apiKey: string,
  draft: ImprovementDraft,
  gapItem: { category: string; yourScore: number; bestRef: number; gap: number }
): Promise<AIBrief | null> {
  const refApp = draft.referenceApps.find((a) => {
    const cat = a.scores.find((s) => s.name === gapItem.category);
    return cat && cat.avg === gapItem.bestRef;
  }) ?? draft.referenceApps[0];

  const whyLeaderWins = refApp?.cpo
    ? `${refApp.cpo.philosophy} — strengths: ${refApp.cpo.strengths.join(", ")}`
    : "Strong execution across the board";

  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        appBrief: {
          name: draft.app.name,
          description: draft.app.description,
          tech_stack: draft.app.tech_stack,
        },
        referenceApp: { name: refApp?.name ?? "Leader", why: refApp?.why ?? "" },
        categories: [],
        mode: "improvement_brief",
        category: gapItem.category,
        currentScore: gapItem.yourScore,
        targetScore: gapItem.bestRef,
        refScore: gapItem.bestRef,
        whyLeaderWins,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.brief ?? null;
  } catch {
    return null;
  }
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  MED: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  LOW: "border-green-500/30 bg-green-500/10 text-green-400",
};

export function StepImprove({ draft, onChange, onGenerateWorkflow }: Props) {
  const [running, setRunning] = React.useState(false);
  const runningRef = React.useRef(false);
  const [committing, setCommitting] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<{
    success: boolean;
    message: string;
    url?: string;
  } | null>(null);
  const [workflowGenerated, setWorkflowGenerated] = React.useState(false);

  // Collect CPOs from reference apps
  const cpos: CPOPersona[] = draft.referenceApps
    .map((app) => app.cpo)
    .filter((c): c is CPOPersona => c !== null);

  const maxGap = Math.max(...draft.gapAnalysis.map((g) => g.gap), 0);
  const allGapsClosed = maxGap < 10;
  const maxRoundsReached = draft.currentRound >= 20;
  const isDone = allGapsClosed || maxRoundsReached;
  const overall = calcWeightedOverall(draft.consensusScores);

  async function runRound() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);

    const apiKey = localStorage.getItem("athena_anthropic_key");

    // Find highest-gap category
    const sorted = [...draft.gapAnalysis].sort((a, b) => b.gap - a.gap);
    const topGap = sorted[0];

    if (apiKey && topGap) {
      // Try real AI brief
      const brief = await fetchAIBrief(apiKey, draft, topGap);
      if (brief) {
        // Build a round from the AI brief
        const bump = Math.max(5, Math.min(25, brief.estimatedScoreImpact));
        const overallBefore = calcWeightedOverall(draft.consensusScores);
        const catIdx = draft.consensusScores.findIndex(
          (c) => c.name === topGap.category
        );
        const updatedScores = draft.consensusScores.map((cat, i) => {
          if (i !== catIdx) return cat;
          return { ...cat, avg: Math.min(100, cat.avg + bump) };
        });
        const overallAfter = calcWeightedOverall(updatedScores);

        const aiRound: Round = {
          number: draft.rounds.length + 1,
          decision: brief.decision,
          proposedBy: "ai",
          proposedByRole: "AI Improvement Engine",
          vote: `${draft.team.length}/${draft.team.length} agree`,
          changes: brief.implementationSteps,
          categoryAffected: topGap.category,
          scoreBefore: topGap.yourScore,
          scoreAfter: Math.min(100, topGap.yourScore + bump),
          overallBefore,
          overallAfter,
          gapRemaining: Math.max(0, topGap.bestRef - (topGap.yourScore + bump)),
          rationale: brief.rationale,
          acceptanceCriteria: brief.acceptanceCriteria,
        };

        const updates = applyRound(draft, aiRound);
        onChange(updates);
        runningRef.current = false;
        setRunning(false);
        return;
      }
    }

    // Fallback to deterministic simulation
    await new Promise((r) => setTimeout(r, 600));
    const round = simulateRound(draft);
    const updates = applyRound(draft, round);
    onChange(updates);
    runningRef.current = false;
    setRunning(false);
  }

  async function saveToGitHub() {
    const stored = localStorage.getItem("athena_selected_repo");
    if (!stored) {
      setCommitResult({
        success: false,
        message: "No repo selected. Go to GitHub Repos to connect one.",
      });
      return;
    }

    let repo: { name: string; full_name: string; default_branch: string };
    try {
      repo = JSON.parse(stored);
    } catch {
      setCommitResult({ success: false, message: "Invalid repo data in localStorage. Please re-select your repo." });
      return;
    }
    const [owner, repoName] = repo.full_name.split("/");

    setCommitting(true);
    setCommitResult(null);

    const files = generateAthenaFiles(draft, draft.app.name);
    const message = generateCommitMessage(draft);

    try {
      const res = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo: repoName,
          branch: repo.default_branch,
          message,
          files,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCommitResult({
          success: false,
          message: data.error ?? "Commit failed",
        });
      } else {
        setCommitResult({
          success: true,
          message: data.message ?? "Committed successfully",
          url: data.url,
        });
      }
    } catch (err) {
      setCommitResult({
        success: false,
        message: err instanceof Error ? err.message : "Commit failed",
      });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Improvement Loop
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Press the button. Your AI team picks the highest-impact change,
          implements it, and re-scores. Repeat until the gap closes.
        </p>
      </div>

      {/* Current status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Overall Score</p>
          <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
            {overall}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Largest Gap</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
            {maxGap}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Rounds</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">
            {draft.currentRound}
            <span className="text-sm text-muted-foreground font-normal">
              /20
            </span>
          </p>
        </div>
      </div>

      {/* Gap summary */}
      <div className="flex flex-wrap gap-2">
        {[...draft.gapAnalysis]
          .sort((a, b) => b.gap - a.gap)
          .map((item) => (
            <Badge key={item.category} className={PRIORITY_COLORS[item.priority] ?? ""}>
              {item.category}: -{item.gap}
            </Badge>
          ))}
      </div>

      {/* CPO Panel */}
      {cpos.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Competitor CPOs watching your progress
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {cpos.map((cpo) => (
              <div key={cpo.company} className="flex items-center gap-2">
                <span className="text-sm">👤</span>
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {cpo.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    CPO at {cpo.company}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THE BUTTON */}
      <div className="flex flex-col items-center gap-3 py-4">
        {isDone ? (
          <div className="text-center space-y-3">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-3xl">
              {allGapsClosed ? "🎯" : "⏹️"}
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {allGapsClosed
                ? "Target Reached!"
                : "Maximum Rounds Reached"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {allGapsClosed
                ? `All gaps are below 10. Your app scores ${overall}/100 — competitive with the best in class.`
                : `After 20 rounds, your app scores ${overall}/100. Consider swapping personas or adjusting benchmarks.`}
            </p>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={runRound}
            disabled={running || isDone}
            className="px-8 py-6 text-base font-semibold shadow-[0_0_20px_rgba(12,206,107,0.2)]"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Team is working...
              </span>
            ) : (
              `Run Improvement Round ${draft.currentRound + 1}`
            )}
          </Button>
        )}
      </div>

      <LoadingProgress active={running} label="AI team analyzing gaps and generating improvements…" />

      {/* Round log */}
      {draft.rounds.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Round Log</h3>
          <div className="space-y-3">
            {[...draft.rounds].reverse().map((round) => {
              const isRetro = round.number % 5 === 0;
              return (
                <React.Fragment key={round.number}>
                  {isRetro && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-sm font-medium text-primary">
                        🔄 Team Retro — Round {round.number}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {round.overallAfter - draft.rounds[0].overallBefore > 15
                          ? "Good progress. Team is converging effectively. Continuing with current lineup."
                          : "Progress is slow. Consider swapping a persona or adjusting reference benchmarks."}
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 space-y-3">
                    {/* Round header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Round {round.number}
                      </span>
                      <Badge
                        className={
                          round.scoreAfter > round.scoreBefore
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-white/10 bg-white/5 text-muted-foreground"
                        }
                      >
                        +
                        {round.overallAfter - round.overallBefore} overall
                      </Badge>
                    </div>

                    {/* Decision */}
                    <p className="text-sm text-foreground">
                      <span className="text-muted-foreground">Decision: </span>
                      {round.decision}
                    </p>

                    {/* Implementation steps (from AI briefs) */}
                    {round.changes.length > 1 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Implementation Steps
                        </p>
                        <ul className="space-y-0.5">
                          {round.changes.map((change, ci) => (
                            <li key={ci} className="text-xs text-muted-foreground flex gap-1.5">
                              <span className="text-primary shrink-0">{ci + 1}.</span>
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Rationale */}
                    {round.rationale && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Rationale
                        </p>
                        <p className="text-xs text-muted-foreground italic">
                          {round.rationale}
                        </p>
                      </div>
                    )}

                    {/* Acceptance Criteria */}
                    {round.acceptanceCriteria && round.acceptanceCriteria.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Acceptance Criteria
                        </p>
                        <ul className="space-y-0.5">
                          {round.acceptanceCriteria.map((ac, aci) => (
                            <li key={aci} className="text-xs text-muted-foreground flex gap-1.5">
                              <span className="text-primary shrink-0">&#10003;</span>
                              {ac}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Proposed by */}
                    <p className="text-xs text-muted-foreground">
                      Proposed by {round.proposedByRole} — {round.categoryAffected}{" "}
                      gap was {round.gapRemaining + (round.scoreAfter - round.scoreBefore)}
                    </p>

                    {/* Vote */}
                    <p className="text-xs text-muted-foreground">
                      Vote: {round.vote}
                    </p>

                    {/* CPO Reactions */}
                    {cpos.length > 0 && (
                      <div className="space-y-2 border-t border-white/5 pt-2">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          CPO Reactions
                        </p>
                        {cpos.map((cpo) => (
                          <div
                            key={cpo.company}
                            className="flex gap-2 rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2"
                          >
                            <span className="text-xs shrink-0">👤</span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium text-muted-foreground">
                                {cpo.name} — CPO at {cpo.company}
                              </p>
                              <p className="text-xs text-foreground/80 italic mt-0.5">
                                {generateCPOReaction(cpo, round)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Score impact */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {round.categoryAffected}:
                      </span>
                      <span className="tabular-nums">
                        <span className="text-muted-foreground">
                          {round.scoreBefore}
                        </span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-foreground font-medium">
                          {round.scoreAfter}
                        </span>
                        <span className="ml-1 text-green-400 text-xs">
                          (+{round.scoreAfter - round.scoreBefore})
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">Overall:</span>
                      <span className="tabular-nums">
                        <span className="text-muted-foreground">
                          {round.overallBefore}
                        </span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-primary font-medium">
                          {round.overallAfter}
                        </span>
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Automate This Improvement — The Bridge */}
      {draft.rounds.length > 0 && draft.gapAnalysis.length > 0 && onGenerateWorkflow && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>👔</span> Automate This Improvement
              </p>
              <p className="text-xs text-muted-foreground">
                Generate a builder workflow from your top gaps — CPO personas review each fix automatically.
              </p>
            </div>
            <Button
              onClick={() => {
                const workflow = generateGapWorkflow({
                  gaps: draft.gapAnalysis,
                  cpos: cpos.map((c) => ({
                    name: c.name,
                    company: c.company,
                    philosophy: c.philosophy,
                    strengths: c.strengths,
                  })),
                  appName: draft.app.name,
                  maxGaps: 3,
                });
                if (workflow.nodes.length === 0) return;
                onGenerateWorkflow(workflow);
                setWorkflowGenerated(true);
              }}
              disabled={workflowGenerated}
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {workflowGenerated ? "Workflow Generated" : "Generate Workflow"}
            </Button>
          </div>
          {workflowGenerated && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-violet-400">
              Workflow added to the Builder canvas. Switch to the Builder tab to see it.
            </div>
          )}
        </div>
      )}

      {/* Save to GitHub */}
      {draft.rounds.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Save to GitHub
              </p>
              <p className="text-xs text-muted-foreground">
                Commit your .supraloop/ config, scores, and round logs to your
                repo.
              </p>
            </div>
            <Button
              onClick={saveToGitHub}
              disabled={committing}
              size="sm"
            >
              {committing ? "Committing..." : "Commit to Repo"}
            </Button>
          </div>
          {commitResult && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                commitResult.success
                  ? "border border-green-500/20 bg-green-500/5 text-green-400"
                  : "border border-red-500/20 bg-red-500/5 text-red-400"
              }`}
            >
              {commitResult.message}
              {commitResult.url && (
                <a
                  href={commitResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 underline"
                >
                  View commit
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rules */}
      <div className="rounded-xl border border-white/5 bg-white/[0.01] px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Rules</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• One change per round — isolates impact</li>
          <li>• Score can&apos;t go down — revert if it does</li>
          <li>• No persona can be overruled 3 rounds in a row</li>
          <li>• Retro every 5 rounds — swap personas if not converging</li>
          <li>• Max 20 rounds per session</li>
        </ul>
      </div>
    </div>
  );
}
