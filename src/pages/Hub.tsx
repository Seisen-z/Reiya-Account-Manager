import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CATALOG, SEISEN_LOADER_SCRIPT, type GameEntry } from "../data/catalog";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { useSavedGames } from "../context/SavedGamesContext";
import { GameIcon } from "../components/GameIcon";
import {
  CheckIcon, SearchIcon, CopyIcon, TerminalIcon, ActivityIcon, XIcon, PinIcon, PlayIcon,
} from "../components/Icons";

const EXECUTOR_SCRIPT = `loadstring(game:HttpGet("https://api.junkie-development.de/api/v1/luascripts/public/8ac2e97282ac0718aeeb3bb3856a2821d71dc9e57553690ab508ebdb0d1569da/download"))()`;

const CAT_COLOR: Record<string, string> = {
  Anime:     "#E879F9",
  RPG:       "#60A5FA",
  Shooter:   "#F87171",
  Simulator: "#34D399",
  Strategy:  "var(--accent)",
  Tycoon:    "#FB923C",
  Other:     "#94A3B8",
};

const CATEGORIES = ["All", "Anime", "RPG", "Shooter", "Simulator", "Strategy", "Tycoon", "Other"];
type StatusFilter = "All" | "Supported" | "Archived";

async function copyText(text: string) {
  try { await writeText(text); } catch { await navigator.clipboard?.writeText(text); }
}

/* ────────────────────────────────────────────────────────────── */
export default function Hub() {
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const { isSaved, toggleSaved, savedGames } = useSavedGames();
  const [thumbnails,    setThumbnails]    = useState<Record<string, string>>({});
  const [thumbsLoading, setThumbsLoading] = useState(true);

  const [search,       setSearch]       = useState("");
  const [category,     setCategory]     = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Supported");
  const [pinnedOnly,   setPinnedOnly]   = useState(false);
  const [execCopied,   setExecCopied]   = useState(false);
  const [openGame,     setOpenGame]     = useState<GameEntry | null>(null);
  const selectedPlaceId = localStorage.getItem("reiya_last_place_id") || "";

  useEffect(() => {
    // Icons are looked up by universe ID; store them by place ID like the rest of the app
    invoke<Record<string, string>>("fetch_thumbnails", { placeIds: CATALOG.map(g => g.universeId) })
      .then(byUniverse => {
        const byPlace: Record<string, string> = {};
        for (const g of CATALOG) if (byUniverse[g.universeId]) byPlace[g.placeId] = byUniverse[g.universeId];
        setThumbnails(byPlace);
      })
      .catch(() => {})
      .finally(() => setThumbsLoading(false));
  }, []);

  const matchesBase = (g: GameEntry) => {
    const q = search.trim().toLowerCase();
    return (!q || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
      && (category === "All" || g.category === category)
      && (!pinnedOnly || isSaved(g.placeId));
  };
  const statusOf = (g: GameEntry): StatusFilter => g.status === "Supported" ? "Supported" : "Archived";

  const visible = useMemo(
    () => CATALOG.filter(g => matchesBase(g) && (statusFilter === "All" || statusOf(g) === statusFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, category, statusFilter, pinnedOnly, savedGames],
  );
  // Counts for the status tabs, respecting the other filters
  const statusCounts = useMemo(() => {
    const base = CATALOG.filter(matchesBase);
    return { All: base.length, Supported: base.filter(g => statusOf(g) === "Supported").length, Archived: base.filter(g => statusOf(g) === "Archived").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, pinnedOnly, savedGames]);

  const supported = CATALOG.filter(g => g.status === "Supported").length;
  const pinnedCount = CATALOG.filter(g => isSaved(g.placeId)).length;

  const copyExecutor = async () => {
    await copyText(EXECUTOR_SCRIPT);
    setExecCopied(true);
    setTimeout(() => setExecCopied(false), 2000);
  };

  const togglePin = (g: GameEntry) => {
    const wasPinned = isSaved(g.placeId);
    toggleSaved({ placeId: g.placeId, name: g.name, creator: "", iconUrl: thumbnails[g.placeId] || "" });
    toast.success(wasPinned ? `Unpinned "${g.name}"` : `Pinned "${g.name}" — it's now on your Home page`);
  };

  const playOnHome = (g: GameEntry) => {
    localStorage.setItem("reiya_last_place_id", g.placeId);
    navigate("/", { state: { placeId: g.placeId } });
  };

  const resetFilters = () => { setSearch(""); setCategory("All"); setStatusFilter("All"); setPinnedOnly(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--g04)", background: "var(--g01)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Title + stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ActivityIcon size={17} color="var(--green)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--t1)", margin: 0 }}>Seisen Hub</h1>
            <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 3 }}>{t("hubp_subtitle")}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <Pill>{CATALOG.length} {t("hubp_games")}</Pill>
            <Pill tone="green">{supported} {t("supported").toLowerCase()}</Pill>
            {pinnedCount > 0 && <Pill tone="amber"><PinIcon size={10} color="#FBBF24" fill="#FBBF24" /> {pinnedCount} {t("hubp_pinned").toLowerCase()}</Pill>}
          </div>
        </div>

        {/* Loader script */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--g02)", border: "1px solid var(--g05)", borderRadius: 12, padding: "8px 8px 8px 12px" }}>
          <TerminalIcon size={13} color="var(--amber)" />
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--t2)", flexShrink: 0 }}>{t("hubp_loader")}</span>
          <code title={EXECUTOR_SCRIPT} style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
            {EXECUTOR_SCRIPT}
          </code>
          <button
            onClick={copyExecutor}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 14px", borderRadius: 8, border: "none", flexShrink: 0,
              background: execCopied ? "rgba(52,211,153,0.14)" : "var(--accent)", color: execCopied ? "var(--green)" : "var(--accent-text, #0a0a0a)",
              fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {execCopied ? <><CheckIcon size={12} color="var(--green)" /> {t("copied")}</> : <><CopyIcon size={12} /> {t("copy")}</>}
          </button>
        </div>

        {/* Search + filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <SearchIcon size={13} color="var(--t3)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              style={{ width: "100%", height: 34, padding: "0 30px 0 32px", background: "var(--g02)", border: "1px solid var(--g06)", borderRadius: 10, color: "var(--t1)", fontSize: 12, outline: "none" }}
              placeholder={t("search_games")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--g06)"}
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search"
                style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                <XIcon size={12} color="var(--t3)" />
              </button>
            )}
          </div>

          <button
            onClick={() => setPinnedOnly(f => !f)}
            aria-pressed={pinnedOnly}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
              border: `1px solid ${pinnedOnly ? "rgba(251,191,36,0.5)" : "var(--g06)"}`,
              background: pinnedOnly ? "rgba(251,191,36,0.12)" : "var(--g02)",
              color: pinnedOnly ? "#FBBF24" : "var(--t3)", cursor: "pointer",
            }}
          >
            <PinIcon size={11} fill={pinnedOnly ? "#FBBF24" : "none"} color={pinnedOnly ? "#FBBF24" : "var(--t3)"} />
            {t("hubp_pinned")}
          </button>

          <div style={{ display: "flex", background: "var(--g02)", border: "1px solid var(--g06)", borderRadius: 10, padding: 3 }}>
            {(["Supported", "Archived", "All"] as StatusFilter[]).map(s => {
              const active = statusFilter === s;
              return (
                <button key={s} aria-pressed={active} onClick={() => setStatusFilter(s)} style={{
                  padding: "5px 12px", borderRadius: 8, border: "none", fontFamily: "inherit",
                  background: active ? "var(--g08)" : "transparent",
                  color: active ? (s === "Supported" ? "var(--green)" : "var(--t1)") : "var(--t3)",
                  fontSize: 11.5, fontWeight: active ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  {s === "Supported" ? t("supported") : s === "Archived" ? t("hub_archived") : t("all")}
                  <span style={{ marginLeft: 5, opacity: 0.55, fontSize: 10 }}>{statusCounts[s]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Categories */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map(cat => {
            const active = category === cat;
            const color = CAT_COLOR[cat];
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", borderRadius: 99, fontFamily: "inherit",
                border: active && color ? `1px solid ${color}70` : `1px solid ${active ? "var(--g20)" : "var(--g05)"}`,
                background: active ? (color ? color + "1A" : "var(--g08)") : "transparent",
                color: active ? (color ?? "var(--t1)") : "var(--t3)",
                fontSize: 11.5, fontWeight: active ? 800 : 600, cursor: "pointer",
              }}>
                {color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? color : "var(--t3)" }} />}
                {cat === "All" ? t("all") : cat}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>
            {t("hubp_showing").replace("{n}", String(visible.length))}
          </span>
        </div>
      </div>

      {/* ── Game grid ── */}
      <div className="scroll" style={{
        flex: 1, overflowY: "auto", padding: "16px 22px 24px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14, alignContent: "start",
      }}>
        {visible.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", marginTop: 40, textAlign: "center", padding: "44px 20px", color: "var(--t3)", fontSize: 12.5, border: "1px dashed var(--g08)", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {pinnedOnly && pinnedCount === 0 ? t("hubp_no_pinned") : t("no_games_match_filters")}
            <button onClick={resetFilters} className="btn btn-ghost" style={{ padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 800 }}>{t("accp_reset_filters")}</button>
          </div>
        ) : visible.map(game => (
          <HubCard
            key={game.placeId}
            game={game}
            thumbnail={thumbnails[game.placeId]}
            thumbLoading={thumbsLoading}
            isSelected={selectedPlaceId === game.placeId}
            isPinned={isSaved(game.placeId)}
            onOpen={() => setOpenGame(game)}
            onTogglePin={() => togglePin(game)}
            onPlay={() => playOnHome(game)}
          />
        ))}
      </div>

      {/* ── Game details ── */}
      <AnimatePresence>
        {openGame && (
          <GameDetails
            game={openGame}
            thumbnail={thumbnails[openGame.placeId]}
            isPinned={isSaved(openGame.placeId)}
            onClose={() => setOpenGame(null)}
            onTogglePin={() => togglePin(openGame)}
            onPlay={() => { setOpenGame(null); playOnHome(openGame); }}
            onCopyScript={async () => { await copyText(SEISEN_LOADER_SCRIPT); toast.success(t("hubp_script_copied")); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Game card ── */
function HubCard({ game, thumbnail, thumbLoading, isSelected, isPinned, onOpen, onTogglePin, onPlay }: {
  game: GameEntry; thumbnail?: string; thumbLoading: boolean; isSelected: boolean; isPinned: boolean;
  onOpen: () => void; onTogglePin: () => void; onPlay: () => void;
}) {
  const { t } = useLanguage();
  const [hov, setHov] = useState(false);
  const catColor = CAT_COLOR[game.category] ?? "#888";
  const supported = game.status === "Supported";

  return (
    <motion.div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={`${game.name} — ${t("hubp_card_tip")}`}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      style={{ cursor: "pointer", minWidth: 0 }}
    >
      <div style={{
        position: "relative", aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden", background: "var(--g02)",
        border: `2px solid ${isSelected ? "var(--green)" : hov ? "var(--g12)" : "var(--g05)"}`,
        boxShadow: isSelected ? "0 0 16px rgba(52,211,153,0.3)" : hov ? "0 10px 24px rgba(0,0,0,0.35)" : "none",
        transition: "border-color .15s, box-shadow .15s",
      }}>
        {thumbLoading && !thumbnail
          ? <div className="skeleton" style={{ width: "100%", height: "100%" }} />
          : <GameIcon placeId={game.placeId} urls={[thumbnail]} placeholderSize={30} style={{ filter: supported ? "none" : "grayscale(0.7) brightness(0.8)" }} />}

        {/* Badges */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4, zIndex: 5 }}>
          {isSelected && (
            <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 7px", borderRadius: 6, background: "var(--green)", color: "#000", display: "flex", alignItems: "center", gap: 3 }}>
              <CheckIcon size={9} color="#000" strokeWidth={3} /> {t("hubp_on_home")}
            </span>
          )}
          {!supported && (
            <span
              title={game.status === "Discontinued" ? t("hubp_discontinued_tip") : t("hubp_not_listed_tip")}
              style={{ fontSize: 9, fontWeight: 900, padding: "3px 7px", borderRadius: 6, background: game.status === "Discontinued" ? "rgba(248,113,113,0.85)" : "rgba(0,0,0,0.7)", color: game.status === "Discontinued" ? "#fff" : "var(--t2)" }}
            >
              {game.status === "Discontinued" ? t("discontinued") : t("hubp_not_listed")}
            </span>
          )}
        </div>

        {/* Pin */}
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(); }}
          title={isPinned ? t("acc_unpin") : t("hubp_pin_tip")}
          aria-label={isPinned ? t("acc_unpin") : t("hubp_pin_tip")}
          style={{
            position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 9, zIndex: 6,
            background: isPinned ? "rgba(251,191,36,0.95)" : "rgba(0,0,0,0.55)",
            border: `1px solid ${isPinned ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.15)"}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)",
            opacity: hov || isPinned ? 1 : 0, transition: "opacity .12s",
          }}
        >
          <PinIcon size={13} fill={isPinned ? "#000" : "none"} color={isPinned ? "#000" : "#fff"} />
        </button>

        {/* Hover: play */}
        {hov && supported && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4 }}>
            <button
              onClick={e => { e.stopPropagation(); onPlay(); }}
              title={t("hubp_play_on_home_tip")}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 99, border: "none", background: "rgba(255,255,255,0.95)", color: "#07080a", fontSize: 12, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", fontFamily: "inherit" }}
            >
              <PlayIcon size={11} color="#07080a" /> {t("hubp_play")}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, padding: "0 2px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 10.5, fontWeight: 700, color: catColor }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: catColor }} />
          {game.category}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Details popup ── */
function GameDetails({ game, thumbnail, isPinned, onClose, onTogglePin, onPlay, onCopyScript }: {
  game: GameEntry; thumbnail?: string; isPinned: boolean;
  onClose: () => void; onTogglePin: () => void; onPlay: () => void; onCopyScript: () => void;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const catColor = CAT_COLOR[game.category] ?? "#888";
  const supported = game.status === "Supported";
  const availability = supported ? t("supported") : game.status === "Not listed" ? t("hub_unlisted") : t("discontinued");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={game.name}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        style={{
          position: "relative", width: "100%", maxWidth: 500, borderRadius: 20, overflow: "hidden",
          background: "var(--modal-bg)", border: "1px solid var(--modal-border)", boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column", maxHeight: "90vh",
        }}
      >
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 12, right: 12, zIndex: 3, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <XIcon size={14} color="#fff" />
        </button>

        <div style={{ position: "relative", height: 200, flexShrink: 0 }}>
          <GameIcon placeId={game.placeId} urls={[thumbnail]} placeholderSize={40} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--modal-bg) 0%, transparent 70%)" }} />
        </div>

        <div style={{ padding: "4px 24px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 10px", borderRadius: 6, background: catColor + "25", color: catColor, border: `1px solid ${catColor}45` }}>{game.category}</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: supported ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)", color: supported ? "var(--green)" : "var(--red)", border: `1px solid ${supported ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}` }}>{availability}</span>
          </div>

          <h3 style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", margin: 0, letterSpacing: "-0.3px" }}>{game.name}</h3>
          <p style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.55, margin: 0 }}>{game.description}</p>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 13px", borderRadius: 10, background: "var(--g03)", border: "1px solid var(--g05)", fontSize: 11.5, color: "var(--t3)" }}>
            <span>Place ID</span>
            <span style={{ fontFamily: "monospace", color: "var(--t1)", fontWeight: 700 }}>{game.placeId}</span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <button
              onClick={onPlay}
              style={{ flex: "1 1 160px", height: 40, borderRadius: 11, border: "none", background: "var(--accent)", color: "var(--accent-text, #0a0a0a)", fontSize: 12.5, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit" }}
            >
              <PlayIcon size={12} /> {t("hubp_play_on_home")}
            </button>
            <button
              onClick={onTogglePin}
              style={{ height: 40, padding: "0 14px", borderRadius: 11, border: `1px solid ${isPinned ? "rgba(251,191,36,0.45)" : "var(--g08)"}`, background: isPinned ? "rgba(251,191,36,0.12)" : "var(--g04)", color: isPinned ? "#FBBF24" : "var(--t1)", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
            >
              <PinIcon size={12} fill={isPinned ? "#FBBF24" : "none"} color={isPinned ? "#FBBF24" : "currentColor"} /> {isPinned ? t("hubp_pinned_btn") : t("hubp_pin")}
            </button>
            {supported && (
              <button
                onClick={async () => { await onCopyScript(); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{ height: 40, padding: "0 14px", borderRadius: 11, border: "1px solid var(--g08)", background: "var(--g04)", color: copied ? "var(--green)" : "var(--t1)", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}
              >
                {copied ? <CheckIcon size={12} color="var(--green)" /> : <CopyIcon size={12} />} {copied ? t("copied") : t("hubp_copy_script")}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Small pill ── */
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" }) {
  const c = {
    neutral: { fg: "var(--t2)", bg: "var(--g03)", bd: "var(--g06)" },
    green:   { fg: "var(--green)", bg: "var(--green-dim)", bd: "rgba(52,211,153,0.25)" },
    amber:   { fg: "#FBBF24", bg: "rgba(251,191,36,0.1)", bd: "rgba(251,191,36,0.25)" },
  }[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", color: c.fg, background: c.bg, border: `1px solid ${c.bd}` }}>
      {children}
    </span>
  );
}
