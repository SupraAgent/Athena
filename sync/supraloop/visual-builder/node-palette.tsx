"use client";

import * as React from "react";

const PALETTE_ITEMS = [
  // ── Core nodes ──
  {
    type: "personaNode",
    label: "Persona",
    emoji: "👤",
    description: "AI team member",
    group: "core",
    data: {
      label: "New Persona",
      role: "Team Member",
      voteWeight: 1.0,
      expertise: [],
      personality: "",
      emoji: "👤",
    },
  },
  {
    type: "appNode",
    label: "App",
    emoji: "🚀",
    description: "Your application",
    group: "core",
    data: {
      label: "My App",
      description: "",
      targetUsers: "",
      coreValue: "",
      currentState: "",
    },
  },
  {
    type: "competitorNode",
    label: "Competitor",
    emoji: "🏢",
    description: "Reference app",
    group: "core",
    data: {
      label: "Competitor",
      why: "",
      overallScore: 0,
      cpoName: "",
    },
  },
  {
    type: "actionNode",
    label: "Action",
    emoji: "⚡",
    description: "Workflow step",
    group: "core",
    data: {
      label: "Action",
      actionType: "score",
      description: "",
    },
  },
  {
    type: "noteNode",
    label: "Note",
    emoji: "📌",
    description: "Annotation",
    group: "core",
    data: {
      label: "Note",
      content: "",
    },
  },
  // ── Workflow nodes ──
  {
    type: "triggerNode",
    label: "Trigger",
    emoji: "▶",
    description: "Start a workflow",
    group: "workflow",
    data: {
      label: "Trigger",
      triggerType: "manual",
      config: "",
    },
  },
  {
    type: "conditionNode",
    label: "Condition",
    emoji: "🔀",
    description: "Branch logic",
    group: "workflow",
    data: {
      label: "If / Else",
      condition: "",
    },
  },
  {
    type: "transformNode",
    label: "Transform",
    emoji: "🔄",
    description: "Transform data",
    group: "workflow",
    data: {
      label: "Transform",
      transformType: "map",
      expression: "",
    },
  },
  {
    type: "outputNode",
    label: "Output",
    emoji: "📤",
    description: "Send results",
    group: "workflow",
    data: {
      label: "Output",
      outputType: "log",
      destination: "",
    },
  },
  {
    type: "llmNode",
    label: "LLM",
    emoji: "🧠",
    description: "AI / Claude node",
    group: "workflow",
    data: {
      label: "Claude",
      provider: "claude",
      model: "claude-sonnet-4-5-20250514",
      systemPrompt: "",
      temperature: 0.7,
      maxTokens: 2048,
    },
  },
  {
    type: "stepNode",
    label: "Step",
    emoji: "🔢",
    description: "Pipeline step",
    group: "workflow",
    data: {
      label: "Step",
      stepIndex: 0,
      subtitle: "",
      status: "pending",
      summary: "",
      flowCategory: "team",
    },
  },
  {
    type: "consensusNode",
    label: "Consensus",
    emoji: "🗳️",
    description: "Persona group bucket",
    group: "workflow",
    data: {
      label: "Consensus",
      personas: [],
      consensusScore: 0,
    },
  },
  {
    type: "affinityCategoryNode",
    label: "Category",
    emoji: "📐",
    description: "Scoring category",
    group: "workflow",
    data: {
      label: "Category",
      weight: 0.1,
      score: 0,
      domainExpert: "",
    },
  },
];

export function NodePalette() {
  const [expanded, setExpanded] = React.useState(true);

  function onDragStart(
    event: React.DragEvent,
    type: string,
    data: Record<string, unknown>
  ) {
    event.dataTransfer.setData("application/reactflow-type", type);
    event.dataTransfer.setData("application/reactflow-data", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }

  const coreItems = PALETTE_ITEMS.filter((i) => i.group === "core");
  const workflowItems = PALETTE_ITEMS.filter((i) => i.group === "workflow");

  return (
    <div className="rounded-xl border border-white/10 bg-background/95 backdrop-blur-sm shadow-xl max-h-[80vh] overflow-y-auto">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-white/5 rounded-t-xl transition"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>Node Palette</span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 p-2 space-y-1">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Core
          </div>
          {coreItems.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type, item.data)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-grab hover:bg-white/5 transition active:cursor-grabbing"
            >
              <span className="text-base">{item.emoji}</span>
              <div>
                <div className="font-medium text-foreground">{item.label}</div>
                <div className="text-[10px] text-muted-foreground">{item.description}</div>
              </div>
            </div>
          ))}
          <div className="my-1 border-t border-white/5" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workflow
          </div>
          {workflowItems.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type, item.data)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs cursor-grab hover:bg-white/5 transition active:cursor-grabbing"
            >
              <span className="text-base">{item.emoji}</span>
              <div>
                <div className="font-medium text-foreground">{item.label}</div>
                <div className="text-[10px] text-muted-foreground">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
