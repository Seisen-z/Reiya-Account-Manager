import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, ErrorMsg } from "../pages/Accounts";

export const ImportAccountsModal: FC<{
  open: boolean;
  importPwd: string;
  setImportPwd: (v: string) => void;
  importLoading: boolean;
  importErr: string;
  importOk: string;
  onClose: () => void;
  onImport: () => void;
}> = ({ open, importPwd, setImportPwd, importLoading, importErr, importOk, onClose, onImport }) => {
  if (!open) return null;
  return (
    <AccountModal title="Import Backup" onClose={onClose}>
      <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 16, lineHeight: 1.7 }}>
        Select a <code style={{ color: "var(--amber)", fontFamily: "monospace" }}>.reiya</code> backup file to restore.
        Duplicate accounts (matching User ID) will be skipped.
      </p>
      <FieldLabel>BACKUP PASSWORD (IF SET)</FieldLabel>
      <input
        type="password"
        autoFocus
        autoComplete="off"
        value={importPwd}
        onChange={e => setImportPwd(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onImport(); }}
        placeholder="Leave blank if the backup has no password"
        disabled={importLoading}
        style={{
          width: "100%", height: 38, padding: "0 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", fontSize: 12, marginBottom: 12, opacity: importLoading ? 0.5 : 1,
        }}
      />
      {importErr && <ErrorMsg msg={importErr} />}
      {importOk && (
        <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 10, padding: "8px 12px", background: "rgba(52,211,153,0.08)", borderRadius: 9, border: "1px solid rgba(52,211,153,0.2)" }}>
          {importOk}
        </div>
      )}
      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} disabled={importLoading} />
        <ModalBtn label={importLoading ? "Importing..." : "Choose File & Import"} onClick={onImport} primary disabled={importLoading} />
      </ModalActions>
    </AccountModal>
  );
};
