import { useState } from "react";
import { KeyRound, CheckCircle, XCircle, Loader, Plug } from "lucide-react";
import { useWorkspace } from "../store/workspace";

const PROVIDERS = [
  { id: "anthropic" as const, name: "Anthropic", placeholder: "sk-ant-api..." },
  { id: "openai" as const, name: "OpenAI", placeholder: "sk-..." },
  { id: "ollama" as const, name: "Ollama", placeholder: "http://localhost:11434" },
] as const;

const api = window.rwb;

type TestStatus = "idle" | "testing" | "pass" | "fail";

export function CredentialsWizard() {
  const setStatus = useWorkspace((s) => s.setStatus);
  const setFirstRunComplete = useWorkspace((s) => s.setFirstRunComplete);
  const [values, setValues] = useState<Record<string, string>>({ anthropic: "", openai: "", ollama: "" });
  const [storeStatus, setStoreStatus] = useState<Record<string, TestStatus>>({
    anthropic: "idle", openai: "idle", ollama: "idle",
  });
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({
    anthropic: "idle", openai: "idle", ollama: "idle",
  });
  const [testDetail, setTestDetail] = useState<Record<string, string>>({});

  async function storeCredential(provider: "anthropic" | "openai" | "ollama") {
    const value = values[provider]?.trim();
    if (!value) return;
    setStoreStatus((prev) => ({ ...prev, [provider]: "testing" }));
    try {
      if (api) await api.setCredential(provider, value);
      setStoreStatus((prev) => ({ ...prev, [provider]: "pass" }));
      setStatus(`${provider} credential stored`);
    } catch {
      setStoreStatus((prev) => ({ ...prev, [provider]: "fail" }));
      setStatus(`Failed to store ${provider} credential`);
    }
  }

  async function testConnection(provider: "anthropic" | "openai" | "ollama") {
    const value = values[provider]?.trim();
    if (!value) return;
    setTestStatus((prev) => ({ ...prev, [provider]: "testing" }));
    setTestDetail((prev) => ({ ...prev, [provider]: "" }));
    try {
      if (!api) throw new Error("IPC unavailable");
      const result = await api.testCredential(provider, value);
      setTestStatus((prev) => ({ ...prev, [provider]: result.ok ? "pass" : "fail" }));
      setTestDetail((prev) => ({
        ...prev,
        [provider]: result.ok ? "Connection OK" : (result.detail ?? `HTTP ${result.status ?? "error"}`),
      }));
    } catch (error) {
      setTestStatus((prev) => ({ ...prev, [provider]: "fail" }));
      setTestDetail((prev) => ({
        ...prev,
        [provider]: error instanceof Error ? error.message : "Test failed",
      }));
    }
  }

  const statusIcon = (status: TestStatus) => {
    switch (status) {
      case "testing": return <Loader size={14} className="spin" />;
      case "pass": return <CheckCircle size={14} className="testPass" />;
      case "fail": return <XCircle size={14} className="testFail" />;
      default: return null;
    }
  };

  return (
    <div className="wizardOverlay">
      <div className="wizardCard">
        <h2><KeyRound size={20} /> Configure API Credentials</h2>
        <p>Enter your API keys to enable LLM-powered modules. You can skip this and configure later.</p>
        {PROVIDERS.map((p) => (
          <div key={p.id} className="wizardRow">
            <label>{p.name}</label>
            <div className="wizardInput">
              <input
                type="password"
                placeholder={p.placeholder}
                value={values[p.id]}
                onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
              <button onClick={() => storeCredential(p.id)} disabled={!values[p.id]?.trim()}>
                Store {statusIcon(storeStatus[p.id])}
              </button>
              <button
                className="testBtn"
                onClick={() => testConnection(p.id)}
                disabled={!values[p.id]?.trim() || testStatus[p.id] === "testing"}
                title="Send a tiny request to verify the key works"
              >
                <Plug size={12} /> Test {statusIcon(testStatus[p.id])}
              </button>
            </div>
            {testDetail[p.id] && (
              <span className={`testDetail ${testStatus[p.id]}`}>{testDetail[p.id]}</span>
            )}
          </div>
        ))}
        <div className="wizardActions">
          <button onClick={() => setFirstRunComplete(true)}>Skip for now</button>
          <button className="primary" onClick={() => setFirstRunComplete(true)}>Continue</button>
        </div>
      </div>
    </div>
  );
}
