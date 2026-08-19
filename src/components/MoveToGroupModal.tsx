import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, FieldLabel } from "../pages/Accounts";

export const MoveToGroupModal: FC<{
  open: boolean;
  selectedCount: number;
  groupInput: string;
  setGroupInput: (v: string) => void;
  onClose: () => void;
  onMove: () => void;
}> = ({ open, selectedCount, groupInput, setGroupInput, onClose, onMove }) => {
  if (!open) return null;
  return (
    <AccountModal title="Move to Group" onClose={onClose}>
      <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 14, lineHeight: 1.6 }}>
        Assign {selectedCount} selected account(s) to a group. Leave blank to remove from group.
      </p>
      <FieldLabel>GROUP NAME</FieldLabel>
      <input
        autoFocus
        value={groupInput}
        onChange={e => setGroupInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onMove(); }}
        placeholder="e.g. Main, Alts, Farming..."
        style={{
          width: "100%", height: 38, padding: "0 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", fontSize: 12, marginBottom: 12,
        }}
      />
      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} />
        <ModalBtn label="Move" onClick={onMove} primary />
      </ModalActions>
    </AccountModal>
  );
};
