import { useEffect, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { useWorkspace } from "../store/workspace";

const api = window.rwb;

export function ParamForm() {
  const modules = useWorkspace((s) => s.modules);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const selectedNodeId = useWorkspace((s) => s.selectedNodeId);
  const updateNodeParams = useWorkspace((s) => s.updateNodeParams);
  const removePipelineNode = useWorkspace((s) => s.removePipelineNode);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);

  const selectedNode = pipelineNodes.find((n) => n.id === selectedNodeId);
  const selectedModule = selectedNode
    ? modules.find((m) => m.id === selectedNode.moduleId)
    : null;

  useEffect(() => {
    if (!selectedModule?.params_schema) {
      setSchema(null);
      return;
    }
    if (api) {
      fetch(`rwb-local://module-schema/${selectedModule.id}/${selectedModule.params_schema}`)
        .then((r) => r.json())
        .then(setSchema)
        .catch(() => setSchema(null));
    } else {
      setSchema({
        type: "object",
        properties: {
          source_mode: { type: "string", enum: ["fixture", "live_archived", "snapshot"], default: "fixture" },
          query: { type: "string" },
          max_records: { type: "integer", minimum: 1, default: 25 },
        },
      });
    }
  }, [selectedModule]);

  if (!selectedNode || !selectedModule) {
    return (
      <div className="paramForm">
        <span className="paramHint">Select a node on the canvas to edit its parameters</span>
      </div>
    );
  }

  return (
    <div className="paramForm">
      <div className="paramHeader">
        <strong>{selectedModule.name}</strong>
        <button className="removeNodeBtn" onClick={() => removePipelineNode(selectedNode.id)}>Remove</button>
      </div>
      <span className="paramMeta">{selectedModule.stage} · {selectedModule.runtime} · v{selectedModule.version}</span>
      {selectedModule.inputs && selectedModule.inputs.length > 0 && (
        <div className="paramPorts">
          <span className="portLabel">Inputs:</span>
          {selectedModule.inputs.map((i) => (
            <span key={i.name} className="portChip input">{i.name}</span>
          ))}
        </div>
      )}
      {selectedModule.outputs && selectedModule.outputs.length > 0 && (
        <div className="paramPorts">
          <span className="portLabel">Outputs:</span>
          {selectedModule.outputs.map((o) => (
            <span key={o.name} className="portChip output">{o.name}</span>
          ))}
        </div>
      )}
      {schema ? (
        <Form
          schema={schema}
          formData={selectedNode.params}
          validator={validator}
          onChange={(e) => {
            if (e.formData) updateNodeParams(selectedNode.id, e.formData);
          }}
          uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
          liveValidate
        />
      ) : (
        <div className="paramFallback">
          <label>
            Parameters (JSON)
            <textarea
              value={JSON.stringify(selectedNode.params, null, 2)}
              onChange={(e) => {
                try {
                  updateNodeParams(selectedNode.id, JSON.parse(e.target.value));
                } catch { /* ignore parse errors during typing */ }
              }}
              rows={6}
            />
          </label>
        </div>
      )}
    </div>
  );
}
