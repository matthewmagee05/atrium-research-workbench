import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "check-release-signing.mjs");

describe("release signing preflight", () => {
  it("allows linux releases without signing secrets", () => {
    const result = spawnSync(process.execPath, [script, "linux"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Linux release");
  });

  it("fails mac releases when signing secrets are missing", () => {
    const env = { ...process.env };
    for (const key of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) {
      delete env[key];
    }
    const result = spawnSync(process.execPath, [script, "mac"], { env, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Production mac release signing is not configured");
  });
});
