import { FC, RefObject } from "react";
import { useLanguage } from "../context/LanguageContext";
import {
  UserIcon,
  MonitorIcon,
  BarChartIcon,
  ShieldCheckIcon,
  SettingsIcon,
  LoaderIcon,
  KeyIcon,
  CopyIcon,
  FileTextIcon,
} from "./Icons";
import { Account, Session, HeaderStatPill } from "../pages/Home";
import { AddAccountDisclosure } from "./AddAccountDisclosure";
import { CookieCheckAction } from "./CookieCheckAction";

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
}> = ({
  greeting, accounts, sessions, favorites, weekStats, validCookies,
  loginLoading, addMenu, setAddMenu, addMenuRef,
  onManualLogin, onUserPassCombo, onClipboardCookie, onBulkCookies,
  onPlayStats, bulkChecking, cookieCheckError, onBulkCookieCheck, onUtilities,
}) => {
  const { t, language } = useLanguage();
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 24px", height: 66, borderBottom: "1px solid var(--glass-line)", flexShrink: 0, gap: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
          {new Date().toLocaleDateString(language === "zh-cn" ? "zh-CN" : language, { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--t1)", letterSpacing: "-0.5px", lineHeight: 1 }}>{greeting}</div>
      </div>
      <div style={{ width: 1, height: 28, background: "var(--g07)", flexShrink: 0 }} />
      <div style={{ display: "flex", gap: 6, flex: 1 }}>
        <HeaderStatPill icon={<UserIcon size={11} color="#93C5FD" />} label={t("accounts")} value={String(accounts.length)} sub={`${favorites} ${t("favorites").toLowerCase()}`} />
        <HeaderStatPill icon={<MonitorIcon size={11} color={sessions.length > 0 ? "var(--green)" : "var(--t3)"} />} label={t("live")} value={String(sessions.length)} sub={t("sessions_plural")} valueColor={sessions.length > 0 ? "var(--green)" : undefined} />
        <HeaderStatPill icon={<BarChartIcon size={11} color="#C4B5FD" />} label={t("this_week")} value={weekStats.timeStr} sub={`${weekStats.sessCount} ${t("sessions_plural")}`} />
        <HeaderStatPill
          icon={<ShieldCheckIcon size={11} color={accounts.length === 0 ? "var(--t3)" : validCookies === accounts.length ? "var(--green)" : "var(--red)"} />}
          label={t("cookie_title")} value={`${validCookies}/${accounts.length}`}
          sub={accounts.length === 0 ? t("none_added") : validCookies === accounts.length ? t("all_valid") : `${accounts.length - validCookies} ${t("expired_suffix")}`}
          valueColor={accounts.length === 0 ? undefined : validCookies === accounts.length ? "var(--green)" : "var(--red)"} />
      </div>
      <div style={{ display: "flex", gap: 12, flexShrink: 0, alignItems: "center" }}>
        {loginLoading && (
          <span style={{ fontSize: 10.5, color: "var(--t2)", display: "flex", alignItems: "center", gap: 5 }}>
            <LoaderIcon size={10} style={{ animation: "spin 1s linear infinite" }} /> {t("login_open")}
          </span>
        )}
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
        </div>
        <button onClick={onPlayStats} className="btn btn-ghost glow-btn" style={{ padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
          <BarChartIcon size={11} /> {t("play_stats")}
        </button>
        <CookieCheckAction
          status={bulkChecking ? "checking" : (cookieCheckError && accounts.length - validCookies > 0) ? "error" : "idle"}
          invalidCount={accounts.length - validCookies}
          label={t("check_cookies")}
          checkingLabel={t("checking")}
          onRun={onBulkCookieCheck}
        />
        <button onClick={onUtilities} className="btn btn-ghost glow-btn" style={{ padding: "7px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}>
          <SettingsIcon size={11} /> {t("utilities")}
        </button>
      </div>
    </div>
  );
};
