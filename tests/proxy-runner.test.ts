import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeProtocol, initProject, listReviewItems, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

describe("runner proxy process", () => {
  it("lets a module create journal, progress, and review events through RWB_PROXY_SOCKET", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-proxy-"));
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    fs.writeFileSync(protocolPath, `protocol_version: "1.0"
project:
  id: "99999999-9999-4999-8999-999999999999"
  name: "Proxy Smoke"
  created_at: "2026-05-25T00:00:00.000Z"
  created_by: "test"
frozen:
  is_frozen: false
budget:
  max_llm_calls_per_run: 0
  max_tokens_per_run: 0
  max_cost_usd_per_run: 0
  stop_on_budget_exceeded: true
reproduction_policy: {}
nodes:
  - id: "88888888-8888-4888-8888-888888888888"
    name: "Proxy Smoke"
    module: {id: "proxy-smoke", version: "1.0.0"}
    params: {}
edges: []
`, "utf8");
    freezeProtocol(protocolPath, paths);
    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    expect(manifest.completed_status).toBe("success");
    const reviews = listReviewItems(projectDir, "pending");
    expect(reviews).toHaveLength(1);
    expect(fs.readFileSync(path.join(projectDir, "journal.md"), "utf8")).toContain("Proxy smoke journal entry");
  });
});
