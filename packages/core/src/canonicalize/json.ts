/**
 * Round-half-even (banker's rounding) to the given number of significant digits.
 * Matches Python's decimal.ROUND_HALF_EVEN and R's round() semantics.
 */
export function roundHalfEven(value: number, significantDigits: number): number {
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

export function normalizeForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested !== undefined) {
        result[key] = normalizeForJson(nested);
      }
    }
    return result;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundHalfEven(value, 10);
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(normalizeForJson(value), null, 2)}\n`;
}

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), "utf8");
}
