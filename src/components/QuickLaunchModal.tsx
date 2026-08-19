import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, Account } from "../pages/Accounts";

export const QuickLaunchModal: FC<{
  account: Account | null;
  quickPlaceId: string;
  setQuickPlaceId: (v: string) => void;
  onClose: () => void;
  onLaunch: () => void;
}> = ({ account, quickPlaceId, setQuickPlaceId, onClose, onLaunch }) => {
  if (!account) return null;
  return (
    <AccountModal title={`Launch @${account.username}`} onClose={onClose}>
      <FieldLabel>Place ID (leave blank for default)</FieldLabel>
      <input
        autoFocus
        placeholder="e.g. 4483381587"
        value={quickPlaceId}
        onChange={e => setQuickPlaceId(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onLaunch(); if (e.key === "Escape") onClose(); }}
        style={{
          width: "100%", padding: "9px 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", fontSize: 12, marginBottom: 12,
        }}
      />
      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} />
        <ModalBtn label="Launch" onClick={onLaunch} primary />
      </ModalActions>
    </AccountModal>
  );
};
