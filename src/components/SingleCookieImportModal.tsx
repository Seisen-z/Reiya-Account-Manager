import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel, ErrorMsg } from "../pages/Home";

export const SingleCookieImportModal: FC<{
  open: boolean;
  addCookie: string;
  setAddCookie: (v: string) => void;
  addError: string;
  adding: boolean;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, addCookie, setAddCookie, addError, adding, onClose, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("import_cookie_title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <FieldLabel>{t("roblosecurity_cookie_label")}</FieldLabel>
          <textarea className="field glass-input" rows={4} placeholder={t("paste_roblosecurity_placeholder")}
            value={addCookie} onChange={e => setAddCookie(e.target.value)}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 10 }} />
        </div>
        {addError && <ErrorMsg msg={addError} />}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
            {t("cancel")}
          </button>
          <button onClick={onSubmit} disabled={adding || !addCookie.trim()} className="btn"
            style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 800, opacity: !addCookie.trim() ? 0.5 : 1 }}>
            {adding ? t("validating_btn") : t("import_cookie_title")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
