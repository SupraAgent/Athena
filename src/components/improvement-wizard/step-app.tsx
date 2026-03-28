"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StepHint } from "@/components/ui/step-hint";
import type { ImprovementDraft, AppBrief } from "@/lib/improvement";

type Props = {
  draft: ImprovementDraft;
  onChange: (patch: Partial<ImprovementDraft>) => void;
};

const STATES = ["MVP", "Beta", "Production"] as const;

export function StepApp({ draft, onChange }: Props) {
  function patchApp(patch: Partial<AppBrief>) {
    onChange({ app: { ...draft.app, ...patch } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Define Your App
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell the team what you&apos;re building so they can benchmark and
          improve it.
        </p>
      </div>

      <StepHint title="How this is used">
        Your app description and tech stack are sent to the AI team in the next steps.
        The more specific you are, the more relevant their scoring and improvement suggestions will be.
        The <strong className="text-foreground">current state</strong> (MVP, Beta, Production) affects
        how aggressively the team prioritizes polish vs. functionality.
      </StepHint>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            App Name
          </label>
          <Input
            value={draft.app.name}
            onChange={(e) => patchApp({ name: e.target.value })}
            placeholder="e.g. MyApp"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Description
          </label>
          <Textarea
            value={draft.app.description}
            onChange={(e) => patchApp({ description: e.target.value })}
            placeholder="One-paragraph description of what your app does"
            className="min-h-[100px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Target Users
            </label>
            <Input
              value={draft.app.target_users}
              onChange={(e) => patchApp({ target_users: e.target.value })}
              placeholder="Who uses it?"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Core Value
            </label>
            <Input
              value={draft.app.core_value}
              onChange={(e) => patchApp({ core_value: e.target.value })}
              placeholder="Why they use it vs alternatives"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Tech Stack
          </label>
          <Input
            value={draft.app.tech_stack}
            onChange={(e) => patchApp({ tech_stack: e.target.value })}
            placeholder="e.g. Next.js, Supabase, Vercel"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Current State
          </label>
          <div className="flex gap-2">
            {STATES.map((state) => (
              <button
                key={state}
                onClick={() => patchApp({ current_state: state })}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition cursor-pointer ${
                  draft.app.current_state === state
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
