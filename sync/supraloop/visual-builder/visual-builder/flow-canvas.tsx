"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  useViewport,
  SelectionMode,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PersonaNode } from "./nodes/persona-node";
import { AppNode } from "./nodes/app-node";
import { CompetitorNode } from "./nodes/competitor-node";
import { ActionNode } from "./nodes/action-node";
import { NoteNode } from "./nodes/note-node";
import { TriggerNode } from "./nodes/trigger-node";
import { ConditionNode } from "./nodes/condition-node";
import { TransformNode } from "./nodes/transform-node";
import { OutputNode } from "./nodes/output-node";
import { LLMNode } from "./nodes/llm-node";
import { StepNode } from "./nodes/step-node";
import { ConsensusNode } from "./nodes/consensus-node";
import { AffinityCategoryNode } from "./nodes/affinity-category-node";
import { ConfigNode } from "./nodes/config-node";
import { NodePalette } from "./node-palette";
import { NodeInspector } from "./node-inspector";
import { NodeContextMenu } from "./node-context-menu";
import { TemplateManager } from "./template-manager";
import { TemplateSidebar } from "./template-sidebar";
import type { FlowTemplate } from "@/lib/flow-templates";
import {
  builderTemplateToFlowNodes,
  getNodesCenter,
  type BuilderTemplate,
} from "@/lib/builder-templates";
import { useUndoRedo } from "@/lib/use-undo-redo";
import { useClipboard } from "@/lib/use-clipboard";
import {
  useNodeGroups,
  applyGroupDragConstraints,
  createGroupId,
} from "@/lib/use-node-groups";
import { autoLayout } from "@/lib/auto-layout";

/** Restore locked-group CSS class from node data (survives serialization) */
function restoreGroupClassName(node: Node): Node {
  if (node.data?.groupId && !node.className?.includes("locked-group")) {
    const existing = node.className ? `${node.className} ` : "";
    return { ...node, className: `${existing}locked-group` };
  }
  return node;
}

const nodeTypes = {
  personaNode: PersonaNode,
  appNode: AppNode,
  competitorNode: CompetitorNode,
  actionNode: ActionNode,
  noteNode: NoteNode,
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  transformNode: TransformNode,
  outputNode: OutputNode,
  llmNode: LLMNode,
  stepNode: StepNode,
  consensusNode: ConsensusNode,
  affinityCategoryNode: AffinityCategoryNode,
  configNode: ConfigNode,
};

type FlowCanvasProps = {
  initialTemplate?: FlowTemplate | null;
  category: FlowTemplate["category"];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
};

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function FlowCanvasInner({
  initialTemplate,
  category,
  onNodesChange: onNodesChangeCb,
  onEdgesChange: onEdgesChangeCb,
}: FlowCanvasProps) {
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, rawOnNodesChange] = useNodesState(
    initialTemplate ? autoLayout(initialTemplate.nodes).map(restoreGroupClassName) : []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialTemplate?.edges ?? []
  );
  const [showTemplates, setShowTemplates] = React.useState(!initialTemplate);
  const [showTemplateSidebar, setShowTemplateSidebar] = React.useState(false);
  const [needsPostRenderLayout, setNeedsPostRenderLayout] = React.useState(!!initialTemplate);

  // Post-render auto-layout: once nodes are measured, re-run layout with real sizes
  React.useEffect(() => {
    if (!needsPostRenderLayout) return;
    const timer = setTimeout(() => {
      const measured = getNodes();
      if (measured.length > 0 && measured.some((n) => (n as { measured?: { width?: number } }).measured?.width)) {
        setNodes(autoLayout(measured));
        setTimeout(() => fitView({ padding: 0.15 }), 50);
      }
      setNeedsPostRenderLayout(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [needsPostRenderLayout, getNodes, setNodes, fitView]);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  );
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const [contextMenu, setContextMenu] = React.useState<
    | { type: "node"; nodeId: string; x: number; y: number }
    | { type: "selection"; nodeIds: string[]; x: number; y: number }
    | null
  >(null);

  // ── Hooks ────────────────────────────────────────────────────
  const setNodesDirectly = React.useCallback(
    (n: Node[]) => setNodes(n),
    [setNodes]
  );
  const setEdgesDirectly = React.useCallback(
    (e: Edge[]) => setEdges(e),
    [setEdges]
  );
  const { undo, redo, canUndo, canRedo } = useUndoRedo(
    nodes,
    edges,
    setNodesDirectly,
    setEdgesDirectly
  );

  const { lockedGroups, isNodeInLockedGroup, getGroupId } =
    useNodeGroups(nodes);

  useClipboard(nodes, edges, setNodes, setEdges);

  // Track multi-selection
  useOnSelectionChange({
    onChange: React.useCallback(
      ({ nodes: selNodes }: { nodes: Node[] }) => {
        const ids = selNodes.map((n) => n.id);
        setSelectedNodeIds(ids);
        if (ids.length === 1) {
          setSelectedNodeId(ids[0]);
        } else if (ids.length === 0) {
          setSelectedNodeId(null);
        }
      },
      []
    ),
  });

  const selectedNode = React.useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // ── Notify parent (use refs to avoid re-render churn) ────────
  const onNodesChangeCbRef = React.useRef(onNodesChangeCb);
  onNodesChangeCbRef.current = onNodesChangeCb;
  const onEdgesChangeCbRef = React.useRef(onEdgesChangeCb);
  onEdgesChangeCbRef.current = onEdgesChangeCb;

  React.useEffect(() => {
    onNodesChangeCbRef.current?.(nodes);
  }, [nodes]);

  React.useEffect(() => {
    onEdgesChangeCbRef.current?.(edges);
  }, [edges]);

  // ── Delete/Backspace key handler ────────────────────────────
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = nodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        e.preventDefault();
        const ids = selected.map((n) => n.id);
        const deletable = ids.filter((id) => !isNodeInLockedGroup(id));
        if (deletable.length === 0) {
          alert("All selected nodes are in locked groups. Unlock first.");
          return;
        }
        const idSet = new Set(deletable);
        setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
        setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
        setSelectedNodeId(null);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodes, isNodeInLockedGroup, setNodes, setEdges]);

  // ── Wrap onNodesChange to enforce group constraints ──────────
  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const constrained = applyGroupDragConstraints(
        changes,
        nodes,
        lockedGroups
      );
      rawOnNodesChange(constrained);
    },
    [rawOnNodesChange, nodes, lockedGroups]
  );

  // ── Connections ──────────────────────────────────────────────
  const onConnect = React.useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge({ ...params, type: "smoothstep", animated: true }, eds)
      );
    },
    [setEdges]
  );

  // ── Drag & Drop ──────────────────────────────────────────────
  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasTemplate =
      event.dataTransfer.types.includes("application/builder-template") ||
      event.dataTransfer.types.includes("application/reactflow-template");
    event.dataTransfer.dropEffect = hasTemplate ? "copy" : "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      // Handle template drops from sidebar
      const templateStr = event.dataTransfer.getData("application/reactflow-template");
      if (templateStr) {
        try {
          const template: FlowTemplate = JSON.parse(templateStr);
          const dropPos = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const minX = Math.min(...template.nodes.map((n) => n.position.x));
          const minY = Math.min(...template.nodes.map((n) => n.position.y));
          const suffix = Date.now();
          const idMap: Record<string, string> = {};
          // Auto-lock dropped template nodes as a group
          const gid = createGroupId();
          const newNodes = template.nodes.map((n) => {
            const newId = `${n.type}-${suffix}-${n.id}`;
            idMap[n.id] = newId;
            return {
              ...n,
              id: newId,
              position: {
                x: dropPos.x + (n.position.x - minX),
                y: dropPos.y + (n.position.y - minY),
              },
              data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
              className: "locked-group",
            };
          });
          const newEdges = template.edges.map((e) => ({
            ...e,
            id: `e-${suffix}-${e.id}`,
            source: idMap[e.source] ?? e.source,
            target: idMap[e.target] ?? e.target,
          }));
          setNodes((nds) => [...nds, ...newNodes]);
          setEdges((eds) => [...eds, ...newEdges]);
        } catch {
          // ignore malformed template data
        }
        return;
      }

      // Builder template drop
      const builderTemplateStr = event.dataTransfer.getData(
        "application/builder-template"
      );
      if (builderTemplateStr) {
        try {
          const template: BuilderTemplate = JSON.parse(builderTemplateStr);
          const dropPos = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const { nodes: newNodes, edges: newEdges } =
            builderTemplateToFlowNodes(template, 0);
          const center = getNodesCenter(newNodes);
          // Auto-lock dropped template nodes as a group
          const gid = createGroupId();
          const adjusted = newNodes.map((n) => ({
            ...n,
            position: {
              x: n.position.x + dropPos.x - center.x,
              y: n.position.y + dropPos.y - center.y,
            },
            data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
            className: "locked-group",
          }));
          setNodes((nds) => [...nds, ...adjusted]);
          setEdges((eds) => [...eds, ...newEdges]);
        } catch {
          // ignore
        }
        return;
      }

      // Single node drop from palette
      const type = event.dataTransfer.getData("application/reactflow-type");
      const dataStr = event.dataTransfer.getData("application/reactflow-data");
      if (!type) return;

      let data: Record<string, unknown> = {};
      if (dataStr) {
        try { data = JSON.parse(dataStr); } catch { /* ignore malformed */ }
      }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, setEdges, screenToFlowPosition]
  );

  // ── Node interactions ────────────────────────────────────────
  const handleNodeClick = React.useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const handlePaneClick = React.useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, []);

  const handleNodeContextMenu = React.useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        type: "node",
        nodeId: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleSelectionContextMenu = React.useCallback(
    (event: React.MouseEvent, selNodes: Node[]) => {
      event.preventDefault();
      setContextMenu({
        type: "selection",
        nodeIds: selNodes.map((n) => n.id),
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleDuplicateNode = React.useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const src = nds.find((n) => n.id === nodeId);
        if (!src) return nds;
        const dup: Node = {
          id: `${src.type}-${Date.now()}`,
          type: src.type,
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          data: JSON.parse(JSON.stringify(src.data)),
        };
        return [...nds, dup];
      });
    },
    [setNodes]
  );

  const handleNodeUpdate = React.useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n))
      );
    },
    [setNodes]
  );

  const handleNodeDelete = React.useCallback(
    (nodeId: string) => {
      // Don't allow deleting individual nodes that are in a locked group
      if (isNodeInLockedGroup(nodeId)) {
        alert("This node is in a locked group. Unlock the group first to delete individual nodes.");
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, isNodeInLockedGroup]
  );

  const handleDeleteSelection = React.useCallback(
    (nodeIds: string[]) => {
      // Filter out nodes that belong to locked groups
      const deletable = nodeIds.filter((id) => !isNodeInLockedGroup(id));
      if (deletable.length === 0) {
        alert("All selected nodes are in locked groups. Unlock the groups first to delete.");
        return;
      }
      const idSet = new Set(deletable);
      setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, isNodeInLockedGroup]
  );

  // ── Lock / Unlock groups ─────────────────────────────────────
  const handleLockGroup = React.useCallback(
    (nodeIds: string[]) => {
      const gid = createGroupId();
      setNodes((nds) =>
        nds.map((n) =>
          nodeIds.includes(n.id)
            ? { ...n, data: { ...n.data, groupId: gid }, className: "locked-group" }
            : n
        )
      );
    },
    [setNodes]
  );

  const handleUnlockGroup = React.useCallback(
    (nodeIds: string[]) => {
      // Find the groupId from any node in the selection
      const node = nodes.find(
        (n) => nodeIds.includes(n.id) && n.data?.groupId
      );
      if (!node?.data?.groupId) return;
      const gid = node.data.groupId as string;
      setNodes((nds) =>
        nds.map((n) =>
          n.data?.groupId === gid
            ? {
                ...n,
                data: { ...n.data, groupId: undefined },
                className: (n.className ?? "").replace(/\blocked-group\b/g, "").trim() || undefined,
              }
            : n
        )
      );
    },
    [nodes, setNodes]
  );

  // ── Merge for parent (My Templates panel / sidebar) ──────────
  const mergeNodesIntoCanvas = React.useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      // Auto-lock merged template nodes as a group
      const gid = createGroupId();
      const lockedNodes = newNodes.map((n) => ({
        ...n,
        data: { ...JSON.parse(JSON.stringify(n.data)), groupId: gid },
        className: "locked-group",
      }));
      setNodes((nds) => [...nds, ...lockedNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    },
    [setNodes, setEdges]
  );

  function handleLoadTemplate(template: FlowTemplate) {
    // Confirm before replacing existing canvas content
    if (
      nodes.length > 0 &&
      !window.confirm(
        "Loading this template will replace your current canvas. Continue?"
      )
    ) {
      return;
    }
    // Deep copy nodes without auto-locking — replacing the canvas is not a group operation
    const freshNodes = template.nodes.map((n) => ({
      ...n,
      data: JSON.parse(JSON.stringify(n.data)),
    }));
    setNodes(autoLayout(freshNodes));
    setEdges(template.edges.map((e) => ({ ...e })));
    setShowTemplates(false);
    setSelectedNodeId(null);
    setNeedsPostRenderLayout(true);
  }

  // ── Check if context menu target is locked ───────────────────
  const contextMenuIsLocked = React.useMemo(() => {
    if (!contextMenu) return false;
    if (contextMenu.type === "node") {
      return isNodeInLockedGroup(contextMenu.nodeId);
    }
    return contextMenu.nodeIds.some((id) => isNodeInLockedGroup(id));
  }, [contextMenu, isNodeInLockedGroup]);

  const handleAutoLayout = React.useCallback(() => {
    const measured = getNodes();
    setNodes(autoLayout(measured));
    setTimeout(() => fitView({ padding: 0.15 }), 50);
  }, [getNodes, setNodes, fitView]);

  return (
    <div className="relative flex h-full w-full">
      {/* Locked group styling */}
      <style>{`
        .react-flow__node.locked-group {
          outline: 2px dashed rgba(12, 206, 107, 0.4);
          outline-offset: 4px;
        }
      `}</style>

      <div ref={containerRef} className="relative flex-1">
        {showTemplates && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <TemplateManager
              category={category}
              currentNodes={nodes}
              currentEdges={edges}
              onSelect={handleLoadTemplate}
              onClose={() => setShowTemplates(false)}
            />
          </div>
        )}

        <div className="absolute left-3 top-3 z-10">
          <NodePalette />
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13"/></svg>
          </button>
          <button
            onClick={handleAutoLayout}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
            title="Auto-space nodes"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button
            onClick={() => setShowTemplateSidebar((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showTemplateSidebar
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
            }`}
          >
            Templates
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={handleNodeContextMenu}
          onSelectionContextMenu={handleSelectionContextMenu}
          nodeTypes={nodeTypes}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          fitView
          className="bg-background"
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { stroke: "rgba(12, 206, 107, 0.4)", strokeWidth: 2 },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(255,255,255,0.05)"
          />
          <Controls className="!bg-white/5 !border-white/10 !rounded-lg [&>button]:!bg-white/5 [&>button]:!border-white/10 [&>button]:!text-foreground [&>button:hover]:!bg-white/10" />
          <MiniMap
            className="!bg-white/5 !border-white/10 !rounded-lg"
            nodeColor="rgba(12, 206, 107, 0.3)"
            maskColor="rgba(0,0,0,0.6)"
          />
        </ReactFlow>
        <GroupUnlockButtons
          nodes={nodes}
          lockedGroups={lockedGroups}
          onUnlock={handleUnlockGroup}
          containerRef={containerRef}
        />
      </div>

      {/* Context Menu */}
      {contextMenu?.type === "node" && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isLocked={contextMenuIsLocked}
          onEdit={() => {
            setSelectedNodeId(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            handleDuplicateNode(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onDelete={() => {
            handleNodeDelete(contextMenu.nodeId);
            setContextMenu(null);
          }}
          onUnlockGroup={
            contextMenuIsLocked
              ? () => {
                  handleUnlockGroup([contextMenu.nodeId]);
                  setContextMenu(null);
                }
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu?.type === "selection" && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectionCount={contextMenu.nodeIds.length}
          isLocked={contextMenuIsLocked}
          onLockGroup={
            !contextMenuIsLocked
              ? () => {
                  handleLockGroup(contextMenu.nodeIds);
                  setContextMenu(null);
                }
              : undefined
          }
          onUnlockGroup={
            contextMenuIsLocked
              ? () => {
                  handleUnlockGroup(contextMenu.nodeIds);
                  setContextMenu(null);
                }
              : undefined
          }
          onDelete={() => {
            handleDeleteSelection(contextMenu.nodeIds);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Template Sidebar */}
      {showTemplateSidebar && (
        <TemplateSidebar
          onSelect={handleLoadTemplate}
          onMerge={mergeNodesIntoCanvas}
          canvasNodes={nodes}
          canvasEdges={edges}
          onClose={() => setShowTemplateSidebar(false)}
        />
      )}

      {/* Node Inspector Panel */}
      {selectedNode && (
        <NodeInspector
          node={selectedNode}
          onUpdate={handleNodeUpdate}
          onDelete={handleNodeDelete}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

/**
 * Renders a floating unlock button at the top-center of each locked group.
 * Uses flowToScreenPosition for correct placement regardless of pan/zoom,
 * then positions absolutely relative to the ReactFlow container via the
 * wrapper ref passed in.
 */
function GroupUnlockButtons({
  nodes,
  lockedGroups,
  onUnlock,
  containerRef,
}: {
  nodes: Node[];
  lockedGroups: Map<string, Set<string>>;
  onUnlock: (nodeIds: string[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { flowToScreenPosition, getNodes } = useReactFlow();
  // Force re-render on viewport changes so buttons track pan/zoom
  useViewport();

  if (lockedGroups.size === 0) return null;

  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  const measured = getNodes();
  const buttons: React.ReactNode[] = [];

  for (const [groupId, memberIds] of lockedGroups) {
    const members = nodes.filter((n) => memberIds.has(n.id));
    if (members.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    for (const n of members) {
      // Use measured width if available, otherwise estimate
      const mNode = measured.find((m) => m.id === n.id);
      const w = (mNode as { measured?: { width?: number } })?.measured?.width ?? 200;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
    }

    // Convert flow coordinates to screen coordinates
    const centerScreen = flowToScreenPosition({
      x: (minX + maxX) / 2,
      y: minY,
    });

    // Position relative to the ReactFlow container, not the viewport
    const left = centerScreen.x - containerRect.left;
    const top = centerScreen.y - containerRect.top - 32;

    buttons.push(
      <button
        key={groupId}
        onClick={(e) => {
          e.stopPropagation();
          onUnlock([...memberIds]);
        }}
        className="absolute z-40 flex items-center gap-1 rounded-lg border border-primary/30 bg-neutral-900/90 px-2.5 py-1 text-[11px] font-medium text-primary shadow-lg backdrop-blur-sm hover:bg-primary/15 transition pointer-events-auto"
        style={{ left, top, transform: "translateX(-50%)" }}
        title="Unlock this group"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
        Unlock
      </button>
    );
  }

  return <>{buttons}</>;
}
