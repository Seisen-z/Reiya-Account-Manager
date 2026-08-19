import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  GamepadIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  LoaderIcon,
  PlayIcon,
  MonitorIcon,
} from "./Icons";
import { Account, RecentGame } from "../pages/Home";

export const SelectedAccountHero: FC<{
  launchThumb: string | null;
  launchGame: RecentGame | undefined;
  launchPlaceId: string;
  setLaunchPlaceId: (v: string) => void;
  accountGameOptions: RecentGame[];
  selAccount: number | null;
  getAccGameHistory: (userId: number) => RecentGame[];
  recentGames: RecentGame[];
  accessCode: string;
  setAccessCode: (v: string) => void;
  setLaunchError: (v: string) => void;
  onPastePlaceId: () => void;
  jobId: string;
  setJobId: (v: string) => void;
  onAccessCodeChange: (val: string) => void;
  launchHistory: Array<{ userId: number; username: string; placeId: string; gameName: string }>;
  accounts: Account[];
  setSelAccount: (v: number) => void;
  selectedAccountIsActive: boolean;
  reValidating: boolean;
  onReValidate: (userId: number) => void;
  launchError: string;
  multiSelected: Set<number>;
  onLaunchMultiple: () => void;
  launching: boolean;
  onLaunchApp: () => void;
  onLaunch: () => void;
}> = ({
  launchThumb, launchGame, launchPlaceId, setLaunchPlaceId,
  accountGameOptions, selAccount, getAccGameHistory, recentGames,
  accessCode, setAccessCode, setLaunchError, onPastePlaceId, jobId, setJobId, onAccessCodeChange,
  launchHistory, accounts, setSelAccount,
  selectedAccountIsActive, reValidating, onReValidate,
  launchError, multiSelected, onLaunchMultiple, launching, onLaunchApp, onLaunch,
}) => {
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", height: 225, flexShrink: 0, borderBottom: "1px solid var(--glass-line)" }}>
      {/* Game Thumbnail */}
      <div style={{ width: 196, position: "relative", overflow: "hidden", flexShrink: 0, borderRight: "1px solid var(--glass-line)" }}>
        {launchThumb ? (
          <>
            <img src={launchThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)" }} />
          </>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <GamepadIcon size={30} color="var(--g08)" />
          </div>
        )}
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12 }}>
          {launchGame ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{launchGame.name}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{t("by")} {launchGame.creator}</div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: "var(--g25)", fontWeight: 700 }}>{t("no_game_selected")}</div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ flex: 1, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 9, overflow: "hidden", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 0 8px rgba(255,255,255,0.5)", flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, fontWeight: 900, color: "var(--t1)", letterSpacing: "0.09em" }}>{t("launch_console")}</span>
        </div>
        <div style={{ width: "100%", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4 }}>
            <select value={launchPlaceId} onChange={e => {
              const val = e.target.value;
              setLaunchPlaceId(val);
              localStorage.setItem("reiya_last_place_id", val);
              setLaunchError("");
              const game = accountGameOptions.find(g => g.placeId === val);
              setAccessCode(game?.privateServer || "");
            }} className="field glass-input" style={{ flex: 1, height: 32, fontSize: 11, cursor: "pointer" }}>
            <option value="">{t("no_game_custom_target")}</option>
            {selAccount !== null && getAccGameHistory(selAccount).length > 0 && (
              <optgroup label={t("account_history_group")}>
                {getAccGameHistory(selAccount).map(g => <option key={g.placeId} value={g.placeId} title={g.name}>{g.name}</option>)}
              </optgroup>
            )}
            {recentGames.filter(g => selAccount === null || !getAccGameHistory(selAccount).some(h => h.placeId === g.placeId)).length > 0 && (
              <optgroup label={t("all_recent_games_group")}>
                {recentGames.filter(g => selAccount === null || !getAccGameHistory(selAccount).some(h => h.placeId === g.placeId)).map(g => <option key={g.placeId} value={g.placeId} title={g.name}>{g.name}</option>)}
              </optgroup>
            )}
          </select>
            {/* Clear game selection */}
            {launchPlaceId && (
              <button onClick={() => { setLaunchPlaceId(""); setAccessCode(""); localStorage.removeItem("reiya_last_place_id"); }}
                title="Clear game selection"
                style={{ flexShrink: 0, height: 32, width: 32, borderRadius: 7, border: "1px solid var(--g06)", background: "var(--g03)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                ×
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em", marginBottom: 3 }}>{t("place_id")}</div>
            <div style={{ display: "flex", gap: 4 }}>
            <input value={launchPlaceId} onChange={e => { setLaunchPlaceId(e.target.value); localStorage.setItem("reiya_last_place_id", e.target.value); setLaunchError(""); }} placeholder="7882829745"
              className="field glass-input" style={{ flex: 1, height: 28, fontSize: 10.5, padding: "0 9px" }} />
            <button onClick={onPastePlaceId} title="Paste from clipboard"
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 6, border: "1px solid var(--g06)", background: "var(--g03)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
              📋
            </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em", marginBottom: 3 }}>{t("job_id")}</div>
            <input value={jobId} onChange={e => setJobId(e.target.value)} placeholder="server UUID..."
              className="field glass-input" style={{ height: 28, fontSize: 10.5, padding: "0 9px" }} />
          </div>
          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.06em", marginBottom: 3 }}>{t("access_code")}</div>
            <input value={accessCode} onChange={e => onAccessCodeChange(e.target.value)} placeholder={t("private_server")}
              className="field glass-input" style={{ height: 28, fontSize: 10.5, padding: "0 9px" }} />
          </div>
        </div>
        {/* Feature 8: Quick Repeat row */}
        {launchHistory.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.05em", flexShrink: 0 }}>REPEAT:</span>
            {launchHistory.map((h, i) => {
              const accExists = accounts.find(a => a.user_id === h.userId);
              return (
                <button key={i} onClick={() => {
                  if (accExists) {
                    setSelAccount(h.userId);
                    localStorage.setItem("reiya_last_account", String(h.userId));
                  }
                  if (h.placeId) {
                    setLaunchPlaceId(h.placeId);
                    localStorage.setItem("reiya_last_place_id", h.placeId);
                  }
                  setTimeout(() => document.dispatchEvent(new CustomEvent("reiya-launch-shortcut")), 50);
                }}
                title={`@${h.username} · ${h.gameName || h.placeId}`}
                style={{ padding: "2px 8px", borderRadius: 99, border: "1px solid var(--g08)", background: "var(--g03)", color: "var(--t2)", fontSize: 9, fontWeight: 700, cursor: "pointer", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  @{h.username} · {h.gameName || h.placeId || "App"}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", flexShrink: 0, minWidth: 0 }}>
          {selAccount !== null && (() => {
            const acc = accounts.find(a => a.user_id === selAccount);
            if (!acc) return null;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 7, background: "var(--g03)", border: "1px solid var(--g06)", maxWidth: 185, overflow: "hidden" }}>
                  {acc.avatar_url
                    ? <img src={acc.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--surface-3)", fontSize: 8, fontWeight: 700, color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{acc.username.slice(0, 2).toUpperCase()}</div>
                  }
                  <span style={{ fontSize: 10.5, fontWeight: 750, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.display_name || acc.username}</span>
                  {selectedAccountIsActive && <AlertTriangleIcon size={10} color="var(--red)" />}
                  {/* Feature 4: Quick re-validate button */}
                  <button
                    onClick={e => { e.stopPropagation(); onReValidate(acc.user_id); }}
                    title="Re-validate cookie"
                    disabled={reValidating}
                    style={{ flexShrink: 0, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--g08)", background: "transparent", color: reValidating ? "var(--t3)" : "var(--t2)", fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
                    {reValidating ? <LoaderIcon size={8} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheckIcon size={8} />}
                  </button>
                </div>
                {/* Feature 7: Account notes */}
                {acc.notes && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: 185, marginTop: 1 }}>
                    <span style={{ fontSize: 8, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.05em", flexShrink: 0 }}>NOTE</span>
                    <div style={{ fontSize: 10, color: "var(--t2)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "var(--g04)", borderRadius: 4, padding: "1px 6px", border: "1px solid var(--g07)" }}>
                      {acc.notes}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {launchError && <div style={{ fontSize: 10, color: "var(--red)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{launchError}</div>}
          <div style={{ display: "flex", gap: 12, marginLeft: "auto", alignItems: "center", flexShrink: 0 }}>
            {multiSelected.size > 0 && (
              <button onClick={onLaunchMultiple} disabled={launching}
                className="btn glow-btn"
                title={`Launch ${multiSelected.size} selected accounts into the same game`}
                style={{ padding: "7px 14px", borderRadius: 7, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 5, background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)", cursor: launching ? "not-allowed" : "pointer", opacity: launching ? 0.5 : 1 }}>
                <PlayIcon size={11} color="#A78BFA" /> Launch {multiSelected.size} Selected
              </button>
            )}
            <button onClick={onLaunchApp} disabled={launching || selAccount === null || accounts.length === 0}
              className="btn btn-ghost glow-btn"
              style={{ padding: "7px 12px", borderRadius: 7, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 5, opacity: selAccount === null || accounts.length === 0 ? 0.4 : 1, cursor: selAccount === null ? "not-allowed" : "pointer" }}>
              <MonitorIcon size={11} /> {t("app")}
            </button>
            <button onClick={onLaunch} disabled={launching || selAccount === null || accounts.length === 0}
              className="btn glow-btn"
              style={{ padding: "7px 18px", borderRadius: 7, fontSize: 11.5, fontWeight: 900, letterSpacing: "0.05em", background: launching || selAccount === null ? "var(--g04)" : "linear-gradient(135deg, #FFFFFF 0%, #E0E0E0 100%)", color: launching || selAccount === null ? "var(--t3)" : "#07080a", border: launching || selAccount === null ? "1px solid var(--g06)" : "none", cursor: launching || selAccount === null ? "not-allowed" : "pointer", opacity: selAccount === null || accounts.length === 0 ? 0.4 : 1, boxShadow: launching || selAccount === null ? "none" : "0 4px 18px var(--g18)", display: "flex", alignItems: "center", gap: 6 }}
              onMouseEnter={e => { if (!launching && selAccount !== null) e.currentTarget.style.filter = "brightness(1.06)"; }}
              onMouseLeave={e => { if (!launching && selAccount !== null) e.currentTarget.style.filter = "none"; }}>
              {launching
                ? <><LoaderIcon size={11} style={{ animation: "spin 1s linear infinite" }} /> {t("launching_suffix")}</>
                : <><PlayIcon size={11} color="#07080a" /> {t("launch")}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
