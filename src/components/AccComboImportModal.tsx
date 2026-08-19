import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, ErrorMsg } from "../pages/Accounts";

export const AccComboImportModal: FC<{
  open: boolean;
  comboText: string;
  setComboText: (v: string) => void;
  loginLoading: boolean;
  loginError: string;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, comboText, setComboText, loginLoading, loginError, onClose, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <AccountModal title={t("user_pass_combo_import_title")} onClose={onClose}>
      <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 14, lineHeight: 1.6 }}>
        {t("paste_combos_desc")} A login window will open for each account.
      </p>
      <FieldLabel>{t("account_combos_label")}</FieldLabel>
      <textarea
        rows={6}
        value={comboText}
        onChange={e => setComboText(e.target.value)}
        placeholder={"username:password\nusername:password\n..."}
        disabled={loginLoading}
        style={{
          width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 11,
          padding: "10px 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", marginBottom: 12, opacity: loginLoading ? 0.5 : 1,
        }}
      />
      {loginError && <ErrorMsg msg={loginError} />}
      <ModalActions>
        <ModalBtn label={t("cancel")} onClick={onClose} disabled={loginLoading} />
        <ModalBtn label={loginLoading ? t("validating_btn") : t("start_import_btn")} onClick={onSubmit} primary disabled={loginLoading || !comboText.trim()} />
      </ModalActions>
    </AccountModal>
  );
};
