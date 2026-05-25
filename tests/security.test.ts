import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { scrubSecrets } from "../packages/core/src/credentials/credentials";
import { filterEnvForModule, detectVirtualenv, resolveCommand } from "../packages/core/src/runner/sandbox";

describe("environment filtering", () => {
  it("passes PATH and HOME through", () => {
    const filtered = filterEnvForModule({ PATH: "/usr/bin", HOME: "/home/user" });
    expect(filtered.PATH).toBe("/usr/bin");
    expect(filtered.HOME).toBe("/home/user");
  });

  it("passes RWB_ prefixed vars through", () => {
    const filtered = filterEnvForModule({ RWB_RUN_ID: "abc", RWB_MODE: "execute" });
    expect(filtered.RWB_RUN_ID).toBe("abc");
    expect(filtered.RWB_MODE).toBe("execute");
  });

  it("blocks ANTHROPIC_API_KEY", () => {
    const filtered = filterEnvForModule({ ANTHROPIC_API_KEY: "sk-ant-secret123" });
    expect(filtered.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("blocks OPENAI_API_KEY", () => {
    const filtered = filterEnvForModule({ OPENAI_API_KEY: "sk-secret456" });
    expect(filtered.OPENAI_API_KEY).toBeUndefined();
  });

  it("blocks vars ending with _SECRET or _PASSWORD", () => {
    const filtered = filterEnvForModule({
      DB_SECRET: "mysecret",
      ADMIN_PASSWORD: "mypass",
      MY_PRIVATE_KEY: "key123",
    });
    expect(filtered.DB_SECRET).toBeUndefined();
    expect(filtered.ADMIN_PASSWORD).toBeUndefined();
    expect(filtered.MY_PRIVATE_KEY).toBeUndefined();
  });

  it("blocks GITHUB_TOKEN and GH_TOKEN", () => {
    const filtered = filterEnvForModule({ GITHUB_TOKEN: "ghp_abc", GH_TOKEN: "gho_def" });
    expect(filtered.GITHUB_TOKEN).toBeUndefined();
    expect(filtered.GH_TOKEN).toBeUndefined();
  });

  it("passes language runtime vars through", () => {
    const filtered = filterEnvForModule({
      PYTHONPATH: "/libs",
      R_HOME: "/usr/lib/R",
      NODE_PATH: "/node_modules",
    });
    expect(filtered.PYTHONPATH).toBe("/libs");
    expect(filtered.R_HOME).toBe("/usr/lib/R");
    expect(filtered.NODE_PATH).toBe("/node_modules");
  });

  it("blocks arbitrary unknown env vars", () => {
    const filtered = filterEnvForModule({ RANDOM_THING: "value", MY_CUSTOM: "data" });
    expect(filtered.RANDOM_THING).toBeUndefined();
    expect(filtered.MY_CUSTOM).toBeUndefined();
  });
});

describe("secret scrubbing", () => {
  it("redacts Anthropic keys", () => {
    const result = scrubSecrets("key is sk-ant-api03-abcdefghijklmnop");
    expect(result).not.toContain("sk-ant-api03");
    expect(result).toContain("[REDACTED");
  });

  it("redacts generic sk- keys", () => {
    const result = scrubSecrets("openai key sk-abcdefghijklmnopqrstuv");
    expect(result).not.toContain("sk-abcdefghijkl");
    expect(result).toContain("[REDACTED");
  });

  it("redacts api_key=value patterns", () => {
    const result = scrubSecrets('config: api_key="myverylongsecretkey12345"');
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("myverylongsecretkey12345");
  });

  it("returns clean text unchanged", () => {
    const clean = "This is a normal log message with no secrets";
    expect(scrubSecrets(clean)).toBe(clean);
  });
});

describe("virtualenv detection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-sandbox-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("detects Python .venv when present", () => {
    const venvBin = path.join(tmpDir, ".venv", "bin");
    fs.mkdirSync(venvBin, { recursive: true });
    fs.writeFileSync(path.join(venvBin, "python3"), "#!/usr/bin/env python3\n", { mode: 0o755 });
    const result = detectVirtualenv(tmpDir, "python");
    expect(result).toBe(path.join(venvBin, "python3"));
  });

  it("returns null when no venv exists", () => {
    expect(detectVirtualenv(tmpDir, "python")).toBeNull();
  });

  it("detects renv library for R", () => {
    const renvLib = path.join(tmpDir, "renv", "library");
    fs.mkdirSync(renvLib, { recursive: true });
    const result = detectVirtualenv(tmpDir, "r");
    expect(result).toBe(renvLib);
  });

  it("returns null for unknown runtimes", () => {
    expect(detectVirtualenv(tmpDir, "binary")).toBeNull();
  });
});

describe("command resolution", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-cmd-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves python to system python3 without venv", () => {
    const cmd = resolveCommand("python", tmpDir);
    expect(cmd).toBe(process.platform === "win32" ? "python" : "python3");
  });

  it("resolves python to venv python when present", () => {
    const venvBin = path.join(tmpDir, ".venv", "bin");
    fs.mkdirSync(venvBin, { recursive: true });
    fs.writeFileSync(path.join(venvBin, "python3"), "#!/usr/bin/env python3\n", { mode: 0o755 });
    const cmd = resolveCommand("python", tmpDir);
    expect(cmd).toBe(path.join(venvBin, "python3"));
  });

  it("resolves r to Rscript", () => {
    expect(resolveCommand("r", tmpDir)).toBe("Rscript");
  });

  it("resolves node to current process", () => {
    expect(resolveCommand("node", tmpDir)).toBe(process.execPath);
  });
});
