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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--t1)", margin: 0 }}>
          {t("accounts_manager_title")}
        </h1>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--t3)", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span><b style={{ color: "var(--t1)" }}>{totalCount}</b> {t("total").toLowerCase()}</span>
          <span>·</span>
          <span><b style={{ color: "var(--green)" }}>{validCount}</b> valid</span>
          {favCount > 0 && <><span>·</span><span><b style={{ color: "var(--amber)" }}>{favCount}</b> {t("favorites").toLowerCase()}</span></>}
          {online > 0 && <><span>·</span><span><b style={{ color: "var(--green)" }}>{online}</b> {t("active").toLowerCase()}</span></>}
          {selectedCount > 0 && <><span>·</span><span><b style={{ color: "#A78BFA" }}>{selectedCount}</b> selected</span></>}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

        {/* Import / Export */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onImportClick}
            title="Import Backup"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: 0, width: 34, height: 34, justifyContent: "center", borderRadius: 10, fontSize: 11.5, fontWeight: 700,
              border: "1px solid var(--g06)", background: "transparent",
              color: "var(--t2)", cursor: "pointer", transition: "all .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--g08)"; e.currentTarget.style.color = "var(--t1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button
            onClick={onExportClick}
            title="Export Backup"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: 0, width: 34, height: 34, justifyContent: "center", borderRadius: 10, fontSize: 11.5, fontWeight: 700,
              border: "1px solid var(--g06)", background: "transparent",
              color: "var(--t2)", cursor: "pointer", transition: "all .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--g08)"; e.currentTarget.style.color = "var(--t1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
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
