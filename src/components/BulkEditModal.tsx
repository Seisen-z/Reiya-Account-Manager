import { FC, useEffect, useState } from "react";
import { AccountModal, FieldLabel, ModalActions, ModalBtn } from "../pages/Accounts";

export interface BulkEditValue {
  placeId: string;
  gameName: string;
  privateServer: string;
  launcher: string;
  delay: string;
  favGames: string;
  favMode: "add" | "replace";
  notes: string;
  notesMode: "replace" | "append";
  addTags: string;
  removeTags: string;
}

const EMPTY: BulkEditValue = {
  placeId: "", gameName: "", privateServer: "", launcher: "", delay: "",
  favGames: "", favMode: "add", notes: "", notesMode: "replace", addTags: "", removeTags: "",
};

type Tab = "games" | "notes";

export const BulkEditModal: FC<{
  open: boolean;
  selectedCount: number;
  saving: boolean;
  error: string;
  onClose: () => void;
  onApply: (value: BulkEditValue) => void;
}> = ({ open, selectedCount, saving, error, onClose, onApply }) => {
  const [value, setValue] = useState<BulkEditValue>(EMPTY);
  const [tab, setTab] = useState<Tab>("games");
  useEffect(() => { if (open) { setValue(EMPTY); setTab("games"); } }, [open]);
  if (!open) return null;

  const set = <K extends keyof BulkEditValue>(key: K, next: BulkEditValue[K]) => setValue(prev => ({ ...prev, [key]: next }));
  const input = { width: "100%", height: 34, padding: "0 11px", borderRadius: 8, outline: "none", background: "var(--g03)", border: "1px solid var(--g07)", color: "var(--t1)", fontSize: 11.5 } as const;
  const seg = (active: boolean) => ({
    flex: 1, height: 28, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
    border: "none", background: active ? "var(--g08)" : "transparent", color: active ? "var(--t1)" : "var(--t3)",
  }) as const;
  const hasChanges = Object.entries(value).some(([k, v]) => !["favMode", "notesMode"].includes(k) && String(v).trim() !== "");

  return (
    <AccountModal title={`Edit ${selectedCount} accounts`} onClose={onClose} wide>
      <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5, marginBottom: 12 }}>
        Only the fields you fill in are changed. Blank fields leave each account as it is.
      </div>

      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "var(--g02)", border: "1px solid var(--g05)", marginBottom: 14 }}>
        <button style={seg(tab === "games")} onClick={() => setTab("games")}>Games &amp; Launch</button>
        <button style={seg(tab === "notes")} onClick={() => setTab("notes")}>Notes &amp; Tags</button>
      </div>

      {error && <div style={{ padding: "7px 10px", marginBottom: 10, borderRadius: 7, background: "rgba(248,113,113,0.08)", color: "var(--red)", fontSize: 11 }}>{error}</div>}

      {tab === "games" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><FieldLabel>DEFAULT PLACE ID</FieldLabel><input value={value.placeId} onChange={e => set("placeId", e.target.value.replace(/\D/g, ""))} placeholder="Unchanged" style={input} /></div>
          <div><FieldLabel>GAME NAME</FieldLabel><input value={value.gameName} onChange={e => set("gameName", e.target.value)} placeholder="Unchanged" style={input} /></div>
          <div style={{ gridColumn: "1 / -1" }}><FieldLabel>PRIVATE SERVER URL / CODE</FieldLabel><input value={value.privateServer} onChange={e => set("privateServer", e.target.value)} placeholder="Unchanged" style={input} /></div>
          <div>
            <FieldLabel>LAUNCHER</FieldLabel>
            <select value={value.launcher} onChange={e => set("launcher", e.target.value)} style={input}>
              <option value="">Unchanged</option>
              <option value="global">Use global setting</option>
              <option value="official">Official Roblox</option>
              <option value="reiya">Reiya Built-in</option>
              <option value="bloxstrap">Bloxstrap</option>
              <option value="fishstrap">Fishstrap</option>
              <option value="protocol">System Protocol</option>
            </select>
          </div>
          <div><FieldLabel>STARTUP DELAY (SECONDS)</FieldLabel><input type="number" min={0} max={300} value={value.delay} onChange={e => set("delay", e.target.value)} placeholder="Unchanged" style={input} /></div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>FAVORITE GAMES (PLACE IDS, COMMA SEPARATED)</FieldLabel>
            <input value={value.favGames} onChange={e => set("favGames", e.target.value.replace(/[^\d,\s]/g, ""))} placeholder="Unchanged" style={input} />
            <div style={{ display: "flex", gap: 4, marginTop: 6, padding: 3, borderRadius: 9, background: "var(--g02)", border: "1px solid var(--g05)", width: 240 }}>
              <button style={seg(value.favMode === "add")} onClick={() => set("favMode", "add")}>Add to existing</button>
              <button style={seg(value.favMode === "replace")} onClick={() => set("favMode", "replace")}>Replace</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <FieldLabel>ADD TAGS</FieldLabel>
            <input value={value.addTags} onChange={e => set("addTags", e.target.value)} placeholder="farming, alt (comma separated)" style={input} />
          </div>
          <div>
            <FieldLabel>REMOVE TAGS</FieldLabel>
            <input value={value.removeTags} onChange={e => set("removeTags", e.target.value)} placeholder="Tags to take off these accounts" style={input} />
          </div>
          <div>
            <FieldLabel>NOTES</FieldLabel>
            <textarea
              value={value.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Unchanged"
              rows={3}
              style={{ ...input, height: "auto", padding: "8px 11px", resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 6, padding: 3, borderRadius: 9, background: "var(--g02)", border: "1px solid var(--g05)", width: 240 }}>
              <button style={seg(value.notesMode === "replace")} onClick={() => set("notesMode", "replace")}>Replace</button>
              <button style={seg(value.notesMode === "append")} onClick={() => set("notesMode", "append")}>Add to end</button>
            </div>
          </div>
        </div>
      )}

      <ModalActions>
        <ModalBtn label="Cancel" onClick={onClose} />
        <ModalBtn label={saving ? "Applying…" : `Apply to ${selectedCount}`} onClick={() => onApply(value)} primary disabled={saving || !hasChanges} />
      </ModalActions>
    </AccountModal>
  );
};
