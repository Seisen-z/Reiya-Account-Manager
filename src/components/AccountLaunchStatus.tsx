import type { LaunchFeedback } from "../lib/useAccountLauncher";

export function AccountLaunchStatus({ state, running, onRetry }: {
  state?: LaunchFeedback;
  running: boolean;
  onRetry: () => void;
}) {
  if (!state && !running) return null;
  return (
    <div aria-live="polite" style={{ minWidth: 0, marginTop: 3, fontSize: 10, lineHeight: 1.35 }}>
      {state?.phase === "launching" ? <span style={{ color: "var(--amber)" }}>Launching…</span>
        : running ? <span style={{ color: "var(--green)" }}>Running</span>
        : state?.phase === "requested" ? <span style={{ color: "var(--t2)" }}>Launch requested</span>
        : null}
      {state?.phase === "failed" && (
        <div>
          <span title={state.error} style={{ display: "block", color: "var(--red)", overflowWrap: "anywhere" }}>
            {state.error}
          </span>
          <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 10, marginTop: 4 }}
            onClick={event => { event.stopPropagation(); onRetry(); }}
            onDoubleClick={event => event.stopPropagation()}>
            Retry launch
          </button>
        </div>
      )}
    </div>
  );
}
