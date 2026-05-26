import { useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquarePlus, Save, ShieldCheck } from "lucide-react";
import { useWorkspace } from "../store/workspace";

type TrustReport = {
  allTrusted: boolean;
  modules: Array<{ moduleId: string; bundledVersion: string; localVersion?: string | null; hashMatch?: boolean; presentLocally?: boolean }>;
  hashMismatches?: Array<string | { moduleId: string }>;
};

type VerifyReport = {
  ok: boolean;
  checked: Array<{ node_id: string; port: string; expected: string; actual: string; ok: boolean }>;
};

export function ReviewerNotesPanel() {
  const bundleOnlyMode = useWorkspace((s) => s.bundleOnlyMode);
  const projectDir = useWorkspace((s) => s.projectDir);
  const bundleImportPath = useWorkspace((s) => s.bundleImportPath);
  const notes = useWorkspace((s) => s.reviewerNotes);
  const addReviewerNote = useWorkspace((s) => s.addReviewerNote);
  const clearReviewerNotes = useWorkspace((s) => s.clearReviewerNotes);
  const setStatus = useWorkspace((s) => s.setStatus);
  const [artifactId, setArtifactId] = useState("");
  const [note, setNote] = useState("");
  const [trustReport, setTrustReport] = useState<TrustReport | null>(null);
  const [verifyReport, setVerifyReport] = useState<VerifyReport | null>(null);
  const [busy, setBusy] = useState(false);

  if (!bundleOnlyMode) return null;

  async function exportNotes() {
    if (!window.rwb?.exportReviewNotes || !projectDir) return;
    const output = await window.rwb.exportReviewNotes(projectDir, notes);
    setStatus(`Reviewer notes exported to ${output}`);
  }

  async function inspectTrust() {
    if (!window.rwb?.inspectBundleTrust || !bundleImportPath) return;
    setBusy(true);
    try {
      const report = await window.rwb.inspectBundleTrust(bundleImportPath);
      setTrustReport(report as TrustReport);
      setStatus(report.allTrusted ? "Bundle trust inspection passed." : "Bundle has untrusted or mismatched modules.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyBundle(trusted: boolean) {
    if (!window.rwb?.verifyBundle || !bundleImportPath) return;
    setBusy(true);
    try {
      const report = await window.rwb.verifyBundle(bundleImportPath, { trusted });
      setVerifyReport(report as VerifyReport);
      setStatus(report.ok ? "Bundle verification passed." : "Bundle verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reviewerNotesPanel">
      <div className="reviewerNotesHead">
        <strong><MessageSquarePlus size={14} /> Reviewer annotations</strong>
        <button className="iconBtn small" onClick={exportNotes} disabled={notes.length === 0 || !projectDir} title="Export review.md">
          <Save size={12} /> Export
        </button>
      </div>
      {bundleImportPath && (
        <div className="reviewerVerifyPanel">
          <div>
            <strong><ShieldCheck size={13} /> Bundle verification</strong>
            <span>{bundleImportPath}</span>
          </div>
          <div className="reviewerVerifyActions">
            <button className="iconBtn small" onClick={inspectTrust} disabled={busy}>Inspect trust</button>
            <button className="iconBtn small" onClick={() => verifyBundle(false)} disabled={busy}>Verify strict</button>
            <button className="iconBtn small" onClick={() => verifyBundle(true)} disabled={busy}>Verify trusted</button>
          </div>
          {trustReport && (
            <div className={trustReport.allTrusted ? "reviewerCheck pass" : "reviewerCheck warn"}>
              {trustReport.allTrusted ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <span>{trustReport.allTrusted ? "All bundled modules match local modules." : `${trustReport.hashMismatches?.length ?? 0} module mismatch(es) or missing local modules.`}</span>
            </div>
          )}
          {verifyReport && (
            <div className={verifyReport.ok ? "reviewerCheck pass" : "reviewerCheck warn"}>
              {verifyReport.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <span>{verifyReport.ok ? "Deterministic verification passed." : "Verification did not match the run manifest."} {verifyReport.checked.length} output(s) checked.</span>
            </div>
          )}
        </div>
      )}
      <div className="reviewerNotesForm">
        <input value={artifactId} onChange={(e) => setArtifactId(e.target.value)} placeholder="artifact id or general" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note" rows={2} />
        <button
          className="iconBtn small primary"
          disabled={!note.trim()}
          onClick={() => {
            addReviewerNote(artifactId.trim() || "general", note.trim());
            setArtifactId("");
            setNote("");
          }}
        >
          Add note
        </button>
      </div>
      {notes.length > 0 && (
        <div className="reviewerNotesList">
          {notes.slice(-3).map((item, index) => (
            <div key={`${item.createdAt}-${index}`}>
              <code>{item.artifactId}</code>
              <span>{item.note}</span>
            </div>
          ))}
          <button className="linkBtn" onClick={clearReviewerNotes}>Clear notes</button>
        </div>
      )}
    </section>
  );
}
