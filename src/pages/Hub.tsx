import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CATALOG, SEISEN_LOADER_SCRIPT } from "../data/catalog";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import {
  StarIcon, CheckIcon, SearchIcon, CopyIcon, TerminalIcon, ActivityIcon, ZapIcon, XIcon,
} from "../components/Icons";

/* ── Types ── */
interface Game {
  placeId: string;
  name: string;
  category: string;
  description: string;
  status: "Supported" | "Discontinued";
  isFavorite: boolean;
}

const EXECUTOR_SCRIPT = `loadstring(game:HttpGet("https://api.junkie-development.de/api/v1/luascripts/public/8ac2e97282ac0718aeeb3bb3856a2821d71dc9e57553690ab508ebdb0d1569da/download"))()`;

const CAT_COLOR: Record<string, string> = {
  Anime:     "#E879F9",
  RPG:       "#60A5FA",
  Shooter:   "#F87171",
  Simulator: "#34D399",
  Strategy:  "var(--accent)",
  Tycoon:    "#FB923C",
};

const CATEGORIES = ["All", "Anime", "RPG", "Shooter", "Simulator", "Strategy", "Tycoon"];
type StatusFilter = "All" | "Supported" | "Discontinued";

/* ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── */
export default function Hub() {
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>(() =>
    CATALOG.map(g => ({ ...g, isFavorite: false as boolean }))
  );
  const [thumbnails,    setThumbnails]    = useState<Record<string, string>>({});
  const [thumbsLoading, setThumbsLoading] = useState(true);

  const [search,          setSearch]          = useState("");
  const [category,        setCategory]        = useState("All");
  const [statusFilter,    setStatusFilter]    = useState<StatusFilter>("All");
  const [favOnly,         setFavOnly]         = useState(false);
  const [execCopied,      setExecCopied]      = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>(() => localStorage.getItem("reiya_last_place_id") || "");

  useEffect(() => {
    const placeIds = CATALOG.map(g => g.placeId);
    invoke<Record<string, string>>("fetch_thumbnails", { placeIds })
      .then(map => setThumbnails(map))
      .catch(() => {})
      .finally(() => setThumbsLoading(false));
  }, []);

  const visible = useMemo(() => games.filter(g => {
    const q = search.toLowerCase();
    return (
      (!q || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)) &&
      (category === "All" || g.category === category) &&
      (statusFilter === "All" || g.status === statusFilter) &&
      (!favOnly || g.isFavorite)
    );
  }), [games, search, category, statusFilter, favOnly]);

  const toggleFav = useCallback((placeId: string) =>
    setGames(prev => prev.map(g => g.placeId === placeId ? { ...g, isFavorite: !g.isFavorite } : g)),
  []);

  const copyExecutor = async () => {
    try { await writeText(EXECUTOR_SCRIPT); } catch { navigator.clipboard?.writeText(EXECUTOR_SCRIPT); }
    setExecCopied(true);
    setTimeout(() => setExecCopied(false), 2000);
  };

  const supported = CATALOG.filter(g => g.status === "Supported").length;
  const favCount  = games.filter(g => g.isFavorite).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div style={{
        padding: "18px 24px 14px",
        borderBottom: "1px solid var(--g04)",
        background: "var(--g01)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}>

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ActivityIcon size={13} color="var(--green)" />
              </div>
              <h1 style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.06em", color: "var(--t1)", margin: 0 }}>
                SEISEN HUB
              </h1>
            </div>
            <span style={{
              fontSize: 8.5, fontWeight: 800, color: "var(--green)",
              background: "rgba(52,211,153,0.1)", padding: "2px 8px",
              borderRadius: 99, letterSpacing: "0.1em",
              border: "1px solid rgba(52,211,153,0.2)",
            }}>{t("live").toUpperCase()}</span>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: 10 }}>
            <StatPill value={String(CATALOG.length)} label={t("all")} />
            <StatPill value={String(supported)} label={t("supported")} color="var(--green)" />
            <StatPill value={String(favCount)} label={t("favorites_tab")} color="var(--amber)" />
          </div>
        </div>

        {/* Executor bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--g02)",
          border: "1px solid var(--g05)",
          borderRadius: 12, padding: "10px 14px", marginBottom: 14,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: "var(--g12)", border: "1px solid var(--g25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <TerminalIcon size={12} color="var(--amber)" />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
            color: "var(--amber)", flexShrink: 0,
          }}>SCRIPT</span>
          <code style={{
            flex: 1, fontSize: 10, color: "var(--t3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          }}>{EXECUTOR_SCRIPT}</code>
          <button
            onClick={copyExecutor}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8, border: "none", flexShrink: 0,
              background: execCopied ? "rgba(52,211,153,0.12)" : "var(--g04)",
              color: execCopied ? "var(--green)" : "var(--t1)",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseEnter={e => { if (!execCopied) e.currentTarget.style.background = "var(--g07)"; }}
            onMouseLeave={e => { if (!execCopied) e.currentTarget.style.background = "var(--g04)"; }}
          >
            {execCopied
              ? <><CheckIcon size={11} color="var(--green)" /><span>{t("copied")}</span></>
              : <><CopyIcon size={11} color="var(--t2)" /><span>{t("copy")}</span></>
            }
          </button>
        </div>

        {/* Search + status filter row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <SearchIcon size={13} color="var(--t3)" style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
            }} />
            <input
              style={{
                width: "100%", paddingLeft: 32, paddingRight: 12,
                padding: "8px 12px 8px 32px",
                background: "var(--g02)",
                border: "1px solid var(--g05)",
                borderRadius: 10, color: "var(--t1)", fontSize: 12, outline: "none",
                transition: "border-color .15s",
              }}
              placeholder={t("search_games")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--g05)"}
            />
          </div>

          {/* Favorites toggle */}
          <button
            onClick={() => setFavOnly(f => !f)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, fontSize: 11, fontWeight: 700,
              border: favOnly ? "1px solid var(--g35)" : "1px solid var(--g05)",
              background: favOnly ? "var(--g08)" : "var(--g02)",
              color: favOnly ? "var(--amber)" : "var(--t3)",
              cursor: "pointer", transition: "all .15s",
            }}
          >
            <StarIcon size={11} fill={favOnly ? "var(--amber)" : "none"} color={favOnly ? "var(--amber)" : "var(--t3)"} />
            {t("favorites_tab")}
          </button>

          {/* Status segmented control */}
          <div style={{
            display: "flex",
            background: "var(--g02)",
            border: "1px solid var(--g05)",
            borderRadius: 10, padding: 3,
          }}>
            {(["All", "Supported", "Discontinued"] as StatusFilter[]).map(s => {
              const active = statusFilter === s;
              const color = s === "Supported" ? "var(--green)" : s === "Discontinued" ? "var(--red)" : "var(--t1)";
              return (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  padding: "5px 12px", borderRadius: 8,
                  background: active ? "var(--g06)" : "transparent",
                  color: active ? color : "var(--t3)",
                  border: "none", fontSize: 11, fontWeight: active ? 700 : 500,
                  cursor: "pointer", transition: "all .1s", whiteSpace: "nowrap",
                }}>
                  {s === "Supported" ? t("supported") : s === "Discontinued" ? t("discontinued") : t("all")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map(cat => {
            const active = category === cat;
            const color  = CAT_COLOR[cat];
            return (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 13px", borderRadius: 99,
                border: active && color ? `1px solid ${color}60` : "1px solid var(--g05)",
                background: active ? (color ? color + "18" : "var(--g06)") : "var(--g02)",
                color: active ? (color ?? "var(--t1)") : "var(--t3)",
                fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
                transition: "all .12s",
              }}>
                {color && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: active ? color : "var(--t3)",
                    flexShrink: 0,
                  }} />
                )}
                {cat === "All" ? t("all") : cat}
              </button>
            );
          })}
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--t3)", fontWeight: 600 }}>
            {visible.length} {t("games").toLowerCase()}
          </span>
        </div>
      </div>

      {/* ── Game grid ── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "14px 18px 20px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))",
        gap: 12,
        alignContent: "start",
        background: "radial-gradient(circle at top right, rgba(52,211,153,0.02) 0%, transparent 60%)",
      }}>
        {visible.length === 0 ? (
          <div style={{
            gridColumn: "1 / -1", marginTop: 60,
            textAlign: "center", padding: "40px 20px",
            color: "var(--t3)", fontSize: 12.5,
            border: "1px dashed var(--g06)", borderRadius: 16,
          }}>
            {t("no_games_match_filters")}
          </div>
        ) : visible.map(game => (
          <GameCard
            key={game.placeId}
            game={game}
            thumbnail={thumbnails[game.placeId]}
            thumbLoading={thumbsLoading}
            isSelected={selectedPlaceId === game.placeId}
            onToggleFav={() => toggleFav(game.placeId)}
            onSelectForLaunch={() => {
              localStorage.setItem("reiya_last_place_id", game.placeId);
              setSelectedPlaceId(game.placeId);
              toast.success(`Selected "${game.name}" for Home launch!`);
            }}
            onGoHome={() => navigate("/")}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Expandable Game Card ── */
function GameCard({ game, thumbnail, thumbLoading, isSelected, onToggleFav, onSelectForLaunch, onGoHome }: {
  game: Game;
  thumbnail?: string;
  thumbLoading: boolean;
  isSelected?: boolean;
  onToggleFav: () => void;
  onSelectForLaunch: () => void;
  onGoHome: () => void;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const catColor = CAT_COLOR[game.category] ?? "#888";
  const isActive = game.status === "Supported";
  const layoutId = `expandable-game-card-${game.placeId}`;

  const copyScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await writeText(SEISEN_LOADER_SCRIPT);
      setCopiedScript(true);
      toast.success("Copied Seisen Hub script!");
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      toast.error("Failed to copy script");
    }
  };

  return (
    <>
      <motion.div
        layoutId={layoutId}
        onClick={() => setIsOpen(true)}
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--g02)",
          border: `1px solid ${isSelected ? "var(--green)" : "var(--g05)"}`,
          boxShadow: isSelected
            ? "0 0 14px rgba(52,211,153,0.3)"
            : "0 4px 14px rgba(0,0,0,.3)",
          cursor: "pointer",
        }}
        whileHover={{ y: -4, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
      >
        {/* Selected Badge */}
        {isSelected && (
          <span style={{
            position: "absolute", top: 8, left: 8, zIndex: 20,
            fontSize: 8.5, fontWeight: 900, letterSpacing: "0.05em",
            padding: "3px 8px", borderRadius: 6,
            background: "var(--green)", color: "#000",
            boxShadow: "0 2px 8px rgba(52,211,153,0.5)",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <CheckIcon size={9} color="#000" strokeWidth={3} /> Selected
          </span>
        )}

        {/* Favorite Button */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFav(); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: 8, zIndex: 20,
            background: game.isFavorite ? "rgba(232,232,232,.3)" : "rgba(0,0,0,.55)",
            border: `1px solid ${game.isFavorite ? "rgba(232,232,232,.6)" : "rgba(255,255,255,.15)"}`,
            color: game.isFavorite ? "var(--amber)" : "rgba(255,255,255,.5)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(6px)",
            transition: "all .12s",
          }}
        >
          <StarIcon size={14} fill={game.isFavorite ? "var(--amber)" : "none"} color={game.isFavorite ? "var(--amber)" : "rgba(255,255,255,.5)"} />
        </button>

        {/* Image Container */}
        <motion.div layoutId={`image-container-${layoutId}`} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          {thumbnail ? (
            <motion.img
              layoutId={`image-${layoutId}`}
              src={thumbnail}
              alt={game.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : thumbLoading ? (
            <div className="skeleton" style={{ width: "100%", height: "100%" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "var(--surface-3)" }} />
          )}
        </motion.div>

        {/* Bottom Banner Title Overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.4) 50%, transparent 100%)`,
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          padding: "10px 12px",
          zIndex: 10,
        }}>
          <span style={{
            alignSelf: "flex-start", fontSize: 8.5, fontWeight: 800, letterSpacing: "0.05em",
            padding: "2px 7px", borderRadius: 5, marginBottom: 4,
            background: catColor + "CC", color: "#fff", backdropFilter: "blur(4px)",
          }}>
            {game.category.toUpperCase()}
          </span>
          <motion.h3 layoutId={`title-${layoutId}`} style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", lineHeight: 1.2, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {game.name}
          </motion.h3>
        </div>
      </motion.div>

      {/* Expanded Modal View */}
      <AnimatePresence>
        {isOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
            />

            {/* Modal Card */}
            <motion.div
              layoutId={layoutId}
              style={{
                position: "relative",
                width: "100%", maxWidth: 520,
                borderRadius: 20, overflow: "hidden",
                background: "var(--modal-bg)",
                border: "1px solid var(--modal-border)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.75)",
                zIndex: 10, display: "flex", flexDirection: "column",
                maxHeight: "90vh",
              }}
            >
              {/* Close Button */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  position: "absolute", top: 12, right: 12, zIndex: 30,
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(8px)", transition: "all .12s",
                }}
              >
                <XIcon size={14} color="#fff" />
              </button>

              {/* Expanded Header Image */}
              <motion.div layoutId={`image-container-${layoutId}`} style={{ position: "relative", height: 230, width: "100%", flexShrink: 0, overflow: "hidden" }}>
                {thumbnail ? (
                  <motion.img
                    layoutId={`image-${layoutId}`}
                    src={thumbnail}
                    alt={game.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "var(--surface-3)" }} />
                )}
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--modal-bg) 0%, transparent 70%)" }} />
              </motion.div>

              {/* Modal Body */}
              <div style={{ padding: "20px 24px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em",
                    padding: "3px 10px", borderRadius: 6,
                    background: catColor + "25", color: catColor,
                    border: `1px solid ${catColor}45`,
                  }}>
                    {game.category.toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 800,
                    padding: "3px 10px", borderRadius: 6,
                    background: isActive ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                    color: isActive ? "var(--green)" : "var(--red)",
                    border: `1px solid ${isActive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                  }}>
                    {isActive ? t("supported") : t("discontinued")}
                  </span>
                </div>

                <motion.h3 layoutId={`title-${layoutId}`} style={{ fontSize: 20, fontWeight: 900, color: "var(--t1)", margin: 0, letterSpacing: "-0.3px" }}>
                  {game.name}
                </motion.h3>

                <p style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5, margin: 0 }}>
                  {game.description}
                </p>

                {/* Details Box */}
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--g03)", border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--t3)" }}>
                    <span>Roblox Place ID:</span>
                    <span style={{ fontFamily: "monospace", color: "var(--t1)", fontWeight: 700 }}>{game.placeId}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--t3)" }}>
                    <span>Script Status:</span>
                    <span style={{ color: isActive ? "var(--green)" : "var(--red)", fontWeight: 800 }}>{game.status}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (isSelected) {
                        setIsOpen(false);
                        onGoHome();
                      } else {
                        onSelectForLaunch();
                      }
                    }}
                    style={{
                      flex: 1, padding: "10px 16px", borderRadius: 10, border: "none",
                      background: isSelected ? "var(--green)" : "var(--accent)",
                      color: isSelected ? "#000" : "var(--accent-text)",
                      fontSize: 12, fontWeight: 800, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      boxShadow: "0 4px 14px rgba(0,0,0,0.3)", transition: "filter .12s",
                    }}
                  >
                    {isSelected ? (
                      <>
                        <CheckIcon size={13} color="#000" strokeWidth={3} />
                        <span>Selected · Go to Home ➔</span>
                      </>
                    ) : (
                      <>
                        <ZapIcon size={13} />
                        <span>Select for Home Launch</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={copyScript}
                    style={{
                      padding: "10px 16px", borderRadius: 10,
                      border: "1px solid var(--g08)", background: "var(--g04)",
                      color: copiedScript ? "var(--green)" : "var(--t1)",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6, transition: "all .12s",
                    }}
                  >
                    {copiedScript ? <CheckIcon size={13} color="var(--green)" /> : <CopyIcon size={13} />}
                    <span>{copiedScript ? "Copied Script" : "Copy Script"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* â”€â”€ Stat Pill â”€â”€ */
function StatPill({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{
      padding: "6px 16px", borderRadius: 10,
      background: "var(--g02)",
      border: "1px solid var(--g05)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: color ?? "var(--t1)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 3, letterSpacing: "0.06em", fontWeight: 700 }}>
        {label.toUpperCase()}
      </div>
    </div>
  );
}

