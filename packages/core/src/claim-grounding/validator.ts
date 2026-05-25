import { ArtifactStore } from "../artifacts/store";

export interface ClaimValidationIssue {
  claim_id: string;
  message: string;
}

export function validateClaimGrounding(projectDir: string, claimsPayload: unknown): { ok: boolean; issues: ClaimValidationIssue[] } {
  const claims = (claimsPayload as { claims?: Array<Record<string, unknown>> }).claims ?? [];
  const issues: ClaimValidationIssue[] = [];
  const store = new ArtifactStore(projectDir);
  try {
    for (const claim of claims) {
      const claimId = String(claim.claim_id ?? "unknown");
      const status = claim.status;
      const supportedBy = Array.isArray(claim.supported_by) ? claim.supported_by as Array<Record<string, unknown>> : [];
      if (status === "grounded" && supportedBy.length === 0) {
        issues.push({ claim_id: claimId, message: "Grounded claim has no supporting artifacts" });
      }
      for (const support of supportedBy) {
        const artifactId = support.artifact_id;
        if (typeof artifactId !== "string" || !artifactId.startsWith("sha256:")) {
          issues.push({ claim_id: claimId, message: "Support reference is missing a valid artifact_id" });
          continue;
        }
        try {
          store.getMeta(artifactId);
        } catch {
          issues.push({ claim_id: claimId, message: `Supporting artifact not found: ${artifactId}` });
        }
      }
    }
  } finally {
    store.close();
  }
  return { ok: issues.length === 0, issues };
}
