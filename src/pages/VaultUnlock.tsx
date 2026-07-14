import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LockIcon } from "../components/Icons";

interface Props {
  onUnlocked: () => void;
}

export default function VaultUnlock({ onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [shaking, setShaking]   = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [confirmingReset]);

  const submit = async () => {
    if (!password) return;
    setLoading(true); setError("");
    try {
      const ok = await invoke<boolean>("unlock_vault", { password });
      if (ok) {
        onUnlocked();
      } else {
        setPassword("");
        setError("Incorrect password");
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
        inputRef.current?.focus();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await invoke("reset_vault");
      onUnlocked();
    } catch (e) {
      setError(String(e));
      setResetting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(7,8,10,0.97)",
      backdropFilter: "blur(20px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 28,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: "rgba(167,139,250,0.1)",
        border: "1px solid rgba(167,139,250,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <LockIcon size={28} color="rgba(167,139,250,0.9)" />
      </div>

      {!confirmingReset ? (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", marginBottom: 6 }}>
              Data Locked
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)" }}>Enter your password to unlock your accounts</div>
          </div>

          <div style={{ width: "100%", maxWidth: 300, animation: shaking ? "lock-shake 0.4s ease" : "none" }}>
            <input
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Password"
              disabled={loading}
              style={{
                width: "100%", height: 42, padding: "0 14px", borderRadius: 12, outline: "none",
                background: "var(--g03)", border: "1px solid var(--g07)",
                color: "var(--t1)", fontSize: 13, textAlign: "center",
              }}
            />
          </div>

          {error && <div style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 700 }}>{error}</div>}

          <button
            onClick={submit}
            disabled={loading || !password}
            style={{
              width: "100%", maxWidth: 300, height: 42, borderRadius: 12, border: "none",
              background: "var(--accent)", color: "#07080a", fontSize: 12.5, fontWeight: 800,
              cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>

          <button
            onClick={() => { setConfirmingReset(true); setError(""); }}
            style={{
              background: "transparent", border: "none", color: "var(--t3)",
              fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Forgot password?
          </button>
        </>
      ) : (
        <>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--t1)", marginBottom: 8 }}>
              Reset data lock
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)", lineHeight: 1.6, marginBottom: 4 }}>
              Your password can't be recovered. Resetting will <b style={{ color: "var(--red)" }}>permanently delete all saved accounts</b> on this device — there's no way to get them back without the password.
            </div>
          </div>

          <div style={{ width: "100%", maxWidth: 300 }}>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              value={resetText}
              onChange={e => setResetText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              disabled={resetting}
              style={{
                width: "100%", height: 40, padding: "0 14px", borderRadius: 12, outline: "none",
                background: "var(--g03)", border: "1px solid var(--g07)",
                color: "var(--t1)", fontSize: 12.5, textAlign: "center",
              }}
            />
          </div>

          {error && <div style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 700 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 300 }}>
            <button
              onClick={() => { setConfirmingReset(false); setResetText(""); }}
              disabled={resetting}
              style={{
                flex: 1, height: 40, borderRadius: 12, border: "1px solid var(--g07)",
                background: "transparent", color: "var(--t2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={doReset}
              disabled={resetting || resetText !== "DELETE"}
              style={{
                flex: 1, height: 40, borderRadius: 12, border: "none",
                background: "rgba(248,113,113,0.15)", color: "var(--red)", fontSize: 12, fontWeight: 800,
                cursor: resetText === "DELETE" ? "pointer" : "default",
                opacity: resetText === "DELETE" ? 1 : 0.5,
              }}
            >
              {resetting ? "Resetting..." : "Delete & Reset"}
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes lock-shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
