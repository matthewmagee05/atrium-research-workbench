export function roundHalfEven(value: number, significantDigits: number = 10): number {
  if (value === 0) return 0;
  const absVal = Math.abs(value);
  const magnitude = Math.floor(Math.log10(absVal));
  const shift = significantDigits - 1 - magnitude;
  const factor = 10 ** shift;
  const scaled = absVal * factor;
  const lower = Math.floor(scaled);
  const frac = scaled - lower;
  let rounded: number;
  if (Math.abs(frac - 0.5) < 1e-9) {
    rounded = lower % 2 === 0 ? lower : lower + 1;
  } else if (frac > 0.5) {
    rounded = lower + 1;
  } else {
    rounded = lower;
  }
  return Math.sign(value) * (rounded / factor);
}

function normalize(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundHalfEven(value, 10);
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value), null, 2) + "\n";
}

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, canonicalJson(value), "utf-8");
}
