"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Node, Edge } from "@xyflow/react";
import {
  type FlowTemplate,
  getTemplatesByCategory,
  getCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
  copyTemplate,
} from "@/lib/flow-templates";

type TemplateManagerProps = {
  category: FlowTemplate["category"];
  currentNodes: Node[];
  currentEdges: Edge[];
  onSelect: (template: FlowTemplate) => void;
  onClose: () => void;
};

type Tab = "browse" | "create";

export function TemplateManager({
  category,
  currentNodes,
  currentEdges,
  onSelect,
  onClose,
}: TemplateManagerProps) {
  const [tab, setTab] = React.useState<Tab>("browse");
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<FlowTemplate["category"]>(category);

  const CATEGORIES: FlowTemplate["category"][] = [
    "team", "app", "benchmark", "scoring", "improve", "workflow", "custom",
  ];

  const templates = selectedCategory === "custom"
    ? getCustomTemplates()
    : getTemplatesByCategory(selectedCategory);

  function handleSaveTemplate() {
    if (!newName.trim()) return;
    const template: FlowTemplate = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim(),
      category: "custom",
      nodes: currentNodes,
      edges: currentEdges,
      createdAt: new Date().toISOString().split("T")[0],
      isBuiltIn: false,
    };
    saveCustomTemplate(template);
    setNewName("");
    setNewDesc("");
    setTab("browse");
    setSelectedCategory("custom");
  }

  const [, forceUpdate] = React.useState(0);

  function handleUseTemplate(template: FlowTemplate) {
    if (template.isBuiltIn) {
      // Create a copy — never edit the original built-in
      const copy = copyTemplate(template);
      onSelect(copy);
    } else {
      // For custom templates, also create a copy to preserve the original
      const copy = copyTemplate(template);
      onSelect(copy);
    }
  }

  function handleDelete(id: string) {
    deleteCustomTemplate(id);
    // Force re-render
    forceUpdate((v) => v + 1);
  }

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-lg font-bold text-foreground">Flow Templates</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition text-lg">
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("browse")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
            tab === "browse" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Browse Templates
        </button>
        <button
          onClick={() => setTab("create")}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
            tab === "create" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Save Current as Template
        </button>
      </div>

      {tab === "browse" ? (
        <div className="p-6">
          {/* Category filter */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedCategory === cat
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Template grid */}
          {templates.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No templates in this category.{" "}
              {selectedCategory === "custom" && "Create one from the current canvas!"}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template)}
                  className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:bg-white/5 hover:border-white/20 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="font-semibold text-sm text-foreground group-hover:text-primary transition">
                      {template.name}
                    </div>
                    {!template.isBuiltIn && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(template.id);
                        }}
                        className="text-xs text-muted-foreground hover:text-red-400 transition cursor-pointer"
                      >
                        ✕
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{template.nodes.length} nodes</span>
                    <span>{template.edges.length} edges</span>
                    {template.isBuiltIn && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        Built-in
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Template Name
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Custom Flow"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What this template is for..."
              className="min-h-[80px]"
            />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-xs text-muted-foreground">
              Current canvas: <span className="text-foreground font-medium">{currentNodes.length} nodes</span> and{" "}
              <span className="text-foreground font-medium">{currentEdges.length} edges</span> will be saved.
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTab("browse")}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={!newName.trim()}>
              Save Template
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
