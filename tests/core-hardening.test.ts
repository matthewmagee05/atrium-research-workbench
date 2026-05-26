import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportBundle,
  freezeProtocol,
  initProject,
  listModules,
  resolveCorePaths,
  runProtocol
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function copyTier0Project(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-hardening-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), tmp, { recursive: true });
  initProject(tmp);
  return tmp;
}

describe("production hardening", () => {
  afterEach(() => {
    delete process.env.RWB_LLM_MOCK_RESPONSE;
  });

  it("validates all built-in module manifests", () => {
    const modules = listModules(paths.modulesRoot);
    expect(modules.map((mod) => mod.manifest.id)).toContain("llm-screener");
    expect(modules.map((mod) => mod.manifest.id)).toContain("prisma-flow");
    expect(modules.every((mod) => fs.existsSync(path.join(mod.dir, mod.manifest.entry)))).toBe(true);
  });

  it("rejects invalid node params before invoking a module", async () => {
    const projectDir = copyTier0Project();
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);
    const protocolText = fs.readFileSync(protocolPath, "utf8").replace(/fixture_id:\s*"?tiny-corpus"?/, "fixture_id: 42");
    fs.writeFileSync(protocolPath, protocolText, "utf8");
    await expect(runProtocol(protocolPath, paths, { projectDir })).rejects.toThrow(/Params for fixture-source/);
  });

  it("refuses bundle export when project files contain likely API keys", async () => {
    const projectDir = copyTier0Project();
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);
    await runProtocol(protocolPath, paths, { projectDir });
    fs.writeFileSync(path.join(projectDir, "leaky.env"), "ANTHROPIC_API_KEY=sk-ant-thisisnotarealkeybutlookslongenough1234567890\n", "utf8");
    expect(() => exportBundle(projectDir, path.join(os.tmpdir(), `rwb-secret-bundle-${Date.now()}`), paths)).toThrow(/possible secrets/);
  });

  it("records archived external API provenance for non-JSON raw responses", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-raw-provenance-project-"));
    const modulesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-raw-provenance-modules-"));
    const moduleDir = path.join(modulesRoot, "raw-provenance-source");
    fs.mkdirSync(path.join(moduleDir, "schemas"), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, "requirements.txt"), "", "utf8");
    fs.writeFileSync(path.join(moduleDir, "schemas", "params.json"), JSON.stringify({ type: "object", properties: {}, additionalProperties: false }), "utf8");
    fs.writeFileSync(path.join(moduleDir, "schemas", "output.json"), JSON.stringify({ type: "array", items: { type: "object" } }), "utf8");
    fs.writeFileSync(path.join(moduleDir, "manifest.yaml"), `
id: raw-provenance-source
version: 1.0.0
name: Raw Provenance Source
description: Test module that archives XML.
stage: source
runtime: python
entry: entry.py
runtime_version: ">=3.11"
dependencies:
  python: requirements.txt
inputs: []
outputs:
  - name: records
    schema: schemas/output.json
    description: Records.
    output_kind: structured_data
params_schema: schemas/params.json
llm:
  required: false
  budget: {max_tokens_per_run: 0, max_calls_per_run: 0, max_cost_usd_per_run: 0}
  prompts: []
determinism:
  level: volatile
  guarantee: Test-only raw archive.
  variance_sources: [external_api_state]
  reproduction_metrics: [schema_validity]
human_in_the_loop:
  enabled: false
  triggers: []
side_effects:
  network: true
  network_domains: [example.org]
  filesystem_write: true
  external_processes: false
author: Test
license: MIT
documentation_url: https://example.org
`, "utf8");
    fs.writeFileSync(path.join(moduleDir, "entry.py"), `
import json
import os
from pathlib import Path

raw_dir = Path(os.environ["RWB_RAW_RESPONSES_DIR"])
raw_dir.mkdir(parents=True, exist_ok=True)
(raw_dir / "response.xml").write_text("<feed><entry>ok</entry></feed>", encoding="utf-8")
with open(os.environ["RWB_OUTPUT_records"], "w", encoding="utf-8", newline="\\n") as handle:
    json.dump([{"id": "one"}], handle, indent=2, sort_keys=True)
    handle.write("\\n")
`, "utf8");

    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `
protocol_version: "1.0"
project:
  id: raw-provenance
  name: Raw Provenance
  created_at: "2026-05-26T00:00:00.000Z"
  created_by: test
frozen:
  is_frozen: false
budget:
  max_cost_usd_per_run: 0
  stop_on_budget_exceeded: true
reproduction_policy:
  default_mode: replay
nodes:
  - id: source
    name: Source
    module:
      id: raw-provenance-source
      version: 1.0.0
    params: {}
edges: []
`, "utf8");
    const localPaths = { ...paths, modulesRoot };
    freezeProtocol(protocolPath, localPaths);
    const manifest = await runProtocol(protocolPath, localPaths, { projectDir });
    const artifactId = manifest.nodes[0].outputs[0].artifact_id;
    const hashBody = artifactId.replace("sha256:", "");
    const meta = JSON.parse(fs.readFileSync(path.join(projectDir, ".rwb", "artifacts", hashBody.slice(0, 2), hashBody, "meta.json"), "utf8"));
    expect(meta.external_api_calls).toHaveLength(1);
    expect(meta.external_api_calls[0]).toMatchObject({
      service: "raw-provenance-source",
      endpoint: "https://example.org",
      response_archive_path: expect.stringMatching(/raw_responses\/.+\/source\/response\.xml/),
    });
    expect(fs.existsSync(path.join(projectDir, ".rwb", meta.external_api_calls[0].response_archive_path))).toBe(true);
  });

  it("enforces cumulative proxy budgets across repeated module LLM calls", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-proxy-budget-project-"));
    const modulesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-proxy-budget-modules-"));
    const moduleDir = path.join(modulesRoot, "double-llm");
    fs.mkdirSync(path.join(moduleDir, "schemas"), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, "requirements.txt"), "", "utf8");
    fs.writeFileSync(path.join(moduleDir, "schemas", "params.json"), JSON.stringify({ type: "object", properties: {}, additionalProperties: false }), "utf8");
    fs.writeFileSync(path.join(moduleDir, "schemas", "result.json"), JSON.stringify({ type: "object", required: ["ok"], properties: { ok: { type: "boolean" } }, additionalProperties: false }), "utf8");
    fs.writeFileSync(path.join(moduleDir, "manifest.yaml"), `
id: double-llm
version: 1.0.0
name: Double LLM
description: Test module that makes two LLM proxy calls.
stage: custom
runtime: python
entry: entry.py
runtime_version: ">=3.11"
dependencies:
  python: requirements.txt
inputs: []
outputs:
  - name: result
    schema: schemas/result.json
    description: Result.
    output_kind: structured_data
params_schema: schemas/params.json
llm:
  required: true
  budget: {max_tokens_per_run: 100, max_calls_per_run: 1, max_cost_usd_per_run: 1}
  prompts: []
determinism:
  level: replayable
  guarantee: Test-only LLM proxy calls.
  variance_sources: [llm_response]
  reproduction_metrics: [schema_validity]
human_in_the_loop:
  enabled: false
  triggers: []
side_effects:
  network: false
  network_domains: []
  filesystem_write: true
  external_processes: false
author: Test
license: MIT
documentation_url: https://example.org
`, "utf8");
    fs.writeFileSync(path.join(moduleDir, "entry.py"), `
import json
import os
import urllib.request

def call_llm():
    base = os.environ["RWB_PROXY_SOCKET"].rstrip("/")
    request = urllib.request.Request(
        f"{base}/llm.complete",
        data=json.dumps({
            "binding": {"provider": "ollama", "model_id": "test-model"},
            "messages": [{"role": "user", "content": "hi"}],
            "max_output_tokens": 4
        }).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

call_llm()
call_llm()
with open(os.environ["RWB_OUTPUT_result"], "w", encoding="utf-8", newline="\\n") as handle:
    json.dump({"ok": True}, handle)
    handle.write("\\n")
`, "utf8");

    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `
protocol_version: "1.0"
project:
  id: proxy-budget
  name: Proxy Budget
  created_at: "2026-05-26T00:00:00.000Z"
  created_by: test
frozen:
  is_frozen: false
budget:
  max_cost_usd_per_run: 1
  stop_on_budget_exceeded: true
reproduction_policy:
  default_mode: replay
nodes:
  - id: llm
    name: Double LLM
    module:
      id: double-llm
      version: 1.0.0
    params: {}
edges: []
`, "utf8");
    process.env.RWB_LLM_MOCK_RESPONSE = JSON.stringify({ text: "ok", input_tokens: 1, output_tokens: 1 });
    const localPaths = { ...paths, modulesRoot };
    freezeProtocol(protocolPath, localPaths);
    await expect(runProtocol(protocolPath, localPaths, { projectDir })).rejects.toThrow(/call limit|HTTP Error 500/);
  });
});
