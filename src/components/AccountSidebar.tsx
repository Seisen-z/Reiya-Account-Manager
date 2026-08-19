import { FC, Fragment, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { CheckIcon, PinIcon, PlusIcon } from "./Icons";
import { PinnedAccountsHero } from "./PinnedAccountsHero";
import { Account } from "../pages/Home";
import Tooltip from "./ui/Tooltip";

function CompactAccountRow({ account, isActive, isSelected, isChecked, onToggleCheck, checking, health, onCheck, onSelect, onDoubleClick, onContextMenu, onToggleFav }: {
  account: Account; isActive: boolean; isSelected: boolean;
  isChecked: boolean; onToggleCheck: () => void;
  checking: boolean; health: "checking" | "valid" | "invalid" | "unknown";
  onCheck: () => void; onSelect: () => void; onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleFav: () => void;
}) {
  const [hov, setHov] = useState(false);
  const { t } = useLanguage();
  const isValid   = account.cookie_status === "Valid";
  const isExpired = account.cookie_status === "Expired";

  const healthColor = health === "valid" ? "var(--green)" : health === "invalid" ? "var(--red)" : health === "checking" ? "#FBBF24" : "var(--t3)";
  const healthTitle = health === "valid" ? t("cookie_valid_tooltip") : health === "invalid" ? t("cookie_invalid_tooltip") : health === "checking" ? t("checking_tooltip") : t("not_yet_checked_tooltip");

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onSelect} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "7px 14px",
        cursor: "pointer",
        background: isSelected ? "var(--g05)" : hov ? "var(--g02)" : "transparent",
        borderLeft: `2px solid ${isSelected ? "rgba(255,255,255,0.6)" : "transparent"}`,
        transition: "all .12s", userSelect: "none",
      }}>
      <Tooltip content={isChecked ? "Remove from multi-launch" : "Add to multi-launch"} position="right" style={{ flexShrink: 0 }}>
        <div
          onClick={e => { e.stopPropagation(); onToggleCheck(); }}
          style={{
            width: 15, height: 15, borderRadius: 4, flexShrink: 0,
            border: `1.5px solid ${isChecked ? "var(--accent)" : hov ? "var(--g14)" : "var(--g08)"}`,
            background: isChecked ? "var(--accent)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all .12s",
            opacity: hov || isChecked ? 1 : 0.5,
          }}>
          {isChecked && <CheckIcon size={9} color="#07080a" strokeWidth={3} />}
        </div>
      </Tooltip>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {account.avatar_url
          ? <img src={account.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--t2)" }}>{account.username.slice(0, 2).toUpperCase()}</div>
        }
        {/* Health indicator dot — bottom-right of avatar */}
        {!isActive && (
          <Tooltip content={healthTitle} position="right" style={{ position: "absolute", bottom: 0, right: 0 }}>
            <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: healthColor, border: "2px solid var(--bg)", transition: "background .3s", cursor: "pointer" }} />
          </Tooltip>
        )}
        {isActive && (
          <Tooltip content="Account has an active Roblox session running" position="right" style={{ position: "absolute", bottom: 0, right: 0 }}>
            <span style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: "var(--green)", border: "2px solid var(--bg)", animation: "pulse-glow 2s ease-in-out infinite", cursor: "pointer" }} />
          </Tooltip>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: isSelected ? "#FFFFFF" : "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
          {account.display_name || account.username}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
          <span style={{ fontSize: 9, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{account.username}</span>
          {account.group && (
            <span style={{ fontSize: 7.5, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "var(--g04)", color: "var(--t3)", flexShrink: 0 }}>{account.group}</span>
          )}
        </div>
      </div>
      <Tooltip content={healthTitle} position="left" style={{ flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onCheck(); }} disabled={checking}
          style={{ flexShrink: 0, padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
            border: `1px solid ${isValid ? "rgba(52,211,153,.25)" : isExpired ? "rgba(248,113,113,.25)" : "var(--g06)"}`,
            background: isValid ? "var(--green-dim)" : isExpired ? "var(--red-dim)" : "var(--g03)",
            color: isValid ? "var(--green)" : isExpired ? "var(--red)" : "var(--t3)",
            cursor: checking ? "not-allowed" : "pointer" }}>
          {checking ? "…" : isValid ? "✓" : isExpired ? "!" : "?"}
        </button>
      </Tooltip>
      {/* Pin toggle — dimmed at rest (idle ~0.5 opacity), full opacity on hover or when already pinned */}
      <Tooltip content={account.is_favorite ? "Unpin account" : "Pin account"} position="left" style={{ flexShrink: 0 }}>
        <button onClick={e => { e.stopPropagation(); onToggleFav(); }}
          style={{ flexShrink: 0, padding: "2px 4px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: account.is_favorite ? "#FBBF24" : "var(--t3)", opacity: hov || account.is_favorite ? 1 : 0.5, transition: "opacity .12s, color .12s" }}
          onMouseEnter={e => e.currentTarget.style.color = "#FBBF24"}
          onMouseLeave={e => e.currentTarget.style.color = account.is_favorite ? "#FBBF24" : "var(--t3)"}>
          <PinIcon size={11} color={account.is_favorite ? "#FBBF24" : "currentColor"} fill={account.is_favorite ? "#FBBF24" : "none"} />
        </button>
      </Tooltip>
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
  activeUserIds: Set<number | null>;
  selAccount: number | null;
  multiSelected: Set<number>;
  onToggleCheck: (userId: number) => void;
  checkingCookie: Record<number, boolean>;
  healthStatus: Record<number, "checking" | "valid" | "invalid" | "unknown">;
  onCheckCookie: (userId: number) => void;
  onSelectAccount: (userId: number) => void;
  onQuickLaunchAccount: (userId: number) => void;
  onAccountContextMenu: (e: React.MouseEvent, a: Account) => void;
  onToggleFavorite: (userId: number) => void;
  setAddMenu: (fn: (v: boolean) => boolean) => void;
}> = ({
  accounts, loading, accSearch, setAccSearch, accGroups, accGroup, setAccGroup, accFilter, setAccFilter,
  groupedAccounts, activeUserIds, selAccount, multiSelected, onToggleCheck,
  checkingCookie, healthStatus, onCheckCookie, onSelectAccount, onQuickLaunchAccount,
  onAccountContextMenu, onToggleFavorite, setAddMenu,
}) => {
  const { t } = useLanguage();
  return (
    <Fragment>
      <div style={{ padding: "10px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em" }}>{t("accounts").toUpperCase()}</span>
          <span style={{ fontSize: 9.5, color: "var(--t3)", background: "var(--g04)", padding: "1px 8px", borderRadius: 99, fontWeight: 700, border: "1px solid var(--g05)" }}>{accounts.length}</span>
        </div>
      </div>
      <PinnedAccountsHero
        accounts={accounts.filter(a => a.is_favorite)}
        onSelect={onSelectAccount}
      />
      <div style={{ padding: "0 14px 8px", flexShrink: 0, borderBottom: "1px solid var(--glass-line-2)" }}>
        {/* Search */}
        <input
          value={accSearch}
          onChange={e => setAccSearch(e.target.value)}
          placeholder="Search accounts…"
          style={{
            width: "100%", height: 26, padding: "0 9px", borderRadius: 7, outline: "none",
            background: "var(--g03)", border: "1px solid var(--g06)",
            color: "var(--t1)", fontSize: 10.5, marginBottom: 6,
          }}
        />
        {/* Group tabs — primary (only when groups exist) */}
        {accGroups.length > 0 && (
          <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
            <button onClick={() => setAccGroup(null)}
              style={{
                flex: 1, padding: "3px 0", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 9, fontWeight: 800,
                background: accGroup === null ? "var(--g12)" : "transparent",
                color: accGroup === null ? "var(--t1)" : "var(--t3)", transition: "all .1s",
              }}>All</button>
            {accGroups.map(g => (
              <button key={g} onClick={() => setAccGroup(accGroup === g ? null : g)}
                style={{
                  flex: 1, padding: "3px 0", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 9, fontWeight: 800,
                  background: accGroup === g ? "rgba(167,139,250,0.22)" : "transparent",
                  color: accGroup === g ? "#A78BFA" : "var(--t3)", transition: "all .1s",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{g}</button>
            ))}
          </div>
        )}
        {/* Sub-filter tabs: All / Valid / Fav */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "valid", "favorites"] as const).map(f => (
            <button key={f} onClick={() => setAccFilter(f)}
              style={{
                flex: 1, padding: "2px 0", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 9, fontWeight: 800,
                background: accFilter === f ? "var(--g12)" : "transparent",
                color: accFilter === f ? "var(--t1)" : "var(--t3)",
                transition: "all .1s",
              }}>
              {f === "all" ? "All" : f === "valid" ? "✓ Valid" : "📌 Pinned"}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        {loading && accounts.length === 0 ? (
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div className="skeleton" style={{ height: 11, width: "65%", borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 8, width: "40%", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--t3)", fontSize: 11, lineHeight: 1.7 }}>
            {t("no_accounts_added")}
          </div>
        ) : (
          groupedAccounts.map(([groupName, accs]) => (
            <div key={groupName}>
              {groupName && (
                <div style={{ padding: "8px 14px 4px", fontSize: 8.5, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 14, height: 1, background: "var(--g07)" }} />
                  {groupName}
                  <div style={{ flex: 1, height: 1, background: "var(--g07)" }} />
                </div>
              )}
              {accs.map(a => (
                <CompactAccountRow key={a.user_id} account={a}
                  isActive={activeUserIds.has(a.user_id)}
                  isSelected={selAccount === a.user_id}
                  isChecked={multiSelected.has(a.user_id)}
                  onToggleCheck={() => onToggleCheck(a.user_id)}
                  checking={!!checkingCookie[a.user_id]}
                  health={healthStatus[a.user_id] ?? "unknown"}
                  onCheck={() => onCheckCookie(a.user_id)}
                  onSelect={() => onSelectAccount(a.user_id)}
                  onDoubleClick={() => onQuickLaunchAccount(a.user_id)}
                  onContextMenu={(e) => onAccountContextMenu(e, a)}
                  onToggleFav={() => onToggleFavorite(a.user_id)} />
              ))}
            </div>
          ))
        )}
        <div onClick={e => { e.stopPropagation(); setAddMenu(v => !v); }}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", color: "var(--t3)", fontSize: 11, fontWeight: 700, transition: "color .12s" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--t2)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--t3)"}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px dashed var(--g10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <PlusIcon size={13} />
          </div>
          <span>{t("add_account_compact")}</span>
        </div>
      </div>
    </Fragment>
  );
};
