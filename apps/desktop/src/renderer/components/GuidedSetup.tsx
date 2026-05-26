import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Circle, Play, KeyRound, FolderOpen, Sparkles, AlertCircle,
  ChevronDown, ChevronRight, Settings2, Layers,
} from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { useWorkflowActions } from "../lib/use-workflow-actions";
import { SETUP_CARDS, type SetupCard } from "../store/phase-map";
import { PROVIDER_LABELS } from "../store/module-catalog";

const api = window.rwb;

function getNodesFor(moduleId: string, pipelineNodes: Array<{ moduleId: string; params: Record<string, unknown> }>) {
  return pipelineNodes.filter((n) => n.moduleId === moduleId);
}

function getCardValue(card: SetupCard, pipelineNodes: Array<{ moduleId: string; params: Record<string, unknown> }>): unknown {
  for (const binding of card.bindings) {
    const nodes = getNodesFor(binding.moduleId, pipelineNodes);
    for (const node of nodes) {
      const value = node.params[binding.paramKey];
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function cardIsRequired(card: SetupCard, pipelineNodes: Array<{ moduleId: string; params: Record<string, unknown> }>): boolean {
  if (!card.required) return false;
  return card.bindings.some((b) => getNodesFor(b.moduleId, pipelineNodes).length > 0);
}

function cardIsRelevant(card: SetupCard, pipelineNodes: Array<{ moduleId: string; params: Record<string, unknown> }>): boolean {
  return card.bindings.some((b) => getNodesFor(b.moduleId, pipelineNodes).length > 0);
}

function cardIsFilled(card: SetupCard, value: unknown): boolean {
  if (!card.required) return true;
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function valuePreview(card: SetupCard, value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not set";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty";
    return value.slice(0, 3).join(", ") + (value.length > 3 ? `, … (${value.length} total)` : "");
  }
  if (typeof value === "number") return String(value);
  const text = String(value);
  return text.length > 100 ? text.slice(0, 97) + "…" : text;
}

interface CardEditorProps {
  card: SetupCard;
  value: unknown;
  onChange: (next: unknown) => void;
}

function CardEditor({ card, value, onChange }: CardEditorProps) {
  if (card.inputType === "text") {
    return (
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
    );
  }
  if (card.inputType === "textarea") {
    return (
      <textarea
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
    );
  }
  if (card.inputType === "number") {
    const num = typeof value === "number" ? value : Number(value) || 0;
    return (
      <input
        type="number"
        value={num}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        autoFocus
      />
    );
  }
  if (card.inputType === "string-list") {
    const list = Array.isArray(value) ? value.map(String) : [];
    return (
      <textarea
        rows={4}
        value={list.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        autoFocus
      />
    );
  }
  if (card.inputType === "fixed-choice") {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {(card.choices ?? []).map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    );
  }
  return null;
}

export function GuidedSetup() {
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const updateNodeParams = useWorkspace((s) => s.updateNodeParams);
  const defaultLlm = useWorkspace((s) => s.defaultLlm);
  const setSettingsOpen = useWorkspace((s) => s.setSettingsOpen);
  const setAppMode = useWorkspace((s) => s.setAppMode);
  const projectDir = useWorkspace((s) => s.projectDir);
  const credentialStatus = useWorkspace((s) => s.credentialStatus);
  const setCredentialStatus = useWorkspace((s) => s.setCredentialStatus);
  const modules = useWorkspace((s) => s.modules);
  const status = useWorkspace((s) => s.status);
  const { busy, lastError, openProject, runProtocol } = useWorkflowActions();
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!api?.getCredentialStatus) return;
    api.getCredentialStatus().then(setCredentialStatus).catch(() => undefined);
  }, [setCredentialStatus]);

  function setCardValue(card: SetupCard, next: unknown) {
    for (const binding of card.bindings) {
      const nodes = pipelineNodes.filter((n) => n.moduleId === binding.moduleId);
      for (const node of nodes) {
        updateNodeParams(node.id, { ...node.params, [binding.paramKey]: next });
      }
    }
  }

  // Always render every setup card so the layout is consistent across templates.
  // Cards whose modules aren't on the canvas render in a muted, non-editable state.
  const allCards = useMemo(
    () => SETUP_CARDS.map((card) => ({ card, relevant: cardIsRelevant(card, pipelineNodes) })),
    [pipelineNodes],
  );

  const requiredCardsUnfilled = useMemo(
    () => allCards
      .filter(({ card, relevant }) => relevant && cardIsRequired(card, pipelineNodes) && !cardIsFilled(card, getCardValue(card, pipelineNodes)))
      .map(({ card }) => card),
    [allCards, pipelineNodes],
  );

  const llmRequired = useMemo(
    () => pipelineNodes.some((n) => modules.find((m) => m.id === n.moduleId)?.llm?.required),
    [pipelineNodes, modules],
  );
  const hasCreds = Object.values(credentialStatus).some(Boolean);
  const llmReady = !llmRequired || hasCreds;
  const llmConfigured = Boolean(defaultLlm) || pipelineNodes.every((n) => typeof n.params.provider === "string" || !modules.find((m) => m.id === n.moduleId)?.llm?.required);

  const canRun = !busy && pipelineNodes.length > 0 && projectDir && llmReady && llmConfigured && requiredCardsUnfilled.length === 0;
  const blockReasons: string[] = [];
  if (pipelineNodes.length === 0) blockReasons.push("No pipeline loaded");
  if (!projectDir) blockReasons.push("Pick a project location");
  if (llmRequired && !hasCreds) blockReasons.push("Add an API key");
  if (!llmConfigured) blockReasons.push("Choose a default LLM");
  if (requiredCardsUnfilled.length > 0) blockReasons.push(`Fill ${requiredCardsUnfilled.length} required field${requiredCardsUnfilled.length === 1 ? "" : "s"}`);

  return (
    <div className="guidedSetup">
      <header className="guidedHeader">
        <div>
          <h1>Set up your run</h1>
          <p>Configure each step below, then Atrium will execute the full pipeline.</p>
        </div>
        <button className="iconBtn small" onClick={() => setAppMode("builder")} title="Switch to the module workbench for advanced pipeline editing">
          <Layers size={12} /> Custom template builder
        </button>
      </header>

      <ol className="guidedCardList">
        {allCards.map(({ card, relevant }) => {
          if (!relevant) {
            return (
              <li key={card.id} className="guidedCard inactive">
                <div className="guidedCardHeader">
                  <span className="guidedCardStatus"><Circle size={18} /></span>
                  <span className="guidedCardLabel">
                    <strong>{card.label}</strong>
                    <span className="guidedCardPreview muted">Not used by this template</span>
                  </span>
                </div>
              </li>
            );
          }
          const value = getCardValue(card, pipelineNodes);
          const filled = cardIsFilled(card, value);
          const required = cardIsRequired(card, pipelineNodes);
          const isOpen = openCardId === card.id;
          return (
            <li key={card.id} className={`guidedCard ${filled ? "done" : required ? "pending" : "optional"} ${isOpen ? "open" : ""}`}>
              <button className="guidedCardHeader" onClick={() => setOpenCardId(isOpen ? null : card.id)}>
                <span className="guidedCardStatus">
                  {filled ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </span>
                <span className="guidedCardLabel">
                  <strong>{card.label}{required && !filled ? " *" : ""}</strong>
                  <span className="guidedCardPreview">{valuePreview(card, value)}</span>
                </span>
                <span className="guidedCardCaret">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              </button>
              {isOpen && (
                <div className="guidedCardBody">
                  <p className="guidedCardDescription">{card.description}</p>
                  <CardEditor card={card} value={value} onChange={(next) => setCardValue(card, next)} />
                  {card.helpText && <pre className="guidedCardHelp">{card.helpText}</pre>}
                </div>
              )}
            </li>
          );
        })}

        <li className={`guidedCard passive ${defaultLlm ? "done" : "pending"}`}>
          <div className="guidedCardHeader">
            <span className="guidedCardStatus">{defaultLlm ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <span className="guidedCardLabel">
              <strong><Sparkles size={13} /> AI model</strong>
              <span className="guidedCardPreview">
                {defaultLlm
                  ? `${PROVIDER_LABELS[defaultLlm.provider]} · ${defaultLlm.model}`
                  : "Pick the model every LLM step will use"}
              </span>
            </span>
            <button className="iconBtn small" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={12} /> {defaultLlm ? "Change" : "Choose"}
            </button>
          </div>
        </li>

        <li className={`guidedCard passive ${projectDir ? "done" : "pending"}`}>
          <div className="guidedCardHeader">
            <span className="guidedCardStatus">{projectDir ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <span className="guidedCardLabel">
              <strong><FolderOpen size={13} /> Project location</strong>
              <span className="guidedCardPreview">{projectDir || "Where Atrium will store artifacts and the run manifest"}</span>
            </span>
            <button className="iconBtn small" onClick={openProject}>
              <FolderOpen size={12} /> {projectDir ? "Change" : "Open"}
            </button>
          </div>
        </li>

        <li className={`guidedCard passive ${!llmRequired || hasCreds ? "done" : "pending"}`}>
          <div className="guidedCardHeader">
            <span className="guidedCardStatus">{!llmRequired || hasCreds ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <span className="guidedCardLabel">
              <strong><KeyRound size={13} /> API credentials</strong>
              <span className="guidedCardPreview">
                {!llmRequired
                  ? "Not required — no LLM modules in this pipeline"
                  : hasCreds
                    ? `${Object.values(credentialStatus).filter(Boolean).length} provider(s) configured`
                    : "Save at least one provider key"}
              </span>
            </span>
            <button className="iconBtn small" onClick={() => setSettingsOpen(true)}>
              <KeyRound size={12} /> Manage
            </button>
          </div>
        </li>
      </ol>

      {lastError && (
        <div className="guidedError">
          <AlertCircle size={14} /> {lastError}
        </div>
      )}

      <footer className="guidedFooter">
        <div className="guidedFooterStatus">{status}</div>
        <button
          className="guidedRunButton"
          onClick={() => runProtocol()}
          disabled={!canRun}
          title={canRun ? "Run the pipeline" : blockReasons.join(" • ")}
        >
          <Play size={16} />
          {busy ? "Starting…" : canRun ? "Run pipeline" : `Run pipeline · ${blockReasons.length} blocker${blockReasons.length === 1 ? "" : "s"}`}
        </button>
      </footer>
      {!canRun && blockReasons.length > 0 && (
        <ul className="guidedBlockers">
          {blockReasons.map((reason) => <li key={reason}><AlertCircle size={12} /> {reason}</li>)}
        </ul>
      )}
    </div>
  );
}
