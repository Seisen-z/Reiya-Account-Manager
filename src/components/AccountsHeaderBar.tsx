import { Dispatch, FC, ReactNode, RefObject, SetStateAction, useState } from "react";
import {
  GlobeIcon, KeyIcon, ShieldCheckIcon, FileTextIcon, SettingsIcon, ChevronDownIcon,
} from "./Icons";

/* ── Stat Pill ── */
export const AccountStatPill: FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => {
  return (
    <div style={{
      textAlign: "center", padding: "6px 16px", borderRadius: 10,
      background: "var(--g02)", border: "1px solid var(--g05)",
    }}>
      <div style={{ fontSize: 16, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8.5, color: "var(--t3)", marginTop: 3, fontWeight: 800, letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
};

/* ── Dropdown item ── */
const DropdownItem: FC<{ icon: ReactNode; label: string; sub: string; onClick: () => void }> = ({ icon, label, sub, onClick }) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 9, background: hov ? "var(--g05)" : "transparent",
        cursor: "pointer", transition: "background .1s",
      }}
    >
      <span style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: hov ? "var(--g10)" : "var(--g04)",
        color: hov ? "var(--amber)" : "var(--t2)",
        border: `1px solid ${hov ? "var(--g20)" : "var(--g06)"}`,
        transition: "all .12s",
      }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
};

export const AccountsHeaderBar: FC<{
  t: (key: string) => string;
  totalCount: number;
  validCount: number;
  favCount: number;
  online: number;
  selectedCount: number;
  addMenu: boolean;
  setAddMenu: Dispatch<SetStateAction<boolean>>;
  addMenuRef: RefObject<HTMLDivElement | null>;
  onImportClick: () => void;
  onExportClick: () => void;
  onManualLogin: () => void;
  onUserPass: () => void;
  onOpenCookieMenu: () => void;
  onCookiesFile: () => void;
  onCustomLogin: () => void;
}> = ({
  t, totalCount, validCount, favCount, online, selectedCount,
  addMenu, setAddMenu, addMenuRef,
  onImportClick, onExportClick,
  onManualLogin, onUserPass, onOpenCookieMenu, onCookiesFile, onCustomLogin,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
      <div>
        <h1 style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.06em", color: "var(--t1)", margin: 0 }}>
          {t("accounts_manager_title")}
        </h1>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.1em", marginTop: 3 }}>
          MANAGE · LAUNCH · VALIDATE ROBLOX ACCOUNTS
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Stat pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AccountStatPill value={totalCount} label={t("total").toUpperCase()} color="var(--t1)" />
          <AccountStatPill value={validCount} label="VALID" color="var(--green)" />
          <AccountStatPill value={favCount} label={t("favorites").toUpperCase()} color="var(--amber)" />
          <AccountStatPill value={online} label={t("active").toUpperCase()} color="var(--green)" />
          {selectedCount > 0 && (
            <AccountStatPill value={selectedCount} label="SELECTED" color="#A78BFA" />
          )}
        </div>

        {/* Import / Export */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onImportClick}
            title="Import Backup"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, fontSize: 11.5, fontWeight: 700,
              border: "1px solid var(--g08)", background: "var(--g04)",
              color: "var(--t2)", cursor: "pointer", transition: "all .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--g08)"; e.currentTarget.style.color = "var(--t1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--g04)"; e.currentTarget.style.color = "var(--t2)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          <button
            onClick={onExportClick}
            title="Export Backup"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, fontSize: 11.5, fontWeight: 700,
              border: "1px solid var(--g08)", background: "var(--g04)",
              color: "var(--t2)", cursor: "pointer", transition: "all .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--g08)"; e.currentTarget.style.color = "var(--t1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--g04)"; e.currentTarget.style.color = "var(--t2)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>

        {/* Add Account dropdown */}
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button
            onClick={e => { e.stopPropagation(); setAddMenu(v => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10, border: "none",
              background: "var(--accent)",
              color: "var(--accent-text)", fontSize: 12, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 4px 14px var(--g18)", transition: "filter .12s",
            }}
            onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.1)"}
            onMouseLeave={e => e.currentTarget.style.filter = "none"}
          >
            {t("add_account_btn_label")}
            <ChevronDownIcon size={11} color="#0a0a0a" />
          </button>

          {addMenu && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 999,
                background: "var(--modal-bg)",
                border: "1px solid var(--g08)", borderRadius: 14,
                padding: 6, minWidth: 220,
                boxShadow: "0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px var(--g04)",
              }}
            >
              <DropdownItem icon={<GlobeIcon size={14} />} label={t("manual_login_title")} sub={t("manual_login_sub")} onClick={onManualLogin} />
              <DropdownItem icon={<KeyIcon size={14} />} label={t("user_pass_title")} sub={t("user_pass_sub")} onClick={onUserPass} />
              <DropdownItem icon={<ShieldCheckIcon size={14} />} label={t("cookie_title")} sub={t("cookie_sub")} onClick={onOpenCookieMenu} />
              <DropdownItem icon={<FileTextIcon size={14} />} label={t("cookies_file_title")} sub={t("cookies_file_sub")} onClick={onCookiesFile} />
              <div style={{ height: 1, background: "var(--g06)", margin: "4px 8px" }} />
              <DropdownItem icon={<SettingsIcon size={14} />} label={t("custom_login_title")} sub={t("custom_login_sub")} onClick={onCustomLogin} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
