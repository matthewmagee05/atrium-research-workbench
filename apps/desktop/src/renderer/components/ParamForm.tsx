import { useEffect, useMemo, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { Sparkles, Trash2, Info, AlertCircle } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { moduleExtras, stageFor } from "../store/module-catalog";

const api = window.rwb;

/**
 * Walk a JSON Schema and produce a uiSchema that:
 *   - puts `examples[0]` as a placeholder on string/number/integer fields
 *   - marks fields under `required` with ui:options.required = true (rjsf already does this,
 *     but we also surface a custom asterisk via classNames)
 *   - hides the title bar when there are no titles in the schema (so we don't show
 *     ugly auto-generated labels)
 */
function deriveUiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const uiSchema: Record<string, unknown> = { "ui:submitButtonOptions": { norender: true } };
  const properties = (schema as { properties?: Record<string, Record<string, unknown>> }).properties;
  if (!properties) return uiSchema;
  const required = ((schema as { required?: string[] }).required) ?? [];

  for (const [key, prop] of Object.entries(properties)) {
    const fieldUi: Record<string, unknown> = {};
    const examples = (prop as { examples?: unknown[] }).examples;
    if (Array.isArray(examples) && examples.length > 0) {
      const example = examples[0];
      if (typeof example === "string") {
        fieldUi["ui:placeholder"] = example;
      } else if (typeof example === "number" || typeof example === "boolean") {
        fieldUi["ui:placeholder"] = String(example);
      } else if (Array.isArray(example)) {
        // For arrays of strings, putting an example doesn't help; show as help text instead.
        fieldUi["ui:help"] = `Example: ${JSON.stringify(example)}`;
      }
    }
    const type = (prop as { type?: string }).type;
    if (type === "string" && (prop as { maxLength?: number }).maxLength === undefined && (prop as { format?: string }).format !== "uri") {
      const desc = (prop as { description?: string }).description ?? "";
      // Use a textarea for clearly long-form fields
      if (desc.length > 80 || key.includes("description") || key === "style_guide" || key === "topic") {
        fieldUi["ui:widget"] = "textarea";
        fieldUi["ui:options"] = { rows: 3 };
      }
    }
    if (required.includes(key)) {
      fieldUi["classNames"] = "rjsf-required";
    }
    uiSchema[key] = fieldUi;
  }
  return uiSchema;
}

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

  const uiSchema = useMemo(() => (schema ? deriveUiSchema(schema) : { "ui:submitButtonOptions": { norender: true } }), [schema]);

  const missingFields = useMemo(() => {
    if (!schema) return [];
    const required = ((schema as { required?: string[] }).required) ?? [];
    return required.filter((key) => {
      const value = (selectedNode?.params as Record<string, unknown> | undefined)?.[key];
      return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    });
  }, [schema, selectedNode]);

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
        {missingFields.length > 0 && (
          <div className="paramMissing">
            <AlertCircle size={14} />
            <div>
              <strong>Fill in {missingFields.length} required field{missingFields.length > 1 ? "s" : ""}:</strong>
              <ul>
                {missingFields.map((f) => <li key={f}><code>{f}</code></li>)}
              </ul>
            </div>
          </div>
        )}
        {extras?.recommendedNote && <p className="paramRecommendedNote">{extras.recommendedNote}</p>}

        {schema ? (
          <Form
            schema={schema}
            formData={selectedNode.params}
            validator={validator}
            onChange={(e) => { if (e.formData) updateNodeParams(selectedNode.id, e.formData); }}
            uiSchema={uiSchema}
            liveValidate
            showErrorList={false}
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
