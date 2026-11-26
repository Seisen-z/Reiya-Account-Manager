import { Dispatch, FC, RefObject, SetStateAction } from "react";
import { SearchIcon, PinIcon, XIcon } from "./Icons";

export type FilterTab = "all" | "favorites" | "valid" | "needs_login";
type SortBy = "last_launched" | "name_asc" | "name_desc" | "status" | "added" | "custom";
type ViewMode = "card" | "list";

const controlStyle: React.CSSProperties = {
  height: 34, padding: "0 10px", borderRadius: 10, border: "1px solid var(--g06)",
  background: "var(--g02)", color: "var(--t2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", outline: "none",
};

export const AccountsToolbar: FC<{
  t: (key: string) => string;
  groups: string[];
  totalCount: number;
  groupCounts: Record<string, number>;
  activeGroup: string | null;
  setActiveGroup: (group: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  filter: FilterTab;
  setFilter: (v: FilterTab) => void;
  sortBy: SortBy;
  setSortBy: Dispatch<SetStateAction<SortBy>>;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Counts shown on the filter chips. */
  counts?: { pinned: number; ready: number; needsLogin: number };
}> = ({
  t, groups, totalCount, groupCounts, activeGroup, setActiveGroup,
  search, setSearch, searchInputRef, filter, setFilter, sortBy, setSortBy, viewMode, setViewMode, counts,
}) => {
  const chips: { id: FilterTab; label: string; count?: number; dot?: string; icon?: React.ReactNode }[] = [
    { id: "all", label: t("acc_filter_all"), count: totalCount },
    { id: "favorites", label: t("acc_filter_pinned"), count: counts?.pinned, icon: <PinIcon size={10} color="#FBBF24" fill={filter === "favorites" ? "#FBBF24" : "none"} /> },
    { id: "valid", label: t("acc_filter_ready"), count: counts?.ready, dot: "var(--green)" },
    { id: "needs_login", label: t("accp_needs_login_short"), count: counts?.needsLogin, dot: "var(--red)" },
  ];

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
        <SearchIcon size={13} color="var(--t3)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        <input
          ref={searchInputRef}
          placeholder={t("accp_search_placeholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", height: 34, padding: "0 56px 0 34px",
            background: "var(--g02)", border: "1px solid var(--g06)",
            borderRadius: 10, color: "var(--t1)", fontSize: 12, outline: "none", transition: "border-color .15s",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
          onBlur={e => e.currentTarget.style.borderColor = "var(--g06)"}
        />
        {search ? (
          <button onClick={() => setSearch("")} aria-label="Clear search"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            <XIcon size={12} color="var(--t3)" />
          </button>
        ) : (
          <kbd style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
            fontSize: 9.5, fontWeight: 700, color: "var(--t3)", border: "1px solid var(--g06)", borderRadius: 5, padding: "1px 5px", fontFamily: "inherit",
          }}>Ctrl F</kbd>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
        {chips.map(c => {
          const active = filter === c.id;
          if (c.id === "needs_login" && !c.count && !active) return null; // hide when nothing needs attention
          return (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 99, cursor: "pointer",
                fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", fontFamily: "inherit",
                border: `1px solid ${active ? "var(--g20)" : "var(--g06)"}`,
                background: active ? "var(--g10)" : "transparent",
                color: active ? "var(--t1)" : "var(--t3)",
              }}
            >
              {c.icon}
              {c.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot }} />}
              {c.label}
              {c.count !== undefined && <span style={{ fontSize: 10, opacity: 0.6 }}>{c.count}</span>}
            </button>
          );
        })}
      </div>

      {/* Group */}
      {groups.length > 0 && (
        <select
          value={activeGroup ?? ""}
          onChange={e => setActiveGroup(e.target.value || null)}
          aria-label={t("acc_group")}
          style={{ ...controlStyle, color: activeGroup ? "#A78BFA" : "var(--t2)", borderColor: activeGroup ? "rgba(167,139,250,0.4)" : "var(--g06)" }}
        >
          <option value="">{t("acc_group_all")} ({totalCount})</option>
          {groups.map(g => <option key={g} value={g}>{g} ({groupCounts[g] ?? 0})</option>)}
        </select>
      )}

      {/* Sort */}
      <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} aria-label={t("accp_sort")} style={controlStyle}>
        <option value="last_launched">{t("accp_sort_last")}</option>
        <option value="name_asc">{t("accp_sort_az")}</option>
        <option value="name_desc">{t("accp_sort_za")}</option>
        <option value="status">{t("accp_sort_status")}</option>
        <option value="added">{t("accp_sort_added")}</option>
        <option value="custom">{t("accp_sort_custom")}</option>
      </select>

      {/* Card / list view */}
      <div className="premium-tab-track" style={{ flexShrink: 0 }}>
        {([["card", t("accp_view_cards")], ["list", t("accp_view_list")]] as [ViewMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`premium-tab ${viewMode === mode ? "active" : ""}`}
            title={label}
            aria-label={label}
            style={{ width: 34, height: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {mode === "card"
                ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>
                : <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></>}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
};
