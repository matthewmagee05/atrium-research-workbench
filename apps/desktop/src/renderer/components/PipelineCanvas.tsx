import React, { useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import { useWorkspace } from "../store/workspace";
import { validateEdge } from "../store/edge-validation";
import "reactflow/dist/style.css";

export function PipelineCanvas() {
  const modules = useWorkspace((s) => s.modules);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const addPipelineEdge = useWorkspace((s) => s.addPipelineEdge);
  const updateNodePosition = useWorkspace((s) => s.updateNodePosition);
  const setSelectedNodeId = useWorkspace((s) => s.setSelectedNodeId);
  const setStatus = useWorkspace((s) => s.setStatus);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const rfNodes: Node[] = useMemo(
    () =>
      pipelineNodes.map((n) => {
        const mod = modules.find((m) => m.id === n.moduleId);
        return {
          id: n.id,
          position: n.position,
          data: { label: `${mod?.name ?? n.moduleId}\n${mod?.stage ?? ""}` },
          type: "default",
        };
      }),
    [pipelineNodes, modules]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      pipelineEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: `${e.sourcePort} → ${e.targetPort}`,
        animated: true,
      })),
    [pipelineEdges]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const positionChanges = changes.filter(
        (c): c is NodeChange & { type: "position"; id: string; position?: { x: number; y: number } } =>
          c.type === "position" && "position" in c && c.position !== undefined
      );
      for (const change of positionChanges) {
        if (change.position) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [updateNodePosition]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = pipelineNodes.find((n) => n.id === connection.source);
      const targetNode = pipelineNodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      const sourceMod = modules.find((m) => m.id === sourceNode.moduleId);
      const targetMod = modules.find((m) => m.id === targetNode.moduleId);
      const sourcePort = sourceMod?.outputs?.[0]?.name ?? "output";
      const targetPort = targetMod?.inputs?.[0]?.name ?? "input";

      const result = validateEdge(sourceNode, sourcePort, targetNode, targetPort, modules, pipelineEdges);
      if (!result.valid) {
        setStatus(`Edge rejected: ${result.reason}`);
        return;
      }

      addPipelineEdge({
        id: `${connection.source}-${connection.target}-${Date.now().toString(36)}`,
        source: connection.source,
        sourcePort,
        target: connection.target,
        targetPort,
      });
    },
    [pipelineNodes, pipelineEdges, modules, addPipelineEdge, setStatus]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const moduleId = event.dataTransfer.getData("application/rwb-module");
      if (!moduleId || !reactFlowInstance.current) return;
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addPipelineNode({
        id: `${moduleId}-${Date.now().toString(36)}`,
        moduleId,
        params: {},
        position,
      });
    },
    [addPipelineNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <section className="canvas" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        fitView
        deleteKeyCode="Backspace"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </section>
  );
}
