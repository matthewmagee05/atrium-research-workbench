#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import {
  addJournalEntry,
  ArtifactStore,
  diffArtifacts,
  exportBundle,
  exportReviewQueue,
  freezeProtocol,
  generateEnvironmentLock,
  generateMethods,
  importBundle,
  importReviewQueue,
  initProject,
  inspectBundleTrust,
  listModules,
  listReviewItems,
  replayBundle,
  resolveCorePaths,
  resolveReviewItem,
  runProtocol,
  validateProtocol,
  verifyBundle
} from "@research-workbench/core";

function jsonLog(event: string, payload: Record<string, unknown> = {}): void {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...payload })}\n`);
}

function paths(): ReturnType<typeof resolveCorePaths> {
  return resolveCorePaths(process.cwd());
}

const program = new Command();
program.name("rwb").description("Research Workbench Tier 0 CLI").version("0.0.0-tier0");

program.command("init")
  .argument("<project-dir>")
  .action((projectDir: string) => {
    initProject(path.resolve(projectDir));
    jsonLog("project.initialized", { project_dir: path.resolve(projectDir) });
    process.stdout.write(`Initialized ${path.resolve(projectDir)}\n`);
  });

program.command("modules")
  .command("list")
  .action(() => {
    const mods = listModules(paths().modulesRoot);
    for (const mod of mods) {
      process.stdout.write(`${mod.manifest.id}@${mod.manifest.version}\t${mod.manifest.stage}\t${mod.manifest.runtime}\n`);
    }
    jsonLog("modules.listed", { count: mods.length });
  });

const protocol = program.command("protocol");
protocol.command("validate")
  .argument("<protocol-yaml>")
  .action((protocolYaml: string) => {
    validateProtocol(path.resolve(protocolYaml), paths());
    jsonLog("protocol.validated", { protocol: path.resolve(protocolYaml) });
    process.stdout.write("Protocol is valid\n");
  });

protocol.command("freeze")
  .argument("<protocol-yaml>")
  .action((protocolYaml: string) => {
    const frozen = freezeProtocol(path.resolve(protocolYaml), paths());
    jsonLog("protocol.frozen", { protocol: path.resolve(protocolYaml), protocol_hash: frozen.frozen.protocol_hash });
    process.stdout.write(`Frozen protocol ${frozen.frozen.protocol_hash}\n`);
  });

program.command("run")
  .argument("<protocol-yaml>")
  .option("--mode <mode>", "execute|deterministic-rerun|full-rerun|variance-audit", "execute")
  .action(async (protocolYaml: string, options: { mode: "execute" | "deterministic-rerun" | "full-rerun" | "variance-audit" }) => {
    const protocolPath = path.resolve(protocolYaml);
    const manifest = await runProtocol(protocolPath, paths(), { mode: options.mode, projectDir: path.dirname(protocolPath) });
    jsonLog("run.completed", { run_id: manifest.run_id, status: manifest.completed_status });
    process.stdout.write(`Run ${manifest.run_id} ${manifest.completed_status}\n`);
  });

const artifact = program.command("artifact");
artifact.command("show")
  .argument("<artifact-id>")
  .option("--project-dir <project-dir>", "project directory", ".")
  .action((artifactId: string, options: { projectDir: string }) => {
    const store = new ArtifactStore(path.resolve(options.projectDir));
    try {
      process.stdout.write(`${JSON.stringify(store.getMeta(artifactId), null, 2)}\n`);
    } finally {
      store.close();
    }
  });

artifact.command("diff")
  .argument("<artifact-id-a>")
  .argument("<artifact-id-b>")
  .option("--project-dir <project-dir>", "project directory", ".")
  .action((artifactIdA: string, artifactIdB: string, options: { projectDir: string }) => {
    process.stdout.write(`${JSON.stringify(diffArtifacts(path.resolve(options.projectDir), artifactIdA, artifactIdB), null, 2)}\n`);
  });

const journal = program.command("journal");
journal.command("add")
  .argument("<text>")
  .option("--project-dir <project-dir>", "project directory", ".")
  .option("--node <node-id>")
  .action((text: string, options: { projectDir: string; node?: string }) => {
    const journalPath = addJournalEntry(path.resolve(options.projectDir), text, options.node);
    jsonLog("journal.entry_added", { journal: journalPath, node_id: options.node ?? null });
    process.stdout.write(`Added journal entry to ${journalPath}\n`);
  });

const review = program.command("review");
review.command("list")
  .option("--project-dir <project-dir>", "project directory", ".")
  .option("--status <status>", "pending|resolved")
  .action((options: { projectDir: string; status?: "pending" | "resolved" }) => {
    process.stdout.write(`${JSON.stringify(listReviewItems(path.resolve(options.projectDir), options.status), null, 2)}\n`);
  });

review.command("resolve")
  .argument("<review-id>")
  .requiredOption("--decision <json>")
  .option("--project-dir <project-dir>", "project directory", ".")
  .action((reviewId: string, options: { projectDir: string; decision: string }) => {
    const decision = JSON.parse(options.decision);
    const item = resolveReviewItem(path.resolve(options.projectDir), reviewId, decision);
    jsonLog("review.resolved", { review_id: reviewId });
    process.stdout.write(`${JSON.stringify(item, null, 2)}\n`);
  });

const collaboration = program.command("collaboration");
collaboration.command("export-review-queue")
  .option("--project-dir <project-dir>", "project directory", ".")
  .requiredOption("--output <path>", "review queue snapshot path")
  .action((options: { projectDir: string; output: string }) => {
    const snapshot = exportReviewQueue(path.resolve(options.projectDir), path.resolve(options.output));
    jsonLog("collaboration.review_queue_exported", { output: path.resolve(options.output), count: snapshot.items.length });
    process.stdout.write(`Exported ${snapshot.items.length} review items to ${path.resolve(options.output)}\n`);
  });

collaboration.command("import-review-queue")
  .argument("<snapshot-path>")
  .option("--project-dir <project-dir>", "project directory", ".")
  .action((snapshotPath: string, options: { projectDir: string }) => {
    const result = importReviewQueue(path.resolve(options.projectDir), path.resolve(snapshotPath));
    jsonLog("collaboration.review_queue_imported", { snapshot: path.resolve(snapshotPath), ...result });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

const methods = program.command("methods");
methods.command("generate")
  .argument("<project-dir>")
  .action((projectDir: string) => {
    generateMethods(path.resolve(projectDir));
    jsonLog("methods.generated", { project_dir: path.resolve(projectDir) });
    process.stdout.write(`Generated ${path.join(path.resolve(projectDir), "METHODS.md")}\n`);
  });

const env = program.command("env");
env.command("lock")
  .argument("<project-dir>")
  .action((projectDir: string) => {
    generateEnvironmentLock(path.resolve(projectDir), paths());
    jsonLog("environment.locked", { project_dir: path.resolve(projectDir) });
    process.stdout.write(`Generated ${path.join(path.resolve(projectDir), "environment.lock")}\n`);
  });

const bundle = program.command("bundle");
bundle.command("export")
  .argument("<project-dir>")
  .requiredOption("--output <path>")
  .action((projectDir: string, options: { output: string }) => {
    exportBundle(path.resolve(projectDir), path.resolve(options.output), paths());
    jsonLog("bundle.exported", { output: path.resolve(options.output) });
    process.stdout.write(`Exported bundle to ${path.resolve(options.output)}\n`);
  });

bundle.command("import")
  .argument("<bundle-path>")
  .option("--into <project-dir>", "target project directory", "imported-project")
  .action((bundlePath: string, options: { into: string }) => {
    const trust = inspectBundleTrust(path.resolve(bundlePath), paths().modulesRoot);
    process.stdout.write("Bundle trust report:\n");
    for (const mod of trust.modules) {
      const status = mod.hashMatch ? "OK" : mod.presentLocally ? "HASH MISMATCH" : "NOT INSTALLED LOCALLY";
      process.stdout.write(`  ${mod.moduleId}@${mod.bundledVersion}  ${mod.bundledManifestHash.slice(0, 20)}...  ${status}\n`);
    }
    if (trust.networkDomains.length > 0) {
      process.stdout.write(`  Network domains: ${trust.networkDomains.join(", ")}\n`);
    }
    if (!trust.allTrusted) {
      process.stdout.write("Warning: some bundled modules do not match locally installed versions. Replay mode is safe (no code execution). Re-execute modes will require --trust.\n");
    }
    importBundle(path.resolve(bundlePath), path.resolve(options.into));
    jsonLog("bundle.imported", { bundle: path.resolve(bundlePath), into: path.resolve(options.into), trust_all: trust.allTrusted });
    process.stdout.write(`Imported bundle into ${path.resolve(options.into)}\n`);
  });

bundle.command("replay")
  .argument("<bundle-path>")
  .action((bundlePath: string) => {
    const result = replayBundle(path.resolve(bundlePath));
    jsonLog("bundle.replayed", { bundle: path.resolve(bundlePath), replay_dir: result.replayDir });
    process.stdout.write(`Replayed ${result.materialized.length} artifacts into ${result.replayDir}\n`);
  });

bundle.command("verify")
  .argument("<bundle-path>")
  .option("--trust", "Confirm execution of bundled module code that does not match locally installed versions")
  .action(async (bundlePath: string, options: { trust?: boolean }) => {
    const result = await verifyBundle(path.resolve(bundlePath), {
      trusted: options.trust ?? false,
      localModulesRoot: paths().modulesRoot
    });
    if (!result.trustReport.allTrusted && !options.trust) {
      process.stdout.write("Bundle trust check failed. The following modules do not match locally installed versions:\n");
      for (const mod of result.trustReport.modules.filter((m) => !m.hashMatch)) {
        const reason = !mod.presentLocally ? "not installed locally" : `hash mismatch (bundled: ${mod.bundledManifestHash.slice(0, 20)}..., local: ${mod.localManifestHash?.slice(0, 20)}...)`;
        process.stdout.write(`  ${mod.moduleId}@${mod.bundledVersion}: ${reason}\n`);
      }
      if (result.trustReport.networkDomains.length > 0) {
        process.stdout.write(`  Network domains these modules will contact: ${result.trustReport.networkDomains.join(", ")}\n`);
      }
      process.stdout.write("Re-run with --trust to confirm execution of bundled module code.\n");
      process.exitCode = 1;
      return;
    }
    jsonLog("bundle.verified", { bundle: path.resolve(bundlePath), ok: result.ok, trusted: options.trust ?? false });
    process.stdout.write(`${result.ok ? "Verification passed" : "Verification failed"}\n`);
    for (const item of result.checked) {
      process.stdout.write(`${item.ok ? "OK" : "FAIL"} ${item.node_id}:${item.port} ${item.actual}\n`);
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
  });

program.parse();
