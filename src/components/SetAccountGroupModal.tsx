import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel } from "../pages/Home";

export const SetAccountGroupModal: FC<{
  open: boolean;
  groupInput: string;
  setGroupInput: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}> = ({ open, groupInput, setGroupInput, onClose, onSave }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("set_account_group_title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.4 }}>
          {t("assign_group_desc")}
        </div>
        <div>
          <FieldLabel>{t("group_name_label")}</FieldLabel>
          <input type="text" className="field glass-input" value={groupInput}
            onChange={e => setGroupInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(); }}
            placeholder={t("group_placeholder")}
            style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }} autoFocus />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Main", "Alts", "Trading", "Farming"].map(preset => (
            <button key={preset} onClick={() => setGroupInput(preset)} style={{ padding: "4px 12px", borderRadius: 7, border: "1px solid var(--g08)", background: groupInput === preset ? "var(--g10)" : "transparent", color: groupInput === preset ? "var(--t1)" : "var(--t3)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{preset}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={onSave} className="btn" style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 800 }}>
            {t("save_group_btn")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
