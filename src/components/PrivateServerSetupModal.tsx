import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel } from "../pages/Home";

export const PrivateServerSetupModal: FC<{
  modal: { placeId: string; name: string; currentValue: string } | null;
  privateServerInput: string;
  setPrivateServerInput: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}> = ({ modal, privateServerInput, setPrivateServerInput, onClose, onSave }) => {
  const { t } = useLanguage();
  if (!modal) return null;
  return (
    <HomeModal title={t("private_server_setup_title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.4 }}>
          {t("configure_private_server_for")} <strong>"{modal.name}"</strong>:
        </div>
        <div>
          <FieldLabel>{t("private_server_link_or_access_code")}</FieldLabel>
          <input
            type="text"
            className="field glass-input"
            value={privateServerInput}
            onChange={e => setPrivateServerInput(e.target.value)}
            placeholder="https://www.roblox.com/share?code=...&type=Server"
            style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }}
          />
        </div>
        <div style={{ fontSize: 10, color: "var(--t3)", lineHeight: 1.4 }}>
          {t("private_server_format_desc")}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={onSave} className="btn"
            style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 800 }}>
            {t("save_settings")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
