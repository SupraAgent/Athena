"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";

// ── Types ────────────────────────────────────────────────────────

export interface ManagedTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: Node[];
  edges: Edge[];
  isBuiltIn: boolean;
  tags?: string[];
  createdAt?: string;
}

export interface TemplateManagerProps {
  /** All available templates (built-in + custom) */
  templates: ManagedTemplate[];
  /** Current canvas nodes (for "save as template") */
  currentNodes: Node[];
  /** Current canvas edges (for "save as template") */
  currentEdges: Edge[];
  /** Called when user selects a template to load */
  onSelect: (template: ManagedTemplate) => void;
  /** Called when user saves current canvas as a template */
  onSave: (template: Omit<ManagedTemplate, "id" | "isBuiltIn">) => void;
  /** Called when user deletes a custom template */
  onDelete?: (id: string) => void;
  /** Close the template manager */
  onClose: () => void;
  /** Available categories (auto-derived from templates if not provided) */
  categories?: string[];
  /** Default category filter */
  defaultCategory?: string;
}

type Tab = "browse" | "create";

// ── Component ────────────────────────────────────────────────────

export function TemplateManager({
  templates,
  currentNodes,
  currentEdges,
  onSelect,
  onSave,
  onDelete,
  onClose,
  categories: categoriesProp,
  defaultCategory,
}: TemplateManagerProps) {
  const [tab, setTab] = React.useState<Tab>("browse");
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newTags, setNewTags] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    defaultCategory ?? null
  );

  // Derive categories from templates if not provided
  const categories = React.useMemo(() => {
    if (categoriesProp) return categoriesProp;
    const cats = new Set<string>();
    for (const t of templates) {
      if (t.category) cats.add(t.category);
    }
    return Array.from(cats).sort();
  }, [templates, categoriesProp]);

  // Filter templates
  const filtered = React.useMemo(() => {
    if (!selectedCategory) return templates;
    return templates.filter((t) => t.category === selectedCategory);
  }, [templates, selectedCategory]);

  function handleSaveTemplate() {
    if (!newName.trim()) return;
    onSave({
      name: newName.trim(),
      description: newDesc.trim(),
      category: "custom",
      nodes: currentNodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: currentEdges.map((e) => ({
        ...e,
        ...(e.style ? { style: { ...e.style } } : {}),
      })),
      tags: newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString().split("T")[0],
    });
    setNewName("");
    setNewDesc("");
    setNewTags("");
    setTab("browse");
    setSelectedCategory("custom");
  }

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          Workflow Templates
        </h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("browse")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition ${
            tab === "browse"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Browse Templates
        </button>
        <button
          onClick={() => setTab("create")}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition ${
            tab === "create"
              ? "text-blue-400 border-b-2 border-blue-400"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Save Current as Template
        </button>
      </div>

      {tab === "browse" ? (
        <div className="p-6">
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-3 py-1 text-[10px] font-medium transition capitalize ${
                  selectedCategory === null
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-white/[0.03] text-muted-foreground/60 border border-white/5 hover:bg-white/[0.06]"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`rounded-full px-3 py-1 text-[10px] font-medium transition capitalize ${
                    selectedCategory === cat
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-white/[0.03] text-muted-foreground/60 border border-white/5 hover:bg-white/[0.06]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Template grid */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No templates in this category.
              {selectedCategory === "custom" && " Create one from the current canvas!"}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left hover:bg-white/[0.04] hover:border-white/10 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="font-semibold text-xs text-foreground group-hover:text-blue-400 transition">
                      {template.name}
                    </div>
                    {!template.isBuiltIn && onDelete && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(template.id);
                        }}
                        className="text-xs text-muted-foreground hover:text-red-400 transition cursor-pointer"
                      >
                        ✕
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground/70 line-clamp-2">
                    {template.description}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[9px] text-muted-foreground/50">
                    <span>{template.nodes.length} nodes</span>
                    <span>{template.edges.length} edges</span>
                    {template.isBuiltIn && (
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400">
                        Built-in
                      </span>
                    )}
                    {template.tags && template.tags.length > 0 && (
                      <span>{template.tags.join(", ")}</span>
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
            <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Template Name
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Custom Workflow"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-white/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What this template is for..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-white/20 resize-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Tags (comma-separated)
            </label>
            <input
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              placeholder="crm, notification, onboarding"
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-white/20"
            />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] text-muted-foreground">
              Current canvas:{" "}
              <span className="text-foreground font-medium">
                {currentNodes.length} nodes
              </span>{" "}
              and{" "}
              <span className="text-foreground font-medium">
                {currentEdges.length} edges
              </span>{" "}
              will be saved.
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setTab("browse")}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTemplate}
              disabled={!newName.trim()}
              className="rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition disabled:opacity-30"
            >
              Save Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
