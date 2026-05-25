import fs from "node:fs";
import path from "node:path";
import { readJsonFile } from "../fs-utils";
import { readProtocol } from "../protocol/service";
import type { RunManifest } from "../types";

export function generateMethods(projectDir: string): string {
  const protocol = readProtocol(path.join(projectDir, "protocol.yaml"));
  const runManifestPath = path.join(projectDir, ".rwb", "run.manifest.json");
  const runManifest = fs.existsSync(runManifestPath)
    ? readJsonFile<RunManifest>(runManifestPath)
    : null;
  const modules = protocol.nodes.map((node) => `${node.module.id}@${node.module.version}`).join(", ");
  const corpusLockPath = path.join(projectDir, "corpus.lock.json");
  const corpusText = fs.existsSync(corpusLockPath)
    ? "A corpus lock file was generated and included with the reproducibility bundle."
    : "This pipeline did not produce a corpus lock file.";
  const llmNodes = protocol.nodes.filter((node) => node.llm_binding);
  const llmText = llmNodes.length > 0
    ? llmNodes.map((node) => `${node.name}: ${JSON.stringify(node.llm_binding)}`).join("\n")
    : "No LLM-assisted components were executed in this run.";
  const text = `## Methods

This study was conducted using Research Workbench version ${runManifest?.workbench_version ?? "0.0.0-tier1a"}.
The full protocol was frozen on ${protocol.frozen.frozen_at ?? "unknown"} (protocol hash: \`${protocol.frozen.protocol_hash ?? "unfrozen"}\`) and is included in the reproducibility bundle accompanying this manuscript.

### Corpus

${corpusText}

### Analysis

The pipeline executed the following declared modules: ${modules}. The authoritative node-to-artifact mapping is recorded in \`run.manifest.json\`.

### LLM-assisted components

${llmText}

### Reproducibility

Replay mode uses archived artifacts without executing bundled module code or making network calls. Deterministic verification re-executes deterministic stages and compares produced artifact ids against \`run.manifest.json\`.

### Authoritative Artifacts

\`METHODS.md\` is a convenience narrative generated from authoritative artifacts. If it conflicts with \`protocol.yaml\`, \`corpus.lock.json\`, \`audit.jsonl\`, \`run.manifest.json\`, or \`environment.lock\`, the structured artifacts are authoritative.
`;
  fs.writeFileSync(path.join(projectDir, "METHODS.md"), text, "utf8");
  return text;
}
