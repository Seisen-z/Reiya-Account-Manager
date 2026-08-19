import { FC } from "react";
import { XIcon } from "./Icons";

/* ── Bulk Action Button ── */
export const BulkBtn: FC<{
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; accent?: string;
}> = ({ label, onClick, disabled, danger, accent }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        border: `1px solid ${danger ? "rgba(248,113,113,0.3)" : accent ? `${accent}40` : "var(--g10)"}`,
        background: danger ? "rgba(248,113,113,0.08)" : accent ? `${accent}14` : "var(--g04)",
        color: danger ? "var(--red)" : accent ?? "var(--t2)",
        transition: "all .12s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.2)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
    >
      {label}
    </button>
  );
};

export const BulkActionBar: FC<{
  selectedCount: number;
  bulkLaunching: boolean;
  bulkStatus: string;
  onLaunchAll: () => void;
  onValidateAll: () => void;
  onMoveToGroup: () => void;
  onSelectAll: () => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
}> = ({
  selectedCount, bulkLaunching, bulkStatus,
  onLaunchAll, onValidateAll, onMoveToGroup, onSelectAll, onDeleteAll, onClearSelection,
}) => {
  if (selectedCount === 0) return null;
  return (
    <div style={{
      padding: "10px 24px", display: "flex", alignItems: "center", gap: 10,
      background: "rgba(167,139,250,0.06)",
      borderBottom: "1px solid rgba(167,139,250,0.15)",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#A78BFA", marginRight: 4 }}>
        {selectedCount} selected
      </span>
      <BulkBtn label="Launch All" onClick={onLaunchAll} disabled={bulkLaunching} accent="#34D399" />
      <BulkBtn label="Validate All" onClick={onValidateAll} disabled={bulkLaunching} />
      <BulkBtn label="Move to Group" onClick={onMoveToGroup} disabled={bulkLaunching} />
      <BulkBtn label="Select All" onClick={onSelectAll} disabled={bulkLaunching} />
      <BulkBtn label="Delete All" onClick={onDeleteAll} disabled={bulkLaunching} danger />
      {bulkStatus && (
        <span style={{ fontSize: 11, color: "var(--t2)", marginLeft: "auto" }}>{bulkStatus}</span>
      )}
      <button
        onClick={onClearSelection}
        style={{ marginLeft: bulkStatus ? 0 : "auto", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex", alignItems: "center", padding: 4, borderRadius: 5 }}
        title="Clear selection"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
};
