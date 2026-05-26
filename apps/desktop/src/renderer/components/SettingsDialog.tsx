import { useEffect, useMemo, useState } from "react";
import { X, KeyRound, CheckCircle, XCircle, Loader, Plug, Eye, EyeOff, Trash2, Wand2, AlertTriangle, Sparkles } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import {
  defaultModelForProvider,
  paramsUseLlm,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  type DefaultLlm,
  type LlmProvider,
} from "../store/module-catalog";

const SMART_TO_ASCII: Record<string, string> = {
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-",
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": "\"", "”": "\"", "„": "\"", "‟": "\"",
  " ": " ", " ": " ", " ": " ", "​": "", "‌": "", "‍": "",
  "﻿": "",
};

function detectNonAscii(value: string): { index: number; char: string; code: number } | null {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 127) return { index: i, char: value[i], code };
  }
  return null;
}

function sanitizeAscii(value: string): string {
  return value.replace(/./gsu, (ch) => (ch in SMART_TO_ASCII ? SMART_TO_ASCII[ch] : ch));
}

const api = window.rwb;

type TestStatus = "idle" | "testing" | "pass" | "fail";

const PROVIDERS = [
  { id: "anthropic" as const, name: "Anthropic (Claude)", placeholder: "sk-ant-api03-..." },
  { id: "openai" as const, name: "OpenAI",                placeholder: "sk-..." },
  { id: "ollama" as const, name: "Ollama (local)",        placeholder: "http://localhost:11434" },
] as const;

export function SettingsDialog() {
  const open = useWorkspace((s) => s.settingsOpen);
  const setOpen = useWorkspace((s) => s.setSettingsOpen);
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);
  const defaultLlm = useWorkspace((s) => s.defaultLlm);
  const setDefaultLlm = useWorkspace((s) => s.setDefaultLlm);
  const applyDefaultLlmToAllNodes = useWorkspace((s) => s.applyDefaultLlmToAllNodes);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const [defaultApplyDetail, setDefaultApplyDetail] = useState<string | null>(null);

  const llmNodeCount = useMemo(
    () => pipelineNodes.filter((n) => paramsUseLlm(n.params)).length,
    [pipelineNodes],
  );

  const defaultProvider: LlmProvider = defaultLlm?.provider ?? "openai";
  const defaultModel = defaultLlm?.model ?? defaultModelForProvider(defaultProvider);
  const defaultProviderModels = PROVIDER_MODELS[defaultProvider];
  const defaultModelOption = defaultProviderModels.includes(defaultModel) ? defaultModel : "__custom__";

  function updateDefault(next: Partial<DefaultLlm>) {
    const nextProvider: LlmProvider = next.provider ?? defaultProvider;
    const nextModel = next.model ?? (next.provider ? defaultModelForProvider(nextProvider) : defaultModel);
    setDefaultLlm({ provider: nextProvider, model: nextModel });
    setDefaultApplyDetail(null);
  }

  function clearDefault() {
    setDefaultLlm(null);
    setDefaultApplyDetail(null);
  }

  function applyDefaultToCanvas() {
    if (!defaultLlm) return;
    const updated = applyDefaultLlmToAllNodes();
    setDefaultApplyDetail(
      updated === 0
        ? "All LLM nodes already use the default."
        : `Updated ${updated} node${updated === 1 ? "" : "s"} to ${PROVIDER_LABELS[defaultLlm.provider]} / ${defaultLlm.model}.`,
    );
  }

  const [values, setValues] = useState<Record<string, string>>({ anthropic: "", openai: "", ollama: "" });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [storeStatus, setStoreStatus] = useState<Record<string, TestStatus>>({ anthropic: "idle", openai: "idle", ollama: "idle" });
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({ anthropic: "idle", openai: "idle", ollama: "idle" });
  const [detail, setDetail] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (!api?.getCredentialStatus) return;
    api.getCredentialStatus().then(setCredentialStatus).catch(() => undefined);
  }, [open, setCredentialStatus]);

  if (!open) return null;

  async function refreshStatus() {
    if (!api?.getCredentialStatus) return;
    try { setCredentialStatus(await api.getCredentialStatus()); } catch { /* ignore */ }
  }

  async function storeCredential(provider: "anthropic" | "openai" | "ollama") {
    const value = values[provider]?.trim();
    if (!value) return;
    setStoreStatus((prev) => ({ ...prev, [provider]: "testing" }));
    setDetail((prev) => ({ ...prev, [provider]: "Saving to OS keychain…" }));
    try {
      if (!api) throw new Error("Desktop IPC unavailable (running in browser preview).");
      await api.setCredential(provider, value);
      await refreshStatus();
      setStoreStatus((prev) => ({ ...prev, [provider]: "pass" }));
      setDetail((prev) => ({ ...prev, [provider]: "Saved to OS keychain." }));
      setValues((prev) => ({ ...prev, [provider]: "" }));
    } catch (e) {
      setStoreStatus((prev) => ({ ...prev, [provider]: "fail" }));
      setDetail((prev) => ({ ...prev, [provider]: e instanceof Error ? e.message : "Save failed." }));
    }
  }

  async function testConnection(provider: "anthropic" | "openai" | "ollama") {
    const value = values[provider]?.trim();
    if (!value) {
      setDetail((prev) => ({ ...prev, [provider]: "Enter a value before testing." }));
      return;
    }
    setTestStatus((prev) => ({ ...prev, [provider]: "testing" }));
    setDetail((prev) => ({ ...prev, [provider]: "Testing connection…" }));
    try {
      if (!api) throw new Error("Desktop IPC unavailable.");
      const result = await api.testCredential(provider, value);
      setTestStatus((prev) => ({ ...prev, [provider]: result.ok ? "pass" : "fail" }));
      setDetail((prev) => ({ ...prev, [provider]: result.ok ? "Connection OK." : (result.detail ?? `HTTP ${result.status ?? "error"}`) }));
    } catch (e) {
      setTestStatus((prev) => ({ ...prev, [provider]: "fail" }));
      setDetail((prev) => ({ ...prev, [provider]: e instanceof Error ? e.message : "Test failed." }));
    }
  }

  function statusIcon(s: TestStatus) {
    switch (s) {
      case "testing": return <Loader size={14} className="spin" />;
      case "pass": return <CheckCircle size={14} className="testPass" />;
      case "fail": return <XCircle size={14} className="testFail" />;
      default: return null;
    }
  }

  return (
    <div className="wizardOverlay" onClick={() => setOpen(false)}>
      <div className="wizardCard settingsDialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h2><KeyRound size={18} /> Settings — API credentials</h2>
          <button onClick={() => setOpen(false)}><X size={14} /></button>
        </div>
        <p className="settingsHint">
          Credentials are stored in your OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux). They are never written to your project files.
        </p>

        <section className="settingsRow defaultLlmRow" aria-label="Default LLM">
          <div className="settingsRowHead">
            <strong><Sparkles size={14} /> Default LLM</strong>
            {defaultLlm ? (
              <span className="settingsStatus stored">
                <CheckCircle size={12} /> {PROVIDER_LABELS[defaultLlm.provider]} / {defaultLlm.model}
              </span>
            ) : (
              <span className="settingsStatus missing">Not set</span>
            )}
          </div>
          <p className="settingsHint" style={{ margin: "4px 0 8px" }}>
            Applied to every LLM-using module so you only configure one provider and model. New nodes inherit this automatically; use "Apply to all" to retrofit existing nodes on the canvas.
          </p>
          <div className="providerModelGrid">
            <label>
              Provider
              <select
                value={defaultProvider}
                onChange={(e) => updateDefault({ provider: e.target.value as LlmProvider })}
              >
                {(Object.keys(PROVIDER_MODELS) as LlmProvider[]).map((provider) => (
                  <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select
                value={defaultModelOption}
                onChange={(e) => {
                  const value = e.target.value;
                  updateDefault({ model: value === "__custom__" ? defaultModel : value });
                }}
              >
                {defaultProviderModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
                <option value="__custom__">Custom model...</option>
              </select>
            </label>
          </div>
          {defaultModelOption === "__custom__" && (
            <label className="customModelField">
              Custom model id
              <input
                type="text"
                value={defaultModel}
                placeholder={defaultModelForProvider(defaultProvider)}
                onChange={(e) => updateDefault({ model: e.target.value })}
              />
            </label>
          )}
          <div className="settingsRowBody" style={{ marginTop: 8 }}>
            <button
              className="iconBtn small primary"
              onClick={applyDefaultToCanvas}
              disabled={!defaultLlm || llmNodeCount === 0}
              title={llmNodeCount === 0 ? "No LLM nodes on the canvas yet" : undefined}
            >
              <Sparkles size={12} /> Apply to all LLM nodes ({llmNodeCount})
            </button>
            {defaultLlm && (
              <button
                className="iconBtn small"
                onClick={clearDefault}
                title="Clear the default; new LLM nodes will fall back to their module-recommended provider/model"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          {defaultApplyDetail && (
            <span className="settingsDetail pass">{defaultApplyDetail}</span>
          )}
        </section>

        {PROVIDERS.map((p) => {
          const isStored = credentialStatus[p.id];
          const currentValue = values[p.id] ?? "";
          const offender = detectNonAscii(currentValue);
          return (
            <div key={p.id} className="settingsRow">
              <div className="settingsRowHead">
                <strong>{p.name}</strong>
                {isStored ? (
                  <span className="settingsStatus stored">
                    <CheckCircle size={12} /> Saved in keychain
                  </span>
                ) : (
                  <span className="settingsStatus missing">Not configured</span>
                )}
              </div>
              <div className="settingsRowBody">
                <div className="settingsInputWrap">
                  <input
                    type={reveal[p.id] ? "text" : "password"}
                    placeholder={isStored ? "Enter a new value to replace…" : p.placeholder}
                    value={values[p.id] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <button
                    className="iconBtn small"
                    onClick={() => setReveal((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    title={reveal[p.id] ? "Hide" : "Show"}
                  >
                    {reveal[p.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  className="iconBtn small"
                  onClick={() => testConnection(p.id)}
                  disabled={!values[p.id]?.trim() || testStatus[p.id] === "testing"}
                  title="Send a tiny request to verify the key works"
                >
                  <Plug size={12} /> Test {statusIcon(testStatus[p.id])}
                </button>
                <button
                  className="iconBtn small primary"
                  onClick={() => storeCredential(p.id)}
                  disabled={!values[p.id]?.trim() || storeStatus[p.id] === "testing" || offender !== null}
                  title={offender ? "Fix the non-ASCII character first" : undefined}
                >
                  Save {statusIcon(storeStatus[p.id])}
                </button>
                {isStored && (
                  <button
                    className="iconBtn small danger"
                    onClick={async () => {
                      if (!api) return;
                      try { await api.setCredential(p.id, ""); } catch { /* ignore */ }
                      await refreshStatus();
                      setDetail((prev) => ({ ...prev, [p.id]: "Cleared from keychain." }));
                    }}
                    title="Remove from keychain"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {offender && (
                <div className="settingsDetail fail asciiWarn">
                  <AlertTriangle size={12} />
                  <span>
                    Non-ASCII character <code>{offender.char}</code>{" "}
                    (U+{offender.code.toString(16).toUpperCase().padStart(4, "0")}) at position {offender.index}.
                    Likely an autocorrected dash or smart quote.
                  </span>
                  <button
                    className="iconBtn small"
                    onClick={() => setValues((prev) => ({ ...prev, [p.id]: sanitizeAscii(currentValue) }))}
                    title="Replace smart quotes / em-dashes with plain ASCII"
                  >
                    <Wand2 size={12} /> Fix
                  </button>
                </div>
              )}
              {detail[p.id] && !offender && (
                <span className={`settingsDetail ${storeStatus[p.id] === "fail" || testStatus[p.id] === "fail" ? "fail" : storeStatus[p.id] === "pass" || testStatus[p.id] === "pass" ? "pass" : ""}`}>
                  {detail[p.id]}
                </span>
              )}
            </div>
          );
        })}
        <div className="wizardActions">
          <button className="primary" onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}
