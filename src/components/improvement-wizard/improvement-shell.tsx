"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { StepTeam } from "./step-team";
import { StepApp } from "./step-app";
import { StepBenchmark } from "./step-benchmark";
import { StepSelfScore } from "./step-self-score";
import { StepImprove } from "./step-improve";
import {
  EMPTY_IMPROVEMENT_DRAFT,
  type ImprovementDraft,
} from "@/lib/improvement";
import { FlowCanvas, AIFlowChat } from "@supra/builder";
import type { FlowTemplate } from "@supra/builder";
import type { Node, Edge } from "@xyflow/react";

const STEPS = [
  { label: "Team", subtitle: "Define your AI panel", flowCategory: "team" as const },
  { label: "App", subtitle: "Describe what you're building", flowCategory: "app" as const },
  { label: "Benchmark", subtitle: "Score the competition", flowCategory: "benchmark" as const },
  { label: "Self-Score", subtitle: "Rate your own app", flowCategory: "scoring" as const },
  { label: "Improve", subtitle: "Close the gap", flowCategory: "improve" as const },
];

type ViewMode = "form" | "canvas";

const DRAFT_STORAGE_KEY = "athena_draft";
const STEP_STORAGE_KEY = "athena_step";

function loadSavedDraft(): ImprovementDraft | null {
  try {
    const stored = typeof window !== "undefined" ? localStorage.getItem(DRAFT_STORAGE_KEY) : null;
    if (stored) return JSON.parse(stored) as ImprovementDraft;
  } catch { /* ignore */ }
  return null;
}

export function ImprovementShell() {
  const [step, setStep] = React.useState(() => {
    try {
      const s = typeof window !== "undefined" ? localStorage.getItem(STEP_STORAGE_KEY) : null;
      return s ? parseInt(s, 10) : 0;
    } catch { return 0; }
  });
  const [draft, setDraft] = React.useState<ImprovementDraft>(
    () => loadSavedDraft() ?? EMPTY_IMPROVEMENT_DRAFT
  );
  const [direction, setDirection] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<ViewMode>("form");
  const [canvasNodes, setCanvasNodes] = React.useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = React.useState<Edge[]>([]);

  // Persist draft and step to localStorage (skip initial hydration write)
  const hasHydrated = React.useRef(false);
  React.useEffect(() => {
    if (!hasHydrated.current) { hasHydrated.current = true; return; }
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }, [draft]);

  React.useEffect(() => {
    try { localStorage.setItem(STEP_STORAGE_KEY, String(step)); } catch { /* ignore */ }
  }, [step]);

  function patchDraft(patch: Partial<ImprovementDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function goNext() {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(step + 1);
    }
  }

  function goBack() {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
    }
  }

  function reset() {
    if (!window.confirm("Start over? All progress will be lost.")) return;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(STEP_STORAGE_KEY);
    setDraft(EMPTY_IMPROVEMENT_DRAFT);
    setStep(0);
    setViewMode("form");
  }

  function handleApplyFlow(nodes: Node[], edges: Edge[]) {
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
  }

  const canProceed =
    step === 0
      ? draft.team.length === 5 &&
        draft.team.every((m) => m.name && m.role && m.expertise.length > 0)
      : step === 1
        ? Boolean(draft.app.name && draft.app.description && draft.app.current_state)
        : step === 2
          ? draft.referenceApps.length === 3 &&
            draft.referenceApps.every(
              (r) => r.name && r.scores.some((c) => c.subCriteria.some((sc) => sc.score > 0))
            )
          : step === 3
            ? draft.selfScores.some((c) =>
                c.subCriteria.some((sc) => sc.score > 0)
              )
            : true;

  const lastStep = STEPS.length - 1;
  const isWide = step >= 2 || viewMode === "canvas";
  const currentFlowCategory = STEPS[step].flowCategory;

  return (
    <div
      className={`mx-auto px-4 py-8 ${isWide ? "max-w-5xl" : "max-w-2xl"}`}
    >
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Improvement Loop
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Benchmark, score, and iteratively improve your app with AI
            personas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode("form")}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                viewMode === "form"
                  ? "bg-primary/15 text-primary"
                  : "bg-white/[0.02] text-muted-foreground hover:bg-white/5"
              }`}
            >
              Form View
            </button>
            <button
              onClick={() => setViewMode("canvas")}
              className={`px-3 py-1.5 text-xs font-medium transition border-l border-white/10 ${
                viewMode === "canvas"
                  ? "bg-primary/15 text-primary"
                  : "bg-white/[0.02] text-muted-foreground hover:bg-white/5"
              }`}
            >
              Canvas View
            </button>
          </div>
          {(draft.app.name || step > 0) && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Start over
            </Button>
          )}
        </div>
      </div>

      {/* Progress — mobile compact */}
      <div className="mb-8 flex items-center justify-between sm:hidden">
        <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </Button>
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${step < STEPS.length - 1 ? "bg-primary/20 text-primary" : "bg-primary text-primary-foreground"}`}>
            {step + 1}
          </span>
          <div className="text-sm font-medium text-foreground">
            {STEPS[step].label}
            <span className="text-xs text-muted-foreground ml-1">of {STEPS.length}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={goNext} disabled={step >= STEPS.length - 1}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
        </Button>
      </div>

      {/* Progress — desktop full pills */}
      <div className="mb-8 hidden sm:flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <button
              disabled={i > step}
              aria-disabled={i > step}
              onClick={() => {
                if (i <= step) {
                  setDirection(i > step ? 1 : -1);
                  setStep(i);
                }
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${i <= step ? "cursor-pointer" : "cursor-not-allowed"} ${
                i === step
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : i < step
                    ? "bg-white/5 text-foreground border border-white/10"
                    : "bg-white/[0.02] text-muted-foreground border border-white/5"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary"
                      : "bg-white/5 text-muted-foreground"
                }`}
              >
                {i < step ? "\u2713" : i + 1}
              </span>
              <div className="text-left">
                <div>{s.label}</div>
                {i === step && (
                  <div className="text-[9px] text-muted-foreground font-normal">
                    {s.subtitle}
                  </div>
                )}
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 ${i < step ? "bg-primary/30" : "bg-white/10"}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      {viewMode === "canvas" ? (
        <div className="relative rounded-xl border border-white/10 overflow-hidden" style={{ height: "600px" }}>
          <FlowCanvas
            category={currentFlowCategory}
            onNodesChange={setCanvasNodes}
            onEdgesChange={setCanvasEdges}
          />
          <AIFlowChat
            currentNodes={canvasNodes}
            currentEdges={canvasEdges}
            category={currentFlowCategory}
            onApplyFlow={handleApplyFlow}
          />
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ x: direction * 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -30, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && <StepTeam draft={draft} onChange={patchDraft} />}
            {step === 1 && <StepApp draft={draft} onChange={patchDraft} />}
            {step === 2 && <StepBenchmark draft={draft} onChange={patchDraft} />}
            {step === 3 && (
              <StepSelfScore draft={draft} onChange={patchDraft} />
            )}
            {step === 4 && <StepImprove draft={draft} onChange={patchDraft} />}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Navigation */}
      {step < lastStep && (
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={goBack} disabled={step === 0}>
            Back
          </Button>
          <Button onClick={goNext} disabled={!canProceed}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
