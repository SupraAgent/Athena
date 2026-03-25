"use client";

import * as React from "react";
import type { AISuggestion } from "../core/types";

export interface AISuggestionsPanelProps {
  suggestions: AISuggestion[];
  onDismiss?: (id: string) => void;
  onApplyAll?: () => void;
}

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  add_node: { icon: "+", color: "text-emerald-400" },
  add_edge: { icon: "\u2192", color: "text-blue-400" },
  modify_config: { icon: "\u2699", color: "text-yellow-400" },
  add_error_handling: { icon: "\u26A0", color: "text-orange-400" },
  optimize: { icon: "\u26A1", color: "text-purple-400" },
};

const TYPE_LABELS: Record<string, string> = {
  add_node: "Nodes",
  add_edge: "Connections",
  modify_config: "Configuration",
  add_error_handling: "Error Handling",
  optimize: "Optimization",
};

export function AISuggestionsPanel({
  suggestions,
  onDismiss,
  onApplyAll,
}: AISuggestionsPanelProps) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.id));

  if (visibleSuggestions.length === 0) return null;

  // Group by type
  const grouped = new Map<string, AISuggestion[]>();
  for (const suggestion of visibleSuggestions) {
    const existing = grouped.get(suggestion.type) ?? [];
    existing.push(suggestion);
    grouped.set(suggestion.type, existing);
  }

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  }

  function handleApplyAll() {
    for (const suggestion of visibleSuggestions) {
      suggestion.apply();
    }
    onApplyAll?.();
  }

  return (
    <div className="w-72 shrink-0 border-l border-white/10 bg-white/[0.02] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white/[0.02] backdrop-blur-sm border-b border-white/10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="h-3.5 w-3.5 text-purple-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z" />
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 14v4" />
            </svg>
            <p className="text-xs font-semibold text-foreground">
              Suggestions
            </p>
            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">
              {visibleSuggestions.length}
            </span>
          </div>
        </div>

        {visibleSuggestions.length > 1 && (
          <button
            type="button"
            onClick={handleApplyAll}
            className="mt-2 w-full text-[10px] px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
          >
            Apply All ({visibleSuggestions.length})
          </button>
        )}
      </div>

      {/* Grouped suggestions */}
      <div className="p-3 space-y-4">
        {Array.from(grouped.entries()).map(([type, items]) => {
          const typeInfo = TYPE_ICONS[type] ?? {
            icon: "?",
            color: "text-muted-foreground",
          };
          const label = TYPE_LABELS[type] ?? type;

          return (
            <div key={type} className="space-y-2">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${typeInfo.color}`}
              >
                {label}
              </p>

              {items.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  typeInfo={typeInfo}
                  onDismiss={() => handleDismiss(suggestion.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  typeInfo,
  onDismiss,
}: {
  suggestion: AISuggestion;
  typeInfo: { icon: string; color: string };
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <span className={`text-sm ${typeInfo.color} shrink-0 leading-none mt-0.5`}>
          {typeInfo.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground leading-tight">
            {suggestion.title}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            {suggestion.description}
          </p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              suggestion.confidence >= 0.8
                ? "bg-emerald-400"
                : suggestion.confidence >= 0.5
                  ? "bg-yellow-400"
                  : "bg-orange-400"
            }`}
            style={{ width: `${Math.round(suggestion.confidence * 100)}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground/60 shrink-0">
          {Math.round(suggestion.confidence * 100)}%
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => suggestion.apply()}
          className="flex-1 text-[10px] px-2 py-1 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/10 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
