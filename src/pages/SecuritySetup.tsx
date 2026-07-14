import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LockIcon, ShieldCheckIcon, CheckIcon } from "../components/Icons";

interface Props {
  onDone: (mode: "default" | "password") => void;
}

export default function SecuritySetup({ onDone }: Props) {
  const [choice, setChoice] = useState<"default" | "password" | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (choice === "password") inputRef.current?.focus(); }, [choice]);

  const finishWithDefault = () => {
    onDone("default");
  };

  const finishWithPassword = async () => {
    if (password.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    try {
      await invoke("setup_password_lock", { password });
      onDone("password");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "#07080a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, var(--g04) 0%, transparent 70%)",
      }} />

      <div style={{ width: "100%", maxWidth: 480, padding: "0 32px", position: "relative" }}>
        {choice !== "password" ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: "0 auto 18px",
                background: "linear-gradient(135deg, var(--g12) 0%, var(--g04) 100%)",
                border: "1px solid var(--g20)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ShieldCheckIcon size={26} color="#E8E8E8" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#F0F1F6", letterSpacing: "-0.5px", marginBottom: 8 }}>
                Please select how you want your data to be secured
              </h1>
              <p style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.6 }}>
                This controls how your account cookies are encrypted at rest.
              </p>
            </div>

            <SecurityOption
              title="Default Encryption"
              desc="Cookies are encrypted and tied to this device automatically. Nothing to remember."
              onClick={finishWithDefault}
            />
            <SecurityOption
              title="Password Locked"
              badge="Recommended"
              desc="Set a password. Reiya will ask for it every time the app starts. If you forget it, saved accounts can't be recovered."
              onClick={() => setChoice("password")}
            />
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, margin: "0 auto 18px",
                background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LockIcon size={24} color="rgba(167,139,250,0.9)" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#F0F1F6", letterSpacing: "-0.5px", marginBottom: 8 }}>
                Set your password
              </h1>
              <p style={{ fontSize: 11.5, color: "var(--t3)", lineHeight: 1.6 }}>
                You'll need this every time you open Reiya. There is no way to recover it — write it down somewhere safe.
              </p>
            </div>

            <input
              ref={inputRef}
              type="password"
              autoComplete="off"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") finishWithPassword(); }}
              placeholder="New password"
              disabled={loading}
              style={{
                width: "100%", height: 40, padding: "0 14px", borderRadius: 10, outline: "none",
                background: "var(--g03)", border: "1px solid var(--g07)",
                color: "var(--t1)", fontSize: 13, marginBottom: 10,
              }}
            />
            <input
              type="password"
              autoComplete="off"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") finishWithPassword(); }}
              placeholder="Confirm password"
              disabled={loading}
              style={{
                width: "100%", height: 40, padding: "0 14px", borderRadius: 10, outline: "none",
                background: "var(--g03)", border: "1px solid var(--g07)",
                color: "var(--t1)", fontSize: 13, marginBottom: 14,
              }}
            />

            {error && (
              <div style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 600, marginBottom: 14, textAlign: "center" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setChoice(null); setPassword(""); setConfirm(""); setError(""); }}
                disabled={loading}
                style={{
                  flex: 1, height: 42, borderRadius: 12, border: "1px solid var(--g07)",
                  background: "transparent", color: "var(--t2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={finishWithPassword}
                disabled={loading || !password || !confirm}
                style={{
                  flex: 2, height: 42, borderRadius: 12, border: "none",
                  background: "var(--accent)", color: "#07080a", fontSize: 12.5, fontWeight: 800,
                  cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Securing..." : "Secure My Data"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SecurityOption({ title, desc, badge, onClick }: { title: string; desc: string; badge?: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", textAlign: "left",
        display: "flex", alignItems: "center", gap: 14,
        padding: "16px 18px", borderRadius: 14, marginBottom: 12,
        background: hover ? "var(--g04)" : "var(--g02)",
        border: `1px solid ${hover ? "var(--g14)" : "var(--g07)"}`,
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--t1)" }}>{title}</span>
          {badge && (
            <span style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: "0.06em",
              padding: "2px 7px", borderRadius: 5,
              background: "rgba(52,211,153,0.12)", color: "#34D399",
            }}>
              {badge.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        border: `1px solid ${hover ? "var(--accent)" : "var(--g10)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {hover && <CheckIcon size={12} color="var(--accent)" />}
      </div>
    </button>
  );
}
