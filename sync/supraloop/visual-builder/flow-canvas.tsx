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
  type Connection,
  type Node,
  type Edge,
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
import { NodePalette } from "./node-palette";
import { NodeInspector } from "./node-inspector";
import { NodeContextMenu } from "./node-context-menu";
import { TemplateManager } from "./template-manager";
import type { FlowTemplate } from "@/lib/flow-templates";
import { useUndoRedo } from "@/lib/use-undo-redo";

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
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialTemplate?.nodes ?? []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialTemplate?.edges ?? []
  );
  const [showTemplates, setShowTemplates] = React.useState(!initialTemplate);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null
  );
  const [contextMenu, setContextMenu] = React.useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

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

  const selectedNode = React.useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Notify parent of changes
  React.useEffect(() => {
    onNodesChangeCb?.(nodes);
  }, [nodes, onNodesChangeCb]);

  React.useEffect(() => {
    onEdgesChangeCb?.(edges);
  }, [edges, onEdgesChangeCb]);

  const onConnect = React.useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge({ ...params, type: "smoothstep", animated: true }, eds)
      );
    },
    [setEdges]
  );

  const onDragOver = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    []
  );

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
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
    [setNodes, screenToFlowPosition]
  );

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
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
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
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  function handleLoadTemplate(template: FlowTemplate) {
    setNodes(template.nodes);
    setEdges(template.edges);
    setShowTemplates(false);
    setSelectedNodeId(null);
  }

  return (
    <div className="relative flex h-full w-full">
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
            onClick={() => setShowTemplates(true)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
          >
            Templates
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={handleNodeContextMenu}
          nodeTypes={nodeTypes}
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
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
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
          onClose={() => setContextMenu(null)}
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
