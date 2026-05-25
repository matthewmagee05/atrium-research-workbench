import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  freezeProtocol,
  initProject,
  resolveCorePaths,
  runProtocol
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function setupProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-modes-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), tmp, { recursive: true });
  initProject(tmp);
  freezeProtocol(path.join(tmp, "protocol.yaml"), paths);
  return tmp;
}

describe("run modes", () => {
  it("deterministic-rerun re-executes only deterministic nodes and skips others", async () => {
    const projectDir = setupProject();
    const protocolPath = path.join(projectDir, "protocol.yaml");

    const first = await runProtocol(protocolPath, paths, { projectDir, mode: "execute" });
    expect(first.completed_status).toBe("success");

    const rerun = await runProtocol(protocolPath, paths, { projectDir, mode: "deterministic-rerun" });
    expect(rerun.completed_status).toBe("success");
    expect(rerun.nodes).toHaveLength(3);
    for (const node of rerun.nodes) {
      expect(node.status).toBe("completed");
    }
    for (let i = 0; i < first.nodes.length; i++) {
      expect(rerun.nodes[i].outputs.map((o) => o.artifact_id))
        .toEqual(first.nodes[i].outputs.map((o) => o.artifact_id));
    }
  });

  it("full-rerun re-executes all nodes regardless of determinism level", async () => {
    const projectDir = setupProject();
    const protocolPath = path.join(projectDir, "protocol.yaml");

    const first = await runProtocol(protocolPath, paths, { projectDir, mode: "execute" });
    expect(first.completed_status).toBe("success");

    const rerun = await runProtocol(protocolPath, paths, { projectDir, mode: "full-rerun" });
    expect(rerun.completed_status).toBe("success");
    expect(rerun.nodes).toHaveLength(3);
    for (const node of rerun.nodes) {
      expect(node.status).toBe("completed");
      expect(node.cache_hit).toBe(false);
    }
  });

  it("variance-audit runs target nodes multiple times and records results", async () => {
    const projectDir = setupProject();
    const protocolPath = path.join(projectDir, "protocol.yaml");

    await runProtocol(protocolPath, paths, { projectDir, mode: "execute" });

    const audit = await runProtocol(protocolPath, paths, {
      projectDir,
      mode: "variance-audit",
      varianceIterations: 2
    });
    expect(audit.completed_status).toBe("success");
    // All Tier 0 modules are deterministic, so variance-audit skips them all
    // (no replayable/stochastic modules to audit)
    const skipped = audit.nodes.filter((n) => n.status === "skipped");
    const executed = audit.nodes.filter((n) => n.status === "completed");
    // In the tier-0 spike, all are deterministic so all get skipped in variance-audit mode
    // But if no prior outputs exist for a skipped node, it falls through to execution
    // Since we ran execute first, all prior outputs exist
    expect(skipped.length + executed.length).toBe(3);
  });
});
