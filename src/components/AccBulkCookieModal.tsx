import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { AccountModal, ModalBtn, ModalActions, BulkAddResult } from "../pages/Accounts";
import { CheckIcon, XIcon } from "./Icons";

export const AccBulkCookieModal: FC<{
  open: boolean;
  bulkText: string;
  setBulkText: (v: string) => void;
  bulkAdding: boolean;
  bulkResults: BulkAddResult[];
  onClose: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}> = ({ open, bulkText, setBulkText, bulkAdding, bulkResults, onClose, onCancel, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <AccountModal title={t("bulk_cookie_import_title")} onClose={onClose}>
      <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 14, lineHeight: 1.6 }}>
        {t("paste_cookies_one_per_line_desc")} <code style={{ color: "var(--amber)", fontFamily: "monospace" }}>.ROBLOSECURITY</code>.
      </p>
      {bulkResults.length === 0 ? (
        <textarea
          rows={10}
          placeholder={"_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this...\n..."}
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          style={{
            width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 10,
            padding: "10px 13px", borderRadius: 10, outline: "none",
            background: "var(--g03)", border: "1px solid var(--g07)",
            color: "var(--t1)", marginBottom: 12,
          }}
        />
      ) : (
        <div style={{ maxHeight: 250, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
          {bulkResults.map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9,
              background: r.success ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)",
              border: `1px solid ${r.success ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
            }}>
              {r.success ? <CheckIcon size={12} color="var(--green)" /> : <XIcon size={12} color="var(--red)" />}
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)" }}>{r.username ?? r.preview}</span>
              {r.error && <span style={{ fontSize: 9.5, color: "var(--red)", marginLeft: "auto" }}>{r.error}</span>}
            </div>
          ))}
        </div>
      )}
      <ModalActions>
        <ModalBtn label={bulkResults.length > 0 ? t("close_btn") : t("cancel")} onClick={onCancel} disabled={bulkAdding} />
        {bulkResults.length === 0 && (
          <ModalBtn label={bulkAdding ? t("importing_btn") : t("import_all_btn")} onClick={onSubmit} primary disabled={bulkAdding || !bulkText.trim()} />
        )}
      </ModalActions>
    </AccountModal>
  );
};
