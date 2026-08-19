import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, BulkAddResult } from "../pages/Home";
import { CheckIcon, XIcon } from "./Icons";

export const BulkCookieImportModal: FC<{
  open: boolean;
  bulkText: string;
  setBulkText: (v: string) => void;
  bulkResults: BulkAddResult[];
  bulkAdding: boolean;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, bulkText, setBulkText, bulkResults, bulkAdding, onClose, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("bulk_cookie_import_title")} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 11.5, color: "var(--t2)" }}>{t("paste_cookies_one_per_line_desc")}</p>
        {bulkResults.length === 0 ? (
          <textarea className="field glass-input" rows={10} placeholder={"_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this...\n_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this...\n..."}
            value={bulkText} onChange={e => setBulkText(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: 10, resize: "vertical" }} />
        ) : (
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {bulkResults.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: r.success ? "var(--green-dim)" : "var(--red-dim)", border: `1px solid ${r.success ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)"}` }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {r.success ? <CheckIcon size={14} color="var(--green)" /> : <XIcon size={14} color="var(--red)" />}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{r.username ?? r.preview}</span>
                {r.error && <span style={{ fontSize: 10, color: "var(--red)", marginLeft: "auto", fontWeight: 600 }}>{r.error}</span>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} disabled={bulkAdding} className="btn btn-ghost" style={{ flex: 1 }}>
            {bulkResults.length > 0 ? t("close_btn") : t("cancel")}
          </button>
          {bulkResults.length === 0 && (
            <button onClick={onSubmit} disabled={bulkAdding || !bulkText.trim()} className="btn"
              style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 850, opacity: !bulkText.trim() ? 0.5 : 1 }}>
              {bulkAdding ? t("importing_btn") : t("import_all_btn")}
            </button>
          )}
        </div>
      </div>
    </HomeModal>
  );
};
