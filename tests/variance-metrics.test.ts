import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeDecisionAgreement,
  computeFieldAgreement,
  computeDistributionDistance,
  computeVarianceMetrics
} from "../packages/core/src/variance/metrics";

describe("variance metrics", () => {
  it("computeDecisionAgreement returns 1.0 for identical outputs", () => {
    const outputs = [
      [{ recommendation: "include" }, { recommendation: "exclude" }],
      [{ recommendation: "include" }, { recommendation: "exclude" }]
    ];
    expect(computeDecisionAgreement(outputs)).toBe(1.0);
  });

  it("computeDecisionAgreement returns 0.5 for half-matching decisions", () => {
    const outputs = [
      [{ recommendation: "include" }, { recommendation: "exclude" }],
      [{ recommendation: "include" }, { recommendation: "include" }]
    ];
    expect(computeDecisionAgreement(outputs)).toBe(0.5);
  });

  it("computeDecisionAgreement returns null for fewer than 2 array outputs", () => {
    expect(computeDecisionAgreement([{ notAnArray: true }])).toBeNull();
    expect(computeDecisionAgreement([])).toBeNull();
  });

  it("computeDecisionAgreement falls back to decision then status fields", () => {
    const outputs = [
      [{ decision: "approve" }],
      [{ decision: "approve" }]
    ];
    expect(computeDecisionAgreement(outputs)).toBe(1.0);

    const statusOutputs = [
      [{ status: "active" }],
      [{ status: "inactive" }]
    ];
    expect(computeDecisionAgreement(statusOutputs)).toBe(0.0);
  });

  it("computeFieldAgreement returns 1.0 for identical records", () => {
    const outputs = [
      [{ a: 1, b: "x" }],
      [{ a: 1, b: "x" }]
    ];
    expect(computeFieldAgreement(outputs)).toBe(1.0);
  });

  it("computeFieldAgreement returns 0.5 when half the fields differ", () => {
    const outputs = [
      [{ a: 1, b: "x" }],
      [{ a: 1, b: "y" }]
    ];
    expect(computeFieldAgreement(outputs)).toBe(0.5);
  });

  it("computeFieldAgreement returns null for fewer than 2 arrays", () => {
    expect(computeFieldAgreement(["not-array"])).toBeNull();
  });

  it("computeDistributionDistance returns 0 for identical distributions", () => {
    const outputs = [
      [{ recommendation: "include" }, { recommendation: "exclude" }],
      [{ recommendation: "include" }, { recommendation: "exclude" }]
    ];
    expect(computeDistributionDistance(outputs)).toBeCloseTo(0.0, 10);
  });

  it("computeDistributionDistance returns >0 for different distributions", () => {
    const outputs = [
      [{ recommendation: "include" }, { recommendation: "include" }, { recommendation: "exclude" }],
      [{ recommendation: "exclude" }, { recommendation: "exclude" }, { recommendation: "include" }]
    ];
    const distance = computeDistributionDistance(outputs);
    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(0);
    expect(distance!).toBeLessThanOrEqual(1);
  });

  it("computeDistributionDistance returns null for fewer than 2 arrays", () => {
    expect(computeDistributionDistance([])).toBeNull();
  });

  it("computeVarianceMetrics reads JSON files and computes all metrics", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-variance-"));
    const file1 = path.join(tmpDir, "iter1.json");
    const file2 = path.join(tmpDir, "iter2.json");
    const file3 = path.join(tmpDir, "iter3.json");

    const data1 = [
      { recommendation: "include", score: 0.9 },
      { recommendation: "exclude", score: 0.1 }
    ];
    const data2 = [
      { recommendation: "include", score: 0.85 },
      { recommendation: "exclude", score: 0.15 }
    ];
    const data3 = [
      { recommendation: "include", score: 0.9 },
      { recommendation: "include", score: 0.2 }
    ];

    fs.writeFileSync(file1, JSON.stringify(data1));
    fs.writeFileSync(file2, JSON.stringify(data2));
    fs.writeFileSync(file3, JSON.stringify(data3));

    const metrics = computeVarianceMetrics([file1, file2, file3]);
    expect(metrics.schema_validity).toBe(1.0);
    expect(metrics.row_count_agreement).toBe(1);
    expect(metrics.decision_agreement_rate).not.toBeNull();
    expect(metrics.field_agreement_rate).not.toBeNull();
    expect(metrics.distribution_distance).not.toBeNull();
    expect(metrics.decision_agreement_rate!).toBeGreaterThan(0);
    expect(metrics.decision_agreement_rate!).toBeLessThanOrEqual(1);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("computeVarianceMetrics handles invalid JSON files gracefully", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-variance-"));
    const valid = path.join(tmpDir, "valid.json");
    const invalid = path.join(tmpDir, "invalid.json");

    fs.writeFileSync(valid, JSON.stringify([{ recommendation: "include" }]));
    fs.writeFileSync(invalid, "NOT JSON");

    const metrics = computeVarianceMetrics([valid, invalid]);
    expect(metrics.schema_validity).toBe(0.5);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("computeVarianceMetrics handles nested array outputs (object with array property)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rwb-variance-"));
    const file1 = path.join(tmpDir, "iter1.json");
    const file2 = path.join(tmpDir, "iter2.json");

    fs.writeFileSync(file1, JSON.stringify({ rows: [{ decision: "accept" }] }));
    fs.writeFileSync(file2, JSON.stringify({ rows: [{ decision: "accept" }] }));

    const metrics = computeVarianceMetrics([file1, file2]);
    expect(metrics.schema_validity).toBe(1.0);
    expect(metrics.row_count_agreement).toBe(1);
    expect(metrics.decision_agreement_rate).toBe(1.0);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
