import { useMemo } from "react";
import { useWorkspace } from "../store/workspace";
import { GuidedSetup } from "./GuidedSetup";
import { PhaseTracker } from "./PhaseTracker";
import { ReviewList } from "./ReviewList";

export function GuidedFlow() {
  const runProgress = useWorkspace((s) => s.runProgress);
  const lastRun = useWorkspace((s) => s.lastRun);

  const phase = useMemo<"setup" | "running" | "review">(() => {
    if (runProgress.active) return "running";
    // If we have completed nodes from a finished run, show review.
    if (lastRun && (lastRun.completed_status === "success" || lastRun.completed_status === "partial" || lastRun.completed_status === "failed")) {
      return "review";
    }
    return "setup";
  }, [runProgress.active, lastRun]);

  if (phase === "running") return <PhaseTracker />;
  if (phase === "review") return <ReviewList />;
  return <GuidedSetup />;
}
