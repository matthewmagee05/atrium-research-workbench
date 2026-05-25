import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
} from "reactflow";
import { useWorkspace } from "../store/workspace";
import { validateEdge } from "../store/edge-validation";
import { moduleExtras } from "../store/module-catalog";
import { ModuleNode } from "./ModuleNode";
import { Workflow } from "lucide-react";
import "reactflow/dist/style.css";

const nodeTypes: NodeTypes = { module: ModuleNode };

export function PipelineCanvas() {
  const modules = useWorkspace((s) => s.modules);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const addPipelineEdge = useWorkspace((s) => s.addPipelineEdge);
  const removePipelineEdge = useWorkspace((s) => s.removePipelineEdge);
  const updateNodePosition = useWorkspace((s) => s.updateNodePosition);
  const setSelectedNodeId = useWorkspace((s) => s.setSelectedNodeId);
  const setStatus = useWorkspace((s) => s.setStatus);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const lastNodeCount = useRef(0);

  useEffect(() => {
    if (!reactFlowInstance.current) return;
    if (pipelineNodes.length > 0 && pipelineNodes.length !== lastNodeCount.current) {
      requestAnimationFrame(() => {
        reactFlowInstance.current?.fitView({ padding: 0.2, duration: 400 });
      });
    }
    lastNodeCount.current = pipelineNodes.length;
  }, [pipelineNodes.length]);

  const rfNodes: Node[] = useMemo(
    () =>
      pipelineNodes.map((n) => ({
        id: n.id,
        position: n.position,
        type: "module",
        data: { pipelineNodeId: n.id, moduleId: n.moduleId },
      })),
    [pipelineNodes],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      pipelineEdges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourcePort,
        target: e.target,
        targetHandle: e.targetPort,
        label: `${e.sourcePort} → ${e.targetPort}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
      })),
    [pipelineEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && "position" in change && change.position) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [updateNodePosition],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourcePort = connection.sourceHandle;
      const targetPort = connection.targetHandle;
      if (!sourcePort || !targetPort) {
        setStatus("Edge rejected: drag from a specific output port to a specific input port");
        return;
      }
      const sourceNode = pipelineNodes.find((n) => n.id === connection.source);
      const targetNode = pipelineNodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      const result = validateEdge(sourceNode, sourcePort, targetNode, targetPort, modules, pipelineEdges);
      if (!result.valid) {
        setStatus(`Edge rejected: ${result.reason}`);
        return;
      }

      addPipelineEdge({
        id: `${connection.source}:${sourcePort}-${connection.target}:${targetPort}-${Date.now().toString(36)}`,
        source: connection.source,
        sourcePort,
        target: connection.target,
        targetPort,
      });
      setStatus(`Connected ${sourcePort} → ${targetPort}`);
    },
    [pipelineNodes, pipelineEdges, modules, addPipelineEdge, setStatus],
  );

  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        removePipelineEdge(edge.id);
      }
    },
    [removePipelineEdge],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const moduleId = event.dataTransfer.getData("application/rwb-module");
      if (!moduleId || !reactFlowInstance.current) return;
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const extras = moduleExtras(moduleId);
      addPipelineNode({
        id: `${moduleId}-${Date.now().toString(36)}`,
        moduleId,
        params: { ...(extras.recommendedParams ?? {}) },
        position,
      });
    },
    [addPipelineNode],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <section className="canvas" onDrop={onDrop} onDragOver={onDragOver}>
      {pipelineNodes.length === 0 && (
        <div className="canvasEmpty">
          <Workflow size={48} />
          <h3>Your pipeline is empty</h3>
          <p>Drag modules from the library on the left, or pick a template from the welcome screen.</p>
          <ul>
            <li><strong>Source</strong> finds papers</li>
            <li><strong>Normalize</strong> and <strong>Dedupe</strong> clean them</li>
            <li><strong>Screen</strong> and <strong>Extract</strong> filter and pull data</li>
            <li><strong>Analyze</strong> and <strong>Report</strong> summarize</li>
          </ul>
        </div>
      )}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        fitView={pipelineNodes.length > 0}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{ animated: true, markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </section>
  );
}
