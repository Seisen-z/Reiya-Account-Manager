import { FC } from "react";
import { AccountModal, ModalBtn, ModalActions, FieldLabel, ErrorMsg } from "../pages/Accounts";
import { AccountLimitLink } from "./AccountLimitLink";

export interface BackupImportPreview {
  token: string;
  accounts: { user_id: number; username: string }[];
  duplicates: number;
  saved_accounts: number;
  free_limit: number;
}

export const ImportAccountsModal: FC<{
  open: boolean;
  importPwd: string;
  setImportPwd: (value: string) => void;
  importLoading: boolean;
  importErr: string;
  importOk: string;
  preview: BackupImportPreview | null;
  selected: ReadonlySet<number>;
  premium: boolean | null;
  onToggleAccount: (id: number) => void;
  onResetPreview: () => void;
  onClose: () => void;
  onImport: () => void;
}> = ({
  open, importPwd, setImportPwd, importLoading, importErr, importOk, preview,
  selected, premium, onToggleAccount, onResetPreview, onClose, onImport,
}) => {
  if (!open) return null;

  const freeSlots = preview ? Math.max(0, preview.free_limit - preview.saved_accounts) : 0;
  const exceedsFree = !!preview && selected.size > freeSlots;
  const canImport = !preview || (selected.size > 0 && (!exceedsFree || premium !== false));

  return (
    <AccountModal title={preview ? "Review Backup Import" : "Import Backup"} onClose={() => { if (!importLoading) onClose(); }}>
      {preview ? (
        <>
          <p style={{ fontSize: 12, color: "var(--t2)", marginBottom: 12 }}>
            {preview.accounts.length} new · {preview.duplicates} duplicate{preview.duplicates === 1 ? "" : "s"} skipped · {selected.size} selected
          </p>
          {premium !== true && (
            <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 8 }}>
              The Free plan has {freeSlots} of {preview.free_limit} slots available.
            </p>
          )}
          {preview.accounts.length > 0 ? (
            <fieldset style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
              <legend style={{ fontSize: 11, color: "var(--t2)", marginBottom: 8 }}>Choose accounts to import</legend>
              {preview.accounts.map(account => (
                <label key={account.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 8, background: "var(--g03)" }}>
                  <input type="checkbox" checked={selected.has(account.user_id)} disabled={importLoading} onChange={() => onToggleAccount(account.user_id)} />
                  <span style={{ overflowWrap: "anywhere" }}>{account.username || "Account " + account.user_id}</span>
                </label>
              ))}
            </fieldset>
          ) : <p style={{ color: "var(--t2)", fontSize: 11, marginBottom: 12 }}>This backup has no new accounts to import.</p>}
          {exceedsFree && premium !== true && (
            <div role="status" style={{ color: "var(--amber)", fontSize: 11, marginBottom: 8 }}>
              {premium === false ? "Select fewer accounts or activate Premium to import this selection." : "This selection requires Premium verification."}
              {premium === false && <div><AccountLimitLink /></div>}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 11, color: "var(--t2)", marginBottom: 16, lineHeight: 1.7 }}>
            Choose a .reiya backup to preview its accounts before importing.
          </p>
          <FieldLabel>BACKUP PASSWORD (IF SET)</FieldLabel>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={importPwd}
            onChange={event => setImportPwd(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !importLoading) onImport(); }}
            placeholder="Leave blank if the backup has no password"
            disabled={importLoading}
            style={{
              width: "100%", height: 38, padding: "0 13px", borderRadius: 10, outline: "none",
              background: "var(--g03)", border: "1px solid var(--g07)",
              color: "var(--t1)", fontSize: 12, marginBottom: 12,
            }}
          />
        </>
      )}
      {importErr && <ErrorMsg msg={importErr} />}
      {importOk && <p role="status" style={{ color: "var(--green)", fontSize: 11, marginBottom: 10 }}>{importOk}</p>}
      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} disabled={importLoading} />
        {preview && <ModalBtn label="Choose another file" onClick={onResetPreview} disabled={importLoading} />}
        <ModalBtn
          label={importLoading ? (preview ? "Importing..." : "Reading backup...") : preview ? "Import selected" : "Choose file & preview"}
          onClick={onImport} primary disabled={importLoading || !canImport}
        />
      </ModalActions>
    </AccountModal>
  );
};
