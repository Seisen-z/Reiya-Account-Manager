import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, ErrorMsg } from "../pages/Accounts";

export const ExportAccountsModal: FC<{
  open: boolean;
  exportPwd: string;
  setExportPwd: (v: string) => void;
  exportLoading: boolean;
  exportErr: string;
  exportOk: string;
  onClose: () => void;
  onExport: () => void;
}> = ({ open, exportPwd, setExportPwd, exportLoading, exportErr, exportOk, onClose, onExport }) => {
  if (!open) return null;
  return (
    <AccountModal title="Export Backup" onClose={onClose}>
      <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 16, lineHeight: 1.7 }}>
        All accounts will be exported to a <code style={{ color: "var(--amber)", fontFamily: "monospace" }}>.reiya</code> backup file.
        Add a password for extra protection, or leave it blank to skip — either way, account cookies stay tied to this device's own encryption.
      </p>
      <FieldLabel>BACKUP PASSWORD (OPTIONAL)</FieldLabel>
      <input
        type="password"
        autoFocus
        autoComplete="off"
        value={exportPwd}
        onChange={e => setExportPwd(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onExport(); }}
        placeholder="Leave blank for no password"
        disabled={exportLoading}
        style={{
          width: "100%", height: 38, padding: "0 13px", borderRadius: 10, outline: "none",
          background: "var(--g03)", border: "1px solid var(--g07)",
          color: "var(--t1)", fontSize: 12, marginBottom: 12, opacity: exportLoading ? 0.5 : 1,
        }}
      />
      {exportErr && <ErrorMsg msg={exportErr} />}
      {exportOk && (
        <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 10, padding: "8px 12px", background: "rgba(52,211,153,0.08)", borderRadius: 9, border: "1px solid rgba(52,211,153,0.2)" }}>
          {exportOk}
        </div>
      )}
      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} disabled={exportLoading} />
        <ModalBtn label={exportLoading ? "Exporting..." : "Export Backup"} onClick={onExport} primary disabled={exportLoading} />
      </ModalActions>
    </AccountModal>
  );
};
