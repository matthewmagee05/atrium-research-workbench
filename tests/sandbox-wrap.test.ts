import { afterEach, describe, expect, it } from "vitest";
import { resolveSandboxPolicy, wrapCommandForSandbox } from "../packages/core/src/runner/sandbox";

const originalSandbox = process.env.RWB_SANDBOX;

afterEach(() => {
  if (originalSandbox === undefined) {
    delete process.env.RWB_SANDBOX;
  } else {
    process.env.RWB_SANDBOX = originalSandbox;
  }
});

describe("sandbox wrapping", () => {
  it("returns the raw command when policy is off", () => {
    process.env.RWB_SANDBOX = "off";
    const result = wrapCommandForSandbox("python3", { moduleDir: "/m", scratchDir: "/s", allowNetwork: false });
    expect(result.command).toBe("python3");
    expect(result.prefixArgs).toEqual([]);
    expect(result.mechanism).toBe("none");
  });

  it("policy defaults to off when env var unset (opt-in sandboxing)", () => {
    delete process.env.RWB_SANDBOX;
    expect(resolveSandboxPolicy()).toBe("off");
  });

  it("policy parses 'best-effort' opt-in correctly", () => {
    process.env.RWB_SANDBOX = "best-effort";
    expect(resolveSandboxPolicy()).toBe("best-effort");
  });

  it("policy parses 'required' correctly", () => {
    process.env.RWB_SANDBOX = "required";
    expect(resolveSandboxPolicy()).toBe("required");
  });

  it("policy parses 'off' correctly", () => {
    process.env.RWB_SANDBOX = "off";
    expect(resolveSandboxPolicy()).toBe("off");
  });

  it("policy=required yields a wrap or a throw, never a silent no-op", () => {
    process.env.RWB_SANDBOX = "required";
    try {
      const result = wrapCommandForSandbox("python3", { moduleDir: "/m", scratchDir: "/s", allowNetwork: false });
      // If we get here, a sandbox tool was available — mechanism must be non-"none"
      expect(result.mechanism).not.toBe("none");
      if (result.cleanup) result.cleanup();
    } catch (e) {
      // Otherwise we expect an explicit refusal
      expect((e as Error).message).toMatch(/sandbox/i);
    }
  });

  it("best-effort returns a recognized mechanism", () => {
    process.env.RWB_SANDBOX = "best-effort";
    const result = wrapCommandForSandbox("python3", { moduleDir: "/m", scratchDir: "/s", allowNetwork: false });
    expect(["none", "bwrap", "sandbox-exec", "windows-low-integrity", "windows-powershell-restricted"]).toContain(result.mechanism);
    if (result.cleanup) result.cleanup();
  });
});
