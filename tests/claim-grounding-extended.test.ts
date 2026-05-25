import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  freezeProtocol,
  initProject,
  resolveCorePaths,
  runProtocol,
  validateClaimGrounding
} from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function setupProjectWithRun() {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-claims2-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
  initProject(projectDir);
  const protocolPath = path.join(projectDir, "protocol.yaml");
  freezeProtocol(protocolPath, paths);
  return { projectDir, protocolPath };
}

describe("claim grounding validator edge cases", () => {
  it("accepts ungrounded claims without requiring artifacts", async () => {
    const { projectDir, protocolPath } = setupProjectWithRun();
    await runProtocol(protocolPath, paths, { projectDir });

    const result = validateClaimGrounding(projectDir, {
      claims: [{ claim_id: "c1", status: "ungrounded" }]
    });
    expect(result.ok).toBe(true);
  });

  it("rejects grounded claim referencing non-existent artifact", async () => {
    const { projectDir, protocolPath } = setupProjectWithRun();
    await runProtocol(protocolPath, paths, { projectDir });

    const result = validateClaimGrounding(projectDir, {
      claims: [{
        claim_id: "c_bad",
        status: "grounded",
        supported_by: [{ artifact_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }]
      }]
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("accepts multiple valid grounded claims", async () => {
    const { projectDir, protocolPath } = setupProjectWithRun();
    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    const artifactIds = manifest.nodes.flatMap((n) => n.outputs.map((o) => o.artifact_id));

    const result = validateClaimGrounding(projectDir, {
      claims: artifactIds.slice(0, 2).map((aid, i) => ({
        claim_id: `claim_${i}`,
        status: "grounded",
        supported_by: [{ artifact_id: aid }]
      }))
    });
    expect(result.ok).toBe(true);
  });

  it("validates empty claims list as ok", async () => {
    const { projectDir, protocolPath } = setupProjectWithRun();
    await runProtocol(protocolPath, paths, { projectDir });

    const result = validateClaimGrounding(projectDir, { claims: [] });
    expect(result.ok).toBe(true);
  });
});
