import type { JSONSchemaType } from "ajv";
import type { ModuleManifest } from "../types";

export const moduleManifestSchema: JSONSchemaType<ModuleManifest> = {
  type: "object",
  required: [
    "id",
    "version",
    "name",
    "description",
    "stage",
    "runtime",
    "entry",
    "runtime_version",
    "inputs",
    "outputs",
    "params_schema",
    "llm",
    "determinism",
    "human_in_the_loop",
    "side_effects",
    "author",
    "license"
  ],
  additionalProperties: true,
  properties: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    version: { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+.*$" },
    name: { type: "string" },
    description: { type: "string" },
    stage: { type: "string" },
    runtime: { type: "string", enum: ["python", "r", "node", "binary"] },
    entry: { type: "string" },
    runtime_version: { type: "string" },
    dependencies: {
      type: "object",
      required: [],
      nullable: true,
      additionalProperties: { type: "string" }
    },
    inputs: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "schema"],
        additionalProperties: true,
        properties: {
          name: { type: "string" },
          schema: { type: "string" },
          optional: { type: "boolean", nullable: true }
        }
      }
    },
    outputs: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "schema", "description", "output_kind"],
        additionalProperties: true,
        properties: {
          name: { type: "string" },
          schema: { type: "string" },
          description: { type: "string" },
          output_kind: { type: "string", enum: ["structured_data", "figure_spec", "rendered_figure", "report_text"] }
        }
      }
    },
    params_schema: { type: "string" },
    ui_schema: { type: "string", nullable: true },
    llm: {
      type: "object",
      required: ["required"],
      additionalProperties: true,
      properties: {
        required: { type: "boolean" },
        budget: { type: "object", required: [], nullable: true, additionalProperties: true },
        prompts: {
          type: "array",
          nullable: true,
          items: {
            type: "object",
            required: ["id", "path", "version"],
            additionalProperties: true,
            properties: {
              id: { type: "string" },
              path: { type: "string" },
              version: { type: "string" }
            }
          }
        }
      }
    },
    determinism: {
      type: "object",
      required: ["level", "guarantee"],
      additionalProperties: true,
      properties: {
        level: { type: "string", enum: ["deterministic", "replayable", "volatile", "stochastic"] },
        guarantee: { type: "string" },
        variance_sources: { type: "array", nullable: true, items: { type: "string" } },
        reproduction_metrics: { type: "array", nullable: true, items: { type: "string" } }
      }
    },
    human_in_the_loop: {
      type: "object",
      required: ["enabled"],
      additionalProperties: true,
      properties: {
        enabled: { type: "boolean" },
        triggers: { type: "array", nullable: true, items: { type: "string" } }
      }
    },
    side_effects: {
      type: "object",
      required: ["network", "filesystem_write", "external_processes"],
      additionalProperties: true,
      properties: {
        network: { type: "boolean" },
        network_domains: { type: "array", nullable: true, items: { type: "string" } },
        filesystem_write: { type: "boolean" },
        external_processes: { type: "boolean" }
      }
    },
    author: { type: "string" },
    license: { type: "string" },
    documentation_url: { type: "string", nullable: true }
  }
};
