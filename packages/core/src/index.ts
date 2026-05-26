import path from "node:path";
import { ArtifactStore } from "./artifacts/store";
import { diffArtifacts } from "./artifacts/diff";
import { exportBundle, importBundle, inspectBundleTrust, replayBundle, verifyBundle } from "./bundle/bundle";
import { assertBudgetAvailable } from "./budget/budget";
import { validateClaimGrounding } from "./claim-grounding/validator";
import { findNonAsciiChar, getCredential, getCredentialStatus, sanitizeCredentialPaste, scrubSecrets, setCredential, testCredential } from "./credentials/credentials";
import { generateEnvironmentLock } from "./environment-lock/environment-lock";
import { addJournalEntry } from "./journal/journal";
import { generateMethods } from "./methods-generator/methods";
import { llmComplete } from "./llm-proxy/proxy";
import { resolveModel } from "./model-registry/model-registry";
import { listModules } from "./modules/registry";
import { freezeProtocol, validateProtocol } from "./protocol/service";
import { initProject } from "./project";
import { runProtocol } from "./runner/run";
import { createReviewItem, exportReviewQueue, importReviewQueue, listReviewItems, resolveReviewItem, resolvedDecisionsForNode } from "./review/review-queue";
import { computeVarianceMetrics } from "./variance/metrics";
import type { CorePaths } from "./types";

export function resolveCorePaths(repoRoot = process.cwd()): CorePaths {
  return {
    repoRoot,
    modulesRoot: path.join(repoRoot, "modules"),
    fixturesRoot: path.join(repoRoot, "fixtures")
  };
}

export {
  addJournalEntry,
  assertBudgetAvailable,
  ArtifactStore,
  createReviewItem,
  diffArtifacts,
  exportBundle,
  exportReviewQueue,
  findNonAsciiChar,
  freezeProtocol,
  generateEnvironmentLock,
  generateMethods,
  getCredential,
  getCredentialStatus,
  importBundle,
  importReviewQueue,
  initProject,
  inspectBundleTrust,
  listModules,
  listReviewItems,
  llmComplete,
  replayBundle,
  resolveModel,
  resolvedDecisionsForNode,
  resolveReviewItem,
  runProtocol,
  sanitizeCredentialPaste,
  scrubSecrets,
  setCredential,
  testCredential,
  validateProtocol,
  validateClaimGrounding,
  computeVarianceMetrics,
  verifyBundle
};
export type * from "./types";
