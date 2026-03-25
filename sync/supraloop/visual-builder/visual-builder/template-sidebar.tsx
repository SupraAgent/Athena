"use client";

import * as React from "react";
import type { FlowTemplate } from "@/lib/flow-templates";
import {
  BUILT_IN_TEMPLATES,
  getCustomTemplates,
  deleteCustomTemplate,
  copyTemplate,
  getStarredTemplateIds,
  toggleStarTemplate,
} from "@/lib/flow-templates";

type Tab = "templates" | "my-templates";

type TemplateSidebarProps = {
  onSelect: (template: FlowTemplate) => void;
  onClose: () => void;
};

export function TemplateSidebar({ onSelect, onClose }: TemplateSidebarProps) {
  const [tab, setTab] = React.useState<Tab>("templates");
  const [starred, setStarred] = React.useState<Set<string>>(new Set());
  const [customTemplates, setCustomTemplates] = React.useState<FlowTemplate[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setStarred(getStarredTemplateIds());
    setCustomTemplates(getCustomTemplates());
  }, []);

  // Refresh on mount AND when sidebar regains focus / visibility
  React.useEffect(() => {
    refresh();
    function onFocus() { refresh(); }
    function onVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const handleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleStarTemplate(id);
    setStarred(getStarredTemplateIds());
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteCustomTemplate(id);
    setConfirmDeleteId(null);
    setCustomTemplates(getCustomTemplates());
  };

  const handleUseTemplate = (template: FlowTemplate) => {
    if (template.isBuiltIn) {
      const copy = copyTemplate(template);
      setCustomTemplates(getCustomTemplates());
      onSelect(copy);
    } else {
      onSelect({
        ...template,
        nodes: JSON.parse(JSON.stringify(template.nodes)),
        edges: JSON.parse(JSON.stringify(template.edges)),
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, template: FlowTemplate) => {
    e.dataTransfer.setData("application/reactflow-template", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
  };

  // Filter templates based on search
  const filterBySearch = (templates: FlowTemplate[]) => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  };

  // Sort starred to top
  const sortStarredFirst = (templates: FlowTemplate[]) => {
    return [...templates].sort((a, b) => {
      const aStarred = starred.has(a.id) ? 0 : 1;
      const bStarred = starred.has(b.id) ? 0 : 1;
      return aStarred - bStarred;
    });
  };

  const builtInFiltered = sortStarredFirst(filterBySearch(BUILT_IN_TEMPLATES));
  const customFiltered = filterBySearch(customTemplates);

  // Group built-in templates by category
  const groupedBuiltIn = builtInFiltered.reduce<Record<string, FlowTemplate[]>>(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {}
  );

  const categoryLabels: Record<string, string> = {
    team: "Team",
    app: "App",
    benchmark: "Benchmark",
    scoring: "Scoring",
    improve: "Improve",
    workflow: "Workflow",
  };

  return (
    <div className="flex h-full w-72 flex-col border-l border-white/10 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">Templates</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition text-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab("templates")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            tab === "templates"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setTab("my-templates")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            tab === "my-templates"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Templates
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/30 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {tab === "templates" ? (
          builtInFiltered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No templates match your search.
            </div>
          ) : (
            Object.entries(groupedBuiltIn).map(([category, templates]) => (
              <div key={category} className="mb-3">
                <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoryLabels[category] ?? category}
                </div>
                <div className="space-y-1">
                  {templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      isStarred={starred.has(template.id)}
                      onStar={(e) => handleStar(e, template.id)}
                      onUse={() => handleUseTemplate(template)}
                      onDragStart={(e) => handleDragStart(e, template)}
                    />
                  ))}
                </div>
              </div>
            ))
          )
        ) : customFiltered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {searchQuery
              ? "No templates match your search."
              : "No custom templates yet. Save your current canvas as a template!"}
          </div>
        ) : (
          <div className="space-y-1">
            {customFiltered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isStarred={starred.has(template.id)}
                onStar={(e) => handleStar(e, template.id)}
                onUse={() => handleUseTemplate(template)}
                onDragStart={(e) => handleDragStart(e, template)}
                onDelete={(e) => handleDelete(e, template.id)}
                isConfirmingDelete={confirmDeleteId === template.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  isStarred,
  onStar,
  onUse,
  onDragStart,
  onDelete,
  isConfirmingDelete,
}: {
  template: FlowTemplate;
  isStarred: boolean;
  onStar: (e: React.MouseEvent) => void;
  onUse: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  isConfirmingDelete?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onUse}
      className="group cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:bg-white/5 hover:border-white/20 transition"
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition">
            {template.name}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
            {template.description}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onStar}
            className={`p-0.5 transition ${
              isStarred
                ? "text-yellow-400"
                : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-yellow-400"
            }`}
            title={isStarred ? "Unstar" : "Star to pin to top"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className={`p-0.5 transition ${
                isConfirmingDelete
                  ? "text-red-400 opacity-100"
                  : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-red-400"
              }`}
              title={isConfirmingDelete ? "Click again to confirm delete" : "Delete template"}
            >
              {isConfirmingDelete ? (
                <span className="text-[10px] font-medium">Confirm?</span>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{template.nodes.length} nodes</span>
        <span>{template.edges.length} edges</span>
        {template.isBuiltIn && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary text-[9px]">
            Built-in
          </span>
        )}
      </div>
    </div>
  );
}
