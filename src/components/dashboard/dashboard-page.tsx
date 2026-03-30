"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  HealthHero,
  MemoryOverview,
  SessionHistory,
  VerificationStatus,
  GraduationPipeline,
} from "./hermes";

type PersonaRow = {
  id: string;
  name: string;
};

type HermesData = {
  metrics: {
    activeMemories: number;
    memoriesByType: Record<string, number>;
    memoriesByScope: Record<string, number>;
    avgRelevance: number;
    sessionsLast7Days: number;
    avgSessionDurationMs: number;
    topTags: { tag: string; count: number }[];
    healthScore: number;
  };
  trend: {
    sessionCount: number;
    avgCorrections: number;
    recentCorrections: number;
    direction: "improving" | "stable" | "degrading";
    recurringViolations: string[];
    summary: string;
  } | null;
  scorecards: Array<{
    date: string;
    correctionsReceived: number;
    rulesChecked: number;
    rulesPassed: number;
    rulesFailed: number;
    memoriesCreated: number;
  }>;
  graduation: {
    candidates: Array<{
      memoryId: string;
      content: string;
      confidence: string;
      relevance: number;
      correctionCount: number;
      hasVerify: boolean;
      reason: string;
    }>;
    alreadyGraduated: number;
  };
  confidenceCounts: Record<string, number>;
  verification: {
    checked: number;
    passed: number;
    failed: number;
    skipped: number;
    violations: { memoryContent: string; detail: string }[];
  };
  feedback: {
    totalSignals: number;
    averageScore: number;
  };
};

const WIZARD_LINKS = [
  {
    icon: "\u{1F3AC}",
    label: "Persona Studio",
    href: "/studio",
    description: "Create AI advisors with optional deep expert & agent capabilities",
  },
  {
    icon: "\u{1F4E6}",
    label: "Launch Kit",
    href: "/launch-kit",
    description: "Full project planning with persona team and tech stack",
  },
  {
    icon: "\u{1F3A8}",
    label: "Design-to-Ship",
    href: "/design-to-ship",
    description: "From project brief through design system to shipping",
  },
  {
    icon: "\u{1F4BB}",
    label: "VibeCode",
    href: "/vibecode",
    description: "Generate project scaffolds with persona-driven CLAUDE.md",
  },
  {
    icon: "\u{1F50D}",
    label: "Auto-Research",
    href: "/consult",
    description: "Score and evaluate your personas with AI analysis",
  },
];

const DOC_TYPES = [
  { label: "System Prompts", description: "Persona consultation prompts" },
  { label: "Whitepapers", description: "Project documentation from Launch Kit" },
  { label: "Design Systems", description: "Color, typography, and spacing specs" },
  { label: "Scaffold Specs", description: "Project structure from VibeCode" },
  { label: "Evaluation Reports", description: "Auto-Research persona scores" },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [personaCount, setPersonaCount] = React.useState<number | null>(null);
  const [hermes, setHermes] = React.useState<HermesData | null>(null);

  React.useEffect(() => {
    if (!user) return;
    fetch("/api/personas")
      .then((r) => r.json())
      .then((data) => setPersonaCount(data.personas?.length ?? 0))
      .catch(() => setPersonaCount(0));
    fetch("/api/hermes/dashboard")
      .then((r) => r.json())
      .then((data) => setHermes(data))
      .catch(() => {});
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Docs Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your knowledge hub — personas, documents, and quick access to every tool.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <div className="text-2xl font-bold text-foreground">
            {personaCount === null ? "..." : personaCount}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Personas Saved</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <div className="text-2xl font-bold text-foreground">5</div>
          <div className="mt-1 text-xs text-muted-foreground">Tools Available</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{DOC_TYPES.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">Document Types</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {WIZARD_LINKS.map((w) => (
            <Link
              key={w.href}
              href={w.href}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{w.icon}</span>
                <div>
                  <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {w.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {w.description}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Document Types */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Document Types
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {DOC_TYPES.map((d) => (
            <div
              key={d.label}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="text-sm font-medium text-foreground">{d.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{d.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hermes Self-Evolution */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Hermes — Self-Evolution
        </h2>

        {!hermes && (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`rounded-xl border border-white/10 bg-white/[0.02] p-5 animate-pulse ${i === 1 ? "col-span-2" : ""}`}
              >
                <div className="h-4 w-32 rounded bg-white/5 mb-4" />
                <div className="h-8 w-20 rounded bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {hermes && (
          <div className="space-y-4">
            {/* Hero — full width */}
            <HealthHero
              healthScore={hermes.metrics.healthScore}
              trend={hermes.trend}
              activeMemories={hermes.metrics.activeMemories}
            />

            {/* Row 2 — Memory Overview + Session History */}
            <div className="grid grid-cols-2 gap-4">
              <MemoryOverview
                memoriesByType={hermes.metrics.memoriesByType}
                avgRelevance={hermes.metrics.avgRelevance}
                activeMemories={hermes.metrics.activeMemories}
                confidenceCounts={hermes.confidenceCounts}
                topTags={hermes.metrics.topTags}
              />
              <SessionHistory scorecards={hermes.scorecards} />
            </div>

            {/* Row 3 — Verification + Graduation */}
            <div className="grid grid-cols-2 gap-4">
              <VerificationStatus
                checked={hermes.verification.checked}
                passed={hermes.verification.passed}
                failed={hermes.verification.failed}
                skipped={hermes.verification.skipped}
                violations={hermes.verification.violations}
              />
              <GraduationPipeline
                candidates={hermes.graduation.candidates}
                alreadyGraduated={hermes.graduation.alreadyGraduated}
                confidenceCounts={hermes.confidenceCounts}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
