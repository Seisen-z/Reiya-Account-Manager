import type { LaunchFeedback } from "../lib/useAccountLauncher";
import { AccountLaunchStatus } from "./AccountLaunchStatus";
import { FC, Fragment, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { CheckIcon, PinIcon, PlusIcon, SearchIcon, RefreshIcon, XIcon, LoaderIcon } from "./Icons";
import { Account, timeAgo } from "../pages/Home";
import Tooltip from "./ui/Tooltip";

type Health = "checking" | "valid" | "invalid" | "unknown";

/** One plain-language status for an account, e.g. "Ready", "Login expired", "Playing · Doors". */
function accountStatus(account: Account, isActive: boolean, activeGame: string | undefined, checking: boolean, health: Health, t: (k: string) => string) {
  if (isActive) return { color: "var(--green)", text: activeGame ? `${t("acc_status_playing")} · ${activeGame}` : t("acc_status_playing"), pulse: true };
  if (checking || health === "checking") return { color: "#FBBF24", text: t("acc_status_checking"), pulse: false };
  if (account.cookie_status === "Expired" || health === "invalid") return { color: "var(--red)", text: t("acc_status_expired"), pulse: false };
  if (account.cookie_status === "Valid") {
    const last = account.last_launched_at ? new Date(account.last_launched_at) : null;
    const lastText = last && !isNaN(last.getTime()) ? ` · ${t("acc_played")} ${timeAgo(last, t)}` : "";
    return { color: "var(--green)", text: t("acc_status_ready") + lastText, pulse: false };
  }
  return { color: "var(--t3)", text: t("acc_status_unknown"), pulse: false };
}

function AccountRow({ account, launchState, onRetryLaunch, isActive, activeGame, isSelected, isChecked, showCheckbox, onToggleCheck, checking, health, onCheck, onSelect, onDoubleClick, onContextMenu, onToggleFav }: {
  account: Account; launchState?: LaunchFeedback; onRetryLaunch: () => void; isActive: boolean; activeGame?: string;
  isSelected: boolean; isChecked: boolean; showCheckbox: boolean; onToggleCheck: () => void;
  checking: boolean; health: Health;
  onCheck: () => void; onSelect: () => void; onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleFav: () => void;
}) {
  const [hov, setHov] = useState(false);
  const { t } = useLanguage();
  const status = accountStatus(account, isActive, activeGame, checking, health, t);
  const launchPhase = launchState?.phase;
  const checkboxVisible = showCheckbox || hov || isChecked;

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onSelect} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
      title={t("acc_row_hint")}
      style={{
        position: "relative", display: "flex", alignItems: "center", gap: 10,
        margin: "2px 8px", padding: "8px 8px", borderRadius: 11, cursor: "pointer", userSelect: "none",
        background: isSelected ? "var(--g06)" : hov ? "var(--g03)" : "transparent",
        border: `1px solid ${isSelected ? "var(--g10)" : "transparent"}`,
        transition: "background .12s, border-color .12s",
      }}
    >
      {/* Multi-launch checkbox (shown on hover, or always once anything is ticked) */}
      <div style={{ width: checkboxVisible ? 16 : 0, overflow: "hidden", flexShrink: 0, transition: "width .12s" }}>
        <Tooltip content={isChecked ? t("acc_untick") : t("acc_tick")} position="right">
          <div
            onClick={e => { e.stopPropagation(); onToggleCheck(); }}
            onDoubleClick={e => e.stopPropagation()}
            style={{
              width: 16, height: 16, borderRadius: 5,
              border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--g15)"}`,
              background: isChecked ? "var(--accent)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
            {isChecked && <CheckIcon size={10} color="#07080a" strokeWidth={3} />}
          </div>
        </Tooltip>
      </div>

      {/* Avatar with status dot */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {account.avatar_url
          ? <img src={account.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: `2px solid ${isSelected ? "var(--g20)" : "transparent"}` }} />
          : <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--t2)" }}>{account.username.slice(0, 2).toUpperCase()}</div>}
        <span style={{
          position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%",
          background: status.color, border: "2px solid var(--panel-bg)",
          animation: status.pulse ? "pulse-glow 2s ease-in-out infinite" : "none",
        }} />
      </div>

      {/* Name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {account.display_name || account.username}
          </span>
          {account.group && (
            <span style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--g05)", color: "var(--t3)", flexShrink: 0 }}>{account.group}</span>
          )}
        </div>
        {launchPhase ? (
          <AccountLaunchStatus state={launchState} running={isActive} onRetry={onRetryLaunch} />
        ) : (
          <div style={{ fontSize: 10.5, fontWeight: 600, color: status.color === "var(--t3)" ? "var(--t3)" : status.color, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {status.text}
          </div>
        )}
      </div>

      {/* Hover actions: re-check login, pin */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {(hov || checking) && (
          <Tooltip content={t("acc_recheck")} position="left">
            <button
              onClick={e => { e.stopPropagation(); onCheck(); }}
              onDoubleClick={e => e.stopPropagation()}
              disabled={checking}
              aria-label={t("acc_recheck")}
              style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "var(--g05)", color: "var(--t2)", cursor: checking ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >
              {checking ? <LoaderIcon size={11} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshIcon size={11} />}
            </button>
          </Tooltip>
        )}
        {(hov || account.is_favorite) && (
          <Tooltip content={account.is_favorite ? t("acc_unpin") : t("acc_pin")} position="left">
            <button
              onClick={e => { e.stopPropagation(); onToggleFav(); }}
              onDoubleClick={e => e.stopPropagation()}
              aria-label={account.is_favorite ? t("acc_unpin") : t("acc_pin")}
              style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >
              <PinIcon size={12} color={account.is_favorite ? "#FBBF24" : "var(--t3)"} fill={account.is_favorite ? "#FBBF24" : "none"} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px 4px", fontSize: 9.5, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {children}
      {count !== undefined && <span style={{ opacity: 0.6 }}>{count}</span>}
    </div>
  );
}

export const AccountSidebar: FC<{
  accounts: Account[];
  loading?: boolean;
  accSearch: string;
  setAccSearch: (v: string) => void;
  accGroups: string[];
  accGroup: string | null;
  setAccGroup: (v: string | null) => void;
  accFilter: "all" | "valid" | "favorites";
  setAccFilter: (v: "all" | "valid" | "favorites") => void;
  groupedAccounts: [string, Account[]][];
  activeUserIds: ReadonlySet<number>;
  /** Game name per running account, shown as "Playing · <game>". */
  activeGames?: ReadonlyMap<number, string>;
  launchFeedback: ReadonlyMap<number, LaunchFeedback>;
  onRetryLaunch: (userId: number) => void;
  selAccount: number | null;
  multiSelected: Set<number>;
  onToggleCheck: (userId: number) => void;
  /** Untick every account (multi-launch). */
  onClearChecked?: () => void;
  /** Tick every account currently shown. */
  onCheckAll?: (userIds: number[]) => void;
  checkingCookie: Record<number, boolean>;
  healthStatus: Record<number, Health>;
  onCheckCookie: (userId: number) => void;
  onSelectAccount: (userId: number) => void;
  onQuickLaunchAccount: (userId: number) => void;
  onAccountContextMenu: (e: React.MouseEvent, a: Account) => void;
  onToggleFavorite: (userId: number) => void;
  setAddMenu: (fn: (v: boolean) => boolean) => void;
}> = ({
  accounts, loading, accSearch, setAccSearch, accGroups, accGroup, setAccGroup, accFilter, setAccFilter,
  groupedAccounts, activeUserIds, activeGames, launchFeedback, onRetryLaunch, selAccount, multiSelected, onToggleCheck,
  onClearChecked, onCheckAll,
  checkingCookie, healthStatus, onCheckCookie, onSelectAccount, onQuickLaunchAccount,
  onAccountContextMenu, onToggleFavorite, setAddMenu,
}) => {
  const { t } = useLanguage();
  const visible = groupedAccounts.flatMap(([, accs]) => accs);
  // Pinned accounts float to the top in their own section (only in the "All" view).
  const pinned = accFilter === "all" ? visible.filter(a => a.is_favorite) : [];
  const rest = accFilter === "all" ? visible.filter(a => !a.is_favorite) : visible;
  const anyChecked = multiSelected.size > 0;

  const renderRow = (a: Account) => (
    <AccountRow key={a.user_id} account={a}
      isActive={activeUserIds.has(a.user_id)}
      activeGame={activeGames?.get(a.user_id)}
      launchState={launchFeedback.get(a.user_id)}
      onRetryLaunch={() => onRetryLaunch(a.user_id)}
      isSelected={selAccount === a.user_id}
      isChecked={multiSelected.has(a.user_id)}
      showCheckbox={anyChecked}
      onToggleCheck={() => onToggleCheck(a.user_id)}
      checking={!!checkingCookie[a.user_id]}
      health={healthStatus[a.user_id] ?? "unknown"}
      onCheck={() => onCheckCookie(a.user_id)}
      onSelect={() => onSelectAccount(a.user_id)}
      onDoubleClick={() => onQuickLaunchAccount(a.user_id)}
      onContextMenu={(e) => onAccountContextMenu(e, a)}
      onToggleFav={() => onToggleFavorite(a.user_id)} />
  );

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 99, cursor: "pointer", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap",
    border: `1px solid ${active ? "var(--g15)" : "var(--g06)"}`,
    background: active ? "var(--g10)" : "transparent",
    color: active ? "var(--t1)" : "var(--t3)",
    transition: "all .12s",
  });

  return (
    <Fragment>
      {/* Header */}
      <div style={{ padding: "14px 14px 10px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--glass-line-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: "var(--t1)" }}>{t("accounts")}</span>
          <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700 }}>{accounts.length}</span>
          <div style={{ flex: 1 }} />
          <Tooltip content={t("add_account")} position="bottom">
            <button
              onClick={e => { e.stopPropagation(); setAddMenu(v => !v); }}
              aria-label={t("add_account")}
              style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid var(--g08)", background: "var(--g03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >
              <PlusIcon size={13} color="var(--t1)" />
            </button>
          </Tooltip>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
            <SearchIcon size={12} color="var(--t3)" />
          </span>
          <input
            value={accSearch}
            onChange={e => setAccSearch(e.target.value)}
            placeholder={t("acc_search_placeholder")}
            style={{
              width: "100%", height: 32, padding: "0 28px 0 28px", borderRadius: 9, outline: "none",
              background: "var(--g03)", border: "1px solid var(--g06)", color: "var(--t1)", fontSize: 11.5,
            }}
          />
          {accSearch && (
            <button onClick={() => setAccSearch("")} aria-label="Clear search"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              <XIcon size={11} color="var(--t3)" />
            </button>
          )}
        </div>

        {/* Filters: one row of chips + optional group picker */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {(["all", "favorites", "valid"] as const).map(f => (
            <button key={f} onClick={() => setAccFilter(f)} style={chip(accFilter === f)}>
              {f === "all" ? t("acc_filter_all") : f === "favorites" ? t("acc_filter_pinned") : t("acc_filter_ready")}
            </button>
          ))}
          {accGroups.length > 0 && (
            <select
              value={accGroup ?? ""}
              onChange={e => setAccGroup(e.target.value || null)}
              aria-label={t("acc_group")}
              style={{ ...chip(accGroup !== null), outline: "none", appearance: "auto", paddingRight: 4, maxWidth: 110, background: accGroup !== null ? "rgba(167,139,250,0.18)" : "transparent", color: accGroup !== null ? "#A78BFA" : "var(--t3)" }}
            >
              <option value="">{t("acc_group_all")}</option>
              {accGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Multi-launch selection bar */}
      {anyChecked && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", flexShrink: 0, background: "rgba(167,139,250,0.10)", borderBottom: "1px solid rgba(167,139,250,0.2)" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#A78BFA", flex: 1 }}>
            {multiSelected.size} {t("acc_ticked")}
          </span>
          {onCheckAll && (
            <button onClick={() => onCheckAll(visible.map(a => a.user_id))}
              style={{ border: "none", background: "transparent", color: "var(--t2)", fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              {t("acc_tick_all")}
            </button>
          )}
          {onClearChecked && (
            <button onClick={onClearChecked}
              style={{ border: "none", background: "transparent", color: "var(--t2)", fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              {t("acc_clear")}
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="scroll" style={{ flex: 1, paddingBottom: 8 }}>
        {loading && accounts.length === 0 ? (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="skeleton" style={{ height: 11, width: "65%", borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 8, width: "40%", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--t3)", fontSize: 11.5, lineHeight: 1.7 }}>
            {t("no_accounts_added")}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "28px 18px", textAlign: "center", color: "var(--t3)", fontSize: 11.5, lineHeight: 1.7 }}>
            {t("acc_no_match")}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <SectionLabel count={pinned.length}><PinIcon size={9} color="#FBBF24" fill="#FBBF24" /> {t("acc_filter_pinned")}</SectionLabel>
                {pinned.map(renderRow)}
                {rest.length > 0 && <SectionLabel count={rest.length}>{t("acc_section_others")}</SectionLabel>}
              </>
            )}
            {rest.map(renderRow)}
          </>
        )}

        {accounts.length > 0 && (
          <div onClick={e => { e.stopPropagation(); setAddMenu(v => !v); }}
            style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 8px 0", padding: "8px", borderRadius: 11, cursor: "pointer", color: "var(--t3)", fontSize: 11.5, fontWeight: 700, transition: "color .12s, background .12s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--t1)"; e.currentTarget.style.background = "var(--g03)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.background = "transparent"; }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", border: "1.5px dashed var(--g12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PlusIcon size={14} />
            </div>
            <span>{t("add_account_compact")}</span>
          </div>
        )}
      </div>
    </Fragment>
  );
};
