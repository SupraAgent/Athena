import * as React from "react";
import type { Node, Edge } from "@xyflow/react";

type Snapshot = { nodes: Node[]; edges: Edge[] };

const MAX_HISTORY = 50;

export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void
) {
  const past = React.useRef<Snapshot[]>([]);
  const future = React.useRef<Snapshot[]>([]);
  const skipRecord = React.useRef(false);
  const lastSnapshot = React.useRef<string>("");
  // Version counter to force re-render when refs change
  const [, setVersion] = React.useState(0);

  // Record snapshots when nodes/edges change (debounced by JSON comparison)
  React.useEffect(() => {
    if (skipRecord.current) {
      skipRecord.current = false;
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

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(
      JSON.parse(lastSnapshot.current) as Snapshot
    );
    lastSnapshot.current = JSON.stringify(prev);
    skipRecord.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setVersion((v) => v + 1);
  }, [setNodes, setEdges]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(
      JSON.parse(lastSnapshot.current) as Snapshot
    );
    lastSnapshot.current = JSON.stringify(next);
    skipRecord.current = true;
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
