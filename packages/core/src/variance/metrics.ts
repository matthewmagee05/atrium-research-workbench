import { readJsonFile } from "../fs-utils";

export interface VarianceMetrics {
  schema_validity: number;
  row_count_agreement: number;
  decision_agreement_rate: number | null;
  field_agreement_rate: number | null;
  distribution_distance: number | null;
}

export function computeDecisionAgreement(outputs: unknown[]): number | null {
  const arrays = outputs.filter(Array.isArray) as unknown[][];
  if (arrays.length < 2) return null;

  const baseline = arrays[0];
  let totalComparisons = 0;
  let agreements = 0;

  for (let i = 1; i < arrays.length; i++) {
    const other = arrays[i];
    const len = Math.min(baseline.length, other.length);
    for (let j = 0; j < len; j++) {
      totalComparisons++;
      const bItem = baseline[j] as Record<string, unknown>;
      const oItem = other[j] as Record<string, unknown>;
      const bDecision = bItem.recommendation ?? bItem.decision ?? bItem.status;
      const oDecision = oItem.recommendation ?? oItem.decision ?? oItem.status;
      if (bDecision === oDecision) {
        agreements++;
      }
    }
  }

  return totalComparisons > 0 ? agreements / totalComparisons : null;
}

export function computeFieldAgreement(outputs: unknown[]): number | null {
  const arrays = outputs.filter(Array.isArray) as unknown[][];
  if (arrays.length < 2) return null;

  const baseline = arrays[0];
  let totalFields = 0;
  let matchingFields = 0;

  for (let i = 1; i < arrays.length; i++) {
    const other = arrays[i];
    const len = Math.min(baseline.length, other.length);
    for (let j = 0; j < len; j++) {
      const bItem = baseline[j] as Record<string, unknown>;
      const oItem = other[j] as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(bItem), ...Object.keys(oItem)]);
      for (const key of allKeys) {
        totalFields++;
        if (JSON.stringify(bItem[key]) === JSON.stringify(oItem[key])) {
          matchingFields++;
        }
      }
    }
  }

  return totalFields > 0 ? matchingFields / totalFields : null;
}

export function computeDistributionDistance(outputs: unknown[]): number | null {
  const arrays = outputs.filter(Array.isArray) as unknown[][];
  if (arrays.length < 2) return null;

  function categoryCounts(items: unknown[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of items) {
      const obj = item as Record<string, unknown>;
      const key = String(obj.recommendation ?? obj.decision ?? obj.status ?? "unknown");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  function normalize(counts: Map<string, number>, total: number): Map<string, number> {
    const result = new Map<string, number>();
    for (const [key, count] of counts) {
      result.set(key, count / total);
    }
    return result;
  }

  const baseline = normalize(categoryCounts(arrays[0]), arrays[0].length);
  let totalDistance = 0;
  let comparisons = 0;

  for (let i = 1; i < arrays.length; i++) {
    const otherCounts = normalize(categoryCounts(arrays[i]), arrays[i].length);
    const allKeys = new Set([...baseline.keys(), ...otherCounts.keys()]);
    let hellinger = 0;
    for (const key of allKeys) {
      const p = baseline.get(key) ?? 0;
      const q = otherCounts.get(key) ?? 0;
      hellinger += (Math.sqrt(p) - Math.sqrt(q)) ** 2;
    }
    totalDistance += Math.sqrt(hellinger / 2);
    comparisons++;
  }

  return comparisons > 0 ? totalDistance / comparisons : null;
}

export function computeVarianceMetrics(artifactPaths: string[]): VarianceMetrics {
  const outputs = artifactPaths.map((p) => {
    try {
      return readJsonFile<unknown>(p);
    } catch {
      return null;
    }
  });

  const validOutputs = outputs.filter((o) => o !== null);
  const schemaValidity = outputs.length > 0 ? validOutputs.length / outputs.length : 1;

  const rowCounts = validOutputs.map((o) => {
    if (Array.isArray(o)) return o.length;
    if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) return value.length;
      }
    }
    return 0;
  });
  const rowCountAgreement = rowCounts.length > 1
    ? rowCounts.every((c) => c === rowCounts[0]) ? 1 : 0
    : 1;

  const innerArrays = validOutputs.map((o) => {
    if (Array.isArray(o)) return o;
    if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) return value;
      }
    }
    return null;
  }).filter((a): a is unknown[] => a !== null);

  return {
    schema_validity: schemaValidity,
    row_count_agreement: rowCountAgreement,
    decision_agreement_rate: computeDecisionAgreement(innerArrays),
    field_agreement_rate: computeFieldAgreement(innerArrays),
    distribution_distance: computeDistributionDistance(innerArrays)
  };
}
