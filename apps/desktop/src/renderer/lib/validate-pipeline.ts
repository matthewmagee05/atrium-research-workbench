import Ajv from "ajv";
import type { ModuleManifest, PipelineEdge, PipelineNode } from "../store/workspace";

export interface ValidationIssue {
  nodeId: string;
  nodeName: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface PipelineValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

interface SchemaLoader {
  (moduleId: string, schemaRef: string): Promise<Record<string, unknown>>;
}

/**
 * Validate every node's params against its module's params_schema, plus check
 * that required inputs are connected. Returns a structured list of issues so
 * the UI can surface them next to the offending node.
 */
export async function validatePipeline(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  modules: ModuleManifest[],
  loadSchema: SchemaLoader,
): Promise<PipelineValidationResult> {
  const issues: ValidationIssue[] = [];

  if (nodes.length === 0) {
    issues.push({
      nodeId: "",
      nodeName: "(pipeline)",
      message: "Pipeline is empty. Drag modules onto the canvas first.",
      severity: "error",
    });
    return { valid: false, issues };
  }

  const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false });

  for (const node of nodes) {
    const mod = modules.find((m) => m.id === node.moduleId);
    const displayName = mod?.name ?? node.moduleId;

    // 1. Required-input connectivity check.
    if (mod?.inputs) {
      for (const input of mod.inputs) {
        if (input.optional) continue;
        const connected = edges.some((e) => e.target === node.id && e.targetPort === input.name);
        if (!connected) {
          issues.push({
            nodeId: node.id,
            nodeName: displayName,
            field: input.name,
            message: `Input "${input.name}" is not connected.`,
            severity: "error",
          });
        }
      }
    }

    // 2. Param schema validation.
    if (!mod?.params_schema) continue;
    let schema: Record<string, unknown>;
    try {
      schema = await loadSchema(mod.id, mod.params_schema);
    } catch {
      // Can't load schema; skip but don't block.
      continue;
    }

    // Required + empty-string check (Ajv won't catch an empty string for a required string field).
    const required = (schema as { required?: string[] }).required ?? [];
    const properties = (schema as { properties?: Record<string, { type?: string; minLength?: number }> }).properties ?? {};
    for (const key of required) {
      const value = (node.params as Record<string, unknown>)[key];
      const propDef = properties[key];
      const looksEmpty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "" && propDef?.type === "string");
      if (looksEmpty) {
        issues.push({
          nodeId: node.id,
          nodeName: displayName,
          field: key,
          message: `Required parameter "${key}" is empty.`,
          severity: "error",
        });
      }
    }

    // General Ajv check for everything else.
    try {
      const validate = ajv.compile(schema);
      if (!validate(node.params)) {
        for (const error of validate.errors ?? []) {
          // Skip required-empty errors — we already reported them above.
          if (error.keyword === "required") continue;
          const fieldPath = error.instancePath || (error.params as { missingProperty?: string }).missingProperty || "";
          issues.push({
            nodeId: node.id,
            nodeName: displayName,
            field: fieldPath.replace(/^\//, ""),
            message: error.message ?? "schema validation failed",
            severity: "error",
          });
        }
      }
    } catch {
      // Schema isn't a valid JSON Schema; skip.
    }
  }

  return { valid: issues.filter((i) => i.severity === "error").length === 0, issues };
}
