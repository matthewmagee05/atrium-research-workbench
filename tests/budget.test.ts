import { describe, expect, it } from "vitest";
import { assertBudgetAvailable, type BudgetState } from "../packages/core/src/budget/budget";

function makeBudget(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    max_cost_usd_per_run: 10,
    max_llm_calls_per_run: 100,
    max_tokens_per_run: 100000,
    spent_usd: 0,
    calls: 0,
    tokens: 0,
    ...overrides,
  };
}

describe("budget enforcement", () => {
  it("allows calls within budget", () => {
    const budget = makeBudget({ spent_usd: 5, calls: 50, tokens: 50000 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 1, calls: 1, tokens: 1000 })).not.toThrow();
  });

  it("throws when cost limit would be exceeded", () => {
    const budget = makeBudget({ spent_usd: 9.5 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 1, calls: 1, tokens: 100 })).toThrow("cost limit");
  });

  it("throws when call limit would be exceeded", () => {
    const budget = makeBudget({ calls: 99 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 0, calls: 2, tokens: 100 })).toThrow("call limit");
  });

  it("throws when token limit would be exceeded", () => {
    const budget = makeBudget({ tokens: 99000 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 0, calls: 1, tokens: 2000 })).toThrow("token limit");
  });

  it("allows exactly at the limit", () => {
    const budget = makeBudget({ spent_usd: 9 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 1, calls: 1, tokens: 100 })).not.toThrow();
  });

  it("works with zero budget (no LLM allowed)", () => {
    const budget = makeBudget({ max_cost_usd_per_run: 0, max_llm_calls_per_run: 0, max_tokens_per_run: 0 });
    expect(() => assertBudgetAvailable(budget, { cost_usd: 0.001, calls: 0, tokens: 0 })).toThrow("cost limit");
    expect(() => assertBudgetAvailable(budget, { cost_usd: 0, calls: 1, tokens: 0 })).toThrow("call limit");
    expect(() => assertBudgetAvailable(budget, { cost_usd: 0, calls: 0, tokens: 1 })).toThrow("token limit");
  });
});
