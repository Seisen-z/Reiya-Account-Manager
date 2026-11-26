import { FC, useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  GamepadIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  LoaderIcon,
  PlayIcon,
  MonitorIcon,
  ClipboardIcon,
  SlidersIcon,
  ChevronRightIcon,
  XIcon,
} from "./Icons";
import { Account, RecentGame } from "../pages/Home";
import Tooltip from "./ui/Tooltip";
import { GameIcon } from "./GameIcon";

const labelStyle: React.CSSProperties = {
  fontSize: 9, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  height: 32, fontSize: 11, padding: "0 10px", borderRadius: 8,
  background: "var(--g02)", border: "1px solid var(--g06)", width: "100%",
};

/**
 * Bottom-docked launch bar: shows the chosen game + account and the Launch buttons.
 * Advanced fields (game list, Place ID, Job ID, private server code) live in an "Options" popover.
 */
export const LaunchBar: FC<{
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
  accounts: Account[];
  selectedAccountIsActive: boolean;
  reValidating: boolean;
  onReValidate: (userId: number) => void;
  launchError: string;
  multiSelected: Set<number>;
  onLaunchMultiple: () => void;
  launching: boolean;
  bulkLaunching: boolean;
  onLaunchApp: () => void;
  onLaunch: () => void;
}> = ({
  launchThumb, launchGame, launchPlaceId, setLaunchPlaceId,
  accountGameOptions, selAccount, getAccGameHistory, recentGames,
  accessCode, setAccessCode, setLaunchError, onPastePlaceId, jobId, setJobId, onAccessCodeChange,
  accounts, selectedAccountIsActive, reValidating, onReValidate,
  launchError, multiSelected, onLaunchMultiple, launching, bulkLaunching, onLaunchApp, onLaunch,
}) => {
  const { t } = useLanguage();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!optionsOpen) return;
    const close = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) setOptionsOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOptionsOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [optionsOpen]);

  const acc = selAccount !== null ? accounts.find(a => a.user_id === selAccount) : undefined;
  const placeId = launchPlaceId.trim();
  const gameTitle = launchGame?.name ?? (placeId ? `Place ${placeId}` : null);
  const canLaunch = !launching && !!acc;
  const accHistory = selAccount !== null ? getAccGameHistory(selAccount) : [];
  const otherRecent = recentGames.filter(g => !accHistory.some(h => h.placeId === g.placeId));
  const optionsSetCount = [jobId, accessCode].filter(v => v.trim()).length;

  const hint = launchError
    ? null
    : !acc
      ? t("home_step_pick_account")
      : !placeId
        ? t("home_bar_no_game_hint")
        : null;

  const clearGame = () => {
    setLaunchPlaceId("");
    setAccessCode("");
    localStorage.removeItem("reiya_last_place_id");
  };

  return (
    <div
      style={{
        flexShrink: 0, position: "relative", zIndex: 20,
        borderTop: "1px solid var(--glass-line)",
        background: "var(--panel-bg)",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {launchError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 20px",
          fontSize: 11, fontWeight: 700, color: "#f87171",
          background: "rgba(239, 68, 68, 0.1)", borderBottom: "1px solid rgba(239, 68, 68, 0.2)",
        }}>
          <AlertTriangleIcon size={12} color="#f87171" />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={launchError}>{launchError}</span>
          <button onClick={() => setLaunchError("")} aria-label="Dismiss error"
            style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 2 }}>
            <XIcon size={12} color="#f87171" />
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", minHeight: 76 }}>

        {/* Game */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 0" }}>
          <div style={{ width: 52, height: 52, borderRadius: 11, overflow: "hidden", flexShrink: 0, background: "var(--g03)", border: "1px solid var(--g06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/^\d+$/.test(placeId)
              ? <GameIcon placeId={placeId} urls={[launchThumb, launchGame?.iconUrl]} placeholderSize={22} />
              : <GamepadIcon size={22} color="var(--t3)" />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>{t("home_bar_game")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span title={gameTitle ?? undefined} style={{
                fontSize: 14, fontWeight: 850, lineHeight: 1.2,
                color: gameTitle ? "var(--t1)" : "var(--t3)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {gameTitle ?? t("home_bar_roblox_home")}
              </span>
              {placeId && (
                <Tooltip content="Clear game" position="top">
                  <button onClick={clearGame} aria-label="Clear game"
                    style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: "1px solid var(--g06)", background: "var(--g03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <XIcon size={9} color="var(--t2)" />
                  </button>
                </Tooltip>
              )}
            </div>
            {hint && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>}
            {!hint && launchGame?.creator && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("by")} {launchGame.creator}</div>}
          </div>
        </div>

        <ChevronRightIcon size={16} color="var(--g15)" className="lb-hide-narrow" />

        {/* Account */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 0" }}>
          {acc ? (
            <>
              {acc.avatar_url
                ? <img src={acc.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--g08)" }} />
                : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface-3)", fontSize: 12, fontWeight: 800, color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{acc.username.slice(0, 2).toUpperCase()}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>{t("home_playing_as")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {acc.display_name || acc.username}
                  </span>
                  {selectedAccountIsActive && (
                    <Tooltip content="This account already has Roblox running" position="top">
                      <span style={{ display: "inline-flex" }}><AlertTriangleIcon size={12} color="var(--red)" /></span>
                    </Tooltip>
                  )}
                  <Tooltip content="Re-check this account's login with Roblox" position="top">
                    <button onClick={e => { e.stopPropagation(); onReValidate(acc.user_id); }} disabled={reValidating} aria-label="Re-check login"
                      style={{ flexShrink: 0, padding: 2, border: "none", background: "transparent", color: "var(--t3)", cursor: "pointer", display: "flex" }}>
                      {reValidating ? <LoaderIcon size={11} style={{ animation: "spin 1s linear infinite" }} /> : <ShieldCheckIcon size={11} />}
                    </button>
                  </Tooltip>
                </div>
                {acc.notes
                  ? <div title={acc.notes} style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {acc.notes}</div>
                  : <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>@{acc.username}</div>}
              </div>
            </>
          ) : (
            <div>
              <div style={labelStyle}>{t("home_playing_as")}</div>
              <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 600 }}>{t("home_bar_no_account")}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div ref={optionsRef} style={{ position: "relative" }}>
            <Tooltip content={t("home_more_options_hint")} position="top">
              <button
                onClick={() => setOptionsOpen(v => !v)}
                aria-expanded={optionsOpen}
                className="btn btn-ghost glow-btn"
                style={{ padding: "10px 12px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, background: optionsOpen ? "var(--g06)" : undefined }}
              >
                <SlidersIcon size={13} /> <span className="lb-hide-narrow">{t("home_bar_options")}</span>
                {optionsSetCount > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 900, minWidth: 16, height: 16, borderRadius: 99, background: "#A78BFA", color: "#07080a", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                    {optionsSetCount}
                  </span>
                )}
              </button>
            </Tooltip>

            {optionsOpen && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: "absolute", bottom: "calc(100% + 10px)", right: 0, width: 380, zIndex: 9999,
                  background: "var(--modal-bg)", backdropFilter: "blur(16px)", border: "1px solid var(--modal-border)",
                  borderRadius: 14, padding: 16, boxShadow: "0 -12px 40px rgba(0,0,0,.45)",
                  display: "flex", flexDirection: "column", gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 850, color: "var(--t1)" }}>{t("home_more_options")}</span>
                  <button onClick={() => setOptionsOpen(false)} aria-label="Close"
                    style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "var(--g06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <XIcon size={11} color="var(--t1)" />
                  </button>
                </div>

                <div>
                  <div style={labelStyle}>{t("home_bar_game")}</div>
                  <select
                    value={launchPlaceId}
                    onChange={e => {
                      const val = e.target.value;
                      setLaunchPlaceId(val);
                      localStorage.setItem("reiya_last_place_id", val);
                      setLaunchError("");
                      const game = accountGameOptions.find(g => g.placeId === val);
                      setAccessCode(game?.privateServer || "");
                    }}
                    className="field glass-input"
                    style={{ ...inputStyle, cursor: "pointer", color: "var(--t1)" }}
                  >
                    <option value="">{t("no_game_custom_target")}</option>
                    {accHistory.length > 0 && (
                      <optgroup label={t("account_history_group")}>
                        {accHistory.map(g => <option key={g.placeId} value={g.placeId}>{g.name}</option>)}
                      </optgroup>
                    )}
                    {otherRecent.length > 0 && (
                      <optgroup label={t("all_recent_games_group")}>
                        {otherRecent.map(g => <option key={g.placeId} value={g.placeId}>{g.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>{t("place_id")}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={launchPlaceId}
                      onChange={e => {
                        setLaunchPlaceId(e.target.value);
                        localStorage.setItem("reiya_last_place_id", e.target.value);
                        setLaunchError("");
                      }}
                      placeholder="e.g. 7882829745"
                      className="field glass-input"
                      style={inputStyle}
                    />
                    <Tooltip content="Paste Place ID from clipboard" position="top">
                      <button onClick={onPastePlaceId} aria-label="Paste Place ID"
                        style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: "1px solid var(--g06)", background: "var(--g03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ClipboardIcon size={13} color="var(--t2)" />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={labelStyle}>{t("job_id")}</div>
                    <input value={jobId} onChange={e => setJobId(e.target.value)} placeholder="Specific server (optional)" className="field glass-input" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>{t("access_code")}</div>
                    <input value={accessCode} onChange={e => onAccessCodeChange(e.target.value)} placeholder={t("private_server")} className="field glass-input" style={inputStyle} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <Tooltip content="Open the Roblox app (home screen) without joining a game" position="top">
            <button
              onClick={onLaunchApp}
              disabled={!canLaunch}
              className="btn btn-ghost glow-btn"
              style={{ padding: "10px 12px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, opacity: canLaunch ? 1 : 0.45, cursor: canLaunch ? "pointer" : "not-allowed" }}
            >
              <MonitorIcon size={13} color="var(--t2)" /> <span className="lb-hide-narrow">{t("app")}</span>
            </button>
          </Tooltip>

          {multiSelected.size > 0 && (
            <button
              onClick={onLaunchMultiple}
              disabled={bulkLaunching}
              className="btn glow-btn"
              title={`Launch ${multiSelected.size} ticked accounts into the same game`}
              style={{
                padding: "10px 14px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6,
                background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)",
                cursor: bulkLaunching ? "not-allowed" : "pointer", opacity: bulkLaunching ? 0.5 : 1,
              }}
            >
              <PlayIcon size={11} color="#A78BFA" /> <span className="lb-hide-narrow">Launch</span> {multiSelected.size} <span className="lb-hide-narrow">selected</span>
            </button>
          )}

          <Tooltip content={t("home_launch_shortcut_tip")} position="top">
          <button
            onClick={onLaunch}
            disabled={!canLaunch}
            className="btn glow-btn halloween-primary"
            style={{
              padding: "12px 30px", borderRadius: 11, fontSize: 13.5, fontWeight: 900, letterSpacing: "0.04em",
              background: canLaunch ? "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 100%)" : "var(--g04)",
              color: canLaunch ? "#07080a" : "var(--t3)",
              border: canLaunch ? "none" : "1px solid var(--g06)",
              cursor: canLaunch ? "pointer" : "not-allowed",
              boxShadow: canLaunch ? "0 4px 18px rgba(255, 255, 255, 0.22), 0 2px 6px rgba(0, 0, 0, 0.4)" : "none",
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s ease",
            }}
          >
            {launching
              ? <><LoaderIcon size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("launching_suffix")}</>
              : <>
                  <PlayIcon size={14} color={canLaunch ? "#07080a" : "var(--t3)"} /> {t("launch")}
                  {canLaunch && (
                    <kbd className="lb-hide-narrow" style={{
                      marginLeft: 2, padding: "1px 5px", borderRadius: 4, fontSize: 10, fontWeight: 800, fontFamily: "inherit",
                      background: "rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.15)", color: "#07080a",
                    }}>↵</kbd>
                  )}
                </>}
          </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
