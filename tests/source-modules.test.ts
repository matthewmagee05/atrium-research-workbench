import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function runPythonModule(moduleDir: string, env: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(pythonCmd, [path.join(moduleDir, "entry.py")], {
    cwd: moduleDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("source modules with fixture mode", () => {
  it("crossref-source reads fixtures in fixture mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-crossref-"));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "fixture", fixture_id: "tiny-corpus" }));

    const result = runPythonModule(path.join(repoRoot, "modules", "crossref-source"), {
      RWB_PARAMS: paramsPath,
      RWB_OUTPUT_records: outputPath,
      RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
    });

    expect(result.status).toBe(0);
    const records = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("semantic-scholar-source reads fixtures in fixture mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-s2-"));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "fixture", fixture_id: "tiny-corpus" }));

    const result = runPythonModule(path.join(repoRoot, "modules", "semantic-scholar-source"), {
      RWB_PARAMS: paramsPath,
      RWB_OUTPUT_records: outputPath,
      RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
    });

    expect(result.status).toBe(0);
    const records = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("openalex-source reads fixtures in fixture mode", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-oalex-"));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "fixture", fixture_id: "tiny-corpus" }));

    const result = runPythonModule(path.join(repoRoot, "modules", "openalex-source"), {
      RWB_PARAMS: paramsPath,
      RWB_OUTPUT_records: outputPath,
      RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
    });

    expect(result.status).toBe(0);
    const records = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(records.length).toBe(10);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("crossref-source reads snapshot from disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-snap-"));
    const snapshotData = [{ DOI: "10.1000/test", title: "Snapshot record" }];
    const snapshotPath = path.join(tmpDir, "snapshot.json");
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "snapshot", snapshot_path: snapshotPath }));

    const result = runPythonModule(path.join(repoRoot, "modules", "crossref-source"), {
      RWB_PARAMS: paramsPath,
      RWB_OUTPUT_records: outputPath,
      RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
    });

    expect(result.status).toBe(0);
    const records = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("Snapshot record");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("semantic-scholar-source reads snapshot from disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-s2snap-"));
    const snapshotData = [{ paperId: "abc123", title: "S2 Snapshot" }];
    const snapshotPath = path.join(tmpDir, "snapshot.json");
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "snapshot", snapshot_path: snapshotPath }));

    const result = runPythonModule(path.join(repoRoot, "modules", "semantic-scholar-source"), {
      RWB_PARAMS: paramsPath,
      RWB_OUTPUT_records: outputPath,
      RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
    });

    expect(result.status).toBe(0);
    const records = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("S2 Snapshot");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("source modules reject unsupported modes", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-bad-mode-"));
    const paramsPath = path.join(tmpDir, "params.json");
    const outputPath = path.join(tmpDir, "records.json");
    fs.writeFileSync(paramsPath, JSON.stringify({ source_mode: "invalid_mode" }));

    for (const mod of ["crossref-source", "semantic-scholar-source", "openalex-source"]) {
      const result = runPythonModule(path.join(repoRoot, "modules", mod), {
        RWB_PARAMS: paramsPath,
        RWB_OUTPUT_records: outputPath,
        RWB_FIXTURES_DIR: path.join(repoRoot, "fixtures"),
      });
      expect(result.status).not.toBe(0);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });
});
