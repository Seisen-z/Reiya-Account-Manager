import { Dispatch, FC, RefObject, SetStateAction } from "react";
import { AddAccountDisclosure } from "./AddAccountDisclosure";
import { KeyIcon, UserIcon, CopyIcon, FileTextIcon } from "./Icons";

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
  onCustomLogin?: () => void;
}> = ({
  t, totalCount, validCount, favCount, online, selectedCount,
  addMenu, setAddMenu, addMenuRef,
  onImportClick, onExportClick,
  onManualLogin, onUserPass, onOpenCookieMenu, onCookiesFile,
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

        {/* Add Account disclosure */}
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
        </div>
      </div>
    </div>
  );
};
