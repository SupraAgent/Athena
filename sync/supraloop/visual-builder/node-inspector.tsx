"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import type {
  PersonaNodeData,
  AppNodeData,
  CompetitorNodeData,
  ActionNodeData,
  NoteNodeData,
  TriggerNodeData,
  ConditionNodeData,
  TransformNodeData,
  OutputNodeData,
  LLMNodeData,
} from "@/lib/flow-templates";

type NodeInspectorProps = {
  node: Node;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
};

// ── Shared field components ────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

const selectClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 [&>option]:bg-neutral-900";

const textareaClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none";

// ── Node-specific editors ──────────────────────────────────────

function PersonaEditor({
  data,
  onChange,
}: {
  data: PersonaNodeData;
  onChange: (d: Partial<PersonaNodeData>) => void;
}) {
  return (
    <>
      <Field label="Name">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Role">
        <select
          className={selectClass}
          value={data.role}
          onChange={(e) => onChange({ role: e.target.value })}
        >
          <option value="Head of Product">Head of Product</option>
          <option value="Engineering Lead">Engineering Lead</option>
          <option value="Design Lead">Design Lead</option>
          <option value="Growth & Analytics">Growth & Analytics</option>
          <option value="QA & Reliability">QA & Reliability</option>
          <option value="Competitor CPO">Competitor CPO</option>
        </select>
      </Field>
      <Field label="Emoji">
        <input
          className={inputClass}
          value={data.emoji}
          onChange={(e) => onChange({ emoji: e.target.value })}
          maxLength={4}
        />
      </Field>
      <Field label="Vote Weight">
        <input
          type="number"
          step={0.1}
          min={0}
          max={3}
          className={inputClass}
          value={data.voteWeight}
          onChange={(e) => onChange({ voteWeight: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="Expertise (comma-separated)">
        <input
          className={inputClass}
          value={data.expertise?.join(", ") ?? ""}
          onChange={(e) =>
            onChange({
              expertise: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
      <Field label="Personality">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.personality}
          onChange={(e) => onChange({ personality: e.target.value })}
        />
      </Field>
    </>
  );
}

function AppEditor({
  data,
  onChange,
}: {
  data: AppNodeData;
  onChange: (d: Partial<AppNodeData>) => void;
}) {
  return (
    <>
      <Field label="App Name">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <Field label="Target Users">
        <input
          className={inputClass}
          value={data.targetUsers}
          onChange={(e) => onChange({ targetUsers: e.target.value })}
        />
      </Field>
      <Field label="Core Value">
        <input
          className={inputClass}
          value={data.coreValue}
          onChange={(e) => onChange({ coreValue: e.target.value })}
        />
      </Field>
      <Field label="Current State">
        <select
          className={selectClass}
          value={data.currentState}
          onChange={(e) =>
            onChange({ currentState: e.target.value as AppNodeData["currentState"] })
          }
        >
          <option value="">Not set</option>
          <option value="MVP">MVP</option>
          <option value="Beta">Beta</option>
          <option value="Production">Production</option>
        </select>
      </Field>
    </>
  );
}

function CompetitorEditor({
  data,
  onChange,
}: {
  data: CompetitorNodeData;
  onChange: (d: Partial<CompetitorNodeData>) => void;
}) {
  return (
    <>
      <Field label="Competitor Name">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Why this competitor?">
        <input
          className={inputClass}
          value={data.why}
          onChange={(e) => onChange({ why: e.target.value })}
        />
      </Field>
      <Field label="Overall Score">
        <input
          type="number"
          min={0}
          max={100}
          className={inputClass}
          value={data.overallScore}
          onChange={(e) => onChange({ overallScore: parseInt(e.target.value) || 0 })}
        />
      </Field>
      <Field label="CPO Name">
        <input
          className={inputClass}
          value={data.cpoName}
          placeholder="Auto-generated or custom"
          onChange={(e) => onChange({ cpoName: e.target.value })}
        />
      </Field>
    </>
  );
}

function ActionEditor({
  data,
  onChange,
}: {
  data: ActionNodeData;
  onChange: (d: Partial<ActionNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Action Type">
        <select
          className={selectClass}
          value={data.actionType}
          onChange={(e) =>
            onChange({ actionType: e.target.value as ActionNodeData["actionType"] })
          }
        >
          <option value="score">Score</option>
          <option value="analyze">Analyze</option>
          <option value="improve">Improve</option>
          <option value="generate">Generate</option>
          <option value="commit">Commit</option>
        </select>
      </Field>
      <Field label="Description">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
    </>
  );
}

function NoteEditor({
  data,
  onChange,
}: {
  data: NoteNodeData;
  onChange: (d: Partial<NoteNodeData>) => void;
}) {
  return (
    <>
      <Field label="Title">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Content">
        <textarea
          className={textareaClass}
          rows={4}
          value={data.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </Field>
    </>
  );
}

function TriggerEditor({
  data,
  onChange,
}: {
  data: TriggerNodeData;
  onChange: (d: Partial<TriggerNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Trigger Type">
        <select
          className={selectClass}
          value={data.triggerType}
          onChange={(e) =>
            onChange({ triggerType: e.target.value as TriggerNodeData["triggerType"] })
          }
        >
          <option value="manual">Manual</option>
          <option value="schedule">Schedule</option>
          <option value="webhook">Webhook</option>
          <option value="event">Event</option>
        </select>
      </Field>
      <Field label="Config">
        <textarea
          className={textareaClass}
          rows={2}
          value={data.config}
          onChange={(e) => onChange({ config: e.target.value })}
        />
      </Field>
    </>
  );
}

function ConditionEditor({
  data,
  onChange,
}: {
  data: ConditionNodeData;
  onChange: (d: Partial<ConditionNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Condition">
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="e.g. score > 80"
          value={data.condition}
          onChange={(e) => onChange({ condition: e.target.value })}
        />
      </Field>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
        <span className="text-emerald-400">● True</span> = right-top handle
        <span className="text-red-400">● False</span> = right-bottom handle
      </div>
    </>
  );
}

function TransformEditor({
  data,
  onChange,
}: {
  data: TransformNodeData;
  onChange: (d: Partial<TransformNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Transform Type">
        <select
          className={selectClass}
          value={data.transformType}
          onChange={(e) =>
            onChange({ transformType: e.target.value as TransformNodeData["transformType"] })
          }
        >
          <option value="map">Map</option>
          <option value="filter">Filter</option>
          <option value="merge">Merge</option>
          <option value="extract">Extract</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Expression">
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="e.g. result -> markdown"
          value={data.expression}
          onChange={(e) => onChange({ expression: e.target.value })}
        />
      </Field>
    </>
  );
}

function OutputEditor({
  data,
  onChange,
}: {
  data: OutputNodeData;
  onChange: (d: Partial<OutputNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Output Type">
        <select
          className={selectClass}
          value={data.outputType}
          onChange={(e) =>
            onChange({ outputType: e.target.value as OutputNodeData["outputType"] })
          }
        >
          <option value="log">Log</option>
          <option value="api">API</option>
          <option value="file">File</option>
          <option value="notify">Notify</option>
          <option value="github">GitHub</option>
        </select>
      </Field>
      <Field label="Destination">
        <input
          className={inputClass}
          placeholder="e.g. output.md or POST /api/..."
          value={data.destination}
          onChange={(e) => onChange({ destination: e.target.value })}
        />
      </Field>
    </>
  );
}

function LLMEditor({
  data,
  onChange,
}: {
  data: LLMNodeData;
  onChange: (d: Partial<LLMNodeData>) => void;
}) {
  return (
    <>
      <Field label="Label">
        <input
          className={inputClass}
          value={data.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Provider">
        <select
          className={selectClass}
          value={data.provider}
          onChange={(e) =>
            onChange({ provider: e.target.value as LLMNodeData["provider"] })
          }
        >
          <option value="claude">Claude</option>
          <option value="claude-code">Claude Code (Agent)</option>
          <option value="ollama">Ollama</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      {data.provider !== "claude-code" && (
        <Field label="Model">
          <input
            className={inputClass}
            placeholder="e.g. claude-sonnet-4-5-20250514"
            value={data.model}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </Field>
      )}
      <Field label="System Prompt">
        <textarea
          className={textareaClass}
          rows={4}
          value={data.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value })}
        />
      </Field>
      <Field label="Temperature">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            className="flex-1 accent-primary"
            value={data.temperature ?? 0.7}
            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
          />
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {data.temperature ?? 0.7}
          </span>
        </div>
      </Field>
      <Field label="Max Tokens">
        <input
          type="number"
          min={1}
          max={100000}
          className={inputClass}
          value={data.maxTokens ?? 2048}
          onChange={(e) => onChange({ maxTokens: parseInt(e.target.value) || 2048 })}
        />
      </Field>
    </>
  );
}

// ── Node type display config ───────────────────────────────────

const NODE_TYPE_INFO: Record<string, { emoji: string; label: string; color: string }> = {
  personaNode: { emoji: "🧑", label: "Persona", color: "text-blue-400" },
  appNode: { emoji: "🚀", label: "App", color: "text-primary" },
  competitorNode: { emoji: "🏢", label: "Competitor", color: "text-orange-400" },
  actionNode: { emoji: "⚡", label: "Action", color: "text-purple-400" },
  noteNode: { emoji: "📌", label: "Note", color: "text-yellow-400" },
  triggerNode: { emoji: "▶", label: "Trigger", color: "text-emerald-400" },
  conditionNode: { emoji: "🔀", label: "Condition", color: "text-yellow-400" },
  transformNode: { emoji: "🔄", label: "Transform", color: "text-sky-400" },
  outputNode: { emoji: "📤", label: "Output", color: "text-emerald-400" },
  llmNode: { emoji: "🧠", label: "LLM", color: "text-violet-400" },
};

// ── Main component ─────────────────────────────────────────────

export function NodeInspector({
  node,
  onUpdate,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const info = NODE_TYPE_INFO[node.type ?? ""] ?? {
    emoji: "?",
    label: "Unknown",
    color: "text-foreground",
  };

  function handleChange(partial: Record<string, unknown>) {
    onUpdate(node.id, { ...node.data, ...partial });
  }

  function renderEditor() {
    switch (node.type) {
      case "personaNode":
        return (
          <PersonaEditor
            data={node.data as PersonaNodeData}
            onChange={handleChange}
          />
        );
      case "appNode":
        return (
          <AppEditor data={node.data as AppNodeData} onChange={handleChange} />
        );
      case "competitorNode":
        return (
          <CompetitorEditor
            data={node.data as CompetitorNodeData}
            onChange={handleChange}
          />
        );
      case "actionNode":
        return (
          <ActionEditor
            data={node.data as ActionNodeData}
            onChange={handleChange}
          />
        );
      case "noteNode":
        return (
          <NoteEditor data={node.data as NoteNodeData} onChange={handleChange} />
        );
      case "triggerNode":
        return (
          <TriggerEditor
            data={node.data as TriggerNodeData}
            onChange={handleChange}
          />
        );
      case "conditionNode":
        return (
          <ConditionEditor
            data={node.data as ConditionNodeData}
            onChange={handleChange}
          />
        );
      case "transformNode":
        return (
          <TransformEditor
            data={node.data as TransformNodeData}
            onChange={handleChange}
          />
        );
      case "outputNode":
        return (
          <OutputEditor
            data={node.data as OutputNodeData}
            onChange={handleChange}
          />
        );
      case "llmNode":
        return (
          <LLMEditor data={node.data as LLMNodeData} onChange={handleChange} />
        );
      default:
        return (
          <p className="text-xs text-muted-foreground">
            No editor available for this node type.
          </p>
        );
    }
  }

  return (
    <div className="flex h-full w-[300px] flex-col border-l border-white/10 bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{info.emoji}</span>
          <span className={`text-sm font-semibold ${info.color}`}>
            {info.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
          title="Close inspector"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 3L11 11M11 3L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {renderEditor()}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-4 py-3">
        <button
          onClick={() => onDelete(node.id)}
          className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
        >
          Delete Node
        </button>
        <div className="mt-2 text-center text-[10px] text-muted-foreground">
          ID: {node.id}
        </div>
      </div>
    </div>
  );
}
