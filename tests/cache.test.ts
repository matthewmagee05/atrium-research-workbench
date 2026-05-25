import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freezeProtocol, initProject, resolveCorePaths, runProtocol } from "../packages/core/src";

const repoRoot = path.resolve(__dirname, "..");
const paths = resolveCorePaths(repoRoot);

function copyTier0Project(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-cache-"));
  fs.cpSync(path.join(repoRoot, "golden-pipelines", "tier-0-spike"), tmp, { recursive: true });
  initProject(tmp);
  return tmp;
}

describe("determinism cache", () => {
  it("reuses deterministic artifacts on execute and bypasses cache on deterministic rerun", async () => {
    const projectDir = copyTier0Project();
    const protocolPath = path.join(projectDir, "protocol.yaml");
    freezeProtocol(protocolPath, paths);
    const first = await runProtocol(protocolPath, paths, { projectDir });
    expect(first.nodes.some((node) => node.cache_hit)).toBe(false);
    const second = await runProtocol(protocolPath, paths, { projectDir });
    expect(second.nodes.every((node) => node.cache_hit)).toBe(true);
    expect(second.nodes.map((node) => node.outputs)).toEqual(first.nodes.map((node) => node.outputs));
    const rerun = await runProtocol(protocolPath, paths, { projectDir, mode: "deterministic-rerun" });
    expect(rerun.nodes.some((node) => node.cache_hit)).toBe(false);
    expect(rerun.nodes.map((node) => node.outputs)).toEqual(first.nodes.map((node) => node.outputs));
  });
});
