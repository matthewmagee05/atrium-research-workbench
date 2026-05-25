import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
});
