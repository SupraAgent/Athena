"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoringGrid } from "./scoring-grid";
import {
  createEmptyScores,
  recalcAverages,
  generateCPO,
  calcWeightedOverall,
  SCORING_CATEGORIES,
  type ImprovementDraft,
  type ReferenceApp,
  type CategoryScore,
  type CPOPersona,
} from "@/lib/improvement";

type Props = {
  draft: ImprovementDraft;
  onChange: (patch: Partial<ImprovementDraft>) => void;
};

async function fetchAICPO(
  apiKey: string,
  referenceApp: { name: string; why: string }
): Promise<CPOPersona | null> {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        referenceApp,
        mode: "generate_cpo",
        appBrief: { name: "", description: "", tech_stack: "" },
        categories: [],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.cpo ?? null;
  } catch {
    return null;
  }
}

async function fetchAIScores(
  apiKey: string,
  appBrief: { name: string; description: string; tech_stack: string },
  referenceApp: { name: string; why: string }
): Promise<CategoryScore[] | null> {
  try {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        appBrief,
        referenceApp,
        categories: SCORING_CATEGORIES,
        mode: "score_app",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result?.scores) return null;
    // Map AI scores to our CategoryScore format
    return SCORING_CATEGORIES.map((cat) => {
      const aiCat = data.result.scores.find(
        (s: { category: string }) => s.category === cat.name
      );
      if (!aiCat) return { name: cat.name, weight: cat.weight, subCriteria: cat.subCriteria.map((sc) => ({ name: sc, score: 0 })), avg: 0 };
      const subCriteria = cat.subCriteria.map((scName) => {
        const aiSc = aiCat.subCriteria?.find((s: { name: string }) => s.name === scName);
        return { name: scName, score: Math.max(0, Math.min(100, aiSc?.score ?? 0)) };
      });
      const avg = Math.round(subCriteria.reduce((s, sc) => s + sc.score, 0) / subCriteria.length);
      return { name: cat.name, weight: cat.weight, subCriteria, avg };
    });
  } catch {
    return null;
  }
}

export function StepBenchmark({ draft, onChange }: Props) {
  const [activeTab, setActiveTab] = React.useState(0);
  const [generatingCPO, setGeneratingCPO] = React.useState<number | null>(null);
  const [scoringWithAI, setScoringWithAI] = React.useState<number | null>(null);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const hasApiKey = typeof window !== "undefined" && !!localStorage.getItem("athena_anthropic_key");

  // Backfill slots if loaded from old localStorage format (EMPTY_DRAFT now provides 3)
  React.useEffect(() => {
    if (draft.referenceApps.length >= 3) return;
    if (draft.referenceApps.length < 3) {
      const apps: ReferenceApp[] = [];
      for (let i = 0; i < 3; i++) {
        apps.push(
          draft.referenceApps[i] ?? {
            name: "",
            why: "",
            scores: createEmptyScores(),
            cpo: null,
          }
        );
      }
      onChange({ referenceApps: apps });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchApp(index: number, patch: Partial<ReferenceApp>) {
    const next = [...draft.referenceApps];
    next[index] = { ...next[index], ...patch };
    onChange({ referenceApps: next });
  }

  async function handleGenerateCPO(appIndex: number) {
    const app = draft.referenceApps[appIndex];
    if (!app?.name) return;

    const apiKey = localStorage.getItem("athena_anthropic_key");
    if (!apiKey) {
      // Fallback to deterministic generation
      const cpo = generateCPO(app);
      patchApp(appIndex, { cpo });
      return;
    }

    setGeneratingCPO(appIndex);
    const cpo = await fetchAICPO(apiKey, {
      name: app.name,
      why: app.why,
    });
    if (cpo) {
      patchApp(appIndex, { cpo });
    } else {
      // Fallback to deterministic
      patchApp(appIndex, { cpo: generateCPO(app) });
    }
    setGeneratingCPO(null);
  }

  async function handleAIScore(appIndex: number) {
    const app = draft.referenceApps[appIndex];
    if (!app?.name) return;
    const apiKey = localStorage.getItem("athena_anthropic_key");
    if (!apiKey) return;

    setScoringWithAI(appIndex);
    const scores = await fetchAIScores(
      apiKey,
      { name: draft.app.name, description: draft.app.description, tech_stack: draft.app.tech_stack },
      { name: app.name, why: app.why }
    );
    if (scores) {
      const cpo = app.cpo || generateCPO({ ...app, scores });
      patchApp(appIndex, { scores, cpo });
    }
    setScoringWithAI(null);
  }

  function handleScoreChange(
    appIndex: number,
    catIndex: number,
    subIndex: number,
    value: number
  ) {
    const app = draft.referenceApps[appIndex];
    if (!app) return;

    const newScores: CategoryScore[] = app.scores.map((cat, ci) => {
      if (ci !== catIndex) return cat;
      const subCriteria = cat.subCriteria.map((sc, si) =>
        si === subIndex ? { ...sc, score: value } : sc
      );
      return { ...cat, subCriteria };
    });

    const recalced = recalcAverages(newScores);

    // Auto-generate CPO (deterministic) when app has name and scores
    // User can click "Generate with AI" for real CPO
    const hasScores = recalced.some((c) => c.avg > 0);
    const appWithScores = { ...app, scores: recalced };
    const cpo =
      hasScores && app.name && !app.cpo ? generateCPO(appWithScores) : app.cpo;

    patchApp(appIndex, { scores: recalced, cpo });
  }

  const apps = draft.referenceApps;
  const activeApp = apps[activeTab];
  const activeOverall = activeApp ? calcWeightedOverall(activeApp.scores) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Benchmark Reference Apps
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick 3 apps that represent the best in your category. Score them
          across 8 dimensions — a CPO persona will be auto-generated for each.
        </p>
      </div>

      {/* Reference app names */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Input
              value={apps[i]?.name ?? ""}
              onChange={(e) => patchApp(i, { name: e.target.value })}
              placeholder={`App ${i + 1} name`}
            />
            <Input
              value={apps[i]?.why ?? ""}
              onChange={(e) => patchApp(i, { why: e.target.value })}
              placeholder="Why this app?"
              className="h-8 text-xs"
            />
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1"
        role="tablist"
        aria-label="Reference apps"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); const next = (activeTab + 1) % 3; setActiveTab(next); tabRefs.current[next]?.focus(); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); const next = (activeTab + 2) % 3; setActiveTab(next); tabRefs.current[next]?.focus(); }
        }}
      >
        {[0, 1, 2].map((i) => (
          <Button
            key={i}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab" aria-selected={activeTab === i} aria-controls={`benchmark-panel-${i}`}
            tabIndex={activeTab === i ? 0 : -1}
            variant={activeTab === i ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(i)}
            className="flex-1"
          >
            <span className="truncate">
              {apps[i]?.name || `App ${i + 1}`}
            </span>
            {apps[i]?.cpo && (
              <span className="ml-1.5 text-[10px] opacity-60">
                CPO
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Scoring grid for active app */}
      {activeApp && (
        <div id={`benchmark-panel-${activeTab}`} role="tabpanel" aria-label={activeApp.name || `App ${activeTab + 1}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Score manually below, or let AI score automatically.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAIScore(activeTab)}
              disabled={scoringWithAI === activeTab || !activeApp.name || !hasApiKey}
              className="h-7 text-xs"
            >
              {scoringWithAI === activeTab ? "Scoring with AI..." : "AI Score This App"}
            </Button>
          </div>
          <ScoringGrid
            scores={activeApp.scores}
            onScoreChange={(catIdx, subIdx, value) =>
              handleScoreChange(activeTab, catIdx, subIdx, value)
            }
          />
        </div>
      )}

      {/* CPO Persona Card — auto-generated from scores */}
      {activeApp?.cpo && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">👤</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {activeApp.cpo.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activeApp.cpo.title} at {activeApp.cpo.company}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleGenerateCPO(activeTab)}
                disabled={generatingCPO === activeTab}
                className="h-6 px-2 text-[10px]"
              >
                {generatingCPO === activeTab ? "Generating..." : "Regenerate with AI"}
              </Button>
              <Badge className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                {generatingCPO === activeTab ? "AI..." : "CPO"}
              </Badge>
            </div>
          </div>

          {/* Philosophy */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Product Philosophy
            </p>
            <p className="text-sm text-foreground italic">
              &ldquo;{activeApp.cpo.philosophy}&rdquo;
            </p>
          </div>

          {/* Strengths & Blind Spots side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Strengths
              </p>
              <ul className="space-y-1">
                {activeApp.cpo.strengths.map((s) => (
                  <li key={s} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-green-400 mt-0.5">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Blind Spots
              </p>
              <ul className="space-y-1">
                {activeApp.cpo.blindSpots.map((s) => (
                  <li key={s} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-orange-400 mt-0.5">-</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Decision style & Iconic move */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Decision Style
              </p>
              <p className="text-xs text-muted-foreground">
                {activeApp.cpo.decisionStyle}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Iconic Move
              </p>
              <p className="text-xs text-muted-foreground">
                {activeApp.cpo.iconicMove}
              </p>
            </div>
          </div>

          {/* Score context */}
          <div className="flex items-center gap-2 border-t border-white/5 pt-3">
            <span className="text-xs text-muted-foreground">
              This CPO&apos;s product scores
            </span>
            <span className="text-sm font-bold text-primary tabular-nums">
              {activeOverall}/100
            </span>
            <span className="text-xs text-muted-foreground">
              weighted overall — they&apos;ll challenge your improvements in Step 5.
            </span>
          </div>
        </div>
      )}

      {/* CPO summary across all apps */}
      {apps.filter((a) => a?.cpo).length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Your Competitive CPO Panel
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {apps.map((app, i) =>
              app?.cpo ? (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                    activeTab === i
                      ? "border-primary/30 bg-primary/5"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground truncate">
                    {app.cpo.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    CPO at {app.cpo.company}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                    {app.cpo.strengths[0]}
                  </p>
                </button>
              ) : (
                <div
                  key={i}
                  className="rounded-xl border border-dashed border-white/10 p-3 text-center"
                >
                  <p className="text-xs text-muted-foreground">
                    Score {app?.name || `App ${i + 1}`} to generate CPO
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
