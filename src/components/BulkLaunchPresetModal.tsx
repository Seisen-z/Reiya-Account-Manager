import { FC, useEffect, useState } from "react";
import { AccountModal, FieldLabel, ModalActions, ModalBtn } from "../pages/Accounts";

export interface BulkLaunchPresetValue {
  launchPresetName: string;
  defaultPlaceId: string;
  defaultGameName: string;
  defaultPrivateServer: string;
  launcherPreference: string;
  launchDelaySeconds: number;
}

export const BulkLaunchPresetModal: FC<{
  open: boolean;
  selectedCount: number;
  saving: boolean;
  error: string;
  onClose: () => void;
  onApply: (value: BulkLaunchPresetValue) => void;
}> = ({ open, selectedCount, saving, error, onClose, onApply }) => {
  const [value, setValue] = useState<BulkLaunchPresetValue>({ launchPresetName: "", defaultPlaceId: "", defaultGameName: "", defaultPrivateServer: "", launcherPreference: "", launchDelaySeconds: 0 });
  useEffect(() => {
    if (open) setValue({ launchPresetName: "", defaultPlaceId: "", defaultGameName: "", defaultPrivateServer: "", launcherPreference: "", launchDelaySeconds: 0 });
  }, [open]);
  if (!open) return null;
  const set = <K extends keyof BulkLaunchPresetValue>(key: K, next: BulkLaunchPresetValue[K]) => setValue(prev => ({ ...prev, [key]: next }));
  const inputStyle = { width: "100%", height: 34, padding: "0 11px", borderRadius: 8, outline: "none", background: "var(--g03)", border: "1px solid var(--g07)", color: "var(--t1)", fontSize: 11 } as const;
  return (
    <AccountModal title="Apply Launch Preset" onClose={onClose}>
      <div style={{ fontSize: 10.5, color: "var(--t2)", lineHeight: 1.5, marginBottom: 12 }}>Apply one consistent launch configuration to {selectedCount} selected account(s). Empty fields clear the existing preset values.</div>
      {error && <div style={{ padding: "7px 10px", marginBottom: 10, borderRadius: 7, background: "rgba(248,113,113,0.08)", color: "var(--red)", fontSize: 10 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><FieldLabel>PRESET NAME</FieldLabel><input autoFocus value={value.launchPresetName} onChange={e => set("launchPresetName", e.target.value)} placeholder="Main farming" style={inputStyle} /></div>
        <div><FieldLabel>LAUNCHER</FieldLabel><select value={value.launcherPreference} onChange={e => set("launcherPreference", e.target.value)} style={inputStyle}><option value="">Use global setting</option><option value="official">Official Roblox</option><option value="reiya">Reiya Built-in</option><option value="bloxstrap">Bloxstrap</option><option value="fishstrap">Fishstrap</option><option value="protocol">System Protocol</option></select></div>
        <div><FieldLabel>DEFAULT PLACE ID</FieldLabel><input value={value.defaultPlaceId} onChange={e => set("defaultPlaceId", e.target.value.replace(/\D/g, ""))} placeholder="Numeric Place ID" style={inputStyle} /></div>
        <div><FieldLabel>GAME NAME</FieldLabel><input value={value.defaultGameName} onChange={e => set("defaultGameName", e.target.value)} placeholder="Optional label" style={inputStyle} /></div>
        <div style={{ gridColumn: "1 / -1" }}><FieldLabel>PRIVATE SERVER URL / CODE</FieldLabel><input value={value.defaultPrivateServer} onChange={e => set("defaultPrivateServer", e.target.value)} placeholder="Optional private server link or code" style={inputStyle} /></div>
        <div><FieldLabel>STARTUP DELAY (SECONDS)</FieldLabel><input type="number" min={0} max={300} value={value.launchDelaySeconds} onChange={e => set("launchDelaySeconds", Math.max(0, Math.min(300, Number(e.target.value))))} style={inputStyle} /></div>
      </div>
      <ModalActions><ModalBtn label="Cancel" onClick={onClose} /><ModalBtn label={saving ? "Applying…" : `Apply to ${selectedCount}`} onClick={() => onApply(value)} primary disabled={saving} /></ModalActions>
    </AccountModal>
  );
};
