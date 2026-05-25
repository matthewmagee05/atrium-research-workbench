import { useEffect, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { Sparkles, Trash2, Info } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { moduleExtras, stageFor } from "../store/module-catalog";

const api = window.rwb;

export function ParamForm() {
  const modules = useWorkspace((s) => s.modules);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const pipelineEdges = useWorkspace((s) => s.pipelineEdges);
  const selectedNodeId = useWorkspace((s) => s.selectedNodeId);
  const updateNodeParams = useWorkspace((s) => s.updateNodeParams);
  const removePipelineNode = useWorkspace((s) => s.removePipelineNode);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const selectedNode = pipelineNodes.find((n) => n.id === selectedNodeId);
  const selectedModule = selectedNode
    ? modules.find((m) => m.id === selectedNode.moduleId)
    : null;
  const extras = selectedModule ? moduleExtras(selectedModule.id) : null;
  const stage = stageFor(selectedModule?.stage);

  useEffect(() => {
    if (!selectedModule?.params_schema) {
      setSchema(null);
      setSchemaError(null);
      return;
    }
    if (!api?.loadModuleSchema) {
      setSchema(null);
      setSchemaError("IPC unavailable; running in browser preview");
      return;
    }
    setSchemaError(null);
    api
      .loadModuleSchema(selectedModule.id, selectedModule.params_schema)
      .then((s) => setSchema(s as Record<string, unknown>))
      .catch((e) => {
        setSchema(null);
        setSchemaError(e instanceof Error ? e.message : String(e));
      });
  }, [selectedModule?.id, selectedModule?.params_schema]);

  if (!selectedNode || !selectedModule) {
    return (
      <div className="paramForm empty">
        <Info size={20} />
        <p>Click a node on the canvas to edit it.</p>
      </div>
    );
  }

  const inputConnections = pipelineEdges.filter((e) => e.target === selectedNode.id);
  const outputConnections = pipelineEdges.filter((e) => e.source === selectedNode.id);

  return (
    <div className="paramForm">
      <div className="paramHeader" style={{ borderTopColor: stage.color }}>
        <div className="paramTitleRow">
          <strong className="paramTitle">{selectedModule.name}</strong>
          <button className="iconBtn danger" onClick={() => removePipelineNode(selectedNode.id)} title="Remove node">
            <Trash2 size={14} />
          </button>
        </div>
        <span className="paramStageBadge" style={{ background: stage.color }}>{stage.label}</span>
      </div>

      {extras && (
        <div className="paramAbout">
          <p className="paramTagline">{extras.tagline}</p>
          <p className="paramWhen"><strong>When to use:</strong> {extras.whenToUse}</p>
        </div>
      )}

      <div className="paramConnections">
        <div className="paramConnSection">
          <span className="paramConnLabel">Inputs</span>
          {selectedModule.inputs.length === 0 && <span className="paramConnEmpty">No inputs</span>}
          {selectedModule.inputs.map((input) => {
            const connected = inputConnections.find((e) => e.targetPort === input.name);
            const sourceNode = connected ? pipelineNodes.find((n) => n.id === connected.source) : null;
            const sourceModule = sourceNode ? modules.find((m) => m.id === sourceNode.moduleId) : null;
            return (
              <div key={input.name} className={`portRow inspector ${connected ? "connected" : (input.optional ? "optional" : "missing")}`}>
                <span className="portName">{input.name}{input.optional ? "?" : ""}</span>
                <span className="portConn">
                  {connected
                    ? `← ${sourceModule?.name ?? sourceNode?.moduleId}:${connected.sourcePort}`
                    : (input.optional ? "(optional)" : "not connected")}
                </span>
              </div>
            );
          })}
        </div>
        <div className="paramConnSection">
          <span className="paramConnLabel">Outputs</span>
          {selectedModule.outputs.map((output) => {
            const targets = outputConnections.filter((e) => e.sourcePort === output.name);
            return (
              <div key={output.name} className="portRow inspector outputs">
                <span className="portName">{output.name}</span>
                <span className="portConn">
                  {targets.length > 0
                    ? targets.map((t) => {
                        const targetNode = pipelineNodes.find((n) => n.id === t.target);
                        const targetModule = targetNode ? modules.find((m) => m.id === targetNode.moduleId) : null;
                        return `→ ${targetModule?.name ?? targetNode?.moduleId}:${t.targetPort}`;
                      }).join(", ")
                    : "(not used)"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="paramFormBody">
        <div className="paramFormHead">
          <span className="paramFormLabel">Parameters</span>
          {extras?.recommendedParams && Object.keys(extras.recommendedParams).length > 0 && (
            <button
              className="iconBtn small"
              onClick={() => updateNodeParams(selectedNode.id, { ...(extras.recommendedParams ?? {}) })}
              title="Replace current params with the recommended defaults"
            >
              <Sparkles size={12} /> Recommended defaults
            </button>
          )}
        </div>
        {extras?.recommendedNote && <p className="paramRecommendedNote">{extras.recommendedNote}</p>}

        {schema ? (
          <Form
            schema={schema}
            formData={selectedNode.params}
            validator={validator}
            onChange={(e) => { if (e.formData) updateNodeParams(selectedNode.id, e.formData); }}
            uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
            liveValidate
          />
        ) : (
          <div className="paramFallback">
            {schemaError && <p className="paramError">Schema unavailable: {schemaError}</p>}
            <label>
              Raw params (JSON)
              <textarea
                value={JSON.stringify(selectedNode.params, null, 2)}
                onChange={(e) => {
                  try { updateNodeParams(selectedNode.id, JSON.parse(e.target.value)); }
                  catch { /* ignore parse errors during typing */ }
                }}
                rows={8}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
