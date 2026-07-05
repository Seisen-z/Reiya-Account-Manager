import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import {
  SearchIcon, CopyIcon, CheckIcon, TerminalIcon, ActivityIcon,
  ChevronLeftIcon, ChevronRightIcon, ShieldCheckIcon, AlertTriangleIcon,
  LinkIcon, EyeOffIcon,
} from "../components/Icons";

/* ── Types ── */
interface RscriptRisk {
  score: number | null;
  level: string | null;
  isObfuscated: boolean;
  obfuscatorDetected: string | null;
}
interface RscriptGame {
  placeId?: string;
  title?: string;
  thumbnailUrl?: string | null;
  logoUrl?: string | null;
  robloxUrl?: string | null;
}
interface RscriptCreator {
  username: string;
  isVerified: boolean;
  isPro: boolean;
  avatarUrl?: string | null;
}
interface RscriptItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  views: number;
  likes: number;
  dislikes: number;
  rawScript: string;
  risk: RscriptRisk | null;
  game?: RscriptGame | null;
  creator?: RscriptCreator | null;
}
interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

type SortKey = "newest" | "oldest" | "most-views" | "least-views" | "most-likes" | "trending";
type ViewMode = "browse" | "trending";

const SORTS: { key: SortKey; labelKey: string }[] = [
  { key: "newest",      labelKey: "sort_newest" },
  { key: "oldest",      labelKey: "sort_oldest" },
  { key: "most-views",  labelKey: "sort_most_views" },
  { key: "least-views", labelKey: "sort_least_views" },
  { key: "most-likes",  labelKey: "sort_most_likes" },
  { key: "trending",    labelKey: "sort_trending" },
];

function riskColor(risk: RscriptRisk | null): string {
  if (!risk || risk.score == null) return "var(--t3)";
  if (risk.score <= 3) return "var(--green)";
  if (risk.score <= 6) return "var(--amber)";
  return "var(--red)";
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function buildExecutorSnippet(rawScript: string): string {
  return `loadstring(game:HttpGet("${rawScript}"))()`;
}

/* ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── */
export default function Rscripts() {
  const { t } = useLanguage();
  const toast = useToast();

  const [view, setView] = useState<ViewMode>("browse");

  // Browse state
  const [search, setSearch]     = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort]         = useState<SortKey>("newest");
  const [noKeySystem, setNoKeySystem] = useState(false);
  const [mobileOnly, setMobileOnly]   = useState(false);
  const [freeOnly, setFreeOnly]       = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [page, setPage]         = useState(1);

  const [scripts, setScripts]   = useState<RscriptItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Trending state
  const [rising, setRising]     = useState<RscriptItem[]>([]);
  const [trending, setTrending] = useState<RscriptItem[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError]     = useState<string | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, sort, noKeySystem, mobileOnly, freeOnly, verifiedOnly]);

  useEffect(() => {
    if (view !== "browse") return;
    const myRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    invoke<any>("fetch_rscripts", {
      query: debounced || undefined,
      sort,
      page,
      limit: 24,
      noKeySystem,
      mobileOnly,
      freeOnly,
      verifiedOnly,
    })
      .then(res => {
        if (myRequest !== requestId.current) return;
        const data = res?.data;
        if (Array.isArray(data)) {
          setScripts(data);
          setPagination(res?.meta ?? null);
        } else {
          setScripts(data?.scripts ?? []);
          setPagination(res?.meta?.pagination?.scripts ?? null);
        }
      })
      .catch(e => {
        if (myRequest !== requestId.current) return;
        setScripts([]);
        setPagination(null);
        setError(typeof e === "string" ? e : "Failed to load scripts");
      })
      .finally(() => {
        if (myRequest === requestId.current) setLoading(false);
      });
  }, [view, debounced, sort, page, noKeySystem, mobileOnly, freeOnly, verifiedOnly]);

  useEffect(() => {
    if (view !== "trending") return;
    setTrendLoading(true);
    setTrendError(null);
    invoke<any>("fetch_rscripts_trending")
      .then(res => {
        setRising(res?.data?.rising ?? []);
        setTrending(res?.data?.trending ?? []);
      })
      .catch(e => setTrendError(typeof e === "string" ? e : "Failed to load trending scripts"))
      .finally(() => setTrendLoading(false));
  }, [view]);

  const toggleFilter = useCallback((setter: (fn: (v: boolean) => boolean) => void) => {
    setter(v => !v);
  }, []);

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img src="/rscript-icon.svg" alt="" width={14} height={14} style={{ filter: "var(--logo-filter)", display: "block" }} />
            </div>
            <h1 style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.06em", color: "var(--t1)", margin: 0 }}>
              RSCRIPTS
            </h1>
            <span style={{
              fontSize: 8.5, fontWeight: 800, color: "var(--green)",
              background: "rgba(52,211,153,0.1)", padding: "2px 8px",
              borderRadius: 99, letterSpacing: "0.1em",
              border: "1px solid rgba(52,211,153,0.2)",
            }}>{t("live").toUpperCase()}</span>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 6, paddingLeft: 8, borderLeft: "1px solid var(--g05)" }}>
              <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>by xyba</span>
              <a href="https://rscripts.net" target="_blank" rel="noopener noreferrer" title="rscripts.net"
                style={{ display: "flex", color: "var(--t3)", transition: "color .12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#60A5FA"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
              >
                <LinkIcon size={12} />
              </a>
              <a href="https://discord.gg/gDPeg5VXp8" target="_blank" rel="noopener noreferrer" title="Discord"
                style={{ display: "flex", color: "var(--t3)", transition: "color .12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#5865F2"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
              >
                <DiscordIcon size={12} />
              </a>
              <a href="https://www.youtube.com/@rscripter" target="_blank" rel="noopener noreferrer" title="YouTube"
                style={{ display: "flex", color: "var(--t3)", transition: "color .12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#FF0000"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}
              >
                <YoutubeIcon size={12} />
              </a>
            </div>
          </div>

          {/* Browse / Trending tabs */}
          <div style={{
            display: "flex",
            background: "var(--g02)",
            border: "1px solid var(--g05)",
            borderRadius: 10, padding: 3,
          }}>
            {(["browse", "trending"] as ViewMode[]).map(v => {
              const active = view === v;
              return (
                <button key={v} onClick={() => setView(v)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", borderRadius: 8,
                  background: active ? "var(--g06)" : "transparent",
                  color: active ? "#60A5FA" : "var(--t3)",
                  border: "none", fontSize: 11, fontWeight: active ? 700 : 500,
                  cursor: "pointer", transition: "all .1s",
                }}>
                  {v === "trending" && <ActivityIcon size={11} color={active ? "#60A5FA" : "var(--t3)"} />}
                  {v === "browse" ? t("browse_tab") : t("trending_scripts")}
                </button>
              );
            })}
          </div>
        </div>

        {view === "browse" && (
          <>
            {/* Search + sort row */}
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
                  placeholder={t("search_scripts")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--g05)"}
                />
              </div>

              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                disabled={!!debounced}
                style={{
                  padding: "8px 12px", borderRadius: 10,
                  background: "var(--g02)", border: "1px solid var(--g05)",
                  color: "var(--t1)", fontSize: 11, fontWeight: 600, outline: "none",
                  cursor: debounced ? "not-allowed" : "pointer",
                  opacity: debounced ? 0.5 : 1,
                }}
              >
                {SORTS.map(s => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
              </select>
            </div>

            {/* Filter toggles */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <FilterChip active={noKeySystem}   label={t("no_key_system")} onClick={() => toggleFilter(setNoKeySystem)} />
              <FilterChip active={mobileOnly}     label={t("mobile_only")}   onClick={() => toggleFilter(setMobileOnly)} />
              <FilterChip active={freeOnly}       label={t("free_only")}     onClick={() => toggleFilter(setFreeOnly)} />
              <FilterChip active={verifiedOnly}   label={t("verified_only")} onClick={() => toggleFilter(setVerifiedOnly)} />
              {pagination && (
                <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--t3)", fontWeight: 600 }}>
                  {formatCount(pagination.total)} scripts
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Content ── */}
      {view === "browse" ? (
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
          background: "radial-gradient(circle at top right, rgba(96,165,250,0.02) 0%, transparent 60%)",
        }}>
          {loading ? (
            <SkeletonGrid />
          ) : error ? (
            <EmptyState message={error} isError />
          ) : scripts.length === 0 ? (
            <EmptyState message={t("no_scripts_match_filters")} />
          ) : (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 12,
              }}>
                {scripts.map(s => <ScriptCard key={s.id} script={s} toast={toast} t={t} />)}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
                  <PageButton disabled={!pagination.hasPrevPage} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronLeftIcon size={13} />
                  </PageButton>
                  <PageIsland page={pagination.page} totalPages={pagination.totalPages} onSelect={setPage} />
                  <PageButton disabled={!pagination.hasNextPage} onClick={() => setPage(p => p + 1)}>
                    <ChevronRightIcon size={13} />
                  </PageButton>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 18px 20px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          {trendLoading ? (
            <SkeletonGrid />
          ) : trendError ? (
            <EmptyState message={trendError} isError />
          ) : (
            <>
              <TrendingSection title={t("rising_scripts")} items={rising} toast={toast} t={t} />
              <TrendingSection title={t("trending_scripts")} items={trending} toast={toast} t={t} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Trending section ── */
function TrendingSection({ title, items, toast, t }: {
  title: string; items: RscriptItem[]; toast: ReturnType<typeof useToast>; t: (k: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--t2)", margin: "0 0 10px", textTransform: "uppercase" }}>
        {title}
      </h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {items.map(s => <ScriptCard key={s.id} script={s} toast={toast} t={t} />)}
      </div>
    </div>
  );
}

/* ── Script card ── */
function ScriptCard({ script, toast, t }: {
  script: RscriptItem; toast: ReturnType<typeof useToast>; t: (k: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const color = riskColor(script.risk);
  const scriptUrl = `https://rscripts.net/script/${script.slug}`;

  const copySnippet = async () => {
    const snippet = buildExecutorSnippet(script.rawScript);
    try { await writeText(snippet); } catch { navigator.clipboard?.writeText(snippet); }
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const thumb = script.game?.thumbnailUrl ?? script.game?.logoUrl ?? null;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "var(--g02)", border: "1px solid var(--g05)",
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "var(--g04)" }}>
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TerminalIcon size={22} color="var(--t3)" />
          </div>
        )}
        <div title={script.risk?.level ?? "Unscanned"} style={{
          position: "absolute", top: 8, right: 8,
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
          background: "rgba(10,10,12,0.72)", color, border: `1px solid ${color}55`,
          backdropFilter: "blur(4px)",
        }}>
          {script.risk?.isObfuscated ? <EyeOffIcon size={9} color={color} /> : <ShieldCheckIcon size={9} color={color} />}
          {script.risk?.level ?? "Unscanned"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: "var(--t1)", lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {script.title}
          </div>
          {script.creator && (
            <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
              {script.creator.username}
              {script.creator.isVerified && <CheckIcon size={9} color="#60A5FA" />}
            </div>
          )}
      </div>

      {script.description && (
        <p style={{
          fontSize: 11, color: "var(--t3)", lineHeight: 1.45, margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {script.description}
        </p>
      )}

      {script.game?.title && (
        <span style={{
          alignSelf: "flex-start",
          fontSize: 9.5, fontWeight: 700, color: "var(--t2)",
          background: "var(--g04)", padding: "3px 8px", borderRadius: 6,
        }}>
          {script.game.title}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: "var(--t3)" }}>
        <span>👁 {formatCount(script.views)}</span>
        <span>👍 {formatCount(script.likes)}</span>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button
          onClick={copySnippet}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 10px", borderRadius: 8, border: "none",
            background: copied ? "rgba(52,211,153,0.12)" : "var(--g04)",
            color: copied ? "var(--green)" : "var(--t1)",
            fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all .15s",
          }}
        >
          {copied ? <CheckIcon size={11} color="var(--green)" /> : <CopyIcon size={11} />}
          {copied ? t("copied") : t("copy")}
        </button>
        <a
          href={scriptUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 12px", borderRadius: 8,
            background: "var(--g04)", color: "var(--t2)",
            fontSize: 11, fontWeight: 700, textDecoration: "none",
          }}
        >
          <LinkIcon size={11} />
          {t("view_script")}
        </a>
      </div>
      </div>
    </div>
  );
}

/* ── Small pieces ── */
function DiscordIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}

function YoutubeIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "5px 13px", borderRadius: 99,
      border: active ? "1px solid rgba(96,165,250,0.5)" : "1px solid var(--g05)",
      background: active ? "rgba(96,165,250,0.12)" : "var(--g02)",
      color: active ? "#60A5FA" : "var(--t3)",
      fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
      transition: "all .12s",
    }}>
      {label}
    </button>
  );
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 28, height: 28, borderRadius: 8,
      border: "1px solid var(--g05)", background: "var(--g02)",
      color: disabled ? "var(--t3)" : "var(--t1)",
      opacity: disabled ? 0.4 : 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: disabled ? "not-allowed" : "pointer",
    }}>
      {children}
    </button>
  );
}

const PAGE_BTN = 26;
const PAGE_GAP = 3;

function pageWindow(current: number, totalPages: number): number[] {
  if (current <= 1) return [1];
  const start = Math.max(1, current - 1);
  const end = Math.min(totalPages, current + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

function PageIsland({ page, totalPages, onSelect }: { page: number; totalPages: number; onSelect: (p: number) => void }) {
  const pages = pageWindow(page, totalPages);
  const activeIndex = pages.indexOf(page);

  return (
    <div style={{
      position: "relative", display: "flex", gap: PAGE_GAP,
      background: "var(--g02)", border: "1px solid var(--g05)",
      borderRadius: 999, padding: 3,
    }}>
      <div style={{
        position: "absolute", top: 3, left: 3,
        width: PAGE_BTN, height: `calc(100% - 6px)`,
        borderRadius: 999,
        background: "rgba(96,165,250,0.18)",
        border: "1px solid rgba(96,165,250,0.4)",
        transform: `translateX(${activeIndex * (PAGE_BTN + PAGE_GAP)}px)`,
        transition: "transform .3s cubic-bezier(0.4,0,0.2,1)",
      }} />
      {pages.map(p => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          style={{
            position: "relative", zIndex: 1,
            width: PAGE_BTN, height: PAGE_BTN, borderRadius: 999,
            border: "none", background: "transparent",
            color: p === page ? "#60A5FA" : "var(--t3)",
            fontSize: 11, fontWeight: p === page ? 800 : 600,
            cursor: "pointer", transition: "color .2s",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <div style={{
      marginTop: 60, textAlign: "center", padding: "40px 20px",
      color: isError ? "var(--red)" : "var(--t3)", fontSize: 12.5,
      border: "1px dashed var(--g06)", borderRadius: 16,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      {isError && <AlertTriangleIcon size={14} color="var(--red)" />}
      {message}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 12,
    }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 176, borderRadius: 14 }} />
      ))}
    </div>
  );
}
