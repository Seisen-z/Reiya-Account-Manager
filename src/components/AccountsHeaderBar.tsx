import { AccountSlotUsage } from "./AccountSlotUsage";
import { Dispatch, FC, RefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { AddAccountDisclosure } from "./AddAccountDisclosure";
import { KeyIcon, UserIcon, CopyIcon, FileTextIcon, ChevronDownIcon, AlertTriangleIcon, ShieldCheckIcon, ArchiveIcon, DownloadIcon } from "./Icons";

/** Kept for any other screen that still uses it. */
export const AccountStatPill: FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => (
  <div style={{ textAlign: "center", padding: "6px 16px", borderRadius: 10, background: "var(--g02)", border: "1px solid var(--g05)" }}>
    <div style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 8.5, color: "var(--t3)", marginTop: 3, fontWeight: 800, letterSpacing: "0.08em" }}>{label}</div>
  </div>
);

function Pill({ children, tone = "neutral", onClick, active, title }: {
  children: React.ReactNode; tone?: "neutral" | "green" | "red" | "purple"; onClick?: () => void; active?: boolean; title?: string;
}) {
  const c = {
    neutral: { fg: "var(--t2)", bg: "var(--g03)", bd: "var(--g06)" },
    green:   { fg: "var(--green)", bg: "var(--green-dim)", bd: "rgba(52,211,153,0.25)" },
    red:     { fg: "var(--red)", bg: "var(--red-dim)", bd: "rgba(248,113,113,0.3)" },
    purple:  { fg: "#A78BFA", bg: "rgba(167,139,250,0.12)", bd: "rgba(167,139,250,0.3)" },
  }[tone];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", borderRadius: 99,
        fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", color: c.fg, background: c.bg,
        border: `1px solid ${active ? c.fg : c.bd}`, cursor: onClick ? "pointer" : "default", fontFamily: "inherit",
      }}
    >
      {children}
    </Tag>
  );
}

export const AccountsHeaderBar: FC<{
  t: (key: string) => string;
  totalCount: number;
  usedSlots: number;
  slotPlan: { limit: number | null; premium: boolean | null };
  validCount: number;
  favCount: number;
  online: number;
  selectedCount: number;
  /** Accounts whose login is expired or not checked yet. */
  needsLoginCount?: number;
  /** Show only accounts that need a login (filter). */
  onShowNeedsLogin?: () => void;
  needsLoginActive?: boolean;
  addMenu: boolean;
  setAddMenu: Dispatch<SetStateAction<boolean>>;
  addMenuRef: RefObject<HTMLDivElement | null>;
  onImportClick: () => void;
  onExportClick: () => void;
  onManualLogin: () => void;
  onUserPass: () => void;
  onOpenCookieMenu: () => void;
  onCookiesFile: () => void;
  onCustomLogin?: () => void;
}> = ({
  t, totalCount, usedSlots, slotPlan, validCount, online, selectedCount,
  needsLoginCount = 0, onShowNeedsLogin, needsLoginActive,
  addMenu, setAddMenu, addMenuRef,
  onImportClick, onExportClick,
  onManualLogin, onUserPass, onOpenCookieMenu, onCookiesFile,
}) => {
  const [backupOpen, setBackupOpen] = useState(false);
  const backupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!backupOpen) return;
    const close = (e: MouseEvent) => { if (backupRef.current && !backupRef.current.contains(e.target as Node)) setBackupOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setBackupOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [backupOpen]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--t1)", margin: 0 }}>
          {t("accounts_manager_title")}
        </h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <Pill><UserIcon size={12} /> {totalCount} {t("accp_total")}</Pill>
          <Pill tone="green"><ShieldCheckIcon size={12} /> {validCount} {t("accp_ready")}</Pill>
          {needsLoginCount > 0 && (
            <Pill tone="red" onClick={onShowNeedsLogin} active={needsLoginActive} title={t("accp_needs_login_tip")}>
              <AlertTriangleIcon size={12} /> {needsLoginCount} {t("accp_needs_login")}
            </Pill>
          )}
          {online > 0 && (
            <Pill tone="green">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", animation: "pulse-glow 2s ease-in-out infinite" }} />
              {online} {t("home_running_count")}
            </Pill>
          )}
          {selectedCount > 0 && <Pill tone="purple">{selectedCount} {t("accp_selected")}</Pill>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* Backup menu: import / export */}
        <div ref={backupRef} style={{ position: "relative" }}>
          <button
            onClick={e => { e.stopPropagation(); setBackupOpen(v => !v); }}
            className="btn btn-ghost glow-btn"
            aria-expanded={backupOpen}
            style={{ height: 34, padding: "0 12px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, background: backupOpen ? "var(--g06)" : undefined }}
          >
            <ArchiveIcon size={13} /> {t("accp_backup")} <ChevronDownIcon size={12} />
          </button>
          {backupOpen && (
            <div
              role="menu"
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 9999, width: 250,
                background: "var(--modal-bg)", backdropFilter: "blur(16px)", border: "1px solid var(--modal-border)",
                borderRadius: 12, padding: 4, boxShadow: "0 12px 36px rgba(0,0,0,.4)",
              }}
            >
              {[
                { icon: <DownloadIcon size={14} />, label: t("accp_export"), sub: t("accp_export_sub"), onClick: onExportClick },
                { icon: <ArchiveIcon size={14} />, label: t("accp_import"), sub: t("accp_import_sub"), onClick: onImportClick },
              ].map(item => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={() => { setBackupOpen(false); item.onClick(); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--g05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ display: "flex", color: "var(--t2)", flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{item.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Account */}
        <div ref={addMenuRef} style={{ position: "relative", zIndex: 999 }}>
          <AddAccountDisclosure
            open={addMenu}
            onOpenChange={setAddMenu}
            label={t("add_account")}
            title={t("add_account")}
            actions={[
              { icon: <KeyIcon size={20} />, label: t("manual_login_title"), sub: t("manual_login_sub"), onClick: onManualLogin },
              { icon: <UserIcon size={20} />, label: t("user_pass_combo"), sub: t("user_pass_sub"), onClick: onUserPass },
              { icon: <CopyIcon size={20} />, label: t("clipboard_cookie"), sub: t("cookie_sub"), onClick: onOpenCookieMenu },
              { icon: <FileTextIcon size={20} />, label: t("bulk_cookies"), sub: t("cookies_file_sub"), onClick: onCookiesFile },
            ]}
          />
          <div style={{ position: "absolute", top: "100%", right: 0, whiteSpace: "nowrap" }}>
            <AccountSlotUsage used={usedSlots} {...slotPlan} />
          </div>
        </div>
      </div>
    </div>
  );
};
