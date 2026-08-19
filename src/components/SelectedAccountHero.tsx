import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  GamepadIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  LoaderIcon,
  PlayIcon,
  MonitorIcon,
  ClipboardIcon,
} from "./Icons";
import { Account, RecentGame } from "../pages/Home";
import Tooltip from "./ui/Tooltip";

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
    <div
      style={{
        display: "flex",
        height: 235,
        flexShrink: 0,
        background: "linear-gradient(180deg, var(--g01) 0%, rgba(12, 14, 18, 0.95) 100%)",
        borderBottom: "1px solid var(--g05)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background ambient lighting */}
      <div
        style={{
          position: "absolute",
          top: -40,
          right: 100,
          width: 300,
          height: 120,
          background: "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.03) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Game Thumbnail Card (Left side) */}
      <div
        style={{
          width: 205,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          borderRight: "1px solid var(--g05)",
          background: "var(--g02)",
        }}
      >
        {launchThumb ? (
          <>
            <img
              src={launchThumb}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transition: "transform 0.4s ease",
              }}
            />
            {/* Dark vignette overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 50%, rgba(8,9,12,0.96) 100%)",
              }}
            />
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "radial-gradient(circle at center, var(--g03) 0%, var(--g01) 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--g04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--g06)",
              }}
            >
              <GamepadIcon size={22} color="var(--t3)" />
            </div>
            <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700 }}>
              {t("no_game_selected")}
            </span>
          </div>
        )}

        {/* Selected Game Details Overlay */}
        <div style={{ position: "absolute", bottom: 12, left: 14, right: 14, zIndex: 2 }}>
          {launchGame ? (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 8.5,
                  fontWeight: 900,
                  color: "#fff",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                  textTransform: "uppercase",
                }}
              >
                TARGET GAME
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 850,
                  color: "#ffffff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  lineHeight: 1.25,
                }}
                title={launchGame.name}
              >
                {launchGame.name}
              </div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "rgba(255,255,255,0.6)",
                  fontWeight: 600,
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t("by")} <span style={{ color: "rgba(255,255,255,0.85)" }}>{launchGame.creator}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 600 }}>
              Select a game below to launch
            </div>
          )}
        </div>
      </div>

      {/* Launch Console Controls (Right side) */}
      <div
        style={{
          flex: 1,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Console Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ position: "relative", display: "flex", width: 7, height: 7 }}>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "#ffffff",
                  opacity: 0.6,
                  animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
                }}
              />
              <span style={{ position: "relative", width: 7, height: 7, borderRadius: "50%", background: "#ffffff", boxShadow: "0 0 8px #ffffff" }} />
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "var(--t1)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {t("launch_console")}
            </span>
          </div>

          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--t3)" }}>
            Roblox Client Manager
          </span>
        </div>

        {/* Dropdown Selector */}
        <div style={{ width: "100%", minWidth: 0, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={launchPlaceId}
              onChange={(e) => {
                const val = e.target.value;
                setLaunchPlaceId(val);
                localStorage.setItem("reiya_last_place_id", val);
                setLaunchError("");
                const game = accountGameOptions.find((g) => g.placeId === val);
                setAccessCode(game?.privateServer || "");
              }}
              className="field glass-input"
              style={{
                flex: 1,
                height: 34,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: 8,
                background: "var(--g02)",
                border: "1px solid var(--g06)",
                color: "var(--t1)",
                padding: "0 10px",
              }}
            >
              <option value="">{t("no_game_custom_target")}</option>
              {selAccount !== null && getAccGameHistory(selAccount).length > 0 && (
                <optgroup label={t("account_history_group")}>
                  {getAccGameHistory(selAccount).map((g) => (
                    <option key={g.placeId} value={g.placeId} title={g.name}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {recentGames.filter(
                (g) => selAccount === null || !getAccGameHistory(selAccount).some((h) => h.placeId === g.placeId)
              ).length > 0 && (
                <optgroup label={t("all_recent_games_group")}>
                  {recentGames
                    .filter(
                      (g) => selAccount === null || !getAccGameHistory(selAccount).some((h) => h.placeId === g.placeId)
                    )
                    .map((g) => (
                      <option key={g.placeId} value={g.placeId} title={g.name}>
                        {g.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>

            {launchPlaceId && (
              <Tooltip content="Clear game selection" position="top">
                <button
                  onClick={() => {
                    setLaunchPlaceId("");
                    setAccessCode("");
                    localStorage.removeItem("reiya_last_place_id");
                  }}
                  style={{
                    flexShrink: 0,
                    height: 34,
                    width: 34,
                    borderRadius: 8,
                    border: "1px solid var(--g06)",
                    background: "var(--g03)",
                    color: "var(--t2)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
                    e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                    e.currentTarget.style.color = "#ef4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--g03)";
                    e.currentTarget.style.borderColor = "var(--g06)";
                    e.currentTarget.style.color = "var(--t2)";
                  }}
                >
                  ×
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Inputs Grid: Place ID, Job ID, Access Code */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 8, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>
              {t("place_id")}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={launchPlaceId}
                onChange={(e) => {
                  setLaunchPlaceId(e.target.value);
                  localStorage.setItem("reiya_last_place_id", e.target.value);
                  setLaunchError("");
                }}
                placeholder="7882829745"
                className="field glass-input"
                style={{
                  flex: 1,
                  height: 30,
                  fontSize: 10.5,
                  padding: "0 9px",
                  borderRadius: 7,
                  background: "var(--g02)",
                  border: "1px solid var(--g05)",
                }}
              />
              <Tooltip content="Paste Place ID from clipboard" position="top">
                <button
                  onClick={onPastePlaceId}
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: "1px solid var(--g06)",
                    background: "var(--g03)",
                    color: "var(--t2)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--g05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--g03)")}
                >
                  <ClipboardIcon size={13} color="var(--t2)" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>
              {t("job_id")}
            </div>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="server UUID..."
              className="field glass-input"
              style={{
                height: 30,
                fontSize: 10.5,
                padding: "0 9px",
                borderRadius: 7,
                background: "var(--g02)",
                border: "1px solid var(--g05)",
                width: "100%",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>
              {t("access_code")}
            </div>
            <input
              value={accessCode}
              onChange={(e) => onAccessCodeChange(e.target.value)}
              placeholder={t("private_server")}
              className="field glass-input"
              style={{
                height: 30,
                fontSize: 10.5,
                padding: "0 9px",
                borderRadius: 7,
                background: "var(--g02)",
                border: "1px solid var(--g05)",
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* Feature 8: Quick Repeat Row */}
        {launchHistory.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", marginTop: 1 }}>
            <span style={{ fontSize: 8.5, color: "var(--t3)", fontWeight: 900, letterSpacing: "0.08em", flexShrink: 0 }}>
              RECENT:
            </span>
            {launchHistory.map((h, i) => {
              const accExists = accounts.find((a) => a.user_id === h.userId);
              return (
                <Tooltip key={i} content={`@${h.username} · ${h.gameName || h.placeId}`} position="top">
                  <button
                    onClick={() => {
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
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      border: "1px solid var(--g06)",
                      background: "var(--g02)",
                      color: "var(--t2)",
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                      maxWidth: 130,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--g08)";
                      e.currentTarget.style.color = "var(--t1)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--g06)";
                      e.currentTarget.style.color = "var(--t2)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    @{h.username} · {h.gameName || h.placeId || "App"}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Bottom Footer Row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto", flexShrink: 0, minWidth: 0 }}>
          {selAccount !== null && (() => {
            const acc = accounts.find((a) => a.user_id === selAccount);
            if (!acc) return null;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "5px 10px",
                    borderRadius: 8,
                    background: "var(--g02)",
                    border: "1px solid var(--g06)",
                    maxWidth: 200,
                    overflow: "hidden",
                  }}
                >
                  {acc.avatar_url ? (
                    <img
                      src={acc.avatar_url}
                      alt=""
                      style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: "var(--surface-3)",
                        fontSize: 9,
                        fontWeight: 800,
                        color: "var(--t2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {acc.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "var(--t1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acc.display_name || acc.username}
                  </span>

                  {selectedAccountIsActive && (
                    <Tooltip content="Warning: Account currently has an active Roblox session running" position="top">
                      <span style={{ display: "inline-flex", cursor: "pointer" }}>
                        <AlertTriangleIcon size={11} color="var(--red)" />
                      </span>
                    </Tooltip>
                  )}

                  <Tooltip content="Re-validate account cookie with Roblox" position="top">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReValidate(acc.user_id);
                      }}
                      disabled={reValidating}
                      style={{
                        flexShrink: 0,
                        padding: "2px 6px",
                        borderRadius: 5,
                        border: "1px solid var(--g07)",
                        background: "transparent",
                        color: reValidating ? "var(--t3)" : "var(--t2)",
                        fontSize: 9,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      {reValidating ? (
                        <LoaderIcon size={9} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <ShieldCheckIcon size={9} />
                      )}
                    </button>
                  </Tooltip>
                </div>

                {acc.notes && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: 200, marginTop: 1 }}>
                    <span style={{ fontSize: 8, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.05em", flexShrink: 0 }}>
                      NOTE
                    </span>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--t2)",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        background: "var(--g04)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        border: "1px solid var(--g07)",
                      }}
                    >
                      {acc.notes}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {launchError && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#f87171",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 6,
                padding: "4px 8px",
              }}
            >
              {launchError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginLeft: "auto", alignItems: "center", flexShrink: 0 }}>
            {multiSelected.size > 0 && (
              <button
                onClick={onLaunchMultiple}
                disabled={launching}
                className="btn glow-btn"
                title={`Launch ${multiSelected.size} selected accounts into the same game`}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(167,139,250,0.15)",
                  color: "#A78BFA",
                  border: "1px solid rgba(167,139,250,0.3)",
                  cursor: launching ? "not-allowed" : "pointer",
                  opacity: launching ? 0.5 : 1,
                }}
              >
                <PlayIcon size={11} color="#A78BFA" /> Launch {multiSelected.size} Selected
              </button>
            )}

            <button
              onClick={onLaunchApp}
              disabled={launching || selAccount === null || accounts.length === 0}
              className="btn btn-ghost glow-btn"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--g02)",
                border: "1px solid var(--g06)",
                color: "var(--t2)",
                opacity: selAccount === null || accounts.length === 0 ? 0.4 : 1,
                cursor: selAccount === null ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <MonitorIcon size={12} color="var(--t2)" /> {t("app")}
            </button>

            <button
              onClick={onLaunch}
              disabled={launching || selAccount === null || accounts.length === 0}
              className="btn glow-btn"
              style={{
                padding: "8px 22px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                background:
                  launching || selAccount === null
                    ? "var(--g04)"
                    : "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 100%)",
                color: launching || selAccount === null ? "var(--t3)" : "#07080a",
                border: launching || selAccount === null ? "1px solid var(--g06)" : "none",
                cursor: launching || selAccount === null ? "not-allowed" : "pointer",
                opacity: selAccount === null || accounts.length === 0 ? 0.4 : 1,
                boxShadow:
                  launching || selAccount === null
                    ? "none"
                    : "0 4px 16px rgba(255, 255, 255, 0.25), 0 2px 6px rgba(0, 0, 0, 0.4)",
                display: "flex",
                alignItems: "center",
                gap: 7,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!launching && selAccount !== null) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 22px rgba(255, 255, 255, 0.35), 0 2px 6px rgba(0, 0, 0, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!launching && selAccount !== null) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(255, 255, 255, 0.25), 0 2px 6px rgba(0, 0, 0, 0.4)";
                }
              }}
            >
              {launching ? (
                <>
                  <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} /> {t("launching_suffix")}
                </>
              ) : (
                <>
                  <PlayIcon size={12} color="#07080a" /> {t("launch")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
