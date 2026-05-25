export interface BudgetState {
  max_cost_usd_per_run: number;
  max_llm_calls_per_run: number;
  max_tokens_per_run: number;
  spent_usd: number;
  calls: number;
  tokens: number;
}

export function assertBudgetAvailable(state: BudgetState, next: { cost_usd: number; calls: number; tokens: number }): void {
  if (state.spent_usd + next.cost_usd > state.max_cost_usd_per_run) {
    throw new Error("Budget exceeded: cost limit");
  }
  if (state.calls + next.calls > state.max_llm_calls_per_run) {
    throw new Error("Budget exceeded: call limit");
  }
  if (state.tokens + next.tokens > state.max_tokens_per_run) {
    throw new Error("Budget exceeded: token limit");
  }
}
