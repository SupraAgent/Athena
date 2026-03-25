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
    return { ...node, className: "locked-group" };
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
  onMergeReady?: (merge: (nodes: Node[], edges: Edge[]) => void) => void;
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
  onMergeReady,
}: FlowCanvasProps) {
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
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

  // ── Notify parent ────────────────────────────────────────────
  React.useEffect(() => {
    onNodesChangeCb?.(nodes);
  }, [nodes, onNodesChangeCb]);

  React.useEffect(() => {
    onEdgesChangeCb?.(edges);
  }, [edges, onEdgesChangeCb]);

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
              data: { ...n.data },
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
          const adjusted = newNodes.map((n) => ({
            ...n,
            position: {
              x: n.position.x + dropPos.x - center.x,
              y: n.position.y + dropPos.y - center.y,
            },
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

      const data = dataStr ? JSON.parse(dataStr) : {};
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
          data: { ...src.data },
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
      if (isNodeInLockedGroup(nodeId)) return;
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
      const idSet = new Set(nodeIds);
      setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target))
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
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
                className: undefined,
              }
            : n
        )
      );
    },
    [nodes, setNodes]
  );

  // ── Merge for parent (My Templates panel) ────────────────────
  const mergeNodesIntoCanvas = React.useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      setNodes((nds) => [...nds, ...newNodes]);
      setEdges((eds) => [...eds, ...newEdges]);
    },
    [setNodes, setEdges]
  );

  React.useEffect(() => {
    onMergeReady?.(mergeNodesIntoCanvas);
  }, [onMergeReady, mergeNodesIntoCanvas]);

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
    setNodes(autoLayout(template.nodes));
    setEdges(template.edges);
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
        .react-flow__node.locked-group::after {
          content: "\\1F512";
          position: absolute;
          top: -8px;
          right: -8px;
          font-size: 10px;
        }
      `}</style>

      <div className="relative flex-1">
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
