import fs from "node:fs";
import YAML from "yaml";
import { canonicalJson, normalizeForJson } from "../canonicalize/json";
import { sha256 } from "../canonicalize/hash";
import { loadModule } from "../modules/registry";
import type { CorePaths, Protocol } from "../types";

function protocolForHash(protocol: Protocol): unknown {
  const clone = structuredClone(protocol) as Protocol;
  clone.frozen = {
    ...clone.frozen,
    protocol_hash: "sha256:pending"
  };
  return normalizeForJson(clone);
}

export function readProtocol(protocolPath: string): Protocol {
  return YAML.parse(fs.readFileSync(protocolPath, "utf8")) as Protocol;
}

export function protocolHash(protocol: Protocol): string {
  return sha256(canonicalJson(protocolForHash(protocol)));
}

export function validateProtocol(protocolPath: string, paths: CorePaths): Protocol {
  const protocol = readProtocol(protocolPath);
  if (protocol.protocol_version !== "1.0") {
    throw new Error(`Unsupported protocol_version: ${protocol.protocol_version}`);
  }
  if (!Array.isArray(protocol.nodes) || protocol.nodes.length === 0) {
    throw new Error("Protocol must contain at least one node");
  }
  const nodeIds = new Set(protocol.nodes.map((node) => node.id));
  for (const node of protocol.nodes) {
    const mod = loadModule(node.module.id, paths.modulesRoot);
    if (mod.manifest.version !== node.module.version) {
      throw new Error(`Module ${node.module.id} version mismatch: protocol=${node.module.version} installed=${mod.manifest.version}`);
    }
  }
  for (const edge of protocol.edges ?? []) {
    if (!nodeIds.has(edge.from.node_id)) {
      throw new Error(`Edge references missing from node: ${edge.from.node_id}`);
    }
    if (!nodeIds.has(edge.to.node_id)) {
      throw new Error(`Edge references missing to node: ${edge.to.node_id}`);
    }
  }
  return protocol;
}

export function freezeProtocol(protocolPath: string, paths: CorePaths, frozenBy = "cli"): Protocol {
  const protocol = validateProtocol(protocolPath, paths);
  const frozen: Protocol = {
    ...protocol,
    frozen: {
      is_frozen: true,
      frozen_at: new Date().toISOString(),
      frozen_by: frozenBy,
      protocol_hash: "sha256:pending"
    }
  };
  frozen.frozen.protocol_hash = protocolHash(frozen);
  fs.writeFileSync(protocolPath, YAML.stringify(frozen), "utf8");
  return frozen;
}
