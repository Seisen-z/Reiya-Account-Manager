import { FC, useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { GamepadIcon, PowerIcon } from "./Icons";
import { Session } from "../pages/Home";

export function LiveSessionRow({ session, onKill, onShowDetail }: { session: Session; onKill: () => void; onShowDetail: () => void }) {
  const { t } = useLanguage();
  const [hov, setHov] = useState(false);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!session.start_time) return;
    const start = new Date(session.start_time).getTime();
    const tick = () => {
      const s = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const nextStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
      setElapsed(prev => prev === nextStr ? prev : nextStr);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.start_time]);

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onShowDetail}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: hov ? "var(--surface-2)" : "var(--surface-3)", border: "1px solid var(--border)", transition: "background .1s", cursor: "pointer" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {session.avatar_url ? (
          <img src={session.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <GamepadIcon size={16} color="var(--t2)" />
          </div>
        )}
        <span style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "var(--green)", border: "2px solid var(--surface)", animation: "pulse-glow 2s ease-in-out infinite" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.username ?? "Unknown"}
        </div>
        <div style={{ fontSize: 9, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.game_name ?? `PID ${session.pid}`}
        </div>
      </div>
      {elapsed && <span style={{ fontSize: 9, color: "var(--green)", fontWeight: 700, flexShrink: 0 }}>{elapsed}</span>}
      <button onClick={e => { e.stopPropagation(); onKill(); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,.3)", background: "var(--red-dim)", color: "var(--red)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
        {t("kill")}
      </button>
    </div>
  );
}

export const LiveSessionsList: FC<{
  sessions: Session[];
  onRefresh: () => void;
  onKillAll: () => void;
  onKillOne: (pid: number) => void;
  onShowDetail: (session: Session) => void;
}> = ({ sessions, onRefresh, onKillAll, onKillOne, onShowDetail }) => {
  const { t } = useLanguage();
  return (
    <div style={{ flexShrink: 0, borderTop: "1px solid var(--glass-line)", padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sessions.length > 0 ? 8 : 0 }}>
        <span className="section-title" style={{ fontSize: 9.5 }}>
          <span className="section-dot" style={{ background: sessions.length > 0 ? "var(--green)" : "var(--t3)", animation: sessions.length > 0 ? "pulse-glow 2s ease-in-out infinite" : "none" }} />
          {t("live_sessions")}
          {sessions.length > 0 && (
            <span style={{ fontSize: 8.5, background: "var(--green-dim)", color: "var(--green)", padding: "1px 5px", borderRadius: 99, fontWeight: 800, marginLeft: 4 }}>{sessions.length}</span>
          )}
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={onRefresh}
            title="Refresh sessions"
            style={{ padding: "2px 5px", borderRadius: 4, border: "1px solid var(--g06)", background: "transparent", color: "var(--t3)", fontSize: 9, cursor: "pointer" }}>
            ↻
          </button>
        {sessions.length > 0 && (
          <button onClick={onKillAll}
            style={{ padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(248,113,113,.2)", background: "rgba(248,113,113,0.06)", color: "var(--red)", fontSize: 8.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.14)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(248,113,113,0.06)")}>
            <PowerIcon size={8} color="var(--red)" /> {t("kill_all")}
          </button>
        )}
        </div>
      </div>
      {sessions.length === 0 ? (
        <div style={{ fontSize: 10, color: "var(--t3)", paddingTop: 4 }}>{t("no_active_sessions_lbl")}</div>
      ) : (
        <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
          {sessions.map(s => <LiveSessionRow key={s.pid} session={s} onKill={() => onKillOne(s.pid)} onShowDetail={() => onShowDetail(s)} />)}
        </div>
      )}
    </div>
  );
};
