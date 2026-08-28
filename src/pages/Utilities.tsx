import { useLanguage } from "../context/LanguageContext";
import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, Transition } from "motion/react";
import { useSavedGames } from "../context/SavedGamesContext";
import { Toggle } from "./Home";
import {
  SettingsIcon, SearchIcon, LockIcon, GamepadIcon, StarIcon, XIcon,
  TrashIcon, LoaderIcon, RefreshIcon, ServerIcon, ClockIcon, ActivityIcon,
  ChevronRightIcon, PlayIcon,
} from "../components/Icons";

/* ── Types ── */
interface SessionRecord {
  username: string;
  user_id: number;
  avatar_url: string;
  game_name: string;
  place_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

interface RobloxGameResult {
  name: string;
  place_id: number;
  universe_id: number;
  creator_name: string;
  icon_url: string;
}

interface RobloxServerEntry {
  job_id: string;
  playing: string;
  active_players: number;
  max_players: number;
  ping: string;
  fps: string;
}

/** Unified shape every list in this page renders — a pinned game, a recently
 * played one, a history entry, or a live search result all normalize to this
 * before they hit <GridContainer> or the detail panel. */
interface GameItem {
  placeId: string;
  name: string;
  creator: string;
  iconUrl: string;
  privateServer?: string;
}

const springConfig: Transition = { type: "spring", stiffness: 200, damping: 20, mass: 1.1 };

function pingColor(ping: string): string {
  const n = parseInt(ping) || 999;
  if (n < 80)  return "var(--green)";
  if (n < 150) return "var(--amber)";
  return "var(--red)";
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Utilities() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const { savedGames: favorites, isSaved, toggleSaved, setPrivateServer: persistPrivateServer } = useSavedGames();
  const [recentGames, setRecentGames] = useState<GameItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const [multiInstanceActive, setMultiInstanceActive] = useState(true);

  const [query, setQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<GameItem[]>([]);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState<GameItem | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [loadingServers, setLoadingServers] = useState(false);
  const [servers, setServers] = useState<RobloxServerEntry[]>([]);
  const [serverError, setServerError] = useState("");
  const [serverRefreshTick, setServerRefreshTick] = useState(0);

  const [psEditing, setPsEditing] = useState(false);
  const [psInput, setPsInput] = useState("");

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ placeId: string; name: string } | null>(null);

  /* ── Load ── */
  useEffect(() => {
    async function load() {
      const [hist, multiActive, recents] = await Promise.all([
        invoke<SessionRecord[]>("get_session_history").catch(() => []),
        invoke<boolean>("get_multi_instance").catch(() => true),
        invoke<GameItem[]>("get_recent_games").catch(() => []),
      ]);
      setSessionHistory(hist);
      setMultiInstanceActive(multiActive);
      setRecentGames(recents);

      if (location.state && typeof location.state === "object") {
        const state = location.state as { placeId?: string; jobId?: string };
        if (state.placeId) setQuery(state.placeId);
      }
    }
    load();

    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await listen("session-status-changed", () => {
        invoke<SessionRecord[]>("get_session_history").then(setSessionHistory).catch(() => {});
        invoke<GameItem[]>("get_recent_games").then(setRecentGames).catch(() => {});
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, [location.state]);

  const historyItems = useMemo<GameItem[]>(() => {
    const seen = new Set<string>();
    const list: GameItem[] = [];
    for (const r of sessionHistory) {
      if (r.place_id && !seen.has(r.place_id)) {
        seen.add(r.place_id);
        list.push({ placeId: r.place_id, name: r.game_name, creator: `@${r.username}`, iconUrl: thumbnails[r.place_id] || "" });
      }
    }
    return list;
  }, [sessionHistory, thumbnails]);

  /* ── Thumbnails ── */
  useEffect(() => {
    const ids = new Set<string>();
    for (const r of sessionHistory) { if (r.place_id) ids.add(r.place_id); }
    for (const f of favorites) { if (f.placeId) ids.add(f.placeId); }
    for (const rg of recentGames) {
      if (rg.placeId && (!rg.iconUrl || rg.iconUrl.includes("game_cover_placeholder.png"))) ids.add(rg.placeId);
    }
    if (ids.size > 0) {
      invoke<Record<string, string>>("fetch_place_thumbnails", { placeIds: Array.from(ids) })
        .then(map => setThumbnails(prev => ({ ...prev, ...map }))).catch(() => {});
    }
  }, [sessionHistory, favorites, recentGames]);

  /* ── Live search (debounced) ── */
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSearchResults([]); setSearchError(""); setLoadingSearch(false); return; }
    setLoadingSearch(true); setSearchError("");
    const handle = setTimeout(async () => {
      try {
        // A raw place ID/URL resolves directly instead of going through search.
        const idMatch = q.match(/\d{6,}/);
        if (/^\d+$/.test(q) || (idMatch && idMatch[0] === q)) {
          const placeId = Number(idMatch ? idMatch[0] : q);
          const details = await invoke<RobloxGameResult>("fetch_place_details", { placeId }).catch(() => null);
          setSearchResults(details
            ? [{ placeId: String(details.place_id), name: details.name, creator: details.creator_name, iconUrl: details.icon_url }]
            : [{ placeId: String(placeId), name: `Place ${placeId}`, creator: "Unknown", iconUrl: "" }]);
        } else {
          const results = await invoke<RobloxGameResult[]>("search_roblox_games", { keyword: q });
          setSearchResults(results.map(g => ({ placeId: String(g.place_id), name: g.name, creator: g.creator_name, iconUrl: g.icon_url })));
          if (results.length === 0) setSearchError(t("no_accounts_match"));
        }
      } catch (e) { setSearchError(String(e)); }
      finally { setLoadingSearch(false); }
    }, 320);
    return () => clearTimeout(handle);
  }, [query, t]);

  /* ── Selecting a game loads its servers ── */
  useEffect(() => {
    if (!selected) { setServers([]); setServerError(""); return; }
    setSelectedJobId(null);
    setPsEditing(false);
    setPsInput(selected.privateServer || "");
    setLoadingServers(true); setServerError(""); setServers([]);
    invoke<RobloxServerEntry[]>("fetch_active_servers", { placeId: Number(selected.placeId) })
      .then(list => {
        setServers(list);
        if (list.length === 0) setServerError(`No active public servers found for Place ID ${selected.placeId}.`);
      })
      .catch(e => setServerError(String(e)))
      .finally(() => setLoadingServers(false));
  }, [selected?.placeId, serverRefreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleMultiInstance = async () => {
    const nextState = !multiInstanceActive;
    try {
      await invoke("set_multi_instance", { active: nextState });
      setMultiInstanceActive(nextState);
    } catch (e) { alert(`Failed to set multi-instance status: ${String(e)}`); }
  };

  const handleSelect = (g: GameItem) => {
    setSelected(g);
  };

  const handleLaunch = async () => {
    if (!selected) return;
    await invoke("add_recent_game", { placeId: selected.placeId }).catch(() => {});
    navigate("/", { state: { placeId: selected.placeId, jobId: selectedJobId || "" } });
  };

  const handleSavePrivateServer = async () => {
    if (!selected) return;
    const trimmed = psInput.trim();
    const value = trimmed === "" ? null : trimmed;
    try {
      await invoke("set_private_server", { placeId: selected.placeId, privateServer: value });
      if (isSaved(selected.placeId)) persistPrivateServer(selected.placeId, value);
      setSelected(prev => prev ? { ...prev, privateServer: value || undefined } : prev);
      const recents = await invoke<GameItem[]>("get_recent_games").catch(() => []);
      setRecentGames(recents);
      setPsEditing(false);
    } catch (err) { alert("Failed to save private server: " + err); }
  };

  const handleConfirmDeleteGame = async () => {
    if (!deleteConfirmModal) return;
    const { placeId } = deleteConfirmModal;
    try {
      await invoke("remove_recent_game", { placeId });
      const recents = await invoke<GameItem[]>("get_recent_games").catch(() => []);
      setRecentGames(recents);
      if (selected?.placeId === placeId) setSelected(null);
      setDeleteConfirmModal(null);
    } catch (err) { alert("Failed to remove game: " + err); }
  };

  const groups: { id: string; title: string; Icon: typeof StarIcon; dotColor: string; items: GameItem[]; emptyText: string }[] = [
    { id: "pinned", title: t("favorites_tab"), Icon: StarIcon, dotColor: "#FBBF24", items: favorites, emptyText: t("no_favorites_desc") },
    { id: "recent", title: "Recently Played", Icon: ClockIcon, dotColor: "#FCD34D", items: recentGames, emptyText: t("no_recent_games") },
    { id: "history", title: t("recent_history"), Icon: ActivityIcon, dotColor: "#60A5FA", items: historyItems, emptyText: t("no_recent_games") },
  ];

  const searching = query.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: "18px 24px",
        borderBottom: "1px solid var(--g04)",
        background: "linear-gradient(180deg, var(--g02) 0%, var(--g01) 100%)",
        backdropFilter: "blur(12px)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            background: "var(--g04)", border: "1px solid var(--g08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <GamepadIcon size={17} color="var(--t1)" />
          </div>
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 900, color: "var(--t1)", letterSpacing: "0.02em", margin: 0 }}>
              {t("game_browser_title")}
            </h1>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.06em", marginTop: 3 }}>
              PICK A GAME · REVIEW ITS SERVERS · LAUNCH
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", borderRadius: 12,
            background: "var(--g02)", border: "1px solid var(--g05)",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: multiInstanceActive ? "var(--green)" : "var(--t3)",
              boxShadow: multiInstanceActive ? "0 0 6px var(--green)" : "none",
            }} />
            <Toggle label={t("multi_instance_label")} value={multiInstanceActive} onChange={handleToggleMultiInstance} />
          </div>

          <button
            onClick={() => navigate("/settings")}
            style={{
              background: "var(--g02)", border: "1px solid var(--g05)",
              borderRadius: 10, cursor: "pointer", color: "var(--t3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--t1)"; e.currentTarget.style.background = "var(--g05)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.background = "var(--g02)"; }}
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT: master list (left) + detail panel (right) ── */}
      <div style={{
        flex: 1, padding: "18px 22px", display: "flex", gap: 16,
        overflow: "hidden", minHeight: 0,
        background: "radial-gradient(circle at top right, var(--g02) 0%, transparent 60%)",
      }}>

        {/* LEFT — search + collapsible groups */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            background: "var(--g02)", border: "1px solid var(--g05)",
            borderRadius: 12, padding: "9px 12px", flexShrink: 0,
          }}>
            <SearchIcon size={13} color="var(--t3)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("search_games_placeholder")}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--t1)", fontSize: 12 }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", display: "flex" }}>
                <XIcon size={12} />
              </button>
            )}
          </div>

          <div className="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
            {searching ? (
              <GridContainer
                title="Search Results"
                Icon={SearchIcon}
                dotColor="#A78BFA"
                items={searchResults}
                loading={loadingSearch}
                errorText={searchError}
                selectedPlaceId={selected?.placeId}
                onSelect={handleSelect}
                alwaysExpanded
              />
            ) : (
              groups.map(g => (
                <GridContainer
                  key={g.id}
                  title={g.title}
                  Icon={g.Icon}
                  dotColor={g.dotColor}
                  items={g.items}
                  emptyText={g.emptyText}
                  selectedPlaceId={selected?.placeId}
                  onSelect={handleSelect}
                  onRemoveHistoryItem={g.id === "history" ? (placeId, name) => setDeleteConfirmModal({ placeId, name }) : undefined}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — detail panel */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          background: "var(--g01)", border: "1px solid var(--g05)", borderRadius: 16,
          overflow: "hidden",
        }}>
          {!selected ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--g03)", border: "1px solid var(--g06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GamepadIcon size={20} color="var(--t3)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t2)", marginBottom: 4 }}>{t("no_item_selected")}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", maxWidth: 280, lineHeight: 1.5 }}>
                  Search for a game or pick one from Pinned, Recently Played, or History on the left.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Banner */}
              <div style={{ position: "relative", height: 130, flexShrink: 0, background: "var(--g03)" }}>
                {selected.iconUrl || thumbnails[selected.placeId] ? (
                  <img src={selected.iconUrl || thumbnails[selected.placeId]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.55)" }} />
                ) : null}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 30%, var(--g01))" }} />
                <div style={{ position: "absolute", left: 20, bottom: 14, right: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{selected.creator} · PID {selected.placeId}</div>
                  </div>
                  <button
                    onClick={() => toggleSaved(selected)}
                    title={isSaved(selected.placeId) ? t("unfavorite") : t("favorite")}
                    style={{
                      flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                      background: isSaved(selected.placeId) ? "rgba(251,191,36,0.9)" : "rgba(0,0,0,0.5)",
                      border: `1px solid ${isSaved(selected.placeId) ? "rgba(251,191,36,0.6)" : "rgba(255,255,255,0.18)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    <StarIcon size={15} fill={isSaved(selected.placeId) ? "#000" : "none"} color={isSaved(selected.placeId) ? "#000" : "#fff"} />
                  </button>
                </div>
              </div>

              <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>

                {/* Private server */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.08em" }}>
                      <LockIcon size={11} color={selected.privateServer ? "var(--amber)" : "var(--t3)"} />
                      PRIVATE SERVER
                    </div>
                    {!psEditing && (
                      <button onClick={() => { setPsEditing(true); setPsInput(selected.privateServer || ""); }} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                        {selected.privateServer ? "Edit" : "Add"}
                      </button>
                    )}
                  </div>
                  {psEditing ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        autoFocus
                        className="field glass-input"
                        value={psInput}
                        onChange={e => setPsInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSavePrivateServer(); if (e.key === "Escape") setPsEditing(false); }}
                        placeholder="https://www.roblox.com/share?code=...&type=Server"
                        style={{ flex: 1, padding: "8px 12px", fontSize: 11.5 }}
                      />
                      <ModalBtn label={t("cancel")} onClick={() => setPsEditing(false)} small />
                      <ModalBtn label={t("save_settings")} onClick={handleSavePrivateServer} primary small />
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: selected.privateServer ? "var(--t2)" : "var(--t3)", fontFamily: selected.privateServer ? "monospace" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selected.privateServer || t("private_server_clear_desc")}
                    </div>
                  )}
                </div>

                {/* Live servers */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.08em" }}>
                      <ServerIcon size={11} />
                      LIVE SERVERS {servers.length > 0 && <span style={{ color: "var(--amber)" }}>· {servers.length}</span>}
                    </div>
                    <button
                      onClick={() => setServerRefreshTick(n => n + 1)}
                      title="Refresh"
                      style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", display: "flex" }}
                    >
                      <RefreshIcon size={12} style={{ animation: loadingServers ? "spin 1s linear infinite" : "none" }} />
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--g02)", border: "1px solid var(--g05)", borderRadius: 12 }}>
                    {loadingServers ? (
                      <EmptyState icon={<LoaderIcon size={14} style={{ animation: "spin 1s linear infinite" }} />} text="Scanning servers…" compact />
                    ) : serverError ? (
                      <EmptyState icon={<ActivityIcon size={14} color="var(--red)" />} text={serverError} tone="red" compact />
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--g05)", textAlign: "left" }}>
                            {[t("job_id_guid_header"), t("players_header"), t("ping_header"), t("fps_header")].map((h, i) => (
                              <th key={h} style={{ padding: "8px 12px", color: "var(--t3)", fontWeight: 800, fontSize: 9, letterSpacing: "0.08em", textAlign: i > 0 ? "right" : "left", width: i > 0 ? 70 : undefined }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {servers.map(srv => {
                            const rowSelected = selectedJobId === srv.job_id;
                            const pc = pingColor(srv.ping);
                            return (
                              <tr
                                key={srv.job_id}
                                onClick={() => setSelectedJobId(rowSelected ? null : srv.job_id)}
                                style={{ borderBottom: "1px solid var(--g03)", background: rowSelected ? "var(--g05)" : "transparent", cursor: "pointer" }}
                              >
                                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 10, color: rowSelected ? "var(--amber)" : "var(--t2)", fontWeight: rowSelected ? 700 : 400 }}>{srv.job_id}</td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "var(--t1)" }}>{srv.playing}</td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: pc }}>{srv.ping}ms</td>
                                <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--t2)" }}>{srv.fps}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* Launch bar */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--g04)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 10.5, color: "var(--t3)" }}>
                  {selectedJobId ? <>Joining server <span style={{ color: "var(--amber)", fontFamily: "monospace" }}>{selectedJobId.slice(0, 12)}…</span></> : "Launches into a new server"}
                </div>
                <button
                  onClick={handleLaunch}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 22px", borderRadius: 11, border: "none",
                    background: "var(--accent)", color: "#0a0a0a",
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                    boxShadow: "0 4px 16px var(--g25)", transition: "filter .12s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.08)"}
                  onMouseLeave={e => e.currentTarget.style.filter = "none"}
                >
                  <PlayIcon size={13} color="#0a0a0a" />
                  {t("use_selected_btn")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteConfirmModal && (
        <Modal onClose={() => setDeleteConfirmModal(null)}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--red)", marginBottom: 10 }}>{t("remove_game")}</div>
          <div style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.6, marginBottom: 22 }}>
            {t("remove_game_confirm_desc")}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <ModalBtn label={t("cancel")} onClick={() => setDeleteConfirmModal(null)} />
            <ModalBtn label={t("remove_game").split(" ")[0]} onClick={handleConfirmDeleteGame} danger />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Collapsible group ("Collection Grid Disclosure") ──
 * Collapsed: a 2×2 preview of the group's own game thumbnails, its title and
 * count, and a chevron. Expanded: the same icons fly (shared layoutId) into a
 * vertical list of full rows. Each group manages its own open/closed state
 * independently, same as a real accordion of cards. */
function GridContainer({
  title, Icon, dotColor, items, emptyText, loading, errorText,
  selectedPlaceId, onSelect, onRemoveHistoryItem, alwaysExpanded,
}: {
  title: string; Icon: typeof StarIcon; dotColor: string;
  items: GameItem[]; emptyText?: string; loading?: boolean; errorText?: string;
  selectedPlaceId?: string; onSelect: (g: GameItem) => void;
  onRemoveHistoryItem?: (placeId: string, name: string) => void;
  alwaysExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(!!alwaysExpanded);
  const preview = items.slice(0, 4);

  return (
    <motion.div
      layout
      transition={springConfig}
      style={{
        borderRadius: 14, overflow: "hidden",
        background: "var(--g02)", border: "1px solid var(--g05)",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: 10 }}>
        {!isExpanded ? (
          <div
            onClick={() => items.length > 0 && !alwaysExpanded && setIsExpanded(true)}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: items.length > 0 ? "pointer" : "default" }}
          >
            {preview.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, width: 34, height: 34, flexShrink: 0 }}>
                {preview.map(it => (
                  <div
                    key={it.placeId}
                    style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: "var(--g05)", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {it.iconUrl ? <img src={it.iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GamepadIcon size={9} color="var(--t3)" />}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 4 - preview.length) }).map((_, i) => (
                  <div key={i} style={{ width: "100%", height: "100%", borderRadius: "50%", background: "var(--g03)" }} />
                ))}
              </div>
            ) : (
              <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: "var(--g03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={14} color={dotColor} />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)" }}>{title}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>
                {items.length} {items.length === 1 ? "item" : "items"}
              </div>
            </div>

            {items.length > 0 && <ChevronRightIcon size={15} color="var(--t3)" />}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "0 2px 8px" }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--t1)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                {title}
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--t3)" }}>· {items.length}</span>
              </span>
              {!alwaysExpanded && (
                <button onClick={() => setIsExpanded(false)} style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--g05)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <XIcon size={10} color="var(--t2)" />
                </button>
              )}
            </div>

            {loading ? (
              <EmptyState icon={<LoaderIcon size={13} style={{ animation: "spin 1s linear infinite" }} />} text="Searching…" compact />
            ) : errorText ? (
              <EmptyState icon={<ActivityIcon size={13} color="var(--red)" />} text={errorText} tone="red" compact />
            ) : items.length === 0 ? (
              <EmptyState icon={<Icon size={14} color="var(--t3)" />} text={emptyText || "Nothing here yet."} compact />
            ) : (
              <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
                {items.map(it => {
                  const isSelected = selectedPlaceId === it.placeId;
                  return (
                    <div
                      key={it.placeId}
                      onClick={() => onSelect(it)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 10,
                        background: isSelected ? "var(--g05)" : "transparent", cursor: "pointer", transition: "background .1s",
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--g03)"; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", background: "var(--g05)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {it.iconUrl ? <img src={it.iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GamepadIcon size={13} color="var(--t3)" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: isSelected ? "var(--t1)" : "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                        <div style={{ fontSize: 9.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.creator}</div>
                      </div>
                      {onRemoveHistoryItem && (
                        <button
                          onClick={e => { e.stopPropagation(); onRemoveHistoryItem(it.placeId, it.name); }}
                          style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
                        >
                          <TrashIcon size={11} />
                        </button>
                      )}
                      <ChevronRightIcon size={13} color="var(--t3)" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Empty state ── */
function EmptyState({ icon, text, tone, compact }: { icon: React.ReactNode; text: string; tone?: "red"; compact?: boolean }) {
  return (
    <div style={{
      display: "flex", flexDirection: compact ? "row" : "column", alignItems: "center", justifyContent: "center",
      gap: compact ? 8 : 10, padding: compact ? "16px 14px" : "48px 24px", textAlign: compact ? "left" : "center",
    }}>
      <div style={{
        width: compact ? 26 : 40, height: compact ? 26 : 40, borderRadius: compact ? 8 : 12, flexShrink: 0,
        background: tone === "red" ? "rgba(248,113,113,0.08)" : "var(--g03)",
        border: `1px solid ${tone === "red" ? "rgba(248,113,113,0.18)" : "var(--g06)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <span style={{ fontSize: compact ? 11 : 12, color: tone === "red" ? "var(--red)" : "var(--t3)", maxWidth: compact ? undefined : 320, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ── Modal wrapper ── */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--modal-bg)",
        border: "1px solid var(--g08)", borderRadius: 18,
        padding: 26, width: 440, maxWidth: "92vw",
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalBtn({ label, onClick, primary, danger, small }: { label: string; onClick: () => void; primary?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: small ? undefined : 1, padding: small ? "8px 14px" : "10px 0", borderRadius: 10, fontSize: small ? 11 : 12, fontWeight: 800,
        cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap",
        border: primary ? "none" : danger ? "1px solid rgba(248,113,113,0.3)" : "1px solid var(--g07)",
        background: primary
          ? "var(--accent)"
          : danger ? "rgba(248,113,113,0.1)" : "var(--g03)",
        color: primary ? "#0a0a0a" : danger ? "var(--red)" : "var(--t2)",
        boxShadow: primary ? "0 4px 14px var(--g25)" : "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
    >
      {label}
    </button>
  );
}
