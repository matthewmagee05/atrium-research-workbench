import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ArtifactStore } from "../artifacts/store";
import { sha256 } from "../canonicalize/hash";
import { canonicalJson } from "../canonicalize/json";
import { copyDir, ensureDir, readJsonFile, relativeTo, removeIfExists, writeJsonFile } from "../fs-utils";
import { loadModule } from "../modules/registry";
import { readProtocol } from "../protocol/service";
import { runProtocol } from "../runner/run";
import { generateMethods } from "../methods-generator/methods";
import { generateEnvironmentLock } from "../environment-lock/environment-lock";
import type { BundleModuleTrust, BundleTrustReport, CorePaths, RunManifest } from "../types";

function walkFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files.sort();
}

const KNOWN_KEY_PREFIXES = [
  /sk-ant-[A-Za-z0-9_\-]{20,}/,
  /sk-[A-Za-z0-9_\-]{20,}/,
  /ghp_[A-Za-z0-9]{36,}/,
  /gho_[A-Za-z0-9]{36,}/,
  /glpat-[A-Za-z0-9_\-]{20,}/,
  /npm_[A-Za-z0-9]{36,}/,
  /AKIA[A-Z0-9]{16}/,
];

function scanForSecrets(root: string): string[] {
  const suspicious: string[] = [];
  const keyPattern = /(api[_-]?key|secret|token|password|credential)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}/i;
  const highEntropyPattern = /[A-Za-z0-9_\-]{32,}/g;
  const skipDirs = new Set(["node_modules", "__pycache__", ".git", "renv"]);
  for (const file of walkFiles(root)) {
    const stat = fs.statSync(file);
    if (stat.size > 5_000_000) continue;
    const parts = file.split(path.sep);
    if (parts.some((p) => skipDirs.has(p))) continue;
    if (file.endsWith(".sqlite") || file.endsWith(".db")) continue;

    let buf: Buffer;
    try {
      buf = fs.readFileSync(file);
    } catch {
      continue;
    }

    const isLikelyBinary = buf.includes(0) && !file.endsWith(".json");
    if (isLikelyBinary) {
      const asText = buf.toString("utf8");
      if (KNOWN_KEY_PREFIXES.some((p) => p.test(asText))) {
        suspicious.push(file);
      }
      continue;
    }

    const text = buf.toString("utf8");

    if (KNOWN_KEY_PREFIXES.some((p) => p.test(text))) {
      suspicious.push(file);
      continue;
    }
    if (keyPattern.test(text)) {
      suspicious.push(file);
      continue;
    }
    for (const match of text.matchAll(highEntropyPattern)) {
      const token = match[0];
      const uniqueRatio = new Set(token).size / token.length;
      if (uniqueRatio > 0.45 && /(sk-|api|key|token|secret|password|credential)/i.test(text.slice(Math.max(0, match.index - 80), match.index + token.length + 80))) {
        suspicious.push(file);
        break;
      }
    }
  }
  return suspicious;
}

function bundleManifest(bundleDir: string): Record<string, unknown> {
  const files = walkFiles(bundleDir)
    .filter((file) => path.basename(file) !== "manifest.json")
    .map((file) => ({
      path: relativeTo(bundleDir, file),
      sha256: sha256(fs.readFileSync(file))
    }));
  return {
    bundle_format: "plain-directory",
    workbench_version: "0.0.0-tier0",
    created_at: new Date().toISOString(),
    files
  };
}

export function exportBundle(projectDir: string, outputPath: string, paths: CorePaths): void {
  const protocolPath = path.join(projectDir, "protocol.yaml");
  const runManifestPath = path.join(projectDir, ".rwb", "run.manifest.json");
  if (!fs.existsSync(protocolPath)) {
    throw new Error(`Missing protocol.yaml in ${projectDir}`);
  }
  if (!fs.existsSync(runManifestPath)) {
    throw new Error("Run the protocol before exporting a bundle");
  }
  generateMethods(projectDir);
  generateEnvironmentLock(projectDir, paths);
  const suspicious = scanForSecrets(projectDir);
  if (suspicious.length > 0) {
    throw new Error(`Bundle export refused because possible secrets were found: ${suspicious.join(", ")}`);
  }
  removeIfExists(outputPath);
  ensureDir(outputPath);
  fs.copyFileSync(protocolPath, path.join(outputPath, "protocol.yaml"));
  const journalPath = path.join(projectDir, "journal.md");
  if (fs.existsSync(journalPath)) {
    fs.copyFileSync(journalPath, path.join(outputPath, "journal.md"));
  } else {
    fs.writeFileSync(path.join(outputPath, "journal.md"), "# Research Journal\n\n", "utf8");
  }
  fs.copyFileSync(runManifestPath, path.join(outputPath, "run.manifest.json"));
  for (const optional of ["METHODS.md", "PROVENANCE.md", "environment.lock", "corpus.lock.json"]) {
    const src = path.join(projectDir, optional);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outputPath, optional));
    }
  }
  const auditPath = path.join(projectDir, ".rwb", "audit.jsonl");
  if (fs.existsSync(auditPath)) {
    fs.copyFileSync(auditPath, path.join(outputPath, "audit.jsonl"));
  } else {
    fs.writeFileSync(path.join(outputPath, "audit.jsonl"), "", "utf8");
  }
  copyDir(path.join(projectDir, ".rwb", "artifacts"), path.join(outputPath, "artifacts"));
  const rawResponses = path.join(projectDir, ".rwb", "raw_responses");
  if (fs.existsSync(rawResponses)) {
    copyDir(rawResponses, path.join(outputPath, "raw_responses"));
  }
  copyDir(paths.fixturesRoot, path.join(outputPath, "fixtures"));
  const protocol = readProtocol(protocolPath);
  ensureDir(path.join(outputPath, "modules"));
  for (const node of protocol.nodes) {
    const mod = loadModule(node.module.id, paths.modulesRoot);
    copyDir(mod.dir, path.join(outputPath, "modules", mod.manifest.id));
  }
  fs.writeFileSync(
    path.join(outputPath, "README.md"),
    "# Research Workbench Bundle\n\nRun `rwb bundle replay <bundle-path>` to replay without executing modules. Run `rwb bundle verify <bundle-path>` to re-execute deterministic Tier 0 stages and compare artifact ids.\n",
    "utf8"
  );
  if (!fs.existsSync(path.join(outputPath, "PROVENANCE.md"))) {
    fs.writeFileSync(
      path.join(outputPath, "PROVENANCE.md"),
      "# Provenance\n\nAuthoritative provenance is recorded in `protocol.yaml`, `run.manifest.json`, artifact `meta.json` files, and `audit.jsonl`.\n",
      "utf8"
    );
  }
  ensureDir(path.join(outputPath, "raw_responses"));
  ensureDir(path.join(outputPath, "prompts"));
  ensureDir(path.join(outputPath, "claim_tables"));
  writeJsonFile(path.join(outputPath, "manifest.json"), bundleManifest(outputPath));
}

function indexArtifacts(projectDir: string): void {
  const store = new ArtifactStore(projectDir);
  try {
    for (const metaPath of walkFiles(path.join(projectDir, ".rwb", "artifacts")).filter((file) => path.basename(file) === "meta.json")) {
      store.importExistingArtifact(path.dirname(metaPath));
    }
  } finally {
    store.close();
  }
}

export function importBundle(bundlePath: string, intoProjectDir: string): void {
  ensureDir(intoProjectDir);
  copyDir(path.join(bundlePath, "artifacts"), path.join(intoProjectDir, ".rwb", "artifacts"));
  fs.copyFileSync(path.join(bundlePath, "protocol.yaml"), path.join(intoProjectDir, "protocol.yaml"));
  for (const optional of ["journal.md", "audit.jsonl", "run.manifest.json"]) {
    const src = path.join(bundlePath, optional);
    if (fs.existsSync(src)) {
      const dest = optional.endsWith(".json") || optional.endsWith(".jsonl")
        ? path.join(intoProjectDir, ".rwb", optional)
        : path.join(intoProjectDir, optional);
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
  }
  indexArtifacts(intoProjectDir);
}

function moduleDirectoryHash(moduleDir: string): string {
  const files = walkFiles(moduleDir)
    .filter((f) => !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}__pycache__${path.sep}`))
    .sort();
  const parts = files.map((f) => `${relativeTo(moduleDir, f)}:${sha256(fs.readFileSync(f))}`);
  return sha256(parts.join("\n"));
}

export function inspectBundleTrust(bundlePath: string, localModulesRoot?: string): BundleTrustReport {
  const protocol = readProtocol(path.join(bundlePath, "protocol.yaml"));
  const modules: BundleModuleTrust[] = [];
  const allDomains: string[] = [];

  for (const node of protocol.nodes) {
    const bundledModuleDir = path.join(bundlePath, "modules", node.module.id);
    const bundledManifestPath = path.join(bundledModuleDir, "manifest.yaml");
    if (!fs.existsSync(bundledManifestPath)) {
      modules.push({
        moduleId: node.module.id,
        bundledVersion: node.module.version,
        bundledManifestHash: "missing",
        localVersion: null,
        localManifestHash: null,
        hashMatch: false,
        presentLocally: false,
        networkDomains: []
      });
      continue;
    }

    const bundledMod = loadModule(node.module.id, path.join(bundlePath, "modules"));
    const bundledDirHash = moduleDirectoryHash(bundledModuleDir);
    const domains = bundledMod.manifest.side_effects?.network_domains ?? [];
    allDomains.push(...domains);

    let localVersion: string | null = null;
    let localManifestHash: string | null = null;
    let presentLocally = false;
    let hashMatch = false;
    if (localModulesRoot) {
      try {
        const localMod = loadModule(node.module.id, localModulesRoot);
        localVersion = localMod.manifest.version;
        localManifestHash = localMod.manifestHash;
        presentLocally = true;
        const localDirHash = moduleDirectoryHash(localMod.dir);
        hashMatch = bundledDirHash === localDirHash;
      } catch {
        // not installed locally
      }
    }

    modules.push({
      moduleId: node.module.id,
      bundledVersion: bundledMod.manifest.version,
      bundledManifestHash: bundledMod.manifestHash,
      localVersion,
      localManifestHash,
      hashMatch,
      presentLocally,
      networkDomains: domains
    });
  }

  const untrustedModules = modules.filter((m) => !m.hashMatch).map((m) => m.moduleId);
  const missingLocally = modules.filter((m) => !m.presentLocally).map((m) => m.moduleId);
  const hashMismatches = modules
    .filter((m) => m.presentLocally && !m.hashMatch)
    .map((m) => m.moduleId);

  return {
    allTrusted: untrustedModules.length === 0,
    modules,
    untrustedModules,
    missingLocally,
    hashMismatches,
    networkDomains: [...new Set(allDomains)]
  };
}

export function replayBundle(bundlePath: string): { replayDir: string; materialized: Array<{ node_id: string; port: string; artifact_id: string; path: string }> } {
  const manifest = readJsonFile<RunManifest>(path.join(bundlePath, "run.manifest.json"));
  const replayDir = path.join(bundlePath, "replay-output");
  removeIfExists(replayDir);
  ensureDir(replayDir);
  const materialized: Array<{ node_id: string; port: string; artifact_id: string; path: string }> = [];
  for (const node of manifest.nodes) {
    for (const output of node.outputs) {
      const hashBody = output.artifact_id.replace("sha256:", "");
      const src = path.join(bundlePath, "artifacts", hashBody.slice(0, 2), hashBody, "data.json");
      if (!fs.existsSync(src)) {
        throw new Error(`Bundle is missing artifact data: ${output.artifact_id}`);
      }
      const dest = path.join(replayDir, `${node.execution_order}-${node.node_id}-${output.port}.json`);
      fs.copyFileSync(src, dest);
      materialized.push({ node_id: node.node_id, port: output.port, artifact_id: output.artifact_id, path: dest });
    }
  }
  writeJsonFile(path.join(replayDir, "replay.manifest.json"), {
    replayed_at: new Date().toISOString(),
    source_run_id: manifest.run_id,
    materialized
  });
  return { replayDir, materialized };
}

export interface VerifyBundleOptions {
  trusted?: boolean;
  localModulesRoot?: string;
}

export interface VerifyBundleResult {
  ok: boolean;
  trustReport: BundleTrustReport;
  checked: Array<{ node_id: string; port: string; expected: string; actual: string; ok: boolean }>;
}

export async function verifyBundle(bundlePath: string, options: VerifyBundleOptions = {}): Promise<VerifyBundleResult> {
  const localModulesRoot = options.localModulesRoot;
  const trustReport = inspectBundleTrust(bundlePath, localModulesRoot);

  if (!trustReport.allTrusted && !options.trusted) {
    return { ok: false, trustReport, checked: [] };
  }

  const expected = readJsonFile<RunManifest>(path.join(bundlePath, "run.manifest.json"));
  const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-verify-"));
  const protocolDest = path.join(verifyDir, "protocol.yaml");
  fs.copyFileSync(path.join(bundlePath, "protocol.yaml"), protocolDest);
  const manifest = await runProtocol(protocolDest, {
    repoRoot: bundlePath,
    modulesRoot: path.join(bundlePath, "modules"),
    fixturesRoot: path.join(bundlePath, "fixtures")
  }, { mode: "deterministic-rerun", projectDir: verifyDir });
  const expectedByNode = new Map(expected.nodes.map((node) => [node.node_id, node]));
  const checked: Array<{ node_id: string; port: string; expected: string; actual: string; ok: boolean }> = [];
  for (const actualNode of manifest.nodes) {
    const expectedNode = expectedByNode.get(actualNode.node_id);
    if (!expectedNode) {
      throw new Error(`Unexpected node during verification: ${actualNode.node_id}`);
    }
    for (const actualOutput of actualNode.outputs) {
      const expectedOutput = expectedNode.outputs.find((output) => output.port === actualOutput.port);
      if (!expectedOutput) {
        throw new Error(`Unexpected output during verification: ${actualNode.node_id}:${actualOutput.port}`);
      }
      checked.push({
        node_id: actualNode.node_id,
        port: actualOutput.port,
        expected: expectedOutput.artifact_id,
        actual: actualOutput.artifact_id,
        ok: expectedOutput.artifact_id === actualOutput.artifact_id
      });
    }
  }
  return { ok: checked.every((item) => item.ok), trustReport, checked };
}

export function bundleHashSummary(bundlePath: string): string {
  return canonicalJson(bundleManifest(bundlePath));
}
