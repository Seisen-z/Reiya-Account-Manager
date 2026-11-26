import { FC } from "react";
import { XIcon, PlayIcon, ShieldCheckIcon, TrashIcon, LayoutIcon, SlidersIcon, CheckIcon } from "./Icons";
import { useLanguage } from "../context/LanguageContext";

/* ── Bulk Action Button ── */
export const BulkBtn: FC<{
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; accent?: string; icon?: React.ReactNode; primary?: boolean;
}> = ({ label, onClick, disabled, danger, accent, icon, primary }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 30,
        padding: "0 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        border: primary ? "none" : `1px solid ${danger ? "rgba(248,113,113,0.3)" : accent ? `${accent}40` : "var(--g10)"}`,
        background: primary ? "var(--green)" : danger ? "rgba(248,113,113,0.08)" : accent ? `${accent}14` : "var(--g04)",
        color: primary ? "#07080a" : danger ? "var(--red)" : accent ?? "var(--t2)",
        transition: "filter .12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
    >
      {icon}{label}
    </button>
  );
};

export const BulkActionBar: FC<{
  selectedCount: number;
  /** How many accounts are visible (for "Select all N"). */
  visibleCount?: number;
  bulkLaunching: boolean;
  bulkStatus: string;
  onLaunchAll: () => void;
  onValidateAll: () => void;
  onMoveToGroup: () => void;
  onApplyLaunchPreset: () => void;
  onSelectAll: () => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
}> = ({
  selectedCount, visibleCount, bulkLaunching, bulkStatus,
  onLaunchAll, onValidateAll, onMoveToGroup, onApplyLaunchPreset, onSelectAll, onDeleteAll, onClearSelection,
}) => {
  const { t } = useLanguage();
  if (selectedCount === 0) return null;
  const allSelected = visibleCount !== undefined && selectedCount >= visibleCount;
  return (
    <div style={{
      padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: "rgba(167,139,250,0.08)", borderBottom: "1px solid rgba(167,139,250,0.2)", flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: "#A78BFA", marginRight: 2 }}>
        {selectedCount} {t("accp_selected")}
      </span>
      {!allSelected && (
        <button onClick={onSelectAll} style={{ border: "none", background: "transparent", color: "var(--t2)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "0 4px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
          <CheckIcon size={11} /> {t("accp_select_all")}{visibleCount !== undefined ? ` (${visibleCount})` : ""}
        </button>
      )}
      <div style={{ width: 1, height: 18, background: "rgba(167,139,250,0.25)", margin: "0 4px" }} />
      <BulkBtn primary icon={<PlayIcon size={11} color="#07080a" />} label={t("accp_bulk_launch")} onClick={onLaunchAll} disabled={bulkLaunching} />
      <BulkBtn icon={<ShieldCheckIcon size={12} />} label={t("accp_bulk_check")} onClick={onValidateAll} disabled={bulkLaunching} />
      <BulkBtn icon={<LayoutIcon size={12} />} label={t("accp_bulk_group")} onClick={onMoveToGroup} disabled={bulkLaunching} />
      <BulkBtn icon={<SlidersIcon size={12} />} label={t("accp_bulk_edit")} onClick={onApplyLaunchPreset} disabled={bulkLaunching} accent="#A78BFA" />
      <BulkBtn icon={<TrashIcon size={12} />} label={t("accp_bulk_remove")} onClick={onDeleteAll} disabled={bulkLaunching} danger />
      {bulkStatus && (
        <span style={{ fontSize: 11, color: "var(--t2)", marginLeft: "auto", fontWeight: 600 }}>{bulkStatus}</span>
      )}
      <button
        onClick={onClearSelection}
        style={{ marginLeft: bulkStatus ? 0 : "auto", background: "none", border: "none", cursor: "pointer", color: "var(--t2)", display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}
        title={t("accp_clear_selection")}
      >
        <XIcon size={13} /> {t("acc_clear")}
      </button>
    </div>
  );
};
