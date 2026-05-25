import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Trash2 } from "lucide-react";
import { useWorkspace, type ModuleManifest } from "../store/workspace";
import { stageFor } from "../store/module-catalog";

interface ModuleNodeData {
  pipelineNodeId: string;
  moduleId: string;
}

function schemaTint(schemaRef: string | undefined): string {
  if (!schemaRef) return "#888";
  if (schemaRef.includes("records") || schemaRef.includes("normalized") || schemaRef.includes("deduped")) return "#2c8b9a";
  if (schemaRef.includes("screening")) return "#5b8c45";
  if (schemaRef.includes("extract")) return "#6b9c45";
  if (schemaRef.includes("hypotheses") || schemaRef.includes("questions")) return "#a06ce0";
  if (schemaRef.includes("preregistration") || schemaRef.includes("prisma") || schemaRef.includes("narrative")) return "#ea7a4a";
  if (schemaRef.includes("summary") || schemaRef.includes("tables") || schemaRef.includes("figure")) return "#4a85b0";
  if (schemaRef.includes("corpus")) return "#7b67e6";
  return "#888";
}

function ModuleNodeImpl({ data, selected }: NodeProps<ModuleNodeData>) {
  const modules = useWorkspace((s) => s.modules);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const removeNode = useWorkspace((s) => s.removePipelineNode);
  const runProgress = useWorkspace((s) => s.runProgress);

  const mod: ModuleManifest | undefined = useMemo(
    () => modules.find((m) => m.id === data.moduleId),
    [modules, data.moduleId],
  );
  const node = pipelineNodes.find((n) => n.id === data.pipelineNodeId);
  const stage = stageFor(mod?.stage);
  const StageIcon = stage.icon;
  const inputs = mod?.inputs ?? [];
  const outputs = mod?.outputs ?? [];
  const progress = runProgress.byNode[data.pipelineNodeId];

  const unconnectedRequiredInputs = useMemo(() => {
    return inputs.filter((input) => {
      if (input.optional) return false;
      return !pipelineEdges.some((e) => e.target === data.pipelineNodeId && e.targetPort === input.name);
    });
  }, [inputs, pipelineEdges, data.pipelineNodeId]);

  const paramsLooksEmpty = !node?.params || Object.keys(node.params).length === 0;
  const moduleNeedsParams = (mod?.params_schema ?? "").length > 0;
  const showWarning = unconnectedRequiredInputs.length > 0 || (moduleNeedsParams && paramsLooksEmpty);

  return (
    <div
      className={`moduleNode ${selected ? "selected" : ""} ${progress?.status ? `status-${progress.status}` : ""}`}
      style={{ borderColor: stage.color }}
    >
      <div className="moduleNodeHeader" style={{ background: stage.color }}>
        <StageIcon size={14} />
        <span className="moduleNodeStage">{stage.label}</span>
        <button
          className="moduleNodeRemove"
          onClick={(e) => { e.stopPropagation(); removeNode(data.pipelineNodeId); }}
          title="Remove from pipeline"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="moduleNodeBody">
        <strong className="moduleNodeTitle">{mod?.name ?? data.moduleId}</strong>
        {showWarning && (
          <span className="moduleNodeWarning">
            {unconnectedRequiredInputs.length > 0
              ? `Needs: ${unconnectedRequiredInputs.map((i) => i.name).join(", ")}`
              : "Needs params"}
          </span>
        )}
        {progress?.status === "running" && <span className="moduleNodeStatus running">Running…</span>}
        {progress?.status === "completed" && (
          <span className="moduleNodeStatus completed">
            ✓ {progress.cacheHit ? "cached" : `${(progress.durationMs ?? 0) / 1000}s`}
          </span>
        )}
        {progress?.status === "failed" && <span className="moduleNodeStatus failed">✗ failed</span>}
      </div>

      <div className="moduleNodePorts">
        {inputs.map((input, idx) => {
          const top = 56 + idx * 22;
          return (
            <div key={`in-${input.name}`} className="portRow" style={{ top }}>
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={{ background: schemaTint(input.schema), borderColor: schemaTint(input.schema), top }}
              />
              <span className="portLabel left" style={{ top }}>
                {input.name}{input.optional ? "?" : ""}
              </span>
            </div>
          );
        })}
        {outputs.map((output, idx) => {
          const top = 56 + idx * 22;
          return (
            <div key={`out-${output.name}`} className="portRow" style={{ top }}>
              <span className="portLabel right" style={{ top }}>
                {output.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                style={{ background: schemaTint(output.schema), borderColor: schemaTint(output.schema), top }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ModuleNode = memo(ModuleNodeImpl);
