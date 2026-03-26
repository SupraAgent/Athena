"use client";

import * as React from "react";
import type { Node, Edge } from "@xyflow/react";

type Snapshot = { nodes: Node[]; edges: Edge[] };

const MAX_HISTORY = 50;

/**
 * Generic undo/redo hook for React Flow canvases.
 * Tracks node/edge snapshots and provides Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts.
 */
export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void
) {
  const past = React.useRef<Snapshot[]>([]);
  const future = React.useRef<Snapshot[]>([]);
  // Counter instead of boolean — one skip per state setter call (setNodes + setEdges = 2)
  const skipCount = React.useRef(0);
  const lastSnapshot = React.useRef<string>("");
  // Version counter to force re-render when refs change (canUndo/canRedo derive from this)
  const [version, setVersion] = React.useState(0);

  // Record snapshots when nodes/edges change (debounced by JSON comparison)
  React.useEffect(() => {
    if (skipCount.current > 0) {
      skipCount.current--;
      return;
    }
    const snap = JSON.stringify({ nodes, edges });
    if (snap === lastSnapshot.current) return;

    if (lastSnapshot.current !== "") {
      past.current = [
        ...past.current.slice(-(MAX_HISTORY - 1)),
        JSON.parse(lastSnapshot.current) as Snapshot,
      ];
      future.current = [];
      setVersion((v) => v + 1);
    }
    lastSnapshot.current = snap;
  }, [nodes, edges]);

  // Derive canUndo/canRedo from version to guarantee freshness after mutations
  const canUndo = version >= 0 && past.current.length > 0;
  const canRedo = version >= 0 && future.current.length > 0;

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(JSON.parse(lastSnapshot.current) as Snapshot);
    lastSnapshot.current = JSON.stringify(prev);
    // Skip 2 effect fires: one for setNodes, one for setEdges
    skipCount.current = 2;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(JSON.parse(lastSnapshot.current) as Snapshot);
    lastSnapshot.current = JSON.stringify(next);
    skipCount.current = 2;
    setNodes(next.nodes);
    setEdges(next.edges);
    setVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  // Keyboard shortcuts
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return { undo, redo, canUndo, canRedo };
}
