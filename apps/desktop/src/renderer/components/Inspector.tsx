import { ParamForm } from "./ParamForm";
import { ReviewQueuePanel } from "./ReviewQueuePanel";

export function Inspector() {
  return (
    <aside className="inspector">
      <ParamForm />
      <ReviewQueuePanel />
    </aside>
  );
}
