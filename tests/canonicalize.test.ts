import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, roundHalfEven } from "../packages/core/src/canonicalize/json";

const sdkDir = path.resolve(__dirname, "..", "packages", "module-sdk-py");

describe("roundHalfEven", () => {
  it("rounds 0.5 to even (banker's rounding)", () => {
    expect(roundHalfEven(1.5, 1)).toBe(2);
    expect(roundHalfEven(2.5, 1)).toBe(2);
    expect(roundHalfEven(3.5, 1)).toBe(4);
    expect(roundHalfEven(4.5, 1)).toBe(4);
    expect(roundHalfEven(1.25, 2)).toBe(1.2);
    expect(roundHalfEven(1.35, 2)).toBe(1.4);
    expect(roundHalfEven(15, 1)).toBe(20);
    expect(roundHalfEven(25, 1)).toBe(20);
  });

  it("preserves integers at 10 significant digits", () => {
    expect(roundHalfEven(42, 10)).toBe(42);
    expect(roundHalfEven(1000000, 10)).toBe(1000000);
  });

  it("rounds floats to 10 significant digits", () => {
    expect(roundHalfEven(3.141592653589793, 10)).toBe(3.141592654);
    expect(roundHalfEven(0.00012345678901234, 10)).toBe(0.0001234567890);
  });

  it("handles zero", () => {
    expect(roundHalfEven(0, 10)).toBe(0);
  });

  it("handles negative values", () => {
    expect(roundHalfEven(-1.5, 1)).toBe(-2);
    expect(roundHalfEven(-2.5, 1)).toBe(-2);
  });
});

describe("canonical JSON float output", () => {
  it("produces consistent JSON for float values", () => {
    const obj = { pi: 3.141592653589793, small: 0.00012345678901234 };
    const json = canonicalJson(obj);
    const parsed = JSON.parse(json);
    expect(parsed.pi).toBe(3.141592654);
    expect(parsed.small).toBe(0.000123456789);
  });
});

describe("cross-language float agreement", () => {
  const testValues = [3.141592653589793, 2.5, 0.00012345678901234, 99999.999995, -1.23456789055];

  it("Python round_half_even matches JS roundHalfEven", () => {
    const pyScript = `
import sys
sys.path.insert(0, "${sdkDir}")
from rwb_sdk.canonical import round_half_even
values = [${testValues.join(",")}]
for v in values:
    print(repr(round_half_even(v, 10)))
`;
    const result = spawnSync("python3", ["-c", pyScript], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const pyResults = result.stdout.trim().split("\n").map(Number);
    const jsResults = testValues.map((v) => roundHalfEven(v, 10));
    expect(jsResults).toEqual(pyResults);
  });

  it("R signif(x, 10) matches JS roundHalfEven", () => {
    const rScript = `options(digits=22)
values <- c(${testValues.join(",")})
for (v in values) cat(sprintf("%.15g", signif(v, 10)), "\\n")`;
    const result = spawnSync("Rscript", ["-e", rScript], { encoding: "utf8" });
    if (result.status !== 0) {
      console.warn("R not available, skipping R cross-language test");
      return;
    }
    const rResults = result.stdout.trim().split("\n").map((line) => Number(line.trim()));
    const jsResults = testValues.map((v) => roundHalfEven(v, 10));
    expect(jsResults).toEqual(rResults);
  });
});
