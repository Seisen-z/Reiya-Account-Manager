import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { HomeModal, FieldLabel, Account } from "../pages/Home";

export const AccountUtilitiesMenuModal: FC<{
  account: Account | null;
  utilNewDisplayName: string;
  setUtilNewDisplayName: (v: string) => void;
  utilCurrentPassword: string;
  setUtilCurrentPassword: (v: string) => void;
  utilNewPassword: string;
  setUtilNewPassword: (v: string) => void;
  utilTargetUser: string;
  setUtilTargetUser: (v: string) => void;
  utilStatus: string;
  utilIsError: boolean;
  utilLoading: boolean;
  onClose: () => void;
  onSetDisplayName: () => void;
  onChangePassword: () => void;
  onSignOutAll: () => void;
  onSendFriendRequest: () => void;
  onBlockUser: () => void;
}> = ({
  account, utilNewDisplayName, setUtilNewDisplayName, utilCurrentPassword, setUtilCurrentPassword,
  utilNewPassword, setUtilNewPassword, utilTargetUser, setUtilTargetUser, utilStatus, utilIsError,
  utilLoading, onClose, onSetDisplayName, onChangePassword, onSignOutAll, onSendFriendRequest, onBlockUser,
}) => {
  const { t } = useLanguage();
  if (!account) return null;
  return (
    <HomeModal title={t("account_utilities_menu")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 11, color: "var(--t3)", margin: 0 }}>
          {t("manage_settings_for")} @{account.username} (ID: {account.user_id})
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Set Display Name */}
          <div style={{ borderBottom: "1px solid var(--g06)", paddingBottom: 16 }}>
            <FieldLabel>{t("display_name_label")}</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field glass-input" value={utilNewDisplayName} onChange={e => setUtilNewDisplayName(e.target.value)}
                placeholder={t("new_display_name_placeholder")} style={{ height: 34, fontSize: 12, flex: 1, outline: "none" }}
                disabled={utilLoading} />
              <button onClick={onSetDisplayName} disabled={utilLoading || !utilNewDisplayName.trim()} className="btn"
                style={{ padding: "0 14px", height: 34, fontSize: 11.5, background: "#FFFFFF", color: "#000", fontWeight: 800, borderRadius: 8, border: "none", opacity: !utilNewDisplayName.trim() ? 0.5 : 1 }}>
                {t("set_name")}
              </button>
            </div>
          </div>

          {/* Password */}
          <div style={{ borderBottom: "1px solid var(--g06)", paddingBottom: 16 }}>
            <FieldLabel>{t("change_password_label")}</FieldLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="password" className="field glass-input" value={utilCurrentPassword} onChange={e => setUtilCurrentPassword(e.target.value)}
                placeholder={t("current_password_placeholder")} style={{ height: 34, fontSize: 12, flex: 1, outline: "none" }}
                disabled={utilLoading} />
              <input type="password" className="field glass-input" value={utilNewPassword} onChange={e => setUtilNewPassword(e.target.value)}
                placeholder={t("new_password_placeholder")} style={{ height: 34, fontSize: 12, flex: 1, outline: "none" }}
                disabled={utilLoading} />
            </div>
            <button onClick={onChangePassword} disabled={utilLoading || !utilCurrentPassword || !utilNewPassword} className="btn"
              style={{ padding: "0 14px", height: 34, fontSize: 11.5, background: "#FFFFFF", color: "#000", fontWeight: 800, borderRadius: 8, border: "none", opacity: (!utilCurrentPassword || !utilNewPassword) ? 0.5 : 1 }}>
              {t("change_password_btn")}
            </button>
          </div>

          {/* Sessions */}
          <div style={{ borderBottom: "1px solid var(--g06)", paddingBottom: 16 }}>
            <FieldLabel>{t("sessions_label")}</FieldLabel>
            <button onClick={onSignOutAll} disabled={utilLoading} className="btn"
              style={{ padding: "0 14px", height: 34, fontSize: 11.5, background: "rgba(248,113,113,0.1)", color: "var(--red)", fontWeight: 800, borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)" }}>
              {t("sign_out_other_sessions_btn")}
            </button>
          </div>

          {/* Friend / Block */}
          <div>
            <FieldLabel>{t("friend_block_label")}</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field glass-input" value={utilTargetUser} onChange={e => setUtilTargetUser(e.target.value)}
                placeholder={t("target_username_placeholder")} style={{ height: 34, fontSize: 12, flex: 1, outline: "none" }}
                disabled={utilLoading} />
              <button onClick={onSendFriendRequest} disabled={utilLoading || !utilTargetUser.trim()} className="btn"
                style={{ padding: "0 14px", height: 34, fontSize: 11.5, background: "#FFFFFF", color: "#000", fontWeight: 800, borderRadius: 8, border: "none", opacity: !utilTargetUser.trim() ? 0.5 : 1 }}>
                {t("add_friend_btn")}
              </button>
              <button onClick={onBlockUser} disabled={utilLoading || !utilTargetUser.trim()} className="btn"
                style={{ padding: "0 14px", height: 34, fontSize: 11.5, background: "rgba(248,113,113,0.1)", color: "var(--red)", fontWeight: 800, borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)", opacity: !utilTargetUser.trim() ? 0.5 : 1 }}>
                {t("block_btn")}
              </button>
            </div>
          </div>
        </div>

        {utilStatus && (
          <div style={{
            marginTop: 16, padding: "8px 12px", borderRadius: 8, fontSize: 11.5,
            background: utilIsError ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
            border: `1px solid ${utilIsError ? "rgba(248,113,113,.2)" : "rgba(52,211,153,.2)"}`,
            color: utilIsError ? "var(--red)" : "var(--green)",
            wordBreak: "break-all"
          }}>
            {utilStatus}
          </div>
        )}
      </div>
    </HomeModal>
  );
};
