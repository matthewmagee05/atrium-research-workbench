import { useEffect, useMemo, useState } from "react";
import { X, FolderOpen, Copy, FileText, Braces, ImageIcon, Loader, AlertCircle } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import type { ArtifactFetchPayload } from "../vite-env";

function shortHash(value: string): string {
  return value.startsWith("sha256:") ? value.slice(0, 17) + "…" : value.slice(0, 10) + "…";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Detected =
  | { kind: "markdown"; text: string }
  | { kind: "text"; text: string }
  | { kind: "svg"; svg: string }
  | { kind: "json"; value: unknown };

function detectContent(content: unknown): Detected {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>;
    if (typeof obj.markdown === "string") return { kind: "markdown", text: obj.markdown };
    if (typeof obj.report === "string") return { kind: "markdown", text: obj.report };
    if (typeof obj.text === "string" && obj.text.includes("\n")) return { kind: "text", text: obj.text };
    if (typeof obj.svg === "string") return { kind: "svg", svg: obj.svg };
  }
  if (typeof content === "string") {
    return { kind: "text", text: content };
  }
  return { kind: "json", value: content };
}

function iconForKind(kind: Detected["kind"]) {
  switch (kind) {
    case "markdown":
    case "text":
      return <FileText size={14} />;
    case "svg":
      return <ImageIcon size={14} />;
    default:
      return <Braces size={14} />;
  }
}

export function ArtifactViewer() {
  const artifactId = useWorkspace((s) => s.viewerArtifactId);
  const setArtifactId = useWorkspace((s) => s.setViewerArtifactId);
  const projectDir = useWorkspace((s) => s.projectDir);
  const setStatus = useWorkspace((s) => s.setStatus);
  const [payload, setPayload] = useState<ArtifactFetchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifactId || !projectDir || !window.rwb?.getArtifact) {
      setPayload(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.rwb.getArtifact(projectDir, artifactId)
      .then((result) => { if (!cancelled) setPayload(result); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [artifactId, projectDir]);

  const detected = useMemo<Detected | null>(
    () => (payload ? detectContent(payload.content) : null),
    [payload],
  );

  if (!artifactId) return null;

  const meta = payload?.meta as Record<string, unknown> | undefined;
  const moduleInfo = (meta?.module ?? {}) as { id?: string; version?: string };
  const outputPort = (meta?.output_port as string | undefined) ?? "output";
  const outputKind = (meta?.output_kind as string | undefined) ?? "structured_data";
  const createdAt = (meta?.created_at as string | undefined) ?? "";
  const contentHash = (meta?.content_hash as string | undefined) ?? artifactId;

  async function reveal() {
    if (!projectDir || !artifactId || !window.rwb?.revealArtifact) return;
    try {
      await window.rwb.revealArtifact(projectDir, artifactId);
      setStatus("Opened artifact location in Finder.");
    } catch (e) {
      setStatus(`Reveal failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function copyPath() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.dataPath);
      setStatus(`Copied ${payload.dataPath}`);
    } catch {
      setStatus("Clipboard unavailable in this context.");
    }
  }

  function close() {
    setArtifactId(null);
  }

  return (
    <div className="wizardOverlay" onClick={close}>
      <div className="wizardCard artifactViewer" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h2>
            {detected ? iconForKind(detected.kind) : <FileText size={18} />}{" "}
            {moduleInfo.id ? `${moduleInfo.id}@${moduleInfo.version ?? ""}` : "Artifact"} : {outputPort}
          </h2>
          <button onClick={close}><X size={14} /></button>
        </div>

        <div className="artifactMeta">
          <span><strong>Kind:</strong> {outputKind}</span>
          <span><strong>Hash:</strong> <code title={contentHash}>{shortHash(contentHash)}</code></span>
          {payload && <span><strong>Size:</strong> {formatBytes(payload.sizeBytes)}</span>}
          {createdAt && <span><strong>Created:</strong> {createdAt.replace("T", " ").replace(/\..*/, "")}</span>}
        </div>

        <div className="artifactBody">
          {loading && (
            <div className="artifactStatus"><Loader size={14} className="spin" /> Loading artifact…</div>
          )}
          {error && (
            <div className="artifactStatus error"><AlertCircle size={14} /> {error}</div>
          )}
          {detected?.kind === "markdown" || detected?.kind === "text" ? (
            <pre className="artifactText">{detected.text}</pre>
          ) : null}
          {detected?.kind === "svg" ? (
            <div className="artifactSvg" dangerouslySetInnerHTML={{ __html: detected.svg }} />
          ) : null}
          {detected?.kind === "json" ? (
            <pre className="artifactJson">{JSON.stringify(detected.value, null, 2)}</pre>
          ) : null}
        </div>

        <div className="artifactActions">
          {payload && (
            <span className="artifactPath" title={payload.dataPath}>{payload.dataPath}</span>
          )}
          <div className="artifactActionsButtons">
            <button className="iconBtn small" onClick={copyPath} disabled={!payload}>
              <Copy size={12} /> Copy path
            </button>
            <button className="iconBtn small" onClick={reveal} disabled={!payload}>
              <FolderOpen size={12} /> Reveal in Finder
            </button>
            <button className="iconBtn small primary" onClick={close}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
