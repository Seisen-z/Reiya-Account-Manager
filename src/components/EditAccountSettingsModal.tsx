import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel, ErrorMsg, Toggle, Account } from "../pages/Home";

export const EditAccountSettingsModal: FC<{
  account: Account | null;
  editDisplayName: string;
  setEditDisplayName: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  editTags: string;
  setEditTags: (v: string) => void;
  editDefaultPlaceId: string;
  setEditDefaultPlaceId: (v: string) => void;
  editCooldown: number;
  setEditCooldown: (v: number) => void;
  editCookie: string;
  setEditCookie: (v: string) => void;
  editIsFavorite: boolean;
  setEditIsFavorite: (v: boolean) => void;
  editSafeLaunch: boolean;
  setEditSafeLaunch: (v: boolean) => void;
  editAutoRejoin: boolean;
  setEditAutoRejoin: (v: boolean) => void;
  editLoading: boolean;
  editError: string;
  onClose: () => void;
  onSave: () => void;
}> = ({
  account, editDisplayName, setEditDisplayName, editNotes, setEditNotes, editTags, setEditTags,
  editDefaultPlaceId, setEditDefaultPlaceId, editCooldown, setEditCooldown, editCookie, setEditCookie,
  editIsFavorite, setEditIsFavorite, editSafeLaunch, setEditSafeLaunch, editAutoRejoin, setEditAutoRejoin,
  editLoading, editError, onClose, onSave,
}) => {
  const { t } = useLanguage();
  if (!account) return null;
  return (
    <HomeModal title={t("edit_account_settings_title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: -4 }}>
          {t("edit_details_for")} @{account.username}
        </div>

        {/* Display Name */}
        <div>
          <FieldLabel>{t("display_name_label")}</FieldLabel>
          <input className="field glass-input" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)}
            placeholder={t("leave_empty_username_desc")} style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }} disabled={editLoading} />
        </div>

        {/* Notes */}
        <div>
          <FieldLabel>{t("description_notes_label")}</FieldLabel>
          <textarea className="field glass-input" rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)}
            placeholder={t("notes_placeholder")} style={{ width: "100%", fontSize: 12, outline: "none", resize: "vertical" }} disabled={editLoading} />
        </div>

        {/* Tags */}
        <div>
          <FieldLabel>{t("tags_label")}</FieldLabel>
          <input className="field glass-input" value={editTags} onChange={e => setEditTags(e.target.value)}
            placeholder={t("tags_placeholder")} style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }} disabled={editLoading} />
        </div>

        {/* Default Place ID */}
        <div>
          <FieldLabel>{t("default_place_id_label")}</FieldLabel>
          <input className="field glass-input" value={editDefaultPlaceId} onChange={e => setEditDefaultPlaceId(e.target.value)}
            placeholder={t("roblox_game_place_id_desc")} style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }} disabled={editLoading} />
        </div>

        {/* Cooldown */}
        <div>
          <FieldLabel>{t("launch_cooldown_label")}</FieldLabel>
          <input type="number" className="field glass-input" value={editCooldown} onChange={e => setEditCooldown(Number(e.target.value))}
            style={{ width: "100%", height: 36, fontSize: 12, outline: "none" }} disabled={editLoading} />
        </div>

        {/* Cookie */}
        <div>
          <FieldLabel>{t("cookie_label")}</FieldLabel>
          <textarea className="field glass-input" rows={2} value={editCookie} onChange={e => setEditCookie(e.target.value)}
            placeholder={t("cookie_placeholder")} style={{ width: "100%", fontSize: 11, fontFamily: "monospace", outline: "none", resize: "vertical" }} disabled={editLoading} />
        </div>

        {/* Checkboxes */}
        <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
          <Toggle label={t("favorite")} value={editIsFavorite} onChange={setEditIsFavorite} />
          <Toggle label={t("safe_launch")} value={editSafeLaunch} onChange={setEditSafeLaunch} />
          <Toggle label={t("auto_rejoin")} value={editAutoRejoin} onChange={setEditAutoRejoin} />
        </div>

        {editError && <ErrorMsg msg={editError} />}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button onClick={onClose} disabled={editLoading} className="btn btn-ghost" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={editLoading} className="btn"
            style={{ flex: 2, background: "#FFFFFF", color: "#000", fontWeight: 800 }}>
            {editLoading ? t("saving_changes") : t("save_changes_btn")}
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
