import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, ErrorMsg } from "../pages/Accounts";

export const AccSingleCookieModal: FC<{
  open: boolean;
  addCookie: string;
  setAddCookie: (v: string) => void;
  adding: boolean;
  addError: string;
  onClose: () => void;
  onSubmit: () => void;
}> = ({ open, addCookie, setAddCookie, adding, addError, onClose, onSubmit }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <AccountModal title={t("import_cookie_title")} onClose={onClose}>
      <FieldLabel>{t("roblosecurity_cookie_label")}</FieldLabel>
      <textarea
        rows={4}
        placeholder={t("paste_roblosecurity_placeholder")}
        value={addCookie}
        onChange={e => setAddCookie(e.target.value)}
        style={{
          width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 10.5,
          padding: "10px 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", marginBottom: 12,
        }}
      />
      {addError && <ErrorMsg msg={addError} />}
      <ModalActions>
        <ModalBtn label={t("cancel")} onClick={onClose} />
        <ModalBtn label={adding ? t("validating_btn") : t("import_cookie_title")} onClick={onSubmit} primary disabled={adding || !addCookie.trim()} />
      </ModalActions>
    </AccountModal>
  );
};
