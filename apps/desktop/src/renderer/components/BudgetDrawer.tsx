import { DollarSign, X, Activity } from "lucide-react";
import { useWorkspace } from "../store/workspace";

export function BudgetDrawer() {
  const budget = useWorkspace((s) => s.budget);
  const open = useWorkspace((s) => s.budgetDrawerOpen);
  const setOpen = useWorkspace((s) => s.setBudgetDrawerOpen);
  const lastRun = useWorkspace((s) => s.lastRun);
  const runProgress = useWorkspace((s) => s.runProgress);

  if (!open) return null;

  const runNodes = (lastRun?.nodes ?? []) as Array<{
    node_id: string;
    module: string;
    llm_calls: number;
    tokens: number;
    cost_usd: number;
  }>;

  const liveRows = Object.values(runProgress.byNode).filter((n) => n.status === "completed" || n.status === "running");
  const showLive = runProgress.active || liveRows.length > 0;
  const progressPct = runProgress.totalNodes > 0
    ? Math.round((runProgress.completedNodes / runProgress.totalNodes) * 100)
    : 0;

  return (
    <div className="budgetDrawer">
      <div className="budgetHeader">
        <h3><DollarSign size={16} /> Budget</h3>
        <button onClick={() => setOpen(false)}><X size={14} /></button>
      </div>
      {showLive && (
        <div className="budgetLive">
          <div className="budgetLiveLabel">
            <Activity size={14} className={runProgress.active ? "spin" : ""} />
            <span>
              {runProgress.active ? "Running" : "Run finished"} — {runProgress.completedNodes}/{runProgress.totalNodes} nodes
            </span>
          </div>
          <div className="budgetProgressBar">
            <div className="budgetProgressFill" style={{ width: `${progressPct}%` }} />
          </div>
          {runProgress.error && <p className="budgetError">Failed: {runProgress.error}</p>}
        </div>
      )}
      <div className="budgetSummary">
        <div className="budgetCard">
          <span className="budgetLabel">Total Calls</span>
          <span className="budgetValue">{budget.totalCalls}</span>
        </div>
        <div className="budgetCard">
          <span className="budgetLabel">Total Tokens</span>
          <span className="budgetValue">{budget.totalTokens.toLocaleString()}</span>
        </div>
        <div className="budgetCard">
          <span className="budgetLabel">Total Spend</span>
          <span className="budgetValue">${budget.totalCostUsd.toFixed(4)}</span>
        </div>
      </div>
      {showLive && liveRows.length > 0 && (
        <div className="budgetBreakdown">
          <strong>Live per-node</strong>
          <table>
            <thead>
              <tr><th>Node</th><th>Status</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {liveRows.map((n) => (
                <tr key={n.nodeId}>
                  <td>{n.moduleId ?? n.nodeId}</td>
                  <td>{n.status}{n.cacheHit ? " (cached)" : ""}</td>
                  <td>{n.llmCalls ?? 0}</td>
                  <td>{(n.tokens ?? 0).toLocaleString()}</td>
                  <td>${(n.costUsd ?? 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!showLive && runNodes.length > 0 && (
        <div className="budgetBreakdown">
          <strong>Last run per-node</strong>
          <table>
            <thead>
              <tr><th>Node</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {runNodes.filter((n) => n.llm_calls > 0).map((n) => (
                <tr key={n.node_id}>
                  <td>{n.module}</td>
                  <td>{n.llm_calls}</td>
                  <td>{n.tokens.toLocaleString()}</td>
                  <td>${n.cost_usd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
