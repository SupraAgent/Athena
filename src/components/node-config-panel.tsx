"use client";

import * as React from "react";
import type { Node } from "@xyflow/react";
import type {
  WorkflowNodeData,
  TriggerNodeData,
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  TryCatchNodeData,
  CodeNodeData,
  SwitchNodeData,
  LoopNodeData,
  TransformNodeData,
  TransformOperation,
  AggregateOp,
  ConfigFieldDef,
  NodeTypeRegistration,
  SubWorkflowNodeData,
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
    try_catch: "text-orange-400",
    code: "text-violet-400",
    switch: "text-cyan-400",
    loop: "text-indigo-400",
    transform: "text-emerald-400",
    sub_workflow: "text-sky-400",
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
      {data.nodeType === "try_catch" && (
        <TryCatchConfig data={data as TryCatchNodeData} />
      )}
      {data.nodeType === "code" && (
        <CodeConfig data={data as CodeNodeData} updateConfig={updateConfig} />
      )}
      {data.nodeType === "switch" && (
        <SwitchConfig
          data={data as SwitchNodeData}
          updateConfig={updateConfig}
          onDataChange={(newData) => onDataChange(node.id, newData)}
        />
      )}
      {data.nodeType === "loop" && (
        <LoopConfig data={data as LoopNodeData} updateConfig={updateConfig} />
      )}
      {data.nodeType === "transform" && (
        <TransformConfigPanel
          data={data as TransformNodeData}
          onDataChange={(newData) => onDataChange(node.id, newData)}
          updateConfig={updateConfig}
        />
      )}
      {data.nodeType === "sub_workflow" && (
        <SubWorkflowConfigPanel
          data={data as SubWorkflowNodeData}
          updateConfig={updateConfig}
        />
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

  if (field.type === "secret") {
    return (
      <SecretField
        field={field}
        value={strVal}
        onChange={onChange}
      />
    );
  }

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

// ── Secret field (credential vault) ──────────────────────────────

function SecretField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDef;
  value: string;
  onChange: (value: unknown) => void;
}) {
  const [revealed, setRevealed] = React.useState(false);

  // A credential reference looks like "credential:<id>"
  const isCredentialRef = value.startsWith("credential:");
  const displayValue = isCredentialRef
    ? `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (${value.replace("credential:", "")})`
    : value;

  return (
    <Field label={field.label}>
      <div className="relative">
        <input
          type={revealed && !isCredentialRef ? "text" : "password"}
          value={isCredentialRef ? displayValue : value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={isCredentialRef}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20 pr-16"
          placeholder={field.placeholder ?? "Secret value or credential:id"}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
          {!isCredentialRef && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? "Hide" : "Show"}
            </button>
          )}
          {isCredentialRef && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
              title="Clear credential reference"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {isCredentialRef && (
        <p className="text-[9px] text-muted-foreground mt-0.5">
          Linked to credential vault. Value resolved at execution time.
        </p>
      )}
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

// ── Try/Catch config ─────────────────────────────────────────────

function TryCatchConfig({ data }: { data: TryCatchNodeData }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 px-3 py-2">
        <p className="text-[10px] text-orange-400/80">Try / Catch Error Handler</p>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1.5">
        <p>
          Connect nodes to the <span className="text-emerald-400 font-medium">Success</span> handle
          for the try path. If any node fails, execution routes to the{" "}
          <span className="text-red-400 font-medium">Error</span> handle.
        </p>
        <p>
          The caught error message is available as{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">_tryCatchError</code> in context variables.
        </p>
      </div>

      <div className="flex gap-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Success path
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400" /> Error path
        </span>
      </div>
    </div>
  );
}

// ── Code config ──────────────────────────────────────────────────

function CodeConfig({
  data,
  updateConfig,
}: {
  data: CodeNodeData;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-violet-500/5 border border-violet-500/10 px-3 py-2">
        <p className="text-[10px] text-violet-400/80">Custom Code Execution</p>
      </div>

      <Field label="Language">
        <select
          value={data.config.language ?? "javascript"}
          onChange={(e) => updateConfig("language", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
        </select>
      </Field>

      <Field label="Code">
        <textarea
          value={data.config.code ?? ""}
          onChange={(e) => updateConfig("code", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-none outline-none focus:border-white/20 font-mono"
          rows={8}
          placeholder={`// Access upstream data via input\n// Access workflow vars via context\nconst result = input;\nreturn result;`}
          spellCheck={false}
        />
      </Field>

      <Field label="Timeout (ms)">
        <input
          type="number"
          value={String(data.config.timeout ?? 5000)}
          onChange={(e) => updateConfig("timeout", Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          min={100}
          max={60000}
        />
      </Field>

      <div className="text-[10px] text-muted-foreground space-y-1.5">
        <p>
          Code receives <code className="bg-white/5 px-1 rounded text-[9px]">input</code> (upstream outputs)
          and <code className="bg-white/5 px-1 rounded text-[9px]">context</code> (workflow vars).
        </p>
        <p>Must return a value. Use <code className="bg-white/5 px-1 rounded text-[9px]">return</code> to output results.</p>
      </div>
    </div>
  );
}

// ── Switch config ────────────────────────────────────────────────

function SwitchConfig({
  data,
  updateConfig,
  onDataChange,
}: {
  data: SwitchNodeData;
  updateConfig: (key: string, value: unknown) => void;
  onDataChange: (newData: WorkflowNodeData) => void;
}) {
  const cases = data.config.cases ?? [];

  function addCase() {
    const newCases = [...cases, { value: `case_${cases.length + 1}`, label: `Case ${cases.length + 1}` }];
    onDataChange({
      ...data,
      config: { ...data.config, cases: newCases },
    });
  }

  function removeCase(index: number) {
    const newCases = cases.filter((_, i) => i !== index);
    onDataChange({
      ...data,
      config: { ...data.config, cases: newCases },
    });
  }

  function updateCase(index: number, field: "value" | "label", val: string) {
    const newCases = cases.map((c, i) =>
      i === index ? { ...c, [field]: val } : c
    );
    onDataChange({
      ...data,
      config: { ...data.config, cases: newCases },
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/10 px-3 py-2">
        <p className="text-[10px] text-cyan-400/80">Multi-way Branch</p>
      </div>

      <Field label="Expression">
        <input
          value={data.config.expression ?? ""}
          onChange={(e) => updateConfig("expression", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="{{variable}} or {{nodeId.output.field}}"
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">Cases</label>
          <button
            type="button"
            onClick={addCase}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            + Add case
          </button>
        </div>

        {cases.map((c, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input
              value={c.value}
              onChange={(e) => updateCase(i, "value", e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
              placeholder="Value"
            />
            <input
              value={c.label}
              onChange={(e) => updateCase(i, "label", e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
              placeholder="Label"
            />
            <button
              type="button"
              onClick={() => removeCase(i)}
              className="text-red-400/70 hover:text-red-400 text-[10px] shrink-0 px-1"
              title="Remove case"
            >
              x
            </button>
          </div>
        ))}

        {cases.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 italic">No cases defined</p>
        )}
      </div>

      <Field label="Default Case">
        <input
          value={data.config.defaultCase ?? ""}
          onChange={(e) => updateConfig("defaultCase", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="default"
        />
      </Field>

      <div className="text-[10px] text-muted-foreground">
        <p>
          Expression is evaluated and compared to each case value.
          Connect edges from each case handle to the target nodes.
        </p>
      </div>
    </div>
  );
}

// ── Loop config ──────────────────────────────────────────────────

function LoopConfig({
  data,
  updateConfig,
}: {
  data: LoopNodeData;
  updateConfig: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/10 px-3 py-2">
        <p className="text-[10px] text-indigo-400/80">Loop / Iteration</p>
      </div>

      <Field label="Array Expression">
        <input
          value={data.config.arrayExpression ?? ""}
          onChange={(e) => updateConfig("arrayExpression", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="{{nodeId.output.items}}"
        />
      </Field>

      <Field label="Item Variable Name">
        <input
          value={data.config.itemVariable ?? "item"}
          onChange={(e) => updateConfig("itemVariable", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="item"
        />
      </Field>

      <Field label="Max Iterations">
        <input
          type="number"
          value={String(data.config.maxIterations ?? 100)}
          onChange={(e) => updateConfig("maxIterations", Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          min={1}
          max={10000}
        />
      </Field>

      <div className="flex gap-2 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-indigo-400" /> Body (each item)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Complete
        </span>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1.5">
        <p>
          Each iteration sets{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">{data.config.itemVariable || "item"}</code>,{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">_loopIndex</code>, and{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">_loopLength</code> in context vars.
        </p>
      </div>
    </div>
  );
}

// ── Transform config ─────────────────────────────────────────────

const TRANSFORM_OP_TYPES = [
  { value: "map", label: "Map" },
  { value: "filter", label: "Filter" },
  { value: "sort", label: "Sort" },
  { value: "pick", label: "Pick Keys" },
  { value: "omit", label: "Omit Keys" },
  { value: "rename", label: "Rename Keys" },
  { value: "flatten", label: "Flatten" },
  { value: "group_by", label: "Group By" },
  { value: "aggregate", label: "Aggregate" },
  { value: "template", label: "Template" },
  { value: "json_parse", label: "JSON Parse" },
  { value: "json_stringify", label: "JSON Stringify" },
  { value: "unique", label: "Unique" },
  { value: "take", label: "Take" },
  { value: "skip", label: "Skip" },
] as const;

function createDefaultOp(type: string): TransformOperation {
  switch (type) {
    case "map": return { type: "map", expression: "item" };
    case "filter": return { type: "filter", expression: "item" };
    case "sort": return { type: "sort", key: "", direction: "asc" };
    case "pick": return { type: "pick", keys: [] };
    case "omit": return { type: "omit", keys: [] };
    case "rename": return { type: "rename", mapping: {} };
    case "flatten": return { type: "flatten", depth: 1 };
    case "group_by": return { type: "group_by", key: "" };
    case "aggregate": return { type: "aggregate", operations: [] };
    case "template": return { type: "template", template: "" };
    case "json_parse": return { type: "json_parse" };
    case "json_stringify": return { type: "json_stringify", pretty: false };
    case "unique": return { type: "unique" };
    case "take": return { type: "take", count: 10 };
    case "skip": return { type: "skip", count: 0 };
    default: return { type: "map", expression: "item" };
  }
}

function TransformConfigPanel({
  data,
  onDataChange,
  updateConfig,
}: {
  data: TransformNodeData;
  onDataChange: (newData: WorkflowNodeData) => void;
  updateConfig: (key: string, value: unknown) => void;
}) {
  const operations = data.config.operations ?? [];

  function updateOperations(newOps: TransformOperation[]) {
    onDataChange({
      ...data,
      config: { ...data.config, operations: newOps },
    });
  }

  function addOperation(type: string) {
    updateOperations([...operations, createDefaultOp(type)]);
  }

  function removeOperation(index: number) {
    updateOperations(operations.filter((_, i) => i !== index));
  }

  function updateOperation(index: number, op: TransformOperation) {
    const newOps = operations.map((o, i) => (i === index ? op : o));
    updateOperations(newOps);
  }

  function moveOperation(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= operations.length) return;
    const newOps = [...operations];
    [newOps[index], newOps[newIndex]] = [newOps[newIndex], newOps[index]];
    updateOperations(newOps);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
        <p className="text-[10px] text-emerald-400/80">Data Transformation Pipeline</p>
      </div>

      <Field label="Input Expression">
        <input
          value={data.config.inputExpression ?? ""}
          onChange={(e) => updateConfig("inputExpression", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="{{nodeId.output.items}}"
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">Operations ({operations.length})</label>
        </div>

        {operations.map((op, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2 space-y-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-medium text-emerald-400 flex-1 capitalize">{op.type.replace("_", " ")}</span>
              <button
                type="button"
                onClick={() => moveOperation(i, "up")}
                disabled={i === 0}
                className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                title="Move up"
              >
                ^
              </button>
              <button
                type="button"
                onClick={() => moveOperation(i, "down")}
                disabled={i === operations.length - 1}
                className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                title="Move down"
              >
                v
              </button>
              <button
                type="button"
                onClick={() => removeOperation(i)}
                className="text-red-400/70 hover:text-red-400 text-[10px] px-1"
                title="Remove"
              >
                x
              </button>
            </div>
            <TransformOpConfig op={op} onChange={(newOp) => updateOperation(i, newOp)} />
          </div>
        ))}

        {operations.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 italic">No operations defined</p>
        )}

        <div className="pt-1">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addOperation(e.target.value);
              e.target.value = "";
            }}
            className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs outline-none"
          >
            <option value="">+ Add operation...</option>
            {TRANSFORM_OP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1.5">
        <p>
          Operations are applied in order. Each operation&apos;s output becomes the next operation&apos;s input.
        </p>
        <p>
          Expressions can reference <code className="bg-white/5 px-1 rounded text-[9px]">item</code>,{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">index</code>, and{" "}
          <code className="bg-white/5 px-1 rounded text-[9px]">array</code>.
        </p>
      </div>
    </div>
  );
}

function TransformOpConfig({
  op,
  onChange,
}: {
  op: TransformOperation;
  onChange: (op: TransformOperation) => void;
}) {
  switch (op.type) {
    case "map":
    case "filter":
      return (
        <textarea
          value={op.expression}
          onChange={(e) => onChange({ ...op, expression: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[10px] resize-none outline-none focus:border-white/20 font-mono"
          rows={2}
          placeholder={op.type === "map" ? "item.price * 1.1" : "item.price > 100"}
        />
      );

    case "sort":
      return (
        <div className="flex gap-1.5">
          <input
            value={op.key}
            onChange={(e) => onChange({ ...op, key: e.target.value })}
            className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
            placeholder="Sort key (e.g. price)"
          />
          <select
            value={op.direction}
            onChange={(e) => onChange({ ...op, direction: e.target.value as "asc" | "desc" })}
            className="rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      );

    case "pick":
    case "omit":
      return (
        <input
          value={op.keys.join(", ")}
          onChange={(e) =>
            onChange({
              ...op,
              keys: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
            })
          }
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
          placeholder="key1, key2, key3"
        />
      );

    case "rename": {
      const entries = Object.entries(op.mapping);
      return (
        <div className="space-y-1">
          {entries.map(([from, to], i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                value={from}
                onChange={(e) => {
                  const newMapping = { ...op.mapping };
                  delete newMapping[from];
                  newMapping[e.target.value] = to;
                  onChange({ ...op, mapping: newMapping });
                }}
                className="flex-1 rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
                placeholder="from"
              />
              <span className="text-[10px] text-muted-foreground">&rarr;</span>
              <input
                value={to}
                onChange={(e) => {
                  onChange({ ...op, mapping: { ...op.mapping, [from]: e.target.value } });
                }}
                className="flex-1 rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
                placeholder="to"
              />
              <button
                type="button"
                onClick={() => {
                  const newMapping = { ...op.mapping };
                  delete newMapping[from];
                  onChange({ ...op, mapping: newMapping });
                }}
                className="text-red-400/70 hover:text-red-400 text-[10px] px-0.5"
              >
                x
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...op, mapping: { ...op.mapping, "": "" } })}
            className="text-[10px] text-emerald-400 hover:text-emerald-300"
          >
            + Add mapping
          </button>
        </div>
      );
    }

    case "flatten":
      return (
        <input
          type="number"
          value={op.depth ?? 1}
          onChange={(e) => onChange({ ...op, depth: parseInt(e.target.value, 10) || 1 })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
          placeholder="Depth"
          min={1}
          max={10}
        />
      );

    case "group_by":
      return (
        <input
          value={op.key}
          onChange={(e) => onChange({ ...op, key: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
          placeholder="Group key (e.g. category)"
        />
      );

    case "aggregate": {
      const aggOps = op.operations ?? [];
      return (
        <div className="space-y-1">
          {aggOps.map((agg, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                value={agg.field}
                onChange={(e) => {
                  const newAggs = [...aggOps];
                  newAggs[i] = { ...agg, field: e.target.value };
                  onChange({ ...op, operations: newAggs });
                }}
                className="flex-1 rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
                placeholder="field"
              />
              <select
                value={agg.operation}
                onChange={(e) => {
                  const newAggs = [...aggOps];
                  newAggs[i] = { ...agg, operation: e.target.value as AggregateOp["operation"] };
                  onChange({ ...op, operations: newAggs });
                }}
                className="rounded border border-white/10 bg-transparent px-1 py-0.5 text-[10px] outline-none"
              >
                <option value="sum">Sum</option>
                <option value="count">Count</option>
                <option value="avg">Avg</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
              <input
                value={agg.alias}
                onChange={(e) => {
                  const newAggs = [...aggOps];
                  newAggs[i] = { ...agg, alias: e.target.value };
                  onChange({ ...op, operations: newAggs });
                }}
                className="flex-1 rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
                placeholder="alias"
              />
              <button
                type="button"
                onClick={() => {
                  onChange({ ...op, operations: aggOps.filter((_, j) => j !== i) });
                }}
                className="text-red-400/70 hover:text-red-400 text-[10px] px-0.5"
              >
                x
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...op,
                operations: [...aggOps, { field: "", operation: "sum", alias: "" }],
              })
            }
            className="text-[10px] text-emerald-400 hover:text-emerald-300"
          >
            + Add aggregation
          </button>
        </div>
      );
    }

    case "template":
      return (
        <textarea
          value={op.template}
          onChange={(e) => onChange({ ...op, template: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[10px] resize-none outline-none focus:border-white/20 font-mono"
          rows={2}
          placeholder="Hello {{item.name}}, your total is {{item.total}}"
        />
      );

    case "json_parse":
      return <p className="text-[10px] text-muted-foreground/60">Parses JSON string(s) to objects.</p>;

    case "json_stringify":
      return (
        <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={op.pretty ?? false}
            onChange={(e) => onChange({ ...op, pretty: e.target.checked })}
            className="rounded border-white/10"
          />
          Pretty print
        </label>
      );

    case "unique":
      return (
        <input
          value={op.key ?? ""}
          onChange={(e) => onChange({ ...op, key: e.target.value || undefined })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
          placeholder="Key to deduplicate by (optional)"
        />
      );

    case "take":
    case "skip":
      return (
        <input
          type="number"
          value={op.count}
          onChange={(e) => onChange({ ...op, count: parseInt(e.target.value, 10) || 0 })}
          className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] outline-none focus:border-white/20"
          placeholder={op.type === "take" ? "Number of items" : "Items to skip"}
          min={0}
        />
      );

    default:
      return null;
  }
}

// ── Shared field wrapper ─────────────────────────────────────────

// ── Sub-Workflow config ──────────────────────────────────────────

function SubWorkflowConfigPanel({
  data,
  updateConfig,
}: {
  data: SubWorkflowNodeData;
  updateConfig: (key: string, value: unknown) => void;
}) {
  const config = data.config;
  const inputMappings = config.inputMappings ?? {};
  const outputMappings = config.outputMappings ?? {};

  function updateMapping(
    type: "inputMappings" | "outputMappings",
    mappings: Record<string, string>,
    oldKey: string,
    newKey: string,
    newValue: string
  ) {
    const updated = { ...mappings };
    if (oldKey !== newKey) {
      delete updated[oldKey];
    }
    if (newKey) {
      updated[newKey] = newValue;
    }
    updateConfig(type, updated);
  }

  function addMapping(type: "inputMappings" | "outputMappings") {
    const existing = type === "inputMappings" ? inputMappings : outputMappings;
    const newKey = `var_${Object.keys(existing).length + 1}`;
    updateConfig(type, { ...existing, [newKey]: "" });
  }

  function removeMapping(type: "inputMappings" | "outputMappings", key: string) {
    const existing = type === "inputMappings" ? inputMappings : outputMappings;
    const updated = { ...existing };
    delete updated[key];
    updateConfig(type, updated);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-sky-500/5 border border-sky-500/10 px-3 py-2">
        <p className="text-[10px] text-sky-400/80">Sub-Workflow: Execute another workflow as a step</p>
      </div>

      <Field label="Workflow ID">
        <input
          value={config.workflowId ?? ""}
          onChange={(e) => updateConfig("workflowId", e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="workflow-id"
        />
      </Field>

      <Field label="Version (optional)">
        <input
          value={config.version ?? ""}
          onChange={(e) => updateConfig("version", e.target.value || undefined)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="e.g. 1.0.0"
        />
      </Field>

      <Field label="Max Depth">
        <input
          type="number"
          value={config.maxDepth ?? 10}
          onChange={(e) => updateConfig("maxDepth", Number(e.target.value) || 10)}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs h-8 outline-none focus:border-white/20"
          placeholder="10"
          min={1}
          max={50}
        />
      </Field>

      {/* Input Mappings */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">Input Mappings</label>
          <button
            type="button"
            onClick={() => addMapping("inputMappings")}
            className="text-[9px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            + Add
          </button>
        </div>
        {Object.entries(inputMappings).map(([key, value]) => (
          <div key={key} className="flex gap-1 items-center">
            <input
              value={key}
              onChange={(e) => updateMapping("inputMappings", inputMappings, key, e.target.value, value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] h-7 outline-none focus:border-white/20"
              placeholder="child var"
            />
            <span className="text-[10px] text-muted-foreground shrink-0">&larr;</span>
            <input
              value={value}
              onChange={(e) => updateMapping("inputMappings", inputMappings, key, key, e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] h-7 outline-none focus:border-white/20"
              placeholder="{{parent.expr}}"
            />
            <button
              type="button"
              onClick={() => removeMapping("inputMappings", key)}
              className="text-red-400 hover:text-red-300 text-[10px] px-1 shrink-0"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Output Mappings */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground">Output Mappings</label>
          <button
            type="button"
            onClick={() => addMapping("outputMappings")}
            className="text-[9px] text-sky-400 hover:text-sky-300 transition-colors"
          >
            + Add
          </button>
        </div>
        {Object.entries(outputMappings).map(([key, value]) => (
          <div key={key} className="flex gap-1 items-center">
            <input
              value={key}
              onChange={(e) => updateMapping("outputMappings", outputMappings, key, e.target.value, value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] h-7 outline-none focus:border-white/20"
              placeholder="parent var"
            />
            <span className="text-[10px] text-muted-foreground shrink-0">&larr;</span>
            <input
              value={value}
              onChange={(e) => updateMapping("outputMappings", outputMappings, key, key, e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1 text-[10px] h-7 outline-none focus:border-white/20"
              placeholder="{{child_node.output}}"
            />
            <button
              type="button"
              onClick={() => removeMapping("outputMappings", key)}
              className="text-red-400 hover:text-red-300 text-[10px] px-1 shrink-0"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
