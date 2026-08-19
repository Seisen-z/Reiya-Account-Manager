import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal } from "../pages/Home";

export const RemoveGameConfirmModal: FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ open, onClose, onConfirm }) => {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <HomeModal title={t("remove_game")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>
          {t("remove_game_confirm")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={onConfirm} className="btn"
            style={{ flex: 1, background: "rgba(248, 113, 113, 0.1)", color: "var(--red)", border: "1px solid rgba(248, 113, 113, 0.25)", fontWeight: 800 }}>
            {t("remove_game")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
