import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { AccountModal, UtilSection, UtilInput, UtilAction, Avatar, Account } from "../pages/Accounts";
import { UserIcon, KeyIcon, GamepadIcon, ShieldIcon } from "./Icons";

export const AccUtilitiesModal: FC<{
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
  onSendFriendRequest: () => void;
  onBlockUser: () => void;
  onSignOutAll: () => void;
}> = ({
  account, utilNewDisplayName, setUtilNewDisplayName, utilCurrentPassword, setUtilCurrentPassword,
  utilNewPassword, setUtilNewPassword, utilTargetUser, setUtilTargetUser, utilStatus, utilIsError, utilLoading,
  onClose, onSetDisplayName, onChangePassword, onSendFriendRequest, onBlockUser, onSignOutAll,
}) => {
  const { t } = useLanguage();
  if (!account) return null;
  return (
    <AccountModal title="Account Utilities" onClose={onClose} wide>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        background: "var(--g02)", border: "1px solid var(--g05)",
        borderRadius: 12, marginBottom: 20,
      }}>
        <Avatar name={account.username} avatarUrl={account.avatar_url} size={40} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{account.display_name}</div>
          <div style={{ fontSize: 10.5, color: "var(--amber)", fontFamily: "monospace" }}>@{account.username} · ID {account.user_id}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Display Name */}
        <UtilSection label={t("display_name_label")} Icon={UserIcon}>
          <div style={{ display: "flex", gap: 8 }}>
            <UtilInput value={utilNewDisplayName} onChange={setUtilNewDisplayName} placeholder={t("new_display_name_placeholder")} disabled={utilLoading} />
            <UtilAction label={t("set_name")} onClick={onSetDisplayName} disabled={utilLoading || !utilNewDisplayName.trim()} />
          </div>
        </UtilSection>

        {/* Password */}
        <UtilSection label={t("change_password_label")} Icon={KeyIcon}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <UtilInput type="password" value={utilCurrentPassword} onChange={setUtilCurrentPassword} placeholder={t("current_password_placeholder")} disabled={utilLoading} />
            <div style={{ display: "flex", gap: 8 }}>
              <UtilInput type="password" value={utilNewPassword} onChange={setUtilNewPassword} placeholder={t("new_password_placeholder")} disabled={utilLoading} />
              <UtilAction label={t("change_password_btn")} onClick={onChangePassword} disabled={utilLoading || !utilCurrentPassword || !utilNewPassword} />
            </div>
          </div>
        </UtilSection>

        {/* Friends */}
        <UtilSection label={t("friend_block_label")} Icon={GamepadIcon}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <UtilInput value={utilTargetUser} onChange={setUtilTargetUser} placeholder={t("target_username_placeholder")} disabled={utilLoading} />
            <div style={{ display: "flex", gap: 8 }}>
              <UtilAction label={t("add_friend_btn")} onClick={onSendFriendRequest} disabled={utilLoading || !utilTargetUser.trim()} />
              <UtilAction label={t("block_user_btn")} onClick={onBlockUser} disabled={utilLoading || !utilTargetUser.trim()} danger />
            </div>
          </div>
        </UtilSection>

        {/* Security */}
        <UtilSection label={t("security_label")} Icon={ShieldIcon}>
          <UtilAction label="Sign Out All Other Sessions" onClick={onSignOutAll} disabled={utilLoading} fullWidth />
        </UtilSection>
      </div>

      {utilStatus && (
        <div style={{
          fontSize: 11.5, fontWeight: 700,
          color: utilIsError ? "var(--red)" : "var(--green)",
          marginTop: 16, padding: "10px 14px", borderRadius: 10, textAlign: "center",
          background: utilIsError ? "rgba(248,113,113,0.08)" : "rgba(52,211,153,0.08)",
          border: `1px solid ${utilIsError ? "rgba(248,113,113,0.2)" : "rgba(52,211,153,0.2)"}`,
        }}>
          {utilStatus}
        </div>
      )}
    </AccountModal>
  );
};
