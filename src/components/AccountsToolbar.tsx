import { Dispatch, FC, RefObject, SetStateAction } from "react";
import { SearchIcon, StarIcon } from "./Icons";

type FilterTab = "all" | "favorites" | "valid";
type SortBy = "last_launched" | "name_asc" | "name_desc" | "status" | "added" | "custom";

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
}> = ({
  t, groups, totalCount, groupCounts, activeGroup, setActiveGroup,
  search, setSearch, searchInputRef, filter, setFilter, sortBy, setSortBy,
}) => {
  return (
    <>
      {/* Group tabs row — only shown when accounts have groups */}
      {groups.length > 0 && (
        <div className="premium-tab-track" style={{ flexShrink: 0, marginBottom: 12 }}>
          <button
            onClick={() => setActiveGroup(null)}
            className={`premium-tab ${activeGroup === null ? "active" : ""}`}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px" }}
          >
            <span style={{ fontSize: 11, fontWeight: 700 }}>All</span>
            <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.55 }}>{totalCount}</span>
          </button>
          {groups.map(g => {
            const count = groupCounts[g] ?? 0;
            const isActive = activeGroup === g;
            return (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`premium-tab ${isActive ? "active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>{g}</span>
                <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.55 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Sub-filter */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <SearchIcon size={13} color="var(--t3)" style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
          }} />
          <input
            ref={searchInputRef}
            placeholder={`${t("search_accounts_placeholder")} (Ctrl+F)`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", paddingLeft: 36, padding: "9px 12px 9px 36px",
              background: "var(--g02)", border: "1px solid var(--g05)",
              borderRadius: 10, color: "var(--t1)", fontSize: 12, outline: "none",
              transition: "border-color .15s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--g05)"}
          />
        </div>

        {/* Sub-filter tabs: All / Favorites / Valid */}
        <div className="premium-tab-track" style={{ flexShrink: 0 }}>
          {([
            ["all", t("all_profiles").split(" ")[0]],
            ["favorites", t("favorites")],
            ["valid", "Valid"],
          ] as [FilterTab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`premium-tab ${filter === id ? "active" : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px" }}
            >
              {id === "favorites" && (
                <StarIcon size={11} fill={filter === "favorites" ? "var(--amber)" : "none"} color={filter === "favorites" ? "var(--amber)" : "var(--t3)"} />
              )}
              {id === "valid" && (
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: filter === "valid" ? "var(--green)" : "var(--t3)", display: "inline-block", flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          style={{
            flexShrink: 0, height: 34, padding: "0 10px",
            borderRadius: 10, border: "1px solid var(--g05)",
            background: "var(--g02)", color: "var(--t2)",
            fontSize: 11, fontWeight: 700, cursor: "pointer", outline: "none",
          }}
        >
          <option value="last_launched">↓ Last Launched</option>
          <option value="name_asc">A → Z</option>
          <option value="name_desc">Z → A</option>
          <option value="status">Cookie Status</option>
          <option value="added">Recently Added</option>
          <option value="custom">✦ Custom Order</option>
        </select>
      </div>
    </>
  );
};
