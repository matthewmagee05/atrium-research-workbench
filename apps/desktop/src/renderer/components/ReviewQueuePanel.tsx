import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardCheck, Loader, RefreshCw, UserRoundCheck } from "lucide-react";
import { useWorkspace } from "../store/workspace";

function preview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  try {
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  } catch {
    return String(value);
  }
}

function itemLabel(item: Record<string, unknown>): string {
  const payload = item.payload as Record<string, unknown> | undefined;
  const record = payload?.record as Record<string, unknown> | undefined;
  const decision = payload?.decision as Record<string, unknown> | undefined;
  return String(
    record?.title ??
    payload?.claim ??
    decision?.record_id ??
    payload?.question_index ??
    payload?.hypothesis_index ??
    item.id ??
    "Review item",
  );
}

export function ReviewQueuePanel() {
  const projectDir = useWorkspace((s) => s.projectDir);
  const lastRun = useWorkspace((s) => s.lastRun);
  const reviewItems = useWorkspace((s) => s.reviewItems);
  const setReviewItems = useWorkspace((s) => s.setReviewItems);
  const setStatus = useWorkspace((s) => s.setStatus);
  const [reviewer, setReviewer] = useState(() => localStorage.getItem("atrium.reviewer") ?? "");
  const [orcid, setOrcid] = useState(() => localStorage.getItem("atrium.reviewer_orcid") ?? "");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const pending = useMemo(() => reviewItems.filter((item) => item.status === "pending"), [reviewItems]);
  const resolvedCount = reviewItems.length - pending.length;

  async function refresh() {
    if (!projectDir || !window.rwb?.listReviewItems) return;
    const items = await window.rwb.listReviewItems(projectDir);
    setReviewItems(items);
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [projectDir, lastRun?.run_id]);

  useEffect(() => {
    localStorage.setItem("atrium.reviewer", reviewer);
  }, [reviewer]);

  useEffect(() => {
    localStorage.setItem("atrium.reviewer_orcid", orcid);
  }, [orcid]);

  async function resolve(item: Record<string, unknown>, decisionType: "accept" | "reject" | "defer") {
    if (!projectDir || !window.rwb?.resolveReviewItem) return;
    const id = String(item.id);
    setBusyId(id);
    try {
      await window.rwb.resolveReviewItem(projectDir, id, {
        accepted: decisionType === "accept",
        decision_type: decisionType,
        decided_by: reviewer.trim() || undefined,
        reviewer_orcid: orcid.trim() || undefined,
        reviewer_rationale: decisionType === "defer" ? "Deferred for additional reviewer adjudication." : undefined,
      });
      await refresh();
      setStatus(`Review ${decisionType} recorded.`);
    } finally {
      setBusyId(null);
    }
  }

  async function resolveAll(decisionType: "accept" | "reject") {
    if (!projectDir || !window.rwb?.resolveReviewItem) return;
    if (pending.length === 0) return;
    const verb = decisionType === "accept" ? "approve" : "reject";
    const ok = window.confirm(
      `${verb[0].toUpperCase() + verb.slice(1)} all ${pending.length} pending review items?\n\nThis records the same decision against every item attributed to "${reviewer.trim() || "unnamed reviewer"}". Items already accepted/rejected are not affected.`,
    );
    if (!ok) return;
    setBulkProgress({ done: 0, total: pending.length });
    let done = 0;
    const rationale = decisionType === "accept"
      ? "Bulk-approved from desktop review queue."
      : "Bulk-rejected from desktop review queue.";
    for (const item of pending) {
      try {
        await window.rwb.resolveReviewItem(projectDir, String(item.id), {
          accepted: decisionType === "accept",
          decision_type: decisionType,
          decided_by: reviewer.trim() || undefined,
          reviewer_orcid: orcid.trim() || undefined,
          reviewer_rationale: rationale,
        });
      } catch {
        // continue on individual failures; final refresh will reflect what stuck
      }
      done += 1;
      setBulkProgress({ done, total: pending.length });
    }
    await refresh();
    setBulkProgress(null);
    setStatus(`${done} review item${done === 1 ? "" : "s"} ${decisionType === "accept" ? "approved" : "rejected"}.`);
  }

  return (
    <section className="reviewQueuePanel">
      <div className="reviewQueueHead">
        <strong><ClipboardCheck size={14} /> Review queue</strong>
        <button className="iconBtn small" onClick={() => refresh()} title="Refresh review queue"><RefreshCw size={12} /></button>
      </div>
      <div className="reviewerIdentity">
        <label>
          Reviewer
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="name or email" />
        </label>
        <label>
          ORCID
          <input value={orcid} onChange={(e) => setOrcid(e.target.value)} placeholder="0000-0000-0000-0000" />
        </label>
      </div>
      <div className="reviewQueueMeta">
        <span><UserRoundCheck size={13} /> {pending.length} pending</span>
        <span>{resolvedCount} resolved</span>
      </div>
      {pending.length > 0 && (
        <div className="reviewQueueBulk">
          <button
            className="iconBtn small primary"
            onClick={() => resolveAll("accept")}
            disabled={bulkProgress !== null}
            title="Record an Accept decision for every pending item"
          >
            {bulkProgress ? <Loader size={12} className="spin" /> : <CheckCheck size={12} />}
            {bulkProgress
              ? `Approving ${bulkProgress.done} / ${bulkProgress.total}…`
              : `Approve all (${pending.length})`}
          </button>
          <button
            className="iconBtn small"
            onClick={() => resolveAll("reject")}
            disabled={bulkProgress !== null}
            title="Record a Reject decision for every pending item"
          >
            Reject all
          </button>
        </div>
      )}
      {pending.length === 0 ? (
        <p className="reviewQueueEmpty">No pending review items.</p>
      ) : (
        <div className="reviewQueueList">
          {pending.slice(0, 5).map((item) => (
            <article className="reviewQueueItem" key={String(item.id)}>
              <strong>{itemLabel(item)}</strong>
              <span>{preview(item.payload)}</span>
              <div className="reviewQueueActions">
                <button disabled={busyId === item.id} onClick={() => resolve(item, "accept")}>Accept</button>
                <button disabled={busyId === item.id} onClick={() => resolve(item, "reject")}>Reject</button>
                <button disabled={busyId === item.id} onClick={() => resolve(item, "defer")}>Defer</button>
              </div>
            </article>
          ))}
          {pending.length > 5 && <span className="reviewQueueMore">+{pending.length - 5} more pending</span>}
        </div>
      )}
    </section>
  );
}
