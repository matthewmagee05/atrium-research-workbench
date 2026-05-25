import { useState } from "react";
import { X, Download, ShieldAlert, ShieldCheck, GitCompare, AlertTriangle } from "lucide-react";
import { useWorkspace } from "../store/workspace";

const api = window.rwb;

interface Props {
  mode: "import" | "verify" | "diff";
  onClose: () => void;
}

type TrustModule = { moduleId: string; bundledVersion: string; localVersion?: string; status: string };

export function BundleDialog({ mode, onClose }: Props) {
  const projectDir = useWorkspace((s) => s.projectDir);
  const setProjectDir = useWorkspace((s) => s.setProjectDir);
  const setProtocolPath = useWorkspace((s) => s.setProtocolPath);
  const setStatus = useWorkspace((s) => s.setStatus);

  const [bundlePath, setBundlePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [trust, setTrust] = useState<{ allTrusted: boolean; modules: TrustModule[]; hashMismatches: Array<{ moduleId: string }> } | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; checked: Array<{ node_id: string; port: string; expected: string; actual: string; ok: boolean }> } | null>(null);
  const [artifactA, setArtifactA] = useState("");
  const [artifactB, setArtifactB] = useState("");
  const [diffResult, setDiffResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickAndImport() {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const dest = await api.importBundle();
      if (dest) {
        setProjectDir(dest);
        setProtocolPath(`${dest}/protocol.yaml`);
        setStatus(`Bundle imported into ${dest}`);
        onClose();
      } else {
        setError("Import canceled");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function inspectAndVerify() {
    if (!api || !bundlePath.trim()) return;
    setBusy(true);
    setError(null);
    setTrust(null);
    setVerifyResult(null);
    try {
      const report = await api.inspectBundleTrust(bundlePath.trim());
      setTrust(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runVerify(trusted: boolean) {
    if (!api || !bundlePath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.verifyBundle(bundlePath.trim(), { trusted });
      setVerifyResult({ ok: result.ok, checked: result.checked });
      setStatus(result.ok ? "Bundle verification passed" : "Bundle verification failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runDiff() {
    if (!api || !projectDir || !artifactA.trim() || !artifactB.trim()) return;
    setBusy(true);
    setError(null);
    setDiffResult(null);
    try {
      const result = await api.diffArtifacts(artifactA.trim(), artifactB.trim(), projectDir);
      setDiffResult(result as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizardOverlay" onClick={onClose}>
      <div className="wizardCard bundleDialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h2>
            {mode === "import" && <><Download size={18} /> Import bundle</>}
            {mode === "verify" && <><ShieldAlert size={18} /> Verify bundle</>}
            {mode === "diff" && <><GitCompare size={18} /> Diff artifacts</>}
          </h2>
          <button onClick={onClose}><X size={14} /></button>
        </div>

        {mode === "import" && (
          <div>
            <p>Select a bundle directory, then a destination directory. The bundle's protocol and artifacts will be copied in.</p>
            <button className="primary" onClick={pickAndImport} disabled={busy}>
              Choose bundle & destination
            </button>
          </div>
        )}

        {mode === "verify" && (
          <div>
            <p>Verify a bundle by re-running its deterministic nodes and comparing hashes.</p>
            <input
              type="text"
              placeholder="/absolute/path/to/bundle"
              value={bundlePath}
              onChange={(e) => setBundlePath(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={inspectAndVerify} disabled={busy || !bundlePath.trim()}>Inspect trust</button>
              <button onClick={() => runVerify(false)} disabled={busy || !bundlePath.trim()}>Verify (strict)</button>
              <button onClick={() => runVerify(true)} disabled={busy || !bundlePath.trim()}>Verify (trust bundled modules)</button>
            </div>
            {trust && (
              <div className="trustReport">
                <div className={trust.allTrusted ? "trustOk" : "trustFail"}>
                  {trust.allTrusted
                    ? <><ShieldCheck size={14} /> All bundled modules match local</>
                    : <><AlertTriangle size={14} /> {trust.hashMismatches.length} mismatched module(s)</>}
                </div>
                <table>
                  <thead><tr><th>Module</th><th>Bundled</th><th>Local</th><th>Status</th></tr></thead>
                  <tbody>
                    {trust.modules.map((m) => (
                      <tr key={m.moduleId}>
                        <td>{m.moduleId}</td>
                        <td>{m.bundledVersion}</td>
                        <td>{m.localVersion ?? "—"}</td>
                        <td>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {verifyResult && (
              <div className="verifyReport">
                <h4>{verifyResult.ok ? "Verification passed" : "Verification failed"}</h4>
                {verifyResult.checked.length > 0 ? (
                  <table>
                    <thead><tr><th>Node</th><th>Port</th><th>Match</th></tr></thead>
                    <tbody>
                      {verifyResult.checked.map((c) => (
                        <tr key={`${c.node_id}:${c.port}`}>
                          <td>{c.node_id}</td>
                          <td>{c.port}</td>
                          <td>{c.ok ? "✓" : "✗"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No nodes verified (bundle untrusted or empty).</p>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "diff" && (
          <div>
            <p>Compare two artifacts from the current project.</p>
            <input
              type="text"
              placeholder="artifact id A (sha256:...)"
              value={artifactA}
              onChange={(e) => setArtifactA(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <input
              type="text"
              placeholder="artifact id B (sha256:...)"
              value={artifactB}
              onChange={(e) => setArtifactB(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <button onClick={runDiff} disabled={busy || !artifactA.trim() || !artifactB.trim() || !projectDir}>
              Compare
            </button>
            {diffResult && (
              <pre className="diffOutput">{JSON.stringify(diffResult, null, 2)}</pre>
            )}
          </div>
        )}

        {error && <p className="dialogError">{error}</p>}
      </div>
    </div>
  );
}
