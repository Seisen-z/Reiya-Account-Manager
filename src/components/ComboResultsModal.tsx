import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, ComboResult } from "../pages/Accounts";

export const ComboResultsModal: FC<{
  comboResults: ComboResult[];
  onClose: () => void;
}> = ({ comboResults, onClose }) => {
  if (comboResults.length === 0) return null;
  return (
    <AccountModal
      title={`Import Results — ${comboResults.filter(r => r.ok).length}/${comboResults.length} succeeded`}
      onClose={onClose}
      wide
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {comboResults.map((r, i) => (
          <div key={i} style={{
            padding: "10px 13px", borderRadius: 10,
            background: r.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${r.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.ok ? 0 : 5 }}>
              <span style={{
                width: 16, height: 16, borderRadius: 99, flexShrink: 0,
                background: r.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
                color: r.ok ? "#4ade80" : "#f87171",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 900,
              }}>{r.ok ? "✓" : "✕"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{r.username}</span>
            </div>
            {!r.ok && (
              <div style={{
                fontSize: 11, color: "var(--t2)", lineHeight: 1.55,
                paddingLeft: 24, wordBreak: "break-word", whiteSpace: "pre-wrap",
              }}>
                {r.reason}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 14, lineHeight: 1.6 }}>
        Copy the details below and share them when reporting the issue.
      </div>
      <ModalActions>
        <ModalBtn label="Close" onClick={onClose} />
        <ModalBtn
          label="Copy Details"
          onClick={() => {
            const text = comboResults.map(r =>
              `${r.ok ? "[OK]" : "[FAIL]"} ${r.username}: ${r.reason}`
            ).join("\n");
            navigator.clipboard.writeText(text).catch(() => {});
          }}
          primary
        />
      </ModalActions>
    </AccountModal>
  );
};
