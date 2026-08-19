import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel, ErrorMsg } from "../pages/Home";

export const ComboImportModal: FC<{
  open: boolean;
  comboText: string;
  setComboText: (v: string) => void;
  loginError: string;
  loginLoading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, comboText, setComboText, loginError, loginLoading, onClose, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("user_pass_combo_import_title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.4 }}>
          {t("paste_combos_desc")}
        </p>
        <div>
          <FieldLabel>{t("account_combos_label")}</FieldLabel>
          <textarea
            className="field glass-input"
            rows={6}
            value={comboText}
            onChange={e => setComboText(e.target.value)}
            placeholder={t("username_password_placeholder") + "\n" + t("username_password_placeholder") + "\n..."}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
            disabled={loginLoading}
          />
        </div>
        {loginError && <ErrorMsg msg={loginError} />}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} disabled={loginLoading} className="btn btn-ghost" style={{ flex: 1 }}>
            {t("cancel")}
          </button>
          <button onClick={onSubmit} disabled={loginLoading || !comboText.trim()} className="btn"
            style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 850, opacity: !comboText.trim() ? 0.5 : 1 }}>
            {loginLoading ? t("processing") : t("start_combo_import_btn")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
