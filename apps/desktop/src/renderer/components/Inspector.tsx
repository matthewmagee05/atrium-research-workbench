import { BookOpen, KeyRound, DollarSign } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { ParamForm } from "./ParamForm";

const api = window.rwb;

export function Inspector() {
  const projectDir = useWorkspace((s) => s.projectDir);
  const protocolPath = useWorkspace((s) => s.protocolPath);
  const setProtocolPath = useWorkspace((s) => s.setProtocolPath);
  const status = useWorkspace((s) => s.status);
  const budget = useWorkspace((s) => s.budget);
  const setBudgetDrawerOpen = useWorkspace((s) => s.setBudgetDrawerOpen);
  const reviewItems = useWorkspace((s) => s.reviewItems);
  const setReviewItems = useWorkspace((s) => s.setReviewItems);
  const setStatus = useWorkspace((s) => s.setStatus);
  const credentialProvider = useWorkspace((s) => s.credentialProvider);
  const setCredentialProvider = useWorkspace((s) => s.setCredentialProvider);
  const credentialValue = useWorkspace((s) => s.credentialValue);
  const setCredentialValue = useWorkspace((s) => s.setCredentialValue);
  const lastRun = useWorkspace((s) => s.lastRun);

  async function saveCredential() {
    if (!credentialValue.trim()) { setStatus("Enter a credential value first"); return; }
    setStatus("Storing credential in OS keychain...");
    if (api) await api.setCredential(credentialProvider, credentialValue.trim());
    setCredentialValue("");
    setStatus(`${credentialProvider} credential stored in OS keychain`);
  }

  async function refreshReviews() {
    if (!projectDir) { setStatus("Open a project before loading reviews"); return; }
    if (api) setReviewItems(await api.listReviewItems(projectDir));
    setStatus("Review queue refreshed");
  }

  async function resolveReview(reviewId: string, accepted: boolean) {
    if (api) await api.resolveReviewItem(projectDir, reviewId, { accepted, decided_at: new Date().toISOString() });
    await refreshReviews();
  }

  return (
    <aside className="inspector">
      <h2><BookOpen size={16} /> Inspector</h2>

      <ParamForm />

      <label>
        Protocol
        <input value={protocolPath} onChange={(e) => setProtocolPath(e.target.value)} placeholder="/path/to/protocol.yaml" />
      </label>

      <div className="panel budgetPanel" onClick={() => setBudgetDrawerOpen(true)}>
        <strong><DollarSign size={14} /> Budget</strong>
        <span>Calls: {budget.totalCalls}</span>
        <span>Tokens: {budget.totalTokens.toLocaleString()}</span>
        <span>Spend: ${budget.totalCostUsd.toFixed(4)}</span>
      </div>

      <div className="panel">
        <strong><KeyRound size={14} /> Credentials</strong>
        <select value={credentialProvider} onChange={(e) => setCredentialProvider(e.target.value as typeof credentialProvider)}>
          <option value="anthropic">Anthropic</option>
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI</option>
        </select>
        <input
          value={credentialValue}
          onChange={(e) => setCredentialValue(e.target.value)}
          type="password"
          placeholder={credentialProvider === "ollama" ? "http://localhost:11434" : "API key"}
        />
        <button onClick={saveCredential}>Store</button>
      </div>

      <div className="panel">
        <strong>Status</strong>
        <span>{status}</span>
      </div>

      <div className="panel">
        <strong>Review Queue</strong>
        <button onClick={refreshReviews} disabled={!projectDir}>Refresh</button>
        <span>{reviewItems.length} items</span>
        {reviewItems.slice(0, 4).map((item) => (
          <div className="reviewItem" key={String(item.id)}>
            <span>{String(item.status)} · {String(item.node_id ?? "project")}</span>
            <button onClick={() => resolveReview(String(item.id), true)}>Accept</button>
            <button onClick={() => resolveReview(String(item.id), false)}>Reject</button>
          </div>
        ))}
      </div>

      {lastRun ? <pre>{JSON.stringify(lastRun, null, 2)}</pre> : null}
    </aside>
  );
}
