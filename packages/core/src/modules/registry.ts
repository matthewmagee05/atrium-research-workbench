import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import YAML from "yaml";
import { canonicalJson } from "../canonicalize/json";
import { sha256 } from "../canonicalize/hash";
import type { ModuleManifest } from "../types";
import { moduleManifestSchema } from "./manifest-schema";

export interface LoadedModule {
  dir: string;
  manifest: ModuleManifest;
  manifestHash: string;
}

export function loadModule(moduleId: string, modulesRoot: string): LoadedModule {
  const dir = path.join(modulesRoot, moduleId);
  const manifestPath = path.join(dir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Module not found: ${moduleId} at ${manifestPath}`);
  }
  const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8")) as ModuleManifest;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(moduleManifestSchema);
  if (!validate(manifest)) {
    throw new Error(`Invalid module manifest for ${moduleId}: ${ajv.errorsText(validate.errors)}`);
  }
  if (manifest.id !== moduleId) {
    throw new Error(`Module directory/name mismatch: ${moduleId} contains ${manifest.id}`);
  }
  const entryPath = path.join(dir, manifest.entry);
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Module ${moduleId} missing entry file: ${manifest.entry}`);
  }
  for (const schemaRef of [manifest.params_schema, ...manifest.inputs.map((input) => input.schema), ...manifest.outputs.map((output) => output.schema)]) {
    if (!fs.existsSync(path.join(dir, schemaRef))) {
      throw new Error(`Module ${moduleId} missing schema: ${schemaRef}`);
    }
  }
  return {
    dir,
    manifest,
    manifestHash: sha256(canonicalJson(manifest))
  };
}

export function listModules(modulesRoot: string): LoadedModule[] {
  if (!fs.existsSync(modulesRoot)) {
    return [];
  }
  return fs
    .readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(modulesRoot, entry.name, "manifest.yaml")))
    .map((entry) => loadModule(entry.name, modulesRoot))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export function schemaPath(mod: LoadedModule, schemaRef: string): string {
  return path.join(mod.dir, schemaRef);
}
