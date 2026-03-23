"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import type {
  WorkflowNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  ConfigFieldDef,
  NodeTypeRegistration,
} from "../core/types";
import { DEFAULT_OPERATORS } from "../core/types";
import { useBuilderContext } from "./builder-context";

interface NodeConfigPanelProps {
  node: Node;
  onDataChange: (nodeId: string, data: WorkflowNodeData) => void;
  onDelete: (nodeId: string) => void;
}

export function NodeConfigPanel({ node, onDataChange, onDelete }: NodeConfigPanelProps) {
  const data = node.data as unknown as WorkflowNodeData;
  const { registry } = useBuilderContext();

  function update(partial: Partial<WorkflowNodeData>) {
    onDataChange(node.id, { ...data, ...partial } as WorkflowNodeData);
  }

  function updateConfig(key: string, value: unknown) {
    onDataChange(node.id, {
      ...data,
      config: { ...(data.config as Record<string, unknown>), [key]: value },
    } as unknown as WorkflowNodeData);
  }

  const accentMap: Record<string, string> = {
    trigger: "text-purple-400",
    action: "text-blue-400",
    condition: "text-yellow-400",
    delay: "text-gray-400",
  };

  // Look up registered config fields
  let registration: NodeTypeRegistration | undefined;
  if (data.nodeType === "trigger") {
    registration = registry.triggerConfigs?.[(data as TriggerNodeData).triggerType];
  } else if (data.nodeType === "action") {
    registration = registry.actionConfigs?.[(data as ActionNodeData).actionType];
  }

  return (
    <div className="w-72 shrink-0 border-l border-white/10 bg-white/[0.02] p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${accentMap[data.nodeType] ?? "text-foreground"}`}>
          {data.nodeType} Config
        </p>
      </div>

      {/* Label */}
      <Field label="Label">
        <input
          value={data.label}
          onChange={(e) => update({ label: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="Node label"
        />
      </Field>

      {/* Registered config fields for triggers/actions */}
      {registration && (
        <RegisteredConfig
          registration={registration}
          config={data.config as Record<string, unknown>}
          updateConfig={updateConfig}
        />
      )}

      {/* Built-in config for condition/delay */}
      {data.nodeType === "condition" && (
        <ConditionConfig data={data} updateConfig={updateConfig} />
      )}
      {data.nodeType === "delay" && (
        <DelayConfig data={data} updateConfig={updateConfig} />
      )}

      <div className="pt-3 border-t border-white/10">
        <button
          onClick={() => onDelete(node.id)}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete Node
        </button>
      </div>
    </div>
  );
}

// ── Registered config fields (plugin-provided) ──────────────────

function RegisteredConfig({
  registration,
  config,
  updateConfig,
}: {
  registration: NodeTypeRegistration;
  config: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      {registration.infoText && (
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">{registration.infoText}</p>
        </div>
      )}

      {registration.configFields.map((field) => (
        <ConfigField
          key={field.key}
          field={field}
          value={config[field.key]}
          onChange={(v) => updateConfig(field.key, v)}
        />
      ))}
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const strVal = value == null ? "" : String(value);

  if (field.type === "textarea") {
    return (
      <Field label={field.label}>
        <textarea
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none outline-none focus:border-white/20"
          rows={4}
          placeholder={field.placeholder}
        />
      </Field>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <Field label={field.label}>
        <select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.type === "number") {
    return (
      <Field label={field.label}>
        <input
          type="number"
          value={strVal}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder={field.placeholder}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label}>
      <input
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
        placeholder={field.placeholder}
      />
    </Field>
  );
}

// ── Condition config ─────────────────────────────────────────────

function ConditionConfig({
  data,
  updateConfig,
}: {
  data: ConditionNodeData;
  updateConfig: (key: string, value: unknown) => void;
}) {
  const { registry } = useBuilderContext();
  const fields = registry.conditionFields ?? [
    { value: "status", label: "Status" },
    { value: "type", label: "Type" },
    { value: "value", label: "Value" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 px-3 py-2">
        <p className="text-[10px] text-yellow-400/80">If / Else Branch</p>
      </div>

      <Field label="Field">
        <select
          value={data.config.field ?? ""}
          onChange={(e) => updateConfig("field", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          <option value="">Select field…</option>
          {fields.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Operator">
        <select
          value={data.config.operator ?? "equals"}
          onChange={(e) => updateConfig("operator", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          {DEFAULT_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Value">
        <input
          value={data.config.value ?? ""}
          onChange={(e) => updateConfig("value", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="Compare value…"
        />
      </Field>

      <div className="flex gap-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> True path
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" /> False path
        </span>
      </div>
    </div>
  );
}

// ── Delay config ─────────────────────────────────────────────────

function DelayConfig({
  data,
  updateConfig,
}: {
  data: DelayNodeData;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <p className="text-[10px] text-muted-foreground">Wait before continuing</p>
      </div>

      <Field label="Duration">
        <input
          type="number"
          value={String(data.config.duration ?? 1)}
          onChange={(e) => updateConfig("duration", Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          min={1}
        />
      </Field>

      <Field label="Unit">
        <select
          value={data.config.unit ?? "hours"}
          onChange={(e) => updateConfig("unit", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </Field>
    </div>
  );
}

// ── Shared field wrapper ─────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
