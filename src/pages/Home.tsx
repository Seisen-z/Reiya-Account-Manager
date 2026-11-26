import { AccountLimitLink, isFreeAccountLimit } from "../components/AccountLimitLink";
import { forgetAccountLaunch, useAccountLauncher, useObservedLaunchSessions } from "../lib/useAccountLauncher";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { CATALOG, placeIdForCatalogUniverse } from "../data/catalog";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import {
  GamepadIcon,
  LockIcon,
  XIcon,
  PlayIcon,
  PinIcon,
} from "../components/Icons";
import { AccountSidebar } from "../components/AccountSidebar";
import { LiveSessionsList } from "../components/LiveSessionsList";
import { ActivityPanel } from "../components/ActivityPanel";
import { SingleCookieImportModal } from "../components/SingleCookieImportModal";
import { BulkCookieImportModal } from "../components/BulkCookieImportModal";
import { ComboImportModal } from "../components/ComboImportModal";
import { PlayStatsModal } from "../components/PlayStatsModal";
import { PrivateServerSetupModal } from "../components/PrivateServerSetupModal";
import { RemoveGameConfirmModal } from "../components/RemoveGameConfirmModal";
import { SetAccountGroupModal } from "../components/SetAccountGroupModal";
import { AccountConfigSidebarModal } from "../components/AccountConfigSidebarModal";
import { AccountDetailsDumpModal } from "../components/AccountDetailsDumpModal";
import { SessionDetailsModal } from "../components/SessionDetailsModal";
import { SavePasswordPromptModal } from "../components/SavePasswordPromptModal";
import { HomeHeaderBar } from "../components/HomeHeaderBar";
import { LaunchBar } from "../components/LaunchBar";
import { PinnedGamesSection } from "../components/PinnedGamesSection";
import { useSavedGames } from "../context/SavedGamesContext";
import { RecentGamesSection } from "../components/RecentGamesSection";
import SessionBento from "../components/ui/index";
import Tooltip from "../components/ui/Tooltip";
import { useConfirm } from "../components/ConfirmDialog";
import { GameIcon } from "../components/GameIcon";
import { GameSearchBox, type GameSearchResult } from "../components/GameSearchBox";
import { useBootstrapper as useBootstrapperContext } from "../context/BootstrapperContext";

/* â"€â"€ Types â"€â"€ */
export interface Account {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  is_favorite: boolean;
  cookie_status: string;
  last_launched_at: string | null;
  last_played_game: string;
  notes: string;
  tags: string[];
  default_place_id: string;
  default_game_name: string;
  safe_launch_enabled: boolean;
  auto_rejoin_enabled: boolean;
  launch_cooldown_seconds: number;
  launch_preset_name: string;
  default_private_server: string;
  launcher_preference: string;
  launch_delay_seconds: number;
  has_password?: boolean;
  group?: string;
}

interface LoginResultPayload {
  cookie: string | null;
  window_label: string;
  target_username: string | null;
  error: string | null;
}

export interface Session {
  pid: number;
  user_id: number | null;
  username: string | null;
  avatar_url: string | null;
  game_name: string | null;
  start_time: string | null;
}

export interface EventEntry {
  timestamp: string;
  kind: string;
  user_id: number | null;
  username: string | null;
  avatar_url: string | null;
  detail: string;
}

export interface SessionRecord {
  username: string;
  user_id: number;
  avatar_url: string;
  game_name: string;
  place_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

export interface RecentGame {
  placeId: string;
  name: string;
  creator: string;
  iconUrl: string;
  playedAt?: string;
  privateServer?: string;
}

export interface BulkAddResult {
  preview: string;
  success: boolean;
  username: string | null;
  error: string | null;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* ── Cache for instant page transitions ── */
interface HomeCache {
  accounts: Account[];
  sessions: Session[];
  events: EventEntry[];
  sessionHistory: SessionRecord[];
  recentGames: RecentGame[];
  thumbs: Record<string, string>;
  initialized: boolean;
}

const homeCache: HomeCache = {
  accounts: [],
  sessions: [],
  events: [],
  sessionHistory: [],
  recentGames: [],
  thumbs: {},
  initialized: false,
};

interface Toast {
  id: number;
  msg: string;
  type: "success" | "error" | "info";
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const { status: bootstrapperStatus } = useBootstrapperContext();
  // Real multi-instance state for the "System status" card (null = not loaded yet)
  const [multiInstance, setMultiInstance] = useState<boolean | null>(null);
  useEffect(() => {
    invoke<boolean>("get_multi_instance").then(setMultiInstance).catch(() => setMultiInstance(null));
  }, []);
  const [accounts,       setAccounts]     = useState<Account[]>(() => homeCache.accounts);
  const [sessions,       setSessions]       = useState<Session[]>(() => homeCache.sessions);
  const [events,         setEvents]         = useState<EventEntry[]>(() => homeCache.events);
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>(() => homeCache.sessionHistory);
  const [recentGames,    setRecentGames]    = useState<RecentGame[]>(() => homeCache.recentGames);
  const [thumbs,         setThumbs]         = useState<Record<string, string>>(() => homeCache.thumbs);
  const [initialLoading, setInitialLoading] = useState<boolean>(() => !homeCache.initialized);
  const [, setThumbsLoading]  = useState(true);

  // Play stats modal state & computations
  const [showPlayStats, setShowPlayStats] = useState(false);
  const [bulkChecking, setBulkChecking] = useState(false);

  const playStatsData = useMemo(() => {
    if (sessionHistory.length === 0) {
      return {
        totalSessions: 0,
        totalPlayTime: "0m",
        topAccount: "-",
        byAccount: [],
        byGame: []
      };
    }

    const totalSessions = sessionHistory.length;
    const totalMin = sessionHistory.reduce((sum, r) => sum + r.duration_minutes, 0);
    const totalPlayTime = totalMin < 60 ? `${totalMin}m` : `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;

    const accountGroups: Record<string, { sessions: number; minutes: number }> = {};
    const gameGroups: Record<string, { sessions: number; minutes: number }> = {};

    for (const r of sessionHistory) {
      const u = r.username || "(Unknown)";
      if (!accountGroups[u]) accountGroups[u] = { sessions: 0, minutes: 0 };
      accountGroups[u].sessions++;
      accountGroups[u].minutes += r.duration_minutes;

      const g = r.game_name || "(Unknown)";
      if (!gameGroups[g]) gameGroups[g] = { sessions: 0, minutes: 0 };
      gameGroups[g].sessions++;
      gameGroups[g].minutes += r.duration_minutes;
    }

    const formatTime = (mins: number) => mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

    const accList = Object.entries(accountGroups)
      .map(([name, data]) => ({ name, sessions: data.sessions, minutes: data.minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    const maxAccMin = accList[0]?.minutes || 1;
    const byAccount = accList.map((x, i) => ({
      rank: i + 1,
      name: x.name,
      sessionsLabel: `${x.sessions} ${x.sessions === 1 ? t("session") : t("sessions_plural")}`,
      timeText: formatTime(x.minutes),
      pct: Math.round((x.minutes / maxAccMin) * 100),
    }));

    const gameList = Object.entries(gameGroups)
      .map(([name, data]) => ({ name, sessions: data.sessions, minutes: data.minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    const maxGameMin = gameList[0]?.minutes || 1;
    const byGame = gameList.map((x, i) => ({
      rank: i + 1,
      name: x.name,
      sessionsLabel: `${x.sessions} ${x.sessions === 1 ? t("session") : t("sessions_plural")}`,
      timeText: formatTime(x.minutes),
      pct: Math.round((x.minutes / maxGameMin) * 100),
    }));

    const topAccount = accList[0]?.name ?? "-";

    return {
      totalSessions,
      totalPlayTime,
      topAccount,
      byAccount,
      byGame
    };
  }, [sessionHistory]);

  const [cookieCheckError, setCookieCheckError] = useState(false);

  const handleBulkCookieCheck = async () => {
    if (bulkChecking) return;
    setBulkChecking(true);
    setCookieCheckError(false);
    let invalidCount = 0;
    try {
      for (const acc of accounts) {
        const updated = await handleCheckCookie(acc.user_id);
        if (updated && updated.cookie_status !== "Valid") invalidCount++;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBulkChecking(false);
      setCookieCheckError(invalidCount > 0);
    }
  };

  // Launch state
  const [selAccount,      setSelAccount]      = useState<number | null>(null);
  const [multiSelected,   setMultiSelected]   = useState<Set<number>>(new Set());
  const toggleMultiSelect = (userId: number) => {
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };
  const [launchPlaceId,   setLaunchPlaceId]   = useState("");  // selected placeId (from recent or manual)
  const [jobId,           setJobId]           = useState("");
  const [accessCode,      setAccessCode]      = useState("");
  const [useBootstrapper, setUseBootstrapper] = useState<boolean>(() => {
    return localStorage.getItem("reiya_use_bootstrapper") === "true";
  });
  const { launchAccount, launchingAccounts, launchFeedback, retryLaunch } = useAccountLauncher();
  const [bulkLaunching, setBulkLaunching] = useState(false);
  const [accountMenu, setAccountMenu] = useState<{
    x: number;
    y: number;
    account: Account;
  } | null>(null);
  const [launchError,     setLaunchError]     = useState("");

  // Add account
  const [addMenu,       setAddMenu]       = useState(false);
  const addMenuRef                        = useRef<HTMLDivElement>(null);
  const [showSingle,    setShowSingle]    = useState(false);   // single cookie modal
  const [showBulk,      setShowBulk]      = useState(false);   // bulk import modal
  const [addCookie,     setAddCookie]     = useState("");
  const [adding,        setAdding]        = useState(false);
  const [addError,      setAddError]      = useState("");
  const [bulkText,      setBulkText]      = useState("");
  const [bulkAdding,    setBulkAdding]    = useState(false);
  const [bulkResults,   setBulkResults]   = useState<BulkAddResult[]>([]);

  // User:Pass modal
  const [showUserPass,   setShowUserPass]   = useState(false);
  const [comboText,      setComboText]      = useState("");
  const [loginLoading,   setLoginLoading]   = useState(false);
  const [loginError,     setLoginError]     = useState("");

  // Cookie-check state per account
  const [checkingCookie, setCheckingCookie] = useState<Record<number, boolean>>({});

  // Custom dialog modals
  const [privateServerModal, setPrivateServerModal] = useState<{ placeId: string, name: string, currentValue: string } | null>(null);
  const [privateServerInput, setPrivateServerInput] = useState("");
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ placeId: string, name: string } | null>(null);

  // Account Configuration Sidebar Modal State
  const [configSidebarAccount, setConfigSidebarAccount] = useState<Account | null>(null);

  // Dump Details Modal State
  const [dumpAccount, setDumpAccount] = useState<Account | null>(null);

  // Health check status per account
  const [healthStatus, setHealthStatus] = useState<Record<number, "checking" | "valid" | "invalid" | "unknown">>({});
  const healthCheckedRef = useRef(false);

  // Group modal
  const [groupModal, setGroupModal] = useState<{ account: Account } | null>(null);
  const [groupInput, setGroupInput] = useState("");

  // Home QoL state
  const [accSearch,  setAccSearch]  = useState("");
  const [accFilter,  setAccFilter]  = useState<"all" | "valid" | "favorites">("all");
  const [accGroup,   setAccGroup]   = useState<string | null>(null);
  // Feature 1: Toast notification system
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((msg: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200);
  }, []);

  // Feature 8: Launch history
  const [launchHistory, setLaunchHistory] = useState<Array<{userId:number; username:string; placeId:string; gameName:string}>>(() => {
    try { return JSON.parse(localStorage.getItem("reiya_launch_history") || "[]"); } catch { return []; }
  });
  const pushLaunchHistory = useCallback((userId: number, username: string, placeId: string, gameName: string) => {
    setLaunchHistory(prev => {
      const entry = {userId,username,placeId,gameName};
      const next = [entry, ...prev.filter(h => !(h.userId===userId && h.placeId===placeId))].slice(0,3);
      localStorage.setItem("reiya_launch_history", JSON.stringify(next));
      return next;
    });
  }, []);

  // Feature 9: Pinned games — backed by the shared SavedGamesContext so Home
  // and the Utilities page always agree on what's pinned (they used to keep
  // separate, unsynced localStorage lists).
  const { savedGames, toggleSaved, moveSaved } = useSavedGames();
  const pinnedGames = useMemo(() => savedGames.map(g => g.placeId), [savedGames]);
  const togglePinGame = useCallback((g: RecentGame) => {
    toggleSaved({ placeId: g.placeId, name: g.name, creator: g.creator, iconUrl: g.iconUrl, privateServer: g.privateServer });
  }, [toggleSaved]);

  // Feature 10: Session detail popover
  const [sessionDetail, setSessionDetail] = useState<Session | null>(null);

  // Feature 5: Refs for arrow key navigation
  const selAccountRef = useRef<number|null>(null);
  const flatAccountsRef = useRef<Account[]>([]);

  // Feature 2: Ref for launchPlaceId (to avoid stale closure in selAccount effect)
  const launchPlaceIdRef = useRef(launchPlaceId);

  // Feature 6: Game search state
  const [gameSearch, setGameSearch] = useState("");

  // Main area tab: "games" (default) or "activity" (stats, history, event log)
  const [homeTab, setHomeTab] = useState<"games" | "activity">(() => {
    try { return localStorage.getItem("reiya_home_tab") === "activity" ? "activity" : "games"; } catch { return "games"; }
  });
  // Quick tips card (first-time users)
  const [tipsDone, setTipsDone] = useState<boolean>(() => {
    try { return localStorage.getItem("reiya_home_tips_done") === "true"; } catch { return true; }
  });
  const dismissTips = () => {
    setTipsDone(true);
    try { localStorage.setItem("reiya_home_tips_done", "true"); } catch { /* ignore */ }
  };
  const switchTab = (tab: "games" | "activity") => {
    setHomeTab(tab);
    try { localStorage.setItem("reiya_home_tab", tab); } catch { /* ignore */ }
  };

  // Feature 4: Checking state for re-validate button
  const [reValidating, setReValidating] = useState(false);
  const [savePasswordPrompt, setSavePasswordPrompt] = useState<{ userId: number; username: string } | null>(null);
  const [savePasswordInput, setSavePasswordInput] = useState("");

  /* â"€â"€ Load on mount, poll sessions â"€â"€ */
  useEffect(() => {
    async function load() {
      const [accs, sess, evts, hist, recents, settingsData] = await Promise.all([
        invoke<Account[]>("get_accounts").catch(() => [] as Account[]),
        invoke<Session[]>("get_live_sessions").catch(() => [] as Session[]),
        invoke<EventEntry[]>("get_event_log").catch(() => [] as EventEntry[]),
        invoke<SessionRecord[]>("get_session_history").catch(() => [] as SessionRecord[]),
        invoke<RecentGame[]>("get_recent_games").catch(() => [] as RecentGame[]),
        invoke<any>("get_settings").catch(() => ({})),
      ]);
      setAccounts(accs);
      setSessions(sess);
      setEvents(evts);
      setSessionHistory(hist);
      setRecentGames(recents);

      // Store in memory cache for instant page returns
      homeCache.accounts = accs;
      homeCache.sessions = sess;
      homeCache.events = evts;
      homeCache.sessionHistory = hist;
      homeCache.recentGames = recents;
      homeCache.initialized = true;
      setInitialLoading(false);

      // Sync bootstrapper from global settings
      if (settingsData && settingsData.UseBootstrapperLaunch !== undefined) {
        setUseBootstrapper(settingsData.UseBootstrapperLaunch);
        localStorage.setItem("reiya_use_bootstrapper", settingsData.UseBootstrapperLaunch ? "true" : "false");
      }

      // Sync language from settings
      if (settingsData && settingsData.Language) {
        localStorage.setItem("reiya_language", settingsData.Language);
      }

      // Restore last selected account, fall back to first account
      const lastAccId = Number(localStorage.getItem("reiya_last_account"));
      const restoredAcc = lastAccId && accs.find(a => a.user_id === lastAccId) ? lastAccId : accs[0]?.user_id ?? null;
      if (restoredAcc !== null) setSelAccount(restoredAcc);
      // Restore last selected game
      let lastPlace = localStorage.getItem("reiya_last_place_id");
      const fixedPlace = lastPlace ? placeIdForCatalogUniverse(lastPlace) : null; // old Hub saved a universe ID
      if (fixedPlace) { lastPlace = fixedPlace; localStorage.setItem("reiya_last_place_id", fixedPlace); }
      if (lastPlace) setLaunchPlaceId(lastPlace);
    }
    load();

    // Listen for session status changes to reload statistics and sessions dynamically
    let unlisten: (() => void) | null = null;
    let unlistenAccounts: (() => void) | null = null;
    const setupListener = async () => {
      unlisten = await listen("session-status-changed", () => {
        Promise.all([
          invoke<Session[]>("get_live_sessions").catch(() => []),
          invoke<EventEntry[]>("get_event_log").catch(() => []),
          invoke<SessionRecord[]>("get_session_history").catch(() => []),
          invoke<RecentGame[]>("get_recent_games").catch(() => []),
        ]).then(([sess, evts, hist, recents]) => {
          setSessions(sess);
          setEvents(evts);
          setSessionHistory(hist);
          setRecentGames(recents);
        });
      });
      unlistenAccounts = await listen("accounts-updated", () => {
        refreshAccounts();
      });
    };
    setupListener();

    const interval = setInterval(() => {
      if (document.hidden) return;
      invoke<Session[]>("get_live_sessions").then(sess => {
        setSessions(prev => JSON.stringify(prev) === JSON.stringify(sess) ? prev : sess);
      }).catch(() => {});
    }, 5000);

    // Keyboard shortcuts
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") {
        e.preventDefault();
        // Trigger launch via a custom event the launch button can listen to
        document.dispatchEvent(new CustomEvent("reiya-launch-shortcut"));
      }
      if (e.key === "Escape") {
        setAccSearch("");
      }
      // Feature 5: Arrow key navigation in account list
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const flat = flatAccountsRef.current;
        if (flat.length === 0) return;
        const cur = selAccountRef.current;
        const idx = flat.findIndex(a => a.user_id === cur);
        let next: number;
        if (e.key === "ArrowDown") {
          next = idx < flat.length - 1 ? idx + 1 : 0;
        } else {
          next = idx > 0 ? idx - 1 : flat.length - 1;
        }
        const nextId = flat[next].user_id;
        setSelAccount(nextId);
        localStorage.setItem("reiya_last_account", String(nextId));
      }
    };
    document.addEventListener("keydown", handleKey);

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
      if (unlistenAccounts) unlistenAccounts();
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Fetch catalog game icons. The backend looks them up by universe ID,
  // so convert the result back to place IDs (which is how thumbs are keyed).
  useEffect(() => {
    invoke<Record<string, string>>("fetch_thumbnails", { placeIds: CATALOG.map(g => g.universeId) })
      .then(byUniverse => {
        const byPlace: Record<string, string> = {};
        for (const g of CATALOG) if (byUniverse[g.universeId]) byPlace[g.placeId] = byUniverse[g.universeId];
        setThumbs(prev => ({ ...byPlace, ...prev }));
      })
      .catch(() => {});
  }, []);

  // When recentGames is empty but we have session history, reconstruct from sessions
  useEffect(() => {
    if (recentGames.length > 0 || sessionHistory.length === 0) return;
    const seen = new Set<string>();
    const synthetic: RecentGame[] = [];
    for (const r of [...sessionHistory].reverse()) {
      if (!r.place_id || seen.has(r.place_id)) continue;
      seen.add(r.place_id);
      synthetic.push({
        placeId: r.place_id,
        name: r.game_name || `Place ${r.place_id}`,
        creator: "",
        iconUrl: "",
        playedAt: r.start_time,
      });
    }
    if (synthetic.length > 0) setRecentGames(synthetic.slice(0, 20));
  }, [recentGames, sessionHistory]);

  // Fetch thumbnails for all known place IDs (recent games + session history)
  useEffect(() => {
    const fromRecent = recentGames.map(r => r.placeId);
    const fromHistory = sessionHistory.map(r => r.place_id).filter(Boolean);
    const placeIds = [...new Set([...fromRecent, ...fromHistory])].filter(Boolean);
    if (placeIds.length === 0) { setThumbsLoading(false); return; }
    invoke<Record<string, string>>("fetch_place_thumbnails", { placeIds })
      .then(map => setThumbs(prev => ({ ...prev, ...map })))
      .catch(() => {})
      .finally(() => setThumbsLoading(false));
  }, [recentGames, sessionHistory]);

  useEffect(() => {
    if (location.state && typeof location.state === "object") {
      const state = location.state as { placeId?: string; jobId?: string };
      if (state.placeId) {
        setLaunchPlaceId(state.placeId);
        localStorage.setItem("reiya_last_place_id", state.placeId);
      }
      if (state.jobId !== undefined) {
        setJobId(state.jobId || "");
      }
      invoke<RecentGame[]>("get_recent_games")
        .then(setRecentGames)
        .catch(() => {});
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state]);

  // Per-account game history helpers
  const getAccGameHistory = useCallback((userId: number): RecentGame[] => {
    try { return JSON.parse(localStorage.getItem(`reiya_acc_games_${userId}`) ?? "[]"); }
    catch { return []; }
  }, []);

  const pushAccGameHistory = useCallback((userId: number, game: RecentGame) => {
    const prev = getAccGameHistory(userId).filter(g => g.placeId !== game.placeId);
    localStorage.setItem(`reiya_acc_games_${userId}`, JSON.stringify([game, ...prev].slice(0, 10)));
  }, [getAccGameHistory]);

  // Tray: when user clicks an account in the system tray, select it
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<number>("tray-account-selected", (event) => {
      setSelAccount(event.payload);
      localStorage.setItem("reiya_last_account", String(event.payload));
      setLaunchError("");
    }).then(fn => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Background health check — runs once when accounts first load
  useEffect(() => {
    if (accounts.length === 0 || healthCheckedRef.current) return;
    healthCheckedRef.current = true;
    const queue = [...accounts];
    setHealthStatus(prev => {
      const next = { ...prev };
      for (const acc of queue) next[acc.user_id] = "checking";
      return next;
    });
    const MAX_PARALLEL = 3;
    const worker = async () => {
      for (let acc = queue.shift(); acc; acc = queue.shift()) {
        const userId = acc.user_id;
        try {
          const status = await invoke<string>("check_account_health", { userId });
          setHealthStatus(prev => ({ ...prev, [userId]: status.toLowerCase() as "valid" | "invalid" }));
        } catch {
          setHealthStatus(prev => ({ ...prev, [userId]: "unknown" }));
        }
      }
    };
    const workers = Math.min(MAX_PARALLEL, queue.length); // compute first: each worker shifts from the queue immediately
    for (let i = 0; i < workers; i++) void worker();
  }, [accounts.length]);

  // Pre-fill accessCode when launchPlaceId changes
  const prevLaunchPlaceIdRef = useRef("");
  useEffect(() => {
    if (launchPlaceId && launchPlaceId !== prevLaunchPlaceIdRef.current) {
      const game = recentGames.find(g => g.placeId === launchPlaceId);
      if (game) {
        setAccessCode(game.privateServer || "");
      } else {
        setAccessCode("");
      }
    }
    prevLaunchPlaceIdRef.current = launchPlaceId;
  }, [launchPlaceId, recentGames]);

  /* â"€â"€ Derived â"€â"€ */
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? t("good_morning") : hour < 18 ? t("good_afternoon") : t("good_evening");

  const validCookies = accounts.filter(a => a.cookie_status === "Valid").length;
  const favorites    = accounts.filter(a => a.is_favorite).length;

  const activeUserIds = useMemo(() => new Set(
    sessions.map(session => session.user_id).filter((id): id is number => id !== null),
  ), [sessions]);
  useObservedLaunchSessions(activeUserIds, launchFeedback);
  const activeGames = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of sessions) if (s.user_id !== null && s.game_name) map.set(s.user_id, s.game_name);
    return map;
  }, [sessions]);

  // Weekly stats from session history (last 7 days)
  const weekStats = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = sessionHistory.filter(r => new Date(r.start_time).getTime() >= cutoff);
    const sessCount = week.length;
    const minutes   = week.reduce((s, r) => s + r.duration_minutes, 0);
    const uniqueAcc = new Set(week.map(r => r.username)).size;
    const hours     = Math.floor(minutes / 60);
    const mins      = minutes % 60;
    const timeStr   = minutes < 60 ? `${minutes}m` : `${hours}h ${mins}m`;
    return { sessCount, minutes, uniqueAcc, timeStr };
  }, [sessionHistory]);

  // 7-day graph from session history (by start_time)
  const graphData = useMemo(() => {
    const days: { day: string; dateStr: string; sessions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        dateStr: d.toDateString(),
        day:     d.toLocaleDateString("en-US", { weekday: "short" }),
        sessions: 0,
      });
    }
    for (const r of sessionHistory) {
      const ds = new Date(r.start_time).toDateString();
      const bucket = days.find(b => b.dateStr === ds);
      if (bucket) bucket.sessions++;
    }
    return days.map(({ day, sessions }) => ({ day, sessions }));
  }, [sessionHistory]);

  // Last 5 session history records for "Recent Activity"
  const recentActivity = sessionHistory.slice(0, 5);

  // Top games {t("by_total_playtime_lbl")} from all session history
  const topGames = useMemo(() => {
    const map = new Map<string, { placeId: string; name: string; minutes: number; sessions: number }>();
    for (const r of sessionHistory) {
      const key = r.place_id;
      const existing = map.get(key);
      if (existing) {
        existing.minutes += r.duration_minutes;
        existing.sessions++;
      } else {
        map.set(key, { placeId: r.place_id, name: r.game_name || "Unknown", minutes: r.duration_minutes, sessions: 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6)
      .map(g => {
        const rg = recentGames.find(x => x.placeId === g.placeId);
        const thumbnailUrl = thumbs[g.placeId] || rg?.iconUrl; // fresh first; saved links can go stale
        return { ...g, thumbnailUrl };
      });
  }, [sessionHistory, recentGames, thumbs]);

  // Accounts grouped by group name for the left panel
  const accGroups = useMemo(() => {
    const PRESET_ORDER = ["Main", "Alts", "Trading", "Farming"];
    const seen = Array.from(new Set(accounts.map(a => a.group?.trim()).filter((g): g is string => !!g)));
    return seen.sort((a, b) => {
      const ai = PRESET_ORDER.indexOf(a);
      const bi = PRESET_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [accounts]);

  // Reset accGroup if the group no longer exists
  useEffect(() => {
    if (accGroup !== null && !accGroups.includes(accGroup)) setAccGroup(null);
  }, [accGroups, accGroup]);

  const groupedAccounts = useMemo(() => {
    const q = accSearch.toLowerCase();
    const filtered = accounts.filter(acc => {
      const matchSearch = !q || acc.username.toLowerCase().includes(q) || (acc.display_name || "").toLowerCase().includes(q);
      const matchFilter = accFilter === "all" || (accFilter === "valid" && acc.cookie_status === "Valid") || (accFilter === "favorites" && acc.is_favorite);
      const matchGroup = accGroup === null || (acc.group?.trim() || "") === accGroup;
      return matchSearch && matchFilter && matchGroup;
    });
    // Pinned accounts first (stable), matching the sidebar's "Pinned" section so arrow keys follow screen order
    const ordered = accFilter === "all"
      ? [...filtered.filter(a => a.is_favorite), ...filtered.filter(a => !a.is_favorite)]
      : filtered;
    return [["", ordered]] as [string, Account[]][];
  }, [accounts, accSearch, accFilter, accGroup]);

  // Feature 5: Keep selAccountRef up to date
  useEffect(() => { selAccountRef.current = selAccount; }, [selAccount]);
  // Feature 5: Keep flatAccountsRef up to date (after groupedAccounts is declared)
  useEffect(() => {
    flatAccountsRef.current = groupedAccounts.flatMap(([, accs]) => accs);
  }, [groupedAccounts]);

  // Feature 2: Keep launchPlaceIdRef up to date
  useEffect(() => { launchPlaceIdRef.current = launchPlaceId; }, [launchPlaceId]);

  // Feature 2: Auto-populate game when selecting an account
  useEffect(() => {
    if (selAccount === null) return;
    const account = accounts.find(a => a.user_id === selAccount);
    if (account && account.default_place_id && !launchPlaceIdRef.current) {
      setLaunchPlaceId(account.default_place_id);
      localStorage.setItem("reiya_last_place_id", account.default_place_id);
    }
    if (account?.default_private_server) setAccessCode(account.default_private_server);
  }, [selAccount, accounts]);

  // Per-account game options: show account-specific history first, then global recents
  const accountGameOptions = useMemo(() => {
    if (selAccount === null) return recentGames;
    const accHistory = getAccGameHistory(selAccount);
    const accIds = new Set(accHistory.map(g => g.placeId));
    const rest = recentGames.filter(g => !accIds.has(g.placeId));
    return [...accHistory, ...rest];
  }, [selAccount, recentGames, getAccGameHistory]);

  // Launch derived
  const launchGame            = recentGames.find(g => g.placeId === launchPlaceId.trim());

  // Handle right-click context menu to set/edit private server URL or code via custom modal
  const handleGameContextMenu = (e: React.MouseEvent, g: RecentGame) => {
    e.preventDefault();
    setPrivateServerInput(g.privateServer || "");
    setPrivateServerModal({
      placeId: g.placeId,
      name: g.name,
      currentValue: g.privateServer || ""
    });
  };

  const handleAccountContextMenu = (e: React.MouseEvent, a: Account) => {
    e.preventDefault();
    setAccountMenu({
      x: e.clientX,
      y: e.clientY,
      account: a,
    });
  };

  const handleSavePrivateServer = async () => {
    if (!privateServerModal) return;
    const { placeId } = privateServerModal;
    const trimmed = privateServerInput.trim();
    const value = trimmed === "" ? null : trimmed;
    try {
      await invoke("set_private_server", { placeId, privateServer: value });
      const recents = await invoke<RecentGame[]>("get_recent_games").catch(() => []);
      setRecentGames(recents);
      if (launchPlaceId === placeId) {
        setAccessCode(value || "");
      }
      setPrivateServerModal(null);
    } catch (err) {
      showToast("Failed to save private server: " + err, "error");
    }
  };

  const handleConfirmDeleteGame = async () => {
    if (!deleteConfirmModal) return;
    const { placeId } = deleteConfirmModal;
    try {
      await invoke("remove_recent_game", { placeId });
      const recents = await invoke<RecentGame[]>("get_recent_games").catch(() => []);
      setRecentGames(recents);
      if (launchPlaceId === placeId) {
        setLaunchPlaceId("");
        setAccessCode("");
      }
      setDeleteConfirmModal(null);
    } catch (err) {
      showToast("Failed to remove game: " + err, "error");
    }
  };

  const handleSaveGroup = async () => {
    if (!groupModal) return;
    await invoke("set_account_group", { userId: groupModal.account.user_id, group: groupInput });
    await refreshAccounts();
    setGroupModal(null);
  };

  const handleCopyDumpDetails = async () => {
    if (!dumpAccount) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(dumpAccount, null, 2));
      showToast(t("copied"), "success");
    } catch (err) {
      showToast("Failed to copy details: " + err, "error");
    }
  };

  const handleCopySessionPid = () => {
    if (!sessionDetail) return;
    navigator.clipboard.writeText(String(sessionDetail.pid));
    showToast("PID copied!", "success");
  };

  const handleSavePasswordSubmit = async () => {
    if (!savePasswordPrompt) return;
    if (savePasswordInput.trim()) {
      try {
        await invoke("save_account_password", { userId: savePasswordPrompt.userId, password: savePasswordInput.trim() });
        setAccounts(prev => prev.map(a => a.user_id === savePasswordPrompt.userId ? { ...a, has_password: true } : a));
        showToast("Password saved.", "success");
      } catch (err) {
        showToast("Failed to save password: " + err, "error");
        return; // keep the prompt open so the user can retry
      }
    }
    setSavePasswordPrompt(null);
  };

  // Enter key in the prompt: same as clicking Save, but ignore an empty field
  const handleSavePasswordEnter = async () => {
    if (!savePasswordPrompt || !savePasswordInput.trim()) return;
    await handleSavePasswordSubmit();
  };
  const effectivePlaceId      = launchPlaceId.trim() || null;
  const effectiveGameName     = launchGame?.name ?? (launchPlaceId.trim() ? `Place ${launchPlaceId.trim()}` : null);
  const launchThumb           = launchPlaceId ? (thumbs[launchPlaceId] ?? null) : null;
  const selectedAccountIsActive = selAccount !== null && activeUserIds.has(selAccount);

  const handlePastePlaceId = async () => {
    try {
      const clip = await readText();
      if (clip) {
        const match = clip.match(/\d{6,}/);
        const id = match ? match[0] : clip.trim();
        setLaunchPlaceId(id);
        localStorage.setItem("reiya_last_place_id", id);
        setLaunchError("");
      }
    } catch { }
  };

  /* â"€â"€ Handlers â"€â"€ */
  const refreshAccounts = async () => {
    const [accs, evts] = await Promise.all([
      invoke<Account[]>("get_accounts").catch(() => [] as Account[]),
      invoke<EventEntry[]>("get_event_log").catch(() => [] as EventEntry[]),
    ]);
    setAccounts(accs);
    setEvents(evts);
  };

  const handleOpenCookieMenu = async () => {
    setAddMenu(false);
    try {
      const clip = await readText();
      if (clip && clip.includes(".ROBLOSECURITY")) {
        if (await confirmDialog({
          title: "Import the cookie from your clipboard?",
          message: "A Roblox login cookie was found on your clipboard. Import it as a new account?",
          confirmLabel: "Import",
        })) {
          setAdding(true);
          setAddError("");
          try {
            const acc = await invoke<Account>("add_account", { cookie: clip });
            setAccounts(prev => {
              const idx = prev.findIndex(a => a.user_id === acc.user_id);
              return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
            });
            await refreshAccounts();
            return;
          } catch (e) {
            setAddCookie("");
            setAddError(String(e));
            setShowSingle(true);
            return;
          } finally {
            setAdding(false);
          }
        }
      }
    } catch { }
    setAddCookie("");
    setAddError("");
    setShowSingle(true);
  };

  const handleAddSingle = async () => {
    if (!addCookie.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      const acc = await invoke<Account>("add_account", { cookie: addCookie });
      setAccounts(prev => {
        const idx = prev.findIndex(a => a.user_id === acc.user_id);
        return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
      });
      await refreshAccounts();
      setAddCookie("");
      setShowSingle(false);
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAdding(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    setBulkAdding(true);
    setBulkResults([]);
    try {
      const results = await invoke<BulkAddResult[]>("add_accounts_bulk", { cookies: lines });
      setBulkResults(results);
      await refreshAccounts();
    } catch (e) {
      setBulkResults([{ preview: "-", success: false, username: null, error: String(e) }]);
    } finally {
      setBulkAdding(false);
    }
  };

  const loginOneAccount = (username?: string, password?: string): Promise<LoginResultPayload | null> => {
    return new Promise((resolve) => {
      let unlisten: (() => void) | null = null;
      const windowLabel = `login-${Math.floor(Math.random() * 1000000000)}`;

      const setupListener = async () => {
        unlisten = await listen<LoginResultPayload>("login-cookie-result", (event) => {
          if (event.payload.window_label === windowLabel) {
            if (unlisten) unlisten();
            resolve(event.payload);
          }
        });
      };

      setupListener().then(async () => {
        try {
          await invoke("open_login_window", { 
            windowLabel,
            username: username || null, 
            password: password || null 
          });
        } catch (e) {
          if (unlisten) unlisten();
          showToast(`Failed to open login window: ${String(e)}`, "error");
          resolve(null);
        }
      });
    });
  };

  const handleManualLogin = async () => {
    setAddMenu(false);
    setLoginLoading(true);
    try {
      const res = await loginOneAccount();
      if (res && res.cookie) {
        const acc = await invoke<Account>("add_account", { cookie: res.cookie });
        setAccounts(prev => {
          const idx = prev.findIndex(a => a.user_id === acc.user_id);
          return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
        });
        await refreshAccounts();
        setSavePasswordInput("");
        setSavePasswordPrompt({ userId: acc.user_id, username: acc.username });
      } else {
        const reason = res?.error || "Login window was closed or cookie extraction failed.";
        showToast("Manual login not saved: " + reason, "error");
      }
    } catch (e) {
      showToast(`Manual login failed: ${String(e)}`, "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleComboImport = async (combosText: string) => {
    const lines = combosText.split("\n")
      .map(l => l.trim())
      .filter(l => l.includes(":") && l.length > 2);

    if (lines.length === 0) {
      setLoginError("No valid combos found. Format: username:password");
      return;
    }

    setLoginLoading(true);
    const total = lines.length;
    let successCount = 0;
    let doneCount = 0;

    const pwMap: Record<string, string> = {};
    for (const line of lines) {
      const [u, p] = line.split(":", 2).map(s => s.trim());
      if (u) pwMap[u.toLowerCase()] = p ?? "";
    }

    const failedAccounts: string[] = [];
    const succeededAccounts: string[] = [];

    // Process all imports in parallel (staggered window opening)
    const promises = lines.map(async (line, index) => {
      const [username, password] = line.split(":", 2).map(s => s.trim());
      // Stagger window opens by 800ms each so WebView2 environments initialise cleanly
      await new Promise(r => setTimeout(r, index * 800));
      
      setLoginError(`Opening window ${index + 1}/${total}: ${username}...`);
      const res = await loginOneAccount(username, password);
      doneCount++;
      setLoginError(`${doneCount}/${total} windows completed...`);

      if (res && res.cookie) {
        try {
          const acc = await invoke<Account>("add_account", { cookie: res.cookie });
          const pw = pwMap[acc.username.toLowerCase()] ?? "";
          if (pw) await invoke("save_account_password", { userId: acc.user_id, password: pw }).catch(() => {});
          setAccounts(prev => {
            const idx = prev.findIndex(a => a.user_id === acc.user_id);
            // Never keep the plain password in UI state — only remember that one is saved
            const updated = { ...acc, has_password: acc.has_password || !!pw };
            return idx >= 0 ? prev.map((a, i) => i === idx ? updated : a) : [...prev, updated];
          });
          succeededAccounts.push(acc.username);
          successCount++;
        } catch (err) {
          console.error("add_account failed:", err);
          failedAccounts.push(`${username} (add_account error: ${err})`);
        }
      } else {
        const reason = res?.error || "Window closed or interception timed out.";
        failedAccounts.push(`${username} (${reason})`);
      }
    });

    setLoginError(`All ${total} windows opened — waiting for logins...`);
    await Promise.all(promises);

    setLoginLoading(false);
    setShowUserPass(false);
    setComboText("");
    await refreshAccounts();

    let msg = `Done! Imported ${successCount}/${total} account(s).`;
    if (succeededAccounts.length > 0) msg += `\n\n✓ Success:\n${succeededAccounts.map(u => `  • ${u}`).join("\n")}`;
    if (failedAccounts.length > 0) msg += `\n\n✗ Failed (${failedAccounts.length}):\n${failedAccounts.map(f => `  • ${f}`).join("\n")}`;
    showToast(`Imported ${successCount}/${total} account(s).`, successCount > 0 ? "success" : "error");
  };



  const handleCheckCookie = async (userId: number): Promise<Account | undefined> => {
    setCheckingCookie(prev => ({ ...prev, [userId]: true }));
    try {
      const updated = await invoke<Account>("validate_cookie", { userId });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updated : a));
      setEvents(await invoke<EventEntry[]>("get_event_log").catch(() => []));
      return updated;
    } catch {
      return undefined;
    } finally {
      setCheckingCookie(prev => ({ ...prev, [userId]: false }));
    }
  };

  // Wire Enter shortcut → launch
  useEffect(() => {
    const handler = () => { handleLaunch(); };
    document.addEventListener("reiya-launch-shortcut", handler);
    return () => document.removeEventListener("reiya-launch-shortcut", handler);
  });

  // A game picked from name search: select it, show its artwork right away, and save it to recent games
  const handlePickSearchedGame = async (g: GameSearchResult) => {
    const placeId = String(g.place_id);
    setLaunchPlaceId(placeId);
    localStorage.setItem("reiya_last_place_id", placeId);
    setGameSearch("");
    setLaunchError("");
    setAccessCode("");
    if (g.icon_url) setThumbs(prev => ({ ...prev, [placeId]: g.icon_url }));
    // Show the name immediately, before the backend has saved it
    setRecentGames(prev => prev.some(r => r.placeId === placeId)
      ? prev
      : [{ placeId, name: g.name, creator: g.creator_name, iconUrl: g.icon_url }, ...prev]);
    showToast(`Selected ${g.name}`, "success");
    try {
      await invoke("add_recent_game", { placeId });
      const recents = await invoke<RecentGame[]>("get_recent_games");
      if (recents.some(r => r.placeId === placeId)) setRecentGames(recents);
    } catch { /* keep the optimistic entry */ }
  };

  // After a launch, give Roblox a few seconds to start, then reload sessions, events, history and recent games.
  const refreshActivitySoon = () => {
    setTimeout(async () => {
      const [sess, evts, hist, recents] = await Promise.all([
        invoke<Session[]>("get_live_sessions").catch(() => [] as Session[]),
        invoke<EventEntry[]>("get_event_log").catch(() => [] as EventEntry[]),
        invoke<SessionRecord[]>("get_session_history").catch(() => [] as SessionRecord[]),
        invoke<RecentGame[]>("get_recent_games").catch(() => [] as RecentGame[]),
      ]);
      setSessions(sess);
      setEvents(evts);
      setSessionHistory(hist);
      setRecentGames(recents);
    }, 3000);
  };

  const handleLaunch = async () => {
    if (selAccount === null || launchingAccounts.has(selAccount)) return;
    const account = accounts.find(a => a.user_id === selAccount);
    if (!account) return;

    if (account.cookie_status !== "Valid") {
      setLaunchError("Cookie is not valid. Check the cookie first.");
      return;
    }

    setLaunchError("");
    try {
      await launchAccount({
        userId:         selAccount,
        placeId:        effectivePlaceId,
        jobId:          jobId    || null,
        accessCode:     accessCode || null,
        gameName:       effectiveGameName,
        useBootstrapper,
      });
      // Save to per-account game history
      if (effectivePlaceId && launchGame) {
        pushAccGameHistory(selAccount, launchGame);
      }
      // Feature 8: Push launch history
      pushLaunchHistory(selAccount, account.username, effectivePlaceId || "", effectiveGameName || "");
      refreshActivitySoon();
    } catch (e) {
      setLaunchError(String(e));
    }
  };

  const handleLaunchMultiple = async () => {
    const targets = accounts.filter(account => multiSelected.has(account.user_id) && !launchingAccounts.has(account.user_id));
    if (bulkLaunching || targets.length === 0) return;
    setBulkLaunching(true);

    setLaunchError("");

    const failed = (await Promise.all(targets.map(async account => {
      const userId = account.user_id;
      if (account.cookie_status !== "Valid") return account.username;
      try {
        await launchAccount({
          userId,
          placeId:        effectivePlaceId,
          jobId:          jobId || null,
          accessCode:     accessCode || null,
          gameName:       effectiveGameName,
          useBootstrapper,
        });
        if (effectivePlaceId && launchGame) pushAccGameHistory(userId, launchGame);
        pushLaunchHistory(userId, account.username, effectivePlaceId || "", effectiveGameName || "");
        return null;
      } catch {
        return account.username;
      }
    }))).filter(Boolean);

    if (failed.length > 0) setLaunchError(`Failed to launch: ${failed.join(", ")}`);
    setMultiSelected(current => {
      const next = new Set(current);
      for (const account of targets) next.delete(account.user_id);
      return next;
    });
    refreshActivitySoon();
    setBulkLaunching(false);
  };

  const handleLaunchApp = async () => {
    if (selAccount === null || launchingAccounts.has(selAccount)) return;
    const account = accounts.find(a => a.user_id === selAccount);
    if (!account) return;

    if (account.cookie_status !== "Valid") {
      setLaunchError("Cookie is not valid. Check the cookie first.");
      return;
    }

    setLaunchError("");
    try {
      await launchAccount({
        userId:         selAccount,
        placeId:        null,
        jobId:          null,
        accessCode:     null,
        gameName:       "Roblox App",
        useBootstrapper,
        appMode:        true,
      });
      refreshActivitySoon();
    } catch (e) {
      setLaunchError(String(e));
    }
  };

  const handleKillOne = async (pid: number) => {
    await invoke("kill_session", { pid }).catch(() => {});
    setSessions(prev => prev.filter(s => s.pid !== pid));
    setEvents(await invoke<EventEntry[]>("get_event_log").catch(() => []));
  };

  const handleKillAll = async () => {
    if (!(await confirmDialog({
      title: `Close all ${sessions.length} running Roblox ${sessions.length === 1 ? "window" : "windows"}?`,
      message: "Every account that's playing right now will be disconnected.",
      confirmLabel: "Kill all",
      danger: true,
    }))) return;
    await invoke("kill_all_sessions").catch(() => {});
    setSessions([]);
  };

  const handleSelectRecentGame = (placeId: string) => {
    setLaunchPlaceId(placeId);
    localStorage.setItem("reiya_last_place_id", placeId);
    setLaunchError("");
    const game = recentGames.find(g => g.placeId === placeId);
    setAccessCode(game?.privateServer || "");
  };

  const handleAccessCodeChange = (val: string) => {
    setAccessCode(val);
  };



  return (
  <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }} onClick={() => { setAddMenu(false); setAccountMenu(null); }}>

    {/* ── Single Cookie Modal ── */}
    <SingleCookieImportModal
      open={showSingle}
      addCookie={addCookie}
      setAddCookie={setAddCookie}
      addError={addError}
      adding={adding}
      onClose={() => { setShowSingle(false); setAddError(""); }}
      onSubmit={handleAddSingle}
    />

    {/* ── Bulk Import Modal ── */}
    <BulkCookieImportModal
      open={showBulk}
      bulkText={bulkText}
      setBulkText={setBulkText}
      bulkResults={bulkResults}
      bulkAdding={bulkAdding}
      onClose={() => { if (!bulkAdding) { setShowBulk(false); setBulkText(""); setBulkResults([]); } }}
      onSubmit={handleBulkImport}
    />

    {/* ── User:Pass Modal ── */}
    <ComboImportModal
      open={showUserPass}
      comboText={comboText}
      setComboText={setComboText}
      loginError={loginError}
      loginLoading={loginLoading}
      onClose={() => { if (!loginLoading) setShowUserPass(false); }}
      onSubmit={() => handleComboImport(comboText)}
    />

    {/* ── TOP HEADER BAR ── */}
    <HomeHeaderBar
      greeting={greeting}
      accounts={accounts}
      sessions={sessions}
      favorites={favorites}
      weekStats={weekStats}
      validCookies={validCookies}
      loginLoading={loginLoading}
      addMenu={addMenu}
      setAddMenu={setAddMenu}
      addMenuRef={addMenuRef}
      onManualLogin={handleManualLogin}
      onUserPassCombo={() => { setComboText(""); setLoginError(""); setShowUserPass(true); }}
      onClipboardCookie={handleOpenCookieMenu}
      onBulkCookies={() => { setBulkText(""); setBulkResults([]); setShowBulk(true); }}
      onPlayStats={() => setShowPlayStats(true)}
      bulkChecking={bulkChecking}
      cookieCheckError={cookieCheckError}
      onBulkCookieCheck={handleBulkCookieCheck}
      onUtilities={() => navigate("/utilities")}
      onShowActivity={() => switchTab("activity")}
    />

    {/* ── BODY: accounts (left) + main tabs (right) ── */}
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

    {/* LEFT: Accounts panel */}
    <div style={{ width: 250, borderRight: "1px solid var(--glass-line)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--panel-bg)", flexShrink: 0 }}>
      <AccountSidebar
        accounts={accounts}
        loading={initialLoading}
        accSearch={accSearch}
        setAccSearch={setAccSearch}
        accGroups={accGroups}
        accGroup={accGroup}
        setAccGroup={setAccGroup}
        accFilter={accFilter}
        setAccFilter={setAccFilter}
        groupedAccounts={groupedAccounts}
        activeUserIds={activeUserIds}
        activeGames={activeGames}
        onClearChecked={() => setMultiSelected(new Set())}
        onCheckAll={ids => setMultiSelected(new Set(ids))}
        launchFeedback={launchFeedback}
        onRetryLaunch={id => void retryLaunch(id)}
        selAccount={selAccount}
        multiSelected={multiSelected}
        onToggleCheck={toggleMultiSelect}
        checkingCookie={checkingCookie}
        healthStatus={healthStatus}
        onCheckCookie={handleCheckCookie}
        onSelectAccount={userId => {
          setSelAccount(userId);
          localStorage.setItem("reiya_last_account", String(userId));
          setLaunchError("");
        }}
        onQuickLaunchAccount={userId => {
          setSelAccount(userId);
          localStorage.setItem("reiya_last_account", String(userId));
          setLaunchError("");
          setTimeout(() => document.dispatchEvent(new CustomEvent("reiya-launch-shortcut")), 50);
        }}
        onAccountContextMenu={handleAccountContextMenu}
        onToggleFavorite={async (userId) => {
          try {
            const updated = await invoke<Account>("toggle_favorite", { userId });
            setAccounts(prev => prev.map(acc => acc.user_id === userId ? updated : acc));
          } catch (err) {
            showToast("Failed to toggle favorite: " + err, "error");
          }
        }}
        setAddMenu={setAddMenu}
      />

      {/* Live Sessions — bottom of accounts panel */}
      <LiveSessionsList
        sessions={sessions}
        onRefresh={() => invoke<Session[]>("get_live_sessions").then(setSessions).catch(() => {})}
        onKillAll={handleKillAll}
        onKillOne={handleKillOne}
        onShowDetail={setSessionDetail}
      />
    </div>

    {/* MAIN: tabs (Games / Activity & stats) */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 22px 0", borderBottom: "1px solid var(--glass-line-2)", flexShrink: 0 }}>
        {([
          { id: "games" as const, label: t("home_tab_games") },
          { id: "activity" as const, label: t("home_activity_stats") },
        ]).map(tab => {
          const active = homeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                padding: "8px 14px 10px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: 12.5, fontWeight: 800, color: active ? "var(--t1)" : "var(--t3)",
                borderBottom: `2px solid ${active ? "var(--t1)" : "transparent"}`, marginBottom: -1,
                transition: "color .15s, border-color .15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {homeTab === "games" && (
          <div style={{ marginBottom: 8 }}>
            <GameSearchBox
              value={gameSearch}
              onChange={setGameSearch}
              placeholder={t("home_place_search_placeholder")}
              onPlaceId={id => {
                setLaunchPlaceId(id);
                localStorage.setItem("reiya_last_place_id", id);
                setGameSearch("");
                setLaunchError("");
                showToast(`Game set to Place ID: ${id}`, "success");
              }}
              onPickGame={handlePickSearchedGame}
              onInvalid={() => showToast("Type at least 2 letters to search, or paste a Place ID / game link", "info")}
            />
          </div>
        )}
      </div>

      <div className="scroll" style={{ flex: 1, padding: "18px 22px 24px", display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Welcome card for brand-new users */}
      {!initialLoading && accounts.length === 0 && (
        <div style={{ marginBottom: 22, padding: "26px 28px", borderRadius: 18, background: "linear-gradient(135deg, var(--g04) 0%, var(--g01) 100%)", border: "1px solid var(--g06)", display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "var(--t1)", letterSpacing: "-0.3px" }}>{t("home_welcome_title")}</div>
            <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 8, lineHeight: 1.6 }}>{t("home_welcome_body")}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setAddMenu(true); }}
            className="btn glow-btn halloween-primary"
            style={{ flexShrink: 0, padding: "11px 20px", borderRadius: 10, fontSize: 12.5, fontWeight: 900, background: "#FFFFFF", color: "#07080a", border: "none", cursor: "pointer" }}
          >
            + {t("home_welcome_cta")}
          </button>
        </div>
      )}

      {homeTab === "games" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {/* Quick tips — shown once for new users, until dismissed */}
          {accounts.length > 0 && !tipsDone && (
            <div style={{ padding: "16px 18px", borderRadius: 16, background: "linear-gradient(135deg, rgba(167,139,250,0.12) 0%, var(--g01) 100%)", border: "1px solid rgba(167,139,250,0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: "var(--t1)" }}>{t("tips_title")}</span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={dismissTips}
                  className="btn btn-ghost"
                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800 }}
                >
                  {t("tips_done")}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                {[
                  { n: 1, title: t("tips_1_title"), body: t("tips_1_body") },
                  { n: 2, title: t("tips_2_title"), body: t("tips_2_body") },
                  { n: 3, title: t("tips_3_title"), body: t("tips_3_body") },
                ].map(step => (
                  <div key={step.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#A78BFA", color: "#07080a", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step.n}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{step.title}</div>
                      <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 3, lineHeight: 1.5 }}>{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Jump back in: last launches, one click to repeat */}
          {launchHistory.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 10 }}>{t("home_launch_again")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {launchHistory.map((h, i) => {
                  const acc = accounts.find(a => a.user_id === h.userId);
                  const savedIcon = h.placeId ? recentGames.find(g => g.placeId === h.placeId)?.iconUrl : undefined;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (acc) {
                          setSelAccount(h.userId);
                          localStorage.setItem("reiya_last_account", String(h.userId));
                        }
                        if (h.placeId) {
                          setLaunchPlaceId(h.placeId);
                          localStorage.setItem("reiya_last_place_id", h.placeId);
                        }
                        setTimeout(() => document.dispatchEvent(new CustomEvent("reiya-launch-shortcut")), 50);
                      }}
                      title={`Launch @${h.username} into ${h.gameName || h.placeId || "the Roblox app"}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, cursor: "pointer",
                        background: "var(--g02)", border: "1px solid var(--g05)", textAlign: "left", minWidth: 0,
                        transition: "background .15s, border-color .15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--g04)"; e.currentTarget.style.borderColor = "var(--g10)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--g02)"; e.currentTarget.style.borderColor = "var(--g05)"; }}
                    >
                      <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 9, overflow: "hidden", background: "var(--g04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {h.placeId
                            ? <GameIcon placeId={h.placeId} urls={[thumbs[h.placeId], savedIcon]} />
                            : <GamepadIcon size={18} color="var(--t3)" />}
                        </div>
                        {acc?.avatar_url && (
                          <img src={acc.avatar_url} alt="" style={{ position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--bg)" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.gameName || h.placeId || "Roblox App"}</div>
                        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{h.username}</div>
                      </div>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--g08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <PlayIcon size={10} color="var(--t1)" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <PinnedGamesSection
            pinnedGames={savedGames}
            launchPlaceId={launchPlaceId}
            thumbs={thumbs}
            onReorder={moveSaved}
            onTogglePin={togglePinGame}
            onSelectGame={handleSelectRecentGame}
            onGameContextMenu={handleGameContextMenu}
            onDeleteGame={(placeId, name) => setDeleteConfirmModal({ placeId, name })}
            onQuickLaunch={(placeId) => {
              handleSelectRecentGame(placeId);
              setTimeout(() => document.dispatchEvent(new CustomEvent("reiya-launch-shortcut")), 80);
            }}
          />

          <RecentGamesSection
            recentGames={recentGames}
            launchPlaceId={launchPlaceId}
            thumbs={thumbs}
            pinnedGames={pinnedGames}
            onTogglePin={togglePinGame}
            onSelectGame={handleSelectRecentGame}
            onGameContextMenu={handleGameContextMenu}
            onDeleteGame={(placeId, name) => setDeleteConfirmModal({ placeId, name })}
            onQuickLaunch={(placeId) => {
              handleSelectRecentGame(placeId);
              setTimeout(() => document.dispatchEvent(new CustomEvent("reiya-launch-shortcut")), 80);
            }}
            gameSearch={gameSearch}
            setGameSearch={setGameSearch}
            onSetPlaceIdFromSearch={(id) => {
              setLaunchPlaceId(id);
              localStorage.setItem("reiya_last_place_id", id);
              setGameSearch("");
              showToast(`Game set to Place ID: ${id}`, "success");
            }}
            hideSearch
          />

          {recentGames.length === 0 && savedGames.length === 0 && (
            <div style={{ padding: "40px 20px", borderRadius: 16, border: "1px dashed var(--g08)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <GamepadIcon size={28} color="var(--t3)" />
              <div style={{ fontSize: 12, color: "var(--t2)", maxWidth: 360, lineHeight: 1.6 }}>{t("home_games_empty")}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SessionBento
            weekStats={weekStats}
            graphData={graphData}
            topGames={topGames}
            status={{
              multiInstance,
              bootstrapper: {
                enabled: useBootstrapper,
                installed: bootstrapperStatus ? !!bootstrapperStatus.exe_path : null,
                version: bootstrapperStatus?.installed_version ?? null,
              },
              logins: { ready: validCookies, total: accounts.length },
            }}
          />
          <ActivityPanel recentActivity={recentActivity} events={events} inline />
        </div>
      )}

      </div>{/* end main scroll */}
    </div>{/* end main column */}
    </div>{/* end 2-col body */}

    {/* BOTTOM: docked launch bar */}
    {accounts.length > 0 && (
      <LaunchBar
        launchThumb={launchThumb}
        launchGame={launchGame}
        launchPlaceId={launchPlaceId}
        setLaunchPlaceId={setLaunchPlaceId}
        accountGameOptions={accountGameOptions}
        selAccount={selAccount}
        getAccGameHistory={getAccGameHistory}
        recentGames={recentGames}
        accessCode={accessCode}
        setAccessCode={setAccessCode}
        setLaunchError={setLaunchError}
        onPastePlaceId={handlePastePlaceId}
        jobId={jobId}
        setJobId={setJobId}
        onAccessCodeChange={handleAccessCodeChange}
        accounts={accounts}
        selectedAccountIsActive={selectedAccountIsActive}
        reValidating={reValidating}
        onReValidate={(userId) => { setReValidating(true); handleCheckCookie(userId).finally(() => setReValidating(false)); }}
        launchError={launchError}
        multiSelected={multiSelected}
        onLaunchMultiple={handleLaunchMultiple}
        launching={selAccount !== null && launchingAccounts.has(selAccount)}
        bulkLaunching={bulkLaunching}
        onLaunchApp={handleLaunchApp}
        onLaunch={handleLaunch}
      />
    )}

      <PlayStatsModal
        open={showPlayStats}
        data={playStatsData}
        onClose={() => setShowPlayStats(false)}
      />

      <PrivateServerSetupModal
        modal={privateServerModal}
        privateServerInput={privateServerInput}
        setPrivateServerInput={setPrivateServerInput}
        onClose={() => setPrivateServerModal(null)}
        onSave={handleSavePrivateServer}
      />

      <RemoveGameConfirmModal
        open={!!deleteConfirmModal}
        onClose={() => setDeleteConfirmModal(null)}
        onConfirm={handleConfirmDeleteGame}
      />

      <SetAccountGroupModal
        open={!!groupModal}
        groupInput={groupInput}
        setGroupInput={setGroupInput}
        onClose={() => setGroupModal(null)}
        onSave={handleSaveGroup}
      />

      {/* Account Context Menu */}
      {accountMenu && (() => {
        const MENU_W = 224;
        const PAD = 8;
        const spaceBelow = window.innerHeight - accountMenu.y - PAD;
        const spaceAbove = accountMenu.y - PAD;
        // Flip upward only when more space above than below and below is tight
        const flipUp = spaceAbove > spaceBelow && spaceBelow < 420;
        // maxHeight = actual available space in chosen direction, capped at 88vh
        const maxH = Math.min(
          Math.floor(window.innerHeight * 0.88),
          flipUp ? spaceAbove : spaceBelow
        );
        const topVal = flipUp
          ? Math.max(PAD, accountMenu.y - maxH)
          : accountMenu.y;
        return (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: topVal,
            left: Math.min(accountMenu.x, window.innerWidth - MENU_W - PAD),
            zIndex: 9999,
            background: "var(--modal-bg)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--modal-border)",
            borderRadius: 12,
            padding: 4,
            minWidth: 210,
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.4)",
            maxHeight: maxH,
            overflowY: "auto"
          }}
        >
          <DropdownItem
            icon={<IconSvg><polygon points="5 3 19 12 5 21 5 3" /></IconSvg>}
            label={t("launch_game_menu")}
            sub={launchPlaceId ? `${t("join_place_menu")} ${launchPlaceId}` : t("start_game_menu")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              if (acc.cookie_status !== "Valid") {
                showToast("Cookie is not valid. Validate the cookie first.", "error");
                return;
              }
              if (launchingAccounts.has(acc.user_id)) return;
              setLaunchError("");
              try {
                await launchAccount({
                  userId: acc.user_id,
                  placeId: effectivePlaceId,
                  jobId: jobId || null,
                  accessCode: accessCode || null,
                  gameName: effectiveGameName,
                  useBootstrapper,
                });
              } catch (err) {
                setLaunchError(String(err));
              }
            }}
          />
          <DropdownItem
            icon={
              <IconSvg>
                <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5L13 10 6 3 4.5 16.5zM12 9l3 3M19 2s.75 3-2.5 6.25L13 12l-1-1 3.75-3.5C19 4 19 2 19 2z" />
              </IconSvg>
            }
            label="Account Settings & Utilities"
            sub="Configure profile, games, notes & security"
            onClick={() => {
              const acc = accountMenu.account;
              setConfigSidebarAccount(acc);
              setAccountMenu(null);
            }}
          />
          <DropdownItem
            icon={<PinIcon size={14} fill={accountMenu.account.is_favorite ? "#FBBF24" : "none"} color={accountMenu.account.is_favorite ? "#FBBF24" : "currentColor"} />}
            label={accountMenu.account.is_favorite ? t("unfavorite_account_menu") : t("favorite_account_menu")}
            sub={t("toggle_quick_pinning_sub")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              try {
                const updated = await invoke<Account>("toggle_favorite", { userId: acc.user_id });
                setAccounts(prev => prev.map(a => a.user_id === acc.user_id ? updated : a));
              } catch (err) {
                showToast("Failed to toggle favorite: " + err, "error");
              }
            }}
          />
          <div style={{ height: 1, background: "var(--g08)", margin: "2px 6px" }} />
          <DropdownItem
            icon={<IconSvg><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></IconSvg>}
            label={t("copy_username_menu")}
            sub={t("copy_username_sub")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              await navigator.clipboard.writeText(acc.username);
            }}
          />
          <DropdownItem
            icon={<IconSvg><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></IconSvg>}
            label={t("copy_user_id_menu")}
            sub={t("copy_user_id_sub")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              await navigator.clipboard.writeText(String(acc.user_id));
            }}
          />
          {accountMenu.account.has_password && (
            <DropdownItem
              icon={<IconSvg><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></IconSvg>}
              label={t("copy_password_menu")}
              sub={t("copy_password_sub")}
              onClick={async () => {
                const acc = accountMenu.account;
                setAccountMenu(null);
                try {
                  await invoke("copy_account_password", { userId: acc.user_id });
                  showToast("Password copied. The clipboard clears in 30 seconds.", "success");
                } catch (err) {
                  showToast("Failed to copy password: " + err, "error");
                }
              }}
            />
          )}
          <DropdownItem
            icon={<IconSvg><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></IconSvg>}
            label={t("re_login_menu")}
            sub={t("re_auth_cookie_sub")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              await handleCheckCookie(acc.user_id);
            }}
          />
          <div style={{ height: 1, background: "var(--g08)", margin: "2px 6px" }} />
          <DropdownItem
            icon={<IconSvg><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></IconSvg>}
            label={t("remove_account_menu")}
            sub={t("remove_account_sub")}
            onClick={async () => {
              const acc = accountMenu.account;
              setAccountMenu(null);
              if (await confirmDialog({
                title: `${t("remove_account_confirm")}${acc.username}?`,
                message: "The account's saved login and settings will be deleted from this app. Your Roblox account itself isn't affected.",
                confirmLabel: t("remove_account_menu"),
                danger: true,
              })) {
                try {
                  await invoke("remove_account", { userId: acc.user_id });
                  forgetAccountLaunch(acc.user_id);
                  setAccounts(prev => prev.filter(a => a.user_id !== acc.user_id));
                  if (selAccount === acc.user_id) {
                    setSelAccount(null);
                    localStorage.removeItem("reiya_last_account");
                  }
                } catch (err) {
                  showToast("Failed to remove account: " + err, "error");
                }
              }
            }}
          />
        </div>
        );
      })()}

      <AccountConfigSidebarModal
        account={configSidebarAccount}
        onClose={() => setConfigSidebarAccount(null)}
        onRefresh={refreshAccounts}
        onRemoveAccount={async (userId, username) => {
          if (await confirmDialog({
            title: `${t("remove_account_confirm")}${username}?`,
            message: "The account's saved login and settings will be deleted from this app. Your Roblox account itself isn't affected.",
            confirmLabel: t("remove_account_menu"),
            danger: true,
          })) {
            try {
              await invoke("remove_account", { userId });
              forgetAccountLaunch(userId);
              setAccounts(prev => prev.filter(a => a.user_id !== userId));
              if (selAccount === userId) {
                setSelAccount(null);
                localStorage.removeItem("reiya_last_account");
              }
            } catch (err) {
              showToast("Failed to remove account: " + err, "error");
            }
          }
        }}
      />


      <AccountDetailsDumpModal
        account={dumpAccount}
        onClose={() => setDumpAccount(null)}
        onCopy={handleCopyDumpDetails}
      />

      <SessionDetailsModal
        session={sessionDetail}
        onClose={() => setSessionDetail(null)}
        onCopyPid={handleCopySessionPid}
      />

      <SavePasswordPromptModal
        prompt={savePasswordPrompt}
        savePasswordInput={savePasswordInput}
        setSavePasswordInput={setSavePasswordInput}
        onClose={() => setSavePasswordPrompt(null)}
        onSubmit={handleSavePasswordSubmit}
        onSubmitEnter={handleSavePasswordEnter}
      />

      {/* Feature 1: Toast Container */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

/* â•â• Sub-components â•â• */

/* ── GameCard: game tile (artwork + name) with hover quick-launch ── */
export function GameCard({ g, isSelected, hasPrivateServer, thumb, onSelect, onContextMenu, onDelete, onQuickLaunch, isPinned, onTogglePin }: {
  g: RecentGame; isSelected: boolean; hasPrivateServer: boolean; thumb?: string;
  onSelect: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void; onQuickLaunch: () => void;
  isPinned?: boolean; onTogglePin?: () => void;
}) {
  const [hov, setHov] = useState(false);
  const badge: React.CSSProperties = {
    position: "absolute", width: 22, height: 22, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, cursor: "pointer",
    backdropFilter: "blur(6px)",
  };
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onDoubleClick={onQuickLaunch}
      title={`${g.name}\nClick to choose · Double-click to launch · Right-click for private server`}
      style={{ cursor: "pointer", minWidth: 0, userSelect: "none" }}
    >
      <div
        style={{
          position: "relative", aspectRatio: "1 / 1", borderRadius: 14, overflow: "hidden",
          border: `2px solid ${isSelected ? "#FFFFFF" : hov ? "var(--g12)" : "var(--g05)"}`,
          boxShadow: isSelected ? "0 6px 20px var(--g10)" : hov ? "0 6px 18px rgba(0,0,0,0.35)" : "none",
          transform: hov || isSelected ? "translateY(-2px)" : "none",
          transition: "all .15s ease",
          background: "var(--surface-3)",
        }}
      >
        {/* Fresh thumbnail first; the saved icon link can be stale */}
        <GameIcon placeId={g.placeId} urls={[thumb, g.iconUrl]} placeholderSize={26} />

        {/* Selected marker */}
        {isSelected && (
          <div style={{ position: "absolute", left: 8, bottom: 8, zIndex: 4, padding: "2px 8px", borderRadius: 99, background: "#FFFFFF", color: "#07080a", fontSize: 9.5, fontWeight: 900 }}>
            ✓ Selected
          </div>
        )}

        {/* Remove from history — only on hover to keep cards clean */}
        {hov && (
          <Tooltip content="Remove from history" position="top" style={{ position: "absolute", top: 6, left: 6, zIndex: 10 }}>
            <div onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ ...badge, position: "static", background: "rgba(0,0,0,0.7)", border: "1px solid var(--g10)" }}>
              <XIcon size={10} color="var(--red)" />
            </div>
          </Tooltip>
        )}

        {/* Private server marker */}
        {hasPrivateServer && (
          <Tooltip content="Private server set (right-click to change)" position="top" style={{ position: "absolute", top: 6, right: 6, zIndex: 10 }}>
            <div style={{ ...badge, position: "static", background: "rgba(0,0,0,0.8)", border: "1px solid var(--g12)" }}>
              <LockIcon size={10} color="#FFFFFF" />
            </div>
          </Tooltip>
        )}

        {/* Pin toggle */}
        {onTogglePin && (hov || isPinned) && (
          <Tooltip content={isPinned ? "Unpin game" : "Pin game"} position="top" style={{ position: "absolute", top: hasPrivateServer ? 32 : 6, right: 6, zIndex: 10 }}>
            <div onClick={e => { e.stopPropagation(); onTogglePin(); }}
              style={{ ...badge, position: "static", background: isPinned ? "rgba(251,191,36,0.95)" : "rgba(0,0,0,0.6)", border: `1px solid ${isPinned ? "rgba(251,191,36,0.6)" : "var(--g12)"}` }}>
              <PinIcon size={10} color={isPinned ? "#000" : "#fff"} />
            </div>
          </Tooltip>
        )}

        {/* Quick-launch button on hover */}
        {hov && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
            <Tooltip content="Launch now" position="top">
              <div
                onClick={e => { e.stopPropagation(); onQuickLaunch(); }}
                style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform .12s ease", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                <PlayIcon size={15} color="#07080a" />
              </div>
            </Tooltip>
          </div>
        )}
      </div>

      <div style={{ marginTop: 7, padding: "0 2px" }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: isSelected ? "var(--t1)" : "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
        {g.creator && (
          <div style={{ fontSize: 9.5, color: "var(--t3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.creator}</div>
        )}
      </div>
    </div>
  );
}

export function SegmentedProgress({ pct, color, count = 22 }: { pct: number; color: string; count?: number }) {
  const active = Math.round((pct / 100) * count);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 10, width: 4, borderRadius: 1,
          background: i < active ? color : "var(--g04)",
          transition: "background-color .15s ease",
        }} />
      ))}
    </div>
  );
}

export function MetricTag({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 6, border: "1px solid var(--g06)", background: "var(--g02)", padding: "1.5px 7px 1.5px 5px" }}>
      <span style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: 3, border: "1px solid var(--g08)",
        fontSize: 8, fontWeight: 900, color: "var(--t3)", textTransform: "uppercase",
      }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--t2)" }}>{value}</span>
    </div>
  );
}

export function HeaderStatPill({ icon, label, value, sub, valueColor }: { icon: React.ReactNode; label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: "var(--g03)", border: "1px solid var(--g05)", flexShrink: 0 }}>
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)", letterSpacing: "0.06em", lineHeight: 1 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: valueColor ?? "var(--t1)", lineHeight: 1, letterSpacing: "-0.3px" }}>{value}</span>
          <span style={{ fontSize: 9, color: "var(--t3)", fontWeight: 600 }}>{sub}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Small primitives ── */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }} onClick={() => onChange(!value)}>
      <div style={{
        width: 32, height: 18, borderRadius: 99,
        background: value ? "#FFFFFF" : "var(--g05)",
        border: `1.5px solid ${value ? "#FFFFFF" : "var(--g15)"}`,
        position: "relative", transition: "all .2s cubic-bezier(0.4, 0, 0.2, 1)"
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? 16 : 2,
          width: 11, height: 11, borderRadius: "50%",
          background: value ? "#000000" : "rgba(255, 255, 255, 0.4)",
          transition: "all .2s cubic-bezier(0.4, 0, 0.2, 1)"
        }} />
      </div>
      <span style={{ fontSize: 10.5, color: value ? "var(--t1)" : "var(--t3)", fontWeight: 750, transition: "color 0.15s" }}>{label}</span>
    </div>
  );
}

const IconSvg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    {children}
  </svg>
);

function DropdownItem({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 10px",
        borderRadius: 7,
        background: hov ? "var(--g04)" : "transparent",
        cursor: "pointer",
        transition: "all .1s",
        userSelect: "none"
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: hov ? "#FFFFFF" : "var(--t2)", flexShrink: 0, width: 13, height: 13 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
    </div>
  );
}

export function timeAgo(date: Date, t: (key: string) => string): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60)   return t("time_ago_seconds").replace("{s}", String(sec));
  if (sec < 3600) return t("time_ago_minutes").replace("{m}", String(Math.floor(sec / 60)));
  if (sec < 86400) return t("time_ago_hours").replace("{h}", String(Math.floor(sec / 3600)));
  return t("time_ago_days").replace("{d}", String(Math.floor(sec / 86400)));
}

export interface HomeModalProps {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}

export function HomeModal({ title, onClose, wide, children }: HomeModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--modal-bg)",
          border: "1px solid var(--modal-border)",
          borderRadius: 20,
          padding: 24,
          width: wide ? 560 : 420,
          maxWidth: "100%",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 850, color: "var(--t1)", letterSpacing: "-0.3px" }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--t3)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: "50%",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "var(--g05)";
              e.currentTarget.style.color = "var(--t1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--t3)";
            }}
          >
            <XIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{
      fontSize: 11.5, color: "var(--red)", marginBottom: 10, padding: "8px 12px",
      background: "rgba(248, 113, 113, 0.08)", borderRadius: 9,
      border: "1px solid rgba(248, 113, 113, 0.2)",
    }}>
      {msg}
      {isFreeAccountLimit(msg) && <AccountLimitLink />}
    </div>
  );
}

/* ── Feature 1: Toast notification container ── */
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "9px 16px",
          borderRadius: 10,
          fontSize: 11.5,
          fontWeight: 700,
          color: t.type === "success" ? "#065f46" : t.type === "error" ? "#7f1d1d" : "var(--t1)",
          background: t.type === "success" ? "rgba(52,211,153,0.92)" : t.type === "error" ? "rgba(248,113,113,0.92)" : "rgba(255,255,255,0.92)",
          border: `1px solid ${t.type === "success" ? "rgba(52,211,153,0.4)" : t.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(0,0,0,0.12)"}`,
          boxShadow: "0 4px 18px rgba(0,0,0,0.3)",
          backdropFilter: "blur(8px)",
          maxWidth: 320,
          animation: "fadeInSlideUp 0.2s ease",
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ── Feature 10: SessionElapsed helper ── */
export function SessionElapsed({ startTime }: { startTime: string | null }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    const tick = () => {
      const s = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const nextStr = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
      setElapsed(prev => prev === nextStr ? prev : nextStr);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return <>{elapsed}</>;
}
