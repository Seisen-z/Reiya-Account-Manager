import { FC } from "react";
import { HomeModal } from "../pages/Home";

export const SavePasswordPromptModal: FC<{
  prompt: { userId: number; username: string } | null;
  savePasswordInput: string;
  setSavePasswordInput: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onSubmitEnter: () => void;
}> = ({ prompt, savePasswordInput, setSavePasswordInput, onClose, onSubmit, onSubmitEnter }) => {
  if (!prompt) return null;
  return (
    <HomeModal title="Save Password?" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 800, color: "var(--t1)" }}>@{prompt.username}</span> was added successfully.
          <br />
          Enter the password you used so it can be copied later from the account menu.
        </div>
        <input
          type="password"
          placeholder="Password (optional)"
          value={savePasswordInput}
          onChange={e => setSavePasswordInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && savePasswordInput.trim()) {
              onSubmitEnter();
            }
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          className="field glass-input"
          style={{ height: 34, fontSize: 12, padding: "0 11px" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onSubmit}
            className="btn" style={{ flex: 1, background: "#FFFFFF", color: "#000", fontWeight: 800, fontSize: 11 }}>
            Save
          </button>
          <button onClick={onClose}
            className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }}>
            Skip
          </button>
        </div>
      </div>
    </HomeModal>
  );
};
