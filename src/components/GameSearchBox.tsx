import { FC, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LoaderIcon, SearchIcon, XIcon } from "./Icons";
import { GameIcon } from "./GameIcon";

export interface GameSearchResult {
  name: string;
  place_id: number;
  universe_id: number;
  creator_name: string;
  icon_url: string;
}

/**
 * One box for both: type a game name to search Roblox, or paste a Place ID / game link and press Enter.
 */
export const GameSearchBox: FC<{
  value: string;
  onChange: (v: string) => void;
  /** Called with a Place ID pasted or typed into the box. */
  onPlaceId: (placeId: string) => void;
  /** Called when a search result is picked. */
  onPickGame: (game: GameSearchResult) => void;
  onInvalid?: () => void;
  placeholder: string;
  width?: number;
}> = ({ value, onChange, onPlaceId, onPickGame, onInvalid, placeholder, width = 280 }) => {
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const query = value.trim();
  const looksLikeId = /\d{6,}/.test(query);

  // Debounced name search
  useEffect(() => {
    if (query.length < 2 || looksLikeId) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      invoke<GameSearchResult[]>("search_roblox_games", { keyword: query })
        .then(r => { if (id === requestId.current) { setResults(r.slice(0, 8)); setActive(0); setOpen(true); } })
        .catch(e => { if (id === requestId.current) { setResults([]); setError(String(e)); setOpen(true); } })
        .finally(() => { if (id === requestId.current) setLoading(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, looksLikeId]);

  // Close the dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (g: GameSearchResult) => {
    onPickGame(g);
    setOpen(false);
    setResults([]);
  };

  const showDropdown = open && !looksLikeId && query.length >= 2 && (results.length > 0 || !!error || (!loading && results.length === 0));

  return (
    <div ref={boxRef} style={{ position: "relative", width }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
        {loading ? <LoaderIcon size={12} color="var(--t3)" style={{ animation: "spin 1s linear infinite" }} /> : <SearchIcon size={12} color="var(--t3)" />}
      </span>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          e.stopPropagation(); // keep the page's Enter/arrow shortcuts out of the search box
          if (e.key === "ArrowDown" && results.length) { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === "Escape") { setOpen(false); }
          else if (e.key === "Enter") {
            const match = query.match(/\d{6,}/);
            if (match) onPlaceId(match[0]);
            else if (showDropdown && results[active]) pick(results[active]);
            else if (query) onInvalid?.();
          }
        }}
        placeholder={placeholder}
        className="field glass-input"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        style={{ width: "100%", height: 32, fontSize: 11.5, padding: "0 28px 0 30px", borderRadius: 9 }}
      />
      {value && (
        <button onClick={() => { onChange(""); setResults([]); }} aria-label="Clear"
          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
          <XIcon size={11} color="var(--t3)" />
        </button>
      )}

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, width: Math.max(width, 320), zIndex: 9999,
            background: "var(--modal-bg)", backdropFilter: "blur(16px)", border: "1px solid var(--modal-border)",
            borderRadius: 12, padding: 4, boxShadow: "0 12px 36px rgba(0,0,0,.45)", maxHeight: 380, overflowY: "auto",
          }}
        >
          {error ? (
            <div style={{ padding: "12px 10px", fontSize: 11.5, color: "var(--red)" }}>Search failed: {error}</div>
          ) : results.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 11.5, color: "var(--t3)" }}>
              {loading ? "Searching…" : `No games found for "${query}"`}
            </div>
          ) : results.map((g, i) => (
            <div
              key={g.place_id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => { e.preventDefault(); pick(g); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 9, cursor: "pointer",
                background: i === active ? "var(--g06)" : "transparent",
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--g04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GameIcon placeId={String(g.place_id)} urls={[g.icon_url]} placeholderSize={16} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.creator_name ? `by ${g.creator_name}` : `Place ${g.place_id}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
