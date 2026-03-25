"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";
import {
  getWorkspaces,
  createWorkspace,
  saveWorkspace,
  renameWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  loadWorkspace,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  type Workspace,
} from "@/lib/use-workspaces";

type WorkspaceManagerProps = {
  canvasNodes: Node[];
  canvasEdges: Edge[];
  onLoadWorkspace: (nodes: Node[], edges: Edge[], workspaceId: string) => void;
};

export function WorkspaceManager({
  canvasNodes,
  canvasEdges,
  onLoadWorkspace,
}: WorkspaceManagerProps) {
  const [open, setOpen] = React.useState(false);
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  );
  const [newName, setNewName] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);
  const [saveFlash, setSaveFlash] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(() => {
    setWorkspaces(getWorkspaces());
    setActiveId(getActiveWorkspaceId());
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        setOpen(false);
        setConfirmDeleteId(null);
        setRenamingId(null);
        setShowNew(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSave() {
    if (activeId) {
      saveWorkspace(activeId, canvasNodes, canvasEdges);
      refresh();
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
    }
  }

  function handleSaveAs() {
    setShowNew(true);
    setNewName("");
  }

  function handleCreateNew() {
    const name = newName.trim() || `Workspace ${workspaces.length + 1}`;
    const ws = createWorkspace(name, canvasNodes, canvasEdges);
    setActiveWorkspaceId(ws.id);
    setShowNew(false);
    setNewName("");
    refresh();
  }

  function handleLoad(ws: Workspace) {
    // Auto-save current workspace before switching
    if (activeId && canvasNodes.length > 0) {
      saveWorkspace(activeId, canvasNodes, canvasEdges);
    }
    setActiveWorkspaceId(ws.id);
    onLoadWorkspace(ws.nodes, ws.edges, ws.id);
    setOpen(false);
    refresh();
  }

  function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteWorkspace(id);
    setConfirmDeleteId(null);
    if (activeId === id) {
      setActiveWorkspaceId(null);
      onLoadWorkspace([], [], "");
    }
    refresh();
  }

  function handleDuplicate(id: string) {
    const copy = duplicateWorkspace(id);
    if (copy) refresh();
  }

  function handleRenameStart(ws: Workspace) {
    setRenamingId(ws.id);
    setRenameValue(ws.name);
  }

  function handleRenameSubmit(id: string) {
    if (renameValue.trim()) {
      renameWorkspace(id, renameValue.trim());
    }
    setRenamingId(null);
    refresh();
  }

  function handleNewWorkspace() {
    // Auto-save current if exists
    if (activeId && canvasNodes.length > 0) {
      saveWorkspace(activeId, canvasNodes, canvasEdges);
    }
    const ws = createWorkspace(
      `Workspace ${workspaces.length + 1}`,
      [],
      []
    );
    setActiveWorkspaceId(ws.id);
    onLoadWorkspace([], [], ws.id);
    setOpen(false);
    refresh();
  }

  const activeName =
    workspaces.find((w) => w.id === activeId)?.name ?? "No workspace";

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-white/10 transition"
        >
          <span className="max-w-[160px] truncate">{activeName}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {activeId && (
          <button
            onClick={handleSave}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              saveFlash
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            }`}
            title="Save workspace"
          >
            {saveFlash ? "Saved!" : "Save"}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 rounded-xl border border-white/10 bg-neutral-900/95 shadow-xl backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Workspaces
            </span>
            <div className="flex gap-1">
              <button
                onClick={handleNewWorkspace}
                className="rounded-md px-2 py-0.5 text-xs text-emerald-400 hover:bg-white/10 transition"
              >
                + New
              </button>
              <button
                onClick={handleSaveAs}
                className="rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-white/10 transition"
              >
                Save As...
              </button>
            </div>
          </div>

          {/* Save As form */}
          {showNew && (
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateNew();
                  if (e.key === "Escape") setShowNew(false);
                }}
                placeholder="Workspace name..."
                className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <button
                onClick={handleCreateNew}
                className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 transition"
              >
                Save
              </button>
            </div>
          )}

          {/* Workspace list */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {workspaces.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No workspaces yet. Save your current canvas or create a new one.
              </p>
            )}
            {workspaces.map((ws) => {
              const isActive = ws.id === activeId;
              const isConfirming = confirmDeleteId === ws.id;
              const isRenaming = renamingId === ws.id;

              return (
                <div
                  key={ws.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 transition ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-foreground hover:bg-white/5"
                  }`}
                >
                  {/* Name or rename input */}
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSubmit(ws.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => handleRenameSubmit(ws.id)}
                        className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      />
                    ) : (
                      <button
                        onClick={() => handleLoad(ws)}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-sm font-medium">
                          {ws.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {ws.nodes.length} nodes &middot; updated{" "}
                          {new Date(ws.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRenameStart(ws)}
                        className="rounded p-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        title="Rename"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDuplicate(ws.id)}
                        className="rounded p-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        title="Duplicate"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(ws.id)}
                        className={`rounded p-1 text-xs transition ${
                          isConfirming
                            ? "bg-red-500/20 text-red-400"
                            : "text-muted-foreground hover:bg-white/10 hover:text-red-400"
                        }`}
                        title={isConfirming ? "Click again to confirm" : "Delete"}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
