"use client";

import * as React from "react";
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";

import { TriggerNode } from "./nodes/trigger-node";
import { ActionNode } from "./nodes/action-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { NodeSidebar } from "./node-sidebar";
import { NodeConfigPanel } from "./node-config-panel";
import type { WorkflowNodeData } from "../core/types";
import { autoLayout } from "../core/auto-layout";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

export interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  saving?: boolean;
  /** Auto-save debounce in ms. Default: 1000 */
  autoSaveDelay?: number;
  /** Custom node types to merge with defaults */
  customNodeTypes?: NodeTypes;
  /** Hide the node sidebar */
  hideSidebar?: boolean;
  /** Hide the config panel */
  hideConfigPanel?: boolean;
}

let nodeId = 0;
function getNodeId() {
  return `node_${++nodeId}_${Date.now()}`;
}

function FlowCanvasInner({
  initialNodes,
  initialEdges,
  onSave,
  saving,
  autoSaveDelay = 1000,
  customNodeTypes,
  hideSidebar,
  hideConfigPanel,
}: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(autoLayout(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null);
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReturnType<typeof import("@xyflow/react").useReactFlow> | null>(null);

  const mergedNodeTypes = React.useMemo(
    () => ({ ...nodeTypes, ...customNodeTypes }),
    [customNodeTypes]
  );

  // Auto-save with debounce
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const triggerSave = React.useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onSave(nodesRef.current, edgesRef.current);
    }, autoSaveDelay);
  }, [onSave, autoSaveDelay]);

  React.useEffect(() => {
    if (nodes === initialNodes && edges === initialEdges) return;
    triggerSave();
  }, [nodes, edges, triggerSave, initialNodes, initialEdges]);

  const onConnect: OnConnect = React.useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;
      if (targetNode.type === "trigger") return;

      const edge: Edge = {
        ...connection,
        id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [nodes, setEdges]
  );

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      const { nodeType, subType, label, defaultConfig } = JSON.parse(rawData);

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !reactFlowInstance) return;

      const position = (reactFlowInstance as unknown as { screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number } }).screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      let data: WorkflowNodeData;
      if (nodeType === "trigger") {
        data = { nodeType: "trigger", triggerType: subType, label, config: defaultConfig };
      } else if (nodeType === "action") {
        data = { nodeType: "action", actionType: subType, label, config: defaultConfig };
      } else if (nodeType === "condition") {
        data = { nodeType: "condition", label, config: { field: "", operator: "equals", value: "", ...defaultConfig } };
      } else {
        data = { nodeType: "delay", label, config: { duration: 1, unit: "hours", ...defaultConfig } };
      }

      const newNode: Node = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: data as unknown as Record<string, unknown>,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDataChange = React.useCallback(
    (nodeId: string, newData: WorkflowNodeData) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: newData as unknown as Record<string, unknown> } : n
        )
      );
      setSelectedNode((prev) =>
        prev?.id === nodeId ? { ...prev, data: newData as unknown as Record<string, unknown> } : prev
      );
    },
    [setNodes]
  );

  const onDeleteNode = React.useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  return (
    <div className="flex h-full">
      {!hideSidebar && <NodeSidebar />}

      <div ref={reactFlowWrapper} className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => setReactFlowInstance(instance as unknown as typeof reactFlowInstance)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={mergedNodeTypes}
          colorMode="dark"
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.05)" />
          <Controls
            className="!bg-white/[0.05] !border-white/10 !rounded-xl [&>button]:!bg-white/[0.05] [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10"
          />
          <MiniMap
            className="!bg-white/[0.03] !border-white/10 !rounded-xl"
            nodeColor={(node) => {
              switch (node.type) {
                case "trigger": return "rgba(168, 85, 247, 0.5)";
                case "action": return "rgba(59, 130, 246, 0.5)";
                case "condition": return "rgba(234, 179, 8, 0.5)";
                case "delay": return "rgba(156, 163, 175, 0.5)";
                default: return "rgba(255,255,255,0.1)";
              }
            }}
          />
        </ReactFlow>
      </div>

      {!hideConfigPanel && selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onDataChange={onNodeDataChange}
          onDelete={onDeleteNode}
        />
      )}

      {saving && (
        <div className="absolute top-3 right-3 text-[10px] text-muted-foreground/50">
          Saving…
        </div>
      )}
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
