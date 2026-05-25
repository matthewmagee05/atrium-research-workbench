import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol, validateClaimGrounding } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

describe("claim grounding validator", () => {
  it("requires grounded claims to reference existing artifacts", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-claims-"));
    fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), projectDir, { recursive: true });
    initProject(projectDir);
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);
    const manifest = await runProtocol(protocolPath, paths, { projectDir });
    const summaryArtifact = manifest.nodes.at(-1)?.outputs[0].artifact_id as string;
    expect(validateClaimGrounding(projectDir, {
      claims: [{ claim_id: "claim_001", status: "grounded", supported_by: [{ artifact_id: summaryArtifact }] }]
    }).ok).toBe(true);
    const invalid = validateClaimGrounding(projectDir, {
      claims: [{ claim_id: "claim_002", status: "grounded", supported_by: [] }]
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.issues[0].message).toContain("no supporting artifacts");
  });
});
