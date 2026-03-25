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
import { TryCatchNode } from "./nodes/try-catch-node";
import { CodeNode } from "./nodes/code-node";
import { SwitchNode } from "./nodes/switch-node";
import { LoopNode } from "./nodes/loop-node";
import { TransformNode } from "./nodes/transform-node";
import { SubWorkflowNode } from "./nodes/sub-workflow-node";
import { ScheduleNode } from "./nodes/schedule-node";
import { DatabaseNode } from "./nodes/database-node";
import { AINode } from "./nodes/ai-node";
import { NodeSidebar } from "./node-sidebar";
import { NodeConfigPanel } from "./node-config-panel";
import type { WorkflowNodeData, NodeRegistry, FlowNode as CoreFlowNode, FlowEdge as CoreFlowEdge } from "../core/types";
import { autoLayout } from "../core/auto-layout";
import { computeSmartDefaults, detectUpstreamFromEdges, type SmartDefaultRule } from "../core/smart-defaults";

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  try_catch: TryCatchNode,
  code: CodeNode,
  switch: SwitchNode,
  loop: LoopNode,
  transform: TransformNode,
  sub_workflow: SubWorkflowNode,
  schedule: ScheduleNode,
  database: DatabaseNode,
  ai: AINode,
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
  /** Node registry for smart defaults. When provided, newly dropped nodes get intelligent defaults. */
  registry?: NodeRegistry;
  /** Custom smart default rules to run in addition to built-in rules. */
  smartDefaultRules?: SmartDefaultRule[];
}

function getNodeId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `node_${Date.now()}_${random}`;
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
  registry,
  smartDefaultRules,
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
      } else if (nodeType === "try_catch") {
        data = { nodeType: "try_catch", label, config: { tryPath: "success", catchPath: "error", ...defaultConfig } };
      } else if (nodeType === "code") {
        data = { nodeType: "code", label, config: { language: "javascript", code: "", timeout: 5000, ...defaultConfig } };
      } else if (nodeType === "switch") {
        data = { nodeType: "switch", label, config: { expression: "", cases: [], defaultCase: "default", ...defaultConfig } };
      } else if (nodeType === "loop") {
        data = { nodeType: "loop", label, config: { arrayExpression: "", itemVariable: "item", maxIterations: 100, ...defaultConfig } };
      } else if (nodeType === "transform") {
        data = { nodeType: "transform", label, config: { inputExpression: "", operations: [], ...defaultConfig } };
      } else if (nodeType === "sub_workflow") {
        data = { nodeType: "sub_workflow", label, config: { workflowId: "", inputMappings: {}, outputMappings: {}, maxDepth: 10, ...defaultConfig } };
      } else if (nodeType === "schedule") {
        data = { nodeType: "schedule", label, config: { mode: "interval", interval: { value: 5, unit: "minutes" }, ...defaultConfig } };
      } else if (nodeType === "ai") {
        data = { nodeType: "ai", label, config: { provider: "", model: "", prompt: "", temperature: 0.7, maxToolRounds: 5, ...defaultConfig } };
      } else {
        data = { nodeType: "delay", label, config: { duration: 1, unit: "hours", ...defaultConfig } };
      }

      // Smart defaults: compute intelligent defaults based on workflow context
      if (registry) {
        try {
          // Convert current nodes/edges to core types for the smart defaults engine
          const coreNodes: CoreFlowNode[] = nodes.map((n) => ({
            id: n.id,
            type: n.type ?? "action",
            position: n.position,
            data: n.data as unknown as WorkflowNodeData,
          }));
          const coreEdges: CoreFlowEdge[] = edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
          }));

          // Detect upstream node from drop position
          const upstreamNodeId = detectUpstreamFromEdges(position, coreNodes, coreEdges);

          const smartDefaults = computeSmartDefaults(
            {
              newNodeType: nodeType,
              newNodeSubType: subType,
              existingNodes: coreNodes,
              existingEdges: coreEdges,
              registry,
              upstreamNodeId,
            },
            smartDefaultRules
          );

          // Merge smart defaults into the node's config (smart defaults override defaultConfig)
          if (Object.keys(smartDefaults).length > 0) {
            const currentConfig = (data as { config: Record<string, unknown> }).config;
            (data as { config: Record<string, unknown> }).config = {
              ...currentConfig,
              ...smartDefaults,
            };
          }
        } catch {
          // Smart defaults must never prevent node creation
        }
      }

      const newNode: Node = {
        id: getNodeId(),
        type: nodeType,
        position,
        data: data as unknown as Record<string, unknown>,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes, nodes, edges, registry, smartDefaultRules]
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
                case "try_catch": return "rgba(249, 115, 22, 0.5)";
                case "code": return "rgba(139, 92, 246, 0.5)";
                case "switch": return "rgba(6, 182, 212, 0.5)";
                case "loop": return "rgba(99, 102, 241, 0.5)";
                case "transform": return "rgba(16, 185, 129, 0.5)";
                case "sub_workflow": return "rgba(56, 189, 248, 0.5)";
                case "schedule": return "rgba(139, 92, 246, 0.5)";
                case "ai": return "rgba(168, 85, 247, 0.5)";
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
