import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, Account } from "../pages/Home";

export const AccountDetailsDumpModal: FC<{
  account: Account | null;
  onClose: () => void;
  onCopy: () => void;
}> = ({ account, onClose, onCopy }) => {
  const { t } = useLanguage();
  if (!account) return null;
  return (
    <HomeModal title={t("account_details_dump_title")} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: -4 }}>
          {t("raw_data_properties_for")} @{account.username}
        </div>
        <textarea
          className="field glass-input"
          rows={12}
          readOnly
          value={JSON.stringify(account, null, 2)}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 11, resize: "vertical", background: "var(--g02)", color: "var(--t2)", padding: 12, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
            {t("close_btn")}
          </button>
          <button onClick={onCopy} className="btn"
            style={{ flex: 1, background: "#FFFFFF", color: "#000", fontWeight: 800 }}>
            {t("copy_to_clipboard_btn")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
