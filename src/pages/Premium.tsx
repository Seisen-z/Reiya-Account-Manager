import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cloudPreferenceSnapshot } from "../lib/cloudRestorePreferences";
import { useFreeAccountLimit } from "../lib/useAccountPlan";

type Status = {
  premium: boolean;
  state?: string;
  server_now?: string;
  display_name?: string;
  profile_id?: string;
  expires_at?: string;
};

type Backup = {
  id: string;
  created_at: string;
  metadata: { accounts: number; files: number; bytes: number };
};

type BackupList = { profile: string; items: Backup[] | null; loading: boolean; error: string };

const webOrigin = import.meta.env.DEV ? "http://127.0.0.1:3000" : "https://www.seisen.store";
const statusTitles: Record<string, string> = {
  expired: "Premium expired",
  inactive: "Premium inactive",
  disabled: "Premium disabled",
  refunded: "Purchase refunded",
};

const verificationStorageKey = "reiya_premium_last_verified_at";

function readLastVerification(): number | null {
  try {
    const value = Number(localStorage.getItem(verificationStorageKey));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function recordVerification(status: Status): number | null {
  const hasServerStatus = status.premium || status.state !== "free" || !!status.server_now;
  const verifiedAt = status.server_now ? Date.parse(status.server_now) : Date.now();
  if (hasServerStatus && !Number.isFinite(verifiedAt)) return readLastVerification();
  try {
    if (hasServerStatus) localStorage.setItem(verificationStorageKey, String(verifiedAt));
    else localStorage.removeItem(verificationStorageKey);
  } catch {
    // The current diagnostic can still be displayed if settings cannot be saved.
  }
  return hasServerStatus ? verifiedAt : null;
}

export default function Premium() {
  const freeLimit = useFreeAccountLimit();
  const [lastVerified, setLastVerified] = useState(readLastVerification);
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [replaceKey, setReplaceKey] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cloud, setCloud] = useState<BackupList | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [automatic, setAutomatic] = useState(() => localStorage.getItem("reiya_premium_auto_backup") === "true");
  const statusPending = useRef(false);
  const actionPending = useRef(false);
  const backupRequest = useRef(0);

  const checkStatus = useCallback(async () => {
    if (statusPending.current || actionPending.current) return;
    statusPending.current = true;
    setChecking(true);
    try {
      const result = await invoke<Status>("premium_status");
      setStatus(result);
      setLastVerified(recordVerification(result));
      setStatusError("");
    } catch (error) {
      setStatusError(String(error));
    } finally {
      statusPending.current = false;
      setChecking(false);
    }
  }, []);

  const loadBackups = useCallback(async (profile: string) => {
    const request = ++backupRequest.current;
    setCloud(previous => ({
      profile,
      items: previous?.profile === profile ? previous.items : null,
      loading: true,
      error: "",
    }));
    try {
      const { backups } = await invoke<{ backups: Backup[] }>("premium_backups");
      if (backupRequest.current === request) setCloud({ profile, items: backups, loading: false, error: "" });
    } catch (error) {
      if (backupRequest.current === request) {
        setCloud(previous => ({ profile, items: previous?.items ?? null, loading: false, error: String(error) }));
      }
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void checkStatus(); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [checkStatus]);

  const activeProfile = status?.premium ? status.profile_id ?? "active" : null;
  const backups = cloud?.profile === activeProfile ? cloud : null;

  useEffect(() => {
    setRestore(null);
    setCloud(null);
    if (activeProfile) void loadBackups(activeProfile);
    return () => { ++backupRequest.current; };
  }, [activeProfile, loadBackups]);

  useEffect(() => {
    if (!status?.premium || !status.expires_at || !status.server_now) return;
    const now = Date.now();
    const deadline = now + Date.parse(status.expires_at) - Date.parse(status.server_now);
    const expire = () => {
      if (deadline <= Date.now()) setStatus(current => current && { ...current, premium: false, state: "expired" });
    };
    expire();
    const timer = window.setInterval(expire, 1000);
    return () => window.clearInterval(timer);
  }, [status?.premium, status?.expires_at, status?.server_now]);

  async function run(action: () => Promise<void>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(String(error));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  const title = status?.premium ? "Premium active"
    : status ? statusTitles[status.state ?? ""] ?? "Activate Premium"
    : checking ? "Checking Premium…" : "Premium status unavailable";

  return (
    <div className="scroll" style={{ padding: 28 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Premium &amp; Cloud Backup</h1>
        {import.meta.env.DEV && <p style={{ color: "var(--amber)", marginTop: 8 }}>Development mode uses the local Premium service on port 3000.</p>}
        <p style={{ color: "var(--t2)", margin: "8px 0 20px" }}>
{freeLimit === null ? "The Free plan limits saved accounts." : "Free includes up to " + freeLimit + " saved accounts."}{" "}
          Activate Premium to add more accounts and use cloud backup.
        </p>

        <section className="card" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>{title}</h2>
          {checking && !status && <p role="status" style={{ color: "var(--t2)" }}>Checking your saved Premium key.</p>}
          {statusError && (
            <div role="status" style={{ color: "var(--t2)", marginBottom: 12, overflowWrap: "anywhere" }}>
              <p>{status?.premium ? "Could not refresh Premium. Showing the last confirmed status." : "Could not verify Premium."}</p>
              <p style={{ marginTop: 4 }}>{statusError}</p>
              {!status && !replaceKey && (
                <button className="btn btn-ghost" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => setReplaceKey(true)}>
                  Enter a different key
                </button>
              )}
            </div>
          )}

          {status?.state === "expired" && !status.premium && (
            <div role="status" style={{ padding: 14, border: "1px solid var(--amber)", borderRadius: 12, marginBottom: 16 }}>
              <p>Renew Premium to increase your account capacity and use cloud backups. Cloud snapshots expire 15 days after upload.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={() => void openUrl(webOrigin + "/reiya/account")}>Manage or renew Premium</button>
              </div>
            </div>
          )}

          {status?.premium ? (
            <>
              <p>{status.display_name}{status.expires_at && <> | Paid until {new Date(status.expires_at).toLocaleString()}</>}</p>
              <p style={{ color: "var(--t3)", fontSize: 11, marginTop: 5 }}>Profile: {status.profile_id}</p>
              <button className="btn btn-ghost" disabled={busy || checking} style={{ marginTop: 12 }} onClick={() => {
                if (statusPending.current) return;
                void run(async () => {
                  await invoke("premium_deactivate");
                  const deactivated = { premium: false, state: "free" };
                  setStatus(deactivated);
                  setLastVerified(recordVerification(deactivated));
                  setStatusError("");
                  localStorage.setItem("reiya_premium_auto_backup", "false");
                  setAutomatic(false);
                });
              }}>Deactivate this device</button>
            </>
          ) : (status || replaceKey) && (
            <form onSubmit={event => {
              event.preventDefault();
              if (statusPending.current || !key.trim()) return;
              void run(async () => {
                const activated = await invoke<Status>("premium_activate", { key, displayName: name });
                setKey("");
                setReplaceKey(false);
                setStatus(activated);
                setLastVerified(recordVerification(activated));
                setStatusError("");
                setMessage("Premium activated.");
              });
            }}>
              <label htmlFor="reiya-premium-key" style={{ display: "block", marginBottom: 6 }}>Premium key</label>
              <input id="reiya-premium-key" className="field" type="password" autoComplete="off" spellCheck={false} value={key} onChange={event => setKey(event.target.value)} placeholder="REIYA-P-..." />
              <label htmlFor="reiya-premium-name" style={{ display: "block", margin: "12px 0 6px" }}>Display name (optional, first activation)</label>
              <input id="reiya-premium-name" className="field" value={name} maxLength={48} onChange={event => setName(event.target.value)} placeholder="Your display name" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" disabled={busy || checking || !key.trim()}>Activate Premium</button>
                <button type="button" className="btn btn-ghost" onClick={() => void openUrl(webOrigin + "/reiya#reiya-premium")}>Buy with PayPal</button>
              </div>
              <p style={{ color: "var(--t3)", fontSize: 11, marginTop: 12 }}>Keep your key private. Enter the same key on another computer to access your cloud backups.</p>
            </form>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--g06)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 180, fontSize: 11, color: "var(--t2)" }} aria-live="polite">
              <div><strong>Last verified</strong> {lastVerified === null ? "No verification recorded" : new Date(lastVerified).toLocaleString()}</div>
              <div style={{ marginTop: 4 }}>
                {checking ? "Checking subscription…" : statusError ? "Latest check failed" : status?.premium ? "Subscription active"
                  : status?.state === "expired" ? "Subscription expired" : statusTitles[status?.state ?? ""] ?? "No active subscription"}
              </div>
            </div>
            <button className="btn btn-ghost" disabled={busy || checking} onClick={() => void checkStatus()}>
              {checking ? "Checking…" : statusError ? "Retry Premium check" : "Check Premium now"}
            </button>
          </div>
        </section>

        {activeProfile && (
          <section className="card">
            <h2 style={{ fontSize: 15 }}>Encrypted full-data backups</h2>
            <p style={{ color: "var(--t2)", margin: "9px 0 16px" }}>
              Back up accounts, credentials, games, settings, and app preferences. Reiya keeps up to five cloud snapshots (2 MB each) for 15 days. Restoring replaces matching local data.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => {
                await invoke("premium_backup", { preferences: cloudPreferenceSnapshot() });
                setMessage("Encrypted cloud backup saved.");
                void loadBackups(activeProfile);
              })}>Back up everything now</button>
              <button className="btn btn-ghost" disabled={busy || backups?.loading} onClick={() => void loadBackups(activeProfile)}>
                {backups?.error ? "Retry backups" : "Refresh backups"}
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t2)" }}>
              <input type="checkbox" checked={automatic} onChange={event => {
                setAutomatic(event.target.checked);
                localStorage.setItem("reiya_premium_auto_backup", String(event.target.checked));
              }} />
              Automatic backups every 30 minutes while Reiya is open
            </label>
            <div style={{ marginTop: 16, color: "var(--t2)" }}>
              {(!backups || backups.loading) && <p role="status">Loading cloud backups…</p>}
              {backups?.error && <p role="status" style={{ overflowWrap: "anywhere" }}>Could not load cloud backups. {backups.error}</p>}
              {backups?.items?.length === 0 && !backups.loading && !backups.error && <p>No cloud backups yet.</p>}
              {backups?.items?.map(backup => (
                <div key={backup.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ flex: 1 }}>
                    {new Date(backup.created_at).toLocaleString()}
                    <p style={{ fontSize: 11, color: "var(--t3)" }}>{backup.metadata.accounts} accounts | {backup.metadata.files} files | {Math.ceil(backup.metadata.bytes / 1024)} KB</p>
                  </div>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setRestore(backup.id)}>Restore</button>
                </div>
              ))}
            </div>
            {restore && backups?.items?.some(backup => backup.id === restore) && (
              <div style={{ marginTop: 16, padding: 16, border: "1px solid var(--amber)", borderRadius: 12 }}>
                <p>Restore this snapshot and restart Reiya? This replaces matching local data. A local rollback copy is created automatically. Your local vault protection is retained.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void run(async () => {
                    await invoke("premium_restore", { backupId: restore });
                    await invoke("premium_restart");
                  })}>Restart and restore</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setRestore(null)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}
        {(busy || message) && <p role="status" style={{ marginTop: 16, color: "var(--t2)", overflowWrap: "anywhere" }}>{busy ? "Working…" : message}</p>}
      </div>
    </div>
  );
}
