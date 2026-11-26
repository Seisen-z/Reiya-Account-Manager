import { AccountSlotUsage } from "./AccountSlotUsage";
import { useAccountPlan } from "../lib/useAccountPlan";
import { FC, RefObject, useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  UserIcon,
  BarChartIcon,
  SettingsIcon,
  LoaderIcon,
  KeyIcon,
  CopyIcon,
  FileTextIcon,
  ChevronDownIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  MonitorIcon,
  ChevronRightIcon,
} from "./Icons";
import { Account, Session } from "../pages/Home";
import { AddAccountDisclosure } from "./AddAccountDisclosure";
import Tooltip from "./ui/Tooltip";

/** A status pill. Pass onClick to make it a button. */
function StatusPill({ icon, children, tone = "neutral", onClick, title, className }: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "amber";
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const [hov, setHov] = useState(false);
  const colors = {
    neutral: { fg: "var(--t2)", bg: "var(--g03)", border: "var(--g06)" },
    green:   { fg: "var(--green)", bg: "var(--green-dim)", border: "rgba(52,211,153,0.25)" },
    red:     { fg: "var(--red)", bg: "var(--red-dim)", border: "rgba(248,113,113,0.3)" },
    amber:   { fg: "#FBBF24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" },
  }[tone];
  const clickable = !!onClick;
  const pill = (
    <div
      className={className}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick!(); } }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 99,
        fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
        color: colors.fg, background: colors.bg,
        border: `1px solid ${clickable && hov ? "var(--g15)" : colors.border}`,
        cursor: clickable ? "pointer" : "default",
        transition: "border-color .12s, transform .12s",
        transform: clickable && hov ? "translateY(-1px)" : "none",
      }}
    >
      <span style={{ display: "flex" }}>{icon}</span>
      {children}
      {clickable && <ChevronRightIcon size={11} style={{ opacity: hov ? 0.9 : 0.4 }} />}
    </div>
  );
  return title ? <Tooltip content={title} position="bottom">{pill}</Tooltip> : pill;
}

export const HomeHeaderBar: FC<{
  greeting: string;
  accounts: Account[];
  sessions: Session[];
  favorites: number;
  weekStats: { sessCount: number; timeStr: string };
  validCookies: number;
  loginLoading: boolean;
  addMenu: boolean;
  setAddMenu: (v: boolean) => void;
  addMenuRef: RefObject<HTMLDivElement | null>;
  onManualLogin: () => void;
  onUserPassCombo: () => void;
  onClipboardCookie: () => void;
  onBulkCookies: () => void;
  onPlayStats: () => void;
  bulkChecking: boolean;
  cookieCheckError: boolean;
  onBulkCookieCheck: () => void;
  onUtilities: () => void;
  /** Open the "Activity & stats" tab. */
  onShowActivity?: () => void;
}> = ({
  greeting, accounts, sessions, weekStats, validCookies,
  loginLoading, addMenu, setAddMenu, addMenuRef,
  onManualLogin, onUserPassCombo, onClipboardCookie, onBulkCookies,
  onPlayStats, bulkChecking, cookieCheckError, onBulkCookieCheck, onUtilities, onShowActivity,
}) => {
  const { t, language } = useLanguage();
  const accountPlan = useAccountPlan();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const invalidCount = accounts.length - validCookies;

  // Close the "More" menu when clicking anywhere else or pressing Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [moreOpen]);

  const loginPill = accounts.length === 0 ? null : bulkChecking ? (
    <StatusPill tone="amber" icon={<LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} />}>
      {t("hdr_checking_logins")}
    </StatusPill>
  ) : invalidCount > 0 ? (
    <StatusPill
      tone="red"
      icon={<AlertTriangleIcon size={12} />}
      onClick={onBulkCookieCheck}
      title={t("hdr_recheck_tip")}
    >
      {invalidCount} {invalidCount === 1 ? t("hdr_login_expired_one") : t("hdr_login_expired_many")}
      {cookieCheckError && <span style={{ fontWeight: 600, opacity: 0.8 }}>· {t("hdr_still")}</span>}
    </StatusPill>
  ) : (
    <StatusPill tone="green" icon={<ShieldCheckIcon size={12} />} onClick={onBulkCookieCheck} title={t("hdr_recheck_tip")}>
      {t("hdr_all_logins_ok")}
    </StatusPill>
  );

  return (
    <div className="home-header" style={{ display: "flex", alignItems: "center", padding: "0 22px", height: 64, borderBottom: "1px solid var(--glass-line)", flexShrink: 0, gap: 18 }}>
      {/* Greeting (date first, greeting last — seasonal themes decorate the last line) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
          {new Date().toLocaleDateString(language === "zh-cn" ? "zh-CN" : language, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--t1)", letterSpacing: "-0.4px", lineHeight: 1 }}>{greeting}</div>
      </div>

      <div style={{ width: 1, height: 30, background: "var(--g07)", flexShrink: 0 }} />

      {/* Status pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, overflow: "hidden" }}>
        {/* Most important first: in small windows the later pills hide before these do */}
        {loginPill}
        <StatusPill
          tone={sessions.length > 0 ? "green" : "neutral"}
          icon={sessions.length > 0
            ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", animation: "pulse-glow 2s ease-in-out infinite" }} />
            : <MonitorIcon size={12} />}
        >
          {sessions.length} {t("home_running_count")}
        </StatusPill>
        <StatusPill icon={<BarChartIcon size={12} />} onClick={onShowActivity} title={onShowActivity ? t("hdr_week_tip") : undefined} className="hdr-hide-narrow">
          {weekStats.timeStr} {t("hdr_this_week")}
        </StatusPill>
        <StatusPill icon={<UserIcon size={12} />} className="hdr-hide-md">
          {accounts.length} {accounts.length === 1 ? t("hdr_account_one") : t("home_accounts_count")}
        </StatusPill>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
        {loginLoading && (
          <span style={{ fontSize: 10.5, color: "var(--t2)", display: "flex", alignItems: "center", gap: 5 }}>
            <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} /> {t("login_open")}
          </span>
        )}

        <div ref={moreRef} style={{ position: "relative" }}>
          <button
            onClick={e => { e.stopPropagation(); setMoreOpen(v => !v); }}
            className="btn btn-ghost glow-btn"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            style={{ height: 32, padding: "0 12px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, background: moreOpen ? "var(--g06)" : undefined }}
          >
            {t("home_more")} <ChevronDownIcon size={12} style={{ transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 9999, width: 240,
                background: "var(--modal-bg)", backdropFilter: "blur(16px)", border: "1px solid var(--modal-border)",
                borderRadius: 12, padding: 4, boxShadow: "0 12px 36px rgba(0,0,0,.4)",
              }}
            >
              {[
                { icon: <BarChartIcon size={14} />, label: t("play_stats"), sub: t("hdr_play_stats_sub"), onClick: onPlayStats },
                { icon: <ShieldCheckIcon size={14} />, label: t("check_cookies"), sub: t("hdr_check_sub"), onClick: onBulkCookieCheck },
                { icon: <SettingsIcon size={14} />, label: t("utilities"), sub: t("hdr_utilities_sub"), onClick: onUtilities },
              ].map(item => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={() => { setMoreOpen(false); item.onClick(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 10px",
                    borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--g05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ display: "flex", color: "var(--t2)", flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{item.label}</span>
                    <span style={{ display: "block", fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{item.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Primary action */}
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <AddAccountDisclosure
            open={addMenu}
            onOpenChange={setAddMenu}
            label={t("add_account")}
            title={t("add_account")}
            actions={[
              { icon: <KeyIcon size={20} />, label: t("manual_login_title"), sub: t("manual_login_sub"), onClick: onManualLogin },
              { icon: <UserIcon size={20} />, label: t("user_pass_combo"), sub: t("user_pass_sub"), onClick: onUserPassCombo },
              { icon: <CopyIcon size={20} />, label: t("clipboard_cookie"), sub: t("cookie_sub"), onClick: onClipboardCookie },
              { icon: <FileTextIcon size={20} />, label: t("bulk_cookies"), sub: t("cookies_file_sub"), onClick: onBulkCookies },
            ]}
          />
          <div style={{ position: "absolute", top: "100%", right: 0, whiteSpace: "nowrap" }}>
            <AccountSlotUsage used={new Set(accounts.map(account => account.user_id)).size} {...accountPlan} />
          </div>
        </div>
      </div>
    </div>
  );
};
