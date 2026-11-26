import { AccountLaunchStatus } from "../components/AccountLaunchStatus";
import { AccountLimitLink, isFreeAccountLimit } from "../components/AccountLimitLink";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { forgetAccountLaunch, useAccountLauncher, useObservedLaunchSessions, type LaunchFeedback } from "../lib/useAccountLauncher";
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  SettingsIcon,
  TrashIcon, XIcon, CheckIcon,
  PinIcon, LoaderIcon, KeyIcon, GamepadIcon, ShieldCheckIcon, PlayIcon, RefreshIcon, PlusIcon,
} from "../components/Icons";
import { QuickLaunchModal } from "../components/QuickLaunchModal";
import { AccSingleCookieModal } from "../components/AccSingleCookieModal";
import { AccBulkCookieModal } from "../components/AccBulkCookieModal";
import { AccComboImportModal } from "../components/AccComboImportModal";
import { ComboResultsModal } from "../components/ComboResultsModal";
import { AccountConfigSidebarModal } from "../components/AccountConfigSidebarModal";
import { ExportAccountsModal } from "../components/ExportAccountsModal";
import { ImportAccountsModal, type BackupImportPreview } from "../components/ImportAccountsModal";
import { useAccountPlan } from "../lib/useAccountPlan";
import { MoveToGroupModal } from "../components/MoveToGroupModal";
import { BulkEditModal, type BulkEditValue } from "../components/BulkEditModal";
import { AccountsHeaderBar } from "../components/AccountsHeaderBar";
import { AccountsToolbar } from "../components/AccountsToolbar";
import { BulkActionBar } from "../components/BulkActionBar";
import Tooltip from "../components/ui/Tooltip";
import { CATALOG } from "../data/catalog";
import { useConfirm } from "../components/ConfirmDialog";
import { GameIcon } from "../components/GameIcon";

export interface ComboResult { username: string; ok: boolean; reason: string; }

export interface BulkAddResult {
  preview: string;
  success: boolean;
  username: string | null;
  error: string | null;
}

export interface Account {
  user_id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  is_favorite: boolean;
  cookie_status: string;
  added_at: string;
  cookie_updated_at: string | null;
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
  group?: string;
}

interface LoginResultPayload {
  cookie: string | null;
  window_label: string;
  target_username: string | null;
  error: string | null;
}

interface Session {
  pid: number;
  user_id: number | null;
  username: string | null;
  avatar_url: string | null;
  game_name: string | null;
  start_time: string | null;
}

type FilterTab = "all" | "favorites" | "valid" | "needs_login";
type SortBy = "last_launched" | "name_asc" | "name_desc" | "status" | "added" | "custom";

const accountsCache = {
  accounts: [] as Account[],
  loaded: false,
};

/* ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── */
export default function Accounts() {
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[]>(() => {
    if (accountsCache.loaded && accountsCache.accounts.length > 0) {
      return accountsCache.accounts;
    }
    try {
      const stored = localStorage.getItem("reiya_accounts_cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          accountsCache.accounts = parsed;
          accountsCache.loaded = true;
          return parsed;
        }
      }
    } catch {}
    return [];
  });
  const [filter,      setFilter]      = useState<FilterTab>("all");
  const [search,      setSearch]      = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [loading,     setLoading]     = useState<boolean>(() => accounts.length === 0);
  const { launchAccount, launchingAccounts, launchFeedback, retryLaunch } = useAccountLauncher();
  const [sortBy,      setSortBy]      = useState<SortBy>("last_launched");
  const [gameFilter,  setGameFilter]  = useState<string | null>(null);
  const [viewMode, setViewModeState] = useState<"card" | "list">(() =>
    localStorage.getItem("reiya_accounts_view_mode") === "list" ? "list" : "card"
  );
  const setViewMode = (mode: "card" | "list") => {
    setViewModeState(mode);
    localStorage.setItem("reiya_accounts_view_mode", mode);
  };
  const [copiedId,    setCopiedId]    = useState<number | null>(null);
  const [copiedUid,   setCopiedUid]   = useState<number | null>(null);
  // Accounts whose login is being checked right now (shows a spinner on the card)
  const [checkingIds, setCheckingIds] = useState<ReadonlySet<number>>(new Set());
  const [sessions,    setSessions]    = useState<Session[]>([]);

  // Quick place ID launch
  const [quickLaunchAccount, setQuickLaunchAccount] = useState<Account | null>(null);
  const [quickPlaceId,       setQuickPlaceId]       = useState("");

  // Account Detail Modal state
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);

  // Inline notes editing
  const [editingNotesId,   setEditingNotesId]   = useState<number | null>(null);
  const [editingNotesText, setEditingNotesText] = useState("");

  // Drag-to-reorder custom sort
  const [customOrder, setCustomOrder] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("reiya_account_order") || "[]"); } catch { return []; }
  });
  const dragSrcId = useRef<number | null>(null);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Bulk selection
  const [selected,       setSelected]       = useState<Set<number>>(new Set());
  const [bulkLaunching,  setBulkLaunching]  = useState(false);
  const [bulkStatus,     setBulkStatus]     = useState("");
  const [moveGroupModal, setMoveGroupModal] = useState(false);
  const [groupInput,     setGroupInput]     = useState("");
  const [bulkPresetModal, setBulkPresetModal] = useState(false);
  const [bulkPresetSaving, setBulkPresetSaving] = useState(false);
  const [bulkPresetError, setBulkPresetError] = useState("");

  const [addMenu,       setAddMenu]       = useState(false);
  const addMenuRef                        = useRef<HTMLDivElement>(null);
  const [showSingle,    setShowSingle]    = useState(false);
  const [showBulk,      setShowBulk]      = useState(false);
  const [addCookie,     setAddCookie]     = useState("");
  const [adding,        setAdding]        = useState(false);
  const [addError,      setAddError]      = useState("");
  const [bulkText,      setBulkText]      = useState("");
  const [bulkAdding,    setBulkAdding]    = useState(false);
  const [bulkResults,   setBulkResults]   = useState<BulkAddResult[]>([]);

  const [showUserPass,   setShowUserPass]   = useState(false);
  const [comboText,      setComboText]      = useState("");
  const [loginLoading,   setLoginLoading]   = useState(false);
  const [loginError,     setLoginError]     = useState("");

  const [comboResults,   setComboResults]   = useState<ComboResult[]>([]);

  // Import / Export
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exportPwd,  setExportPwd]  = useState("");
  const [importPwd,  setImportPwd]  = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const [importPreview, setImportPreview] = useState<BackupImportPreview | null>(null);
  const [importSelection, setImportSelection] = useState<ReadonlySet<number>>(new Set());
  const importPending = useRef(false);
  const accountPlan = useAccountPlan();
  const [importErr, setImportErr] = useState("");
  const [exportOk,  setExportOk]  = useState("");
  const [importOk,  setImportOk]  = useState("");

  const handleExport = async () => {
    const pwd = exportPwd.trim();
    if (pwd.length < 8) { setExportErr("Choose a backup password of at least 8 characters."); return; }
    setExportLoading(true); setExportErr(""); setExportOk("");
    try {
      const path = await invoke<string>("export_accounts", { password: pwd });
      setExportOk(`Saved to: ${path}`);
      setExportPwd("");
    } catch (e) {
      if (String(e) !== "cancelled") setExportErr(String(e));
    } finally { setExportLoading(false); }
  };

  const resetImportPreview = () => {
    if (importPreview) void invoke("discard_account_import", { token: importPreview.token }).catch(() => {});
    setImportPreview(null);
    setImportSelection(new Set());
    setImportErr("");
    setImportOk("");
  };

  const handleImport = async () => {
    if (importPending.current) return;
    importPending.current = true;
    setImportLoading(true);
    setImportErr("");
    setImportOk("");
    try {
      if (importPreview) {
        const added = await invoke<number>("commit_account_import", {
          token: importPreview.token, userIds: [...importSelection],
        });
        setImportPreview(null);
        setImportSelection(new Set());
        setImportOk("Imported " + added + (added === 1 ? " new account." : " new accounts."));
        await loadAccounts();
      } else {
        const preview = await invoke<BackupImportPreview>("preview_account_import", { password: importPwd.trim() });
        const slots = Math.max(0, preview.free_limit - preview.saved_accounts);
        setImportPreview(preview);
        setImportPwd("");
        setImportSelection(new Set((accountPlan.premium ? preview.accounts : preview.accounts.slice(0, slots)).map(account => account.user_id)));
      }
    } catch (error) {
      if (String(error) !== "cancelled") setImportErr(String(error));
    } finally {
      importPending.current = false;
      setImportLoading(false);
    }
  };

  const [selectedUtilAccount, setSelectedUtilAccount] = useState<Account | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await invoke<Account[]>("get_accounts");
      setAccounts(data);
      accountsCache.accounts = data;
      accountsCache.loaded = true;
      try { localStorage.setItem("reiya_accounts_cache", JSON.stringify(data)); } catch {}

      // Auto re-validate Unknown cookies silently on startup
      const unknowns = data.filter(a => a.cookie_status === "Unknown" || !a.cookie_status);
      if (unknowns.length > 0) {
        // Check at most 3 at a time so Roblox doesn't rate-limit a big list
        const queue = [...unknowns];
        setCheckingIds(prev => { const next = new Set(prev); queue.forEach(a => next.add(a.user_id)); return next; });
        const worker = async () => {
          for (let acc = queue.shift(); acc; acc = queue.shift()) {
            const userId = acc.user_id;
            try {
              const updated = await invoke<Account>("validate_cookie", { userId });
              setAccounts(prev => {
                const next = prev.map(a => a.user_id === userId ? updated : a);
                accountsCache.accounts = next;
                try { localStorage.setItem("reiya_accounts_cache", JSON.stringify(next)); } catch {}
                return next;
              });
            } catch { /* silent */ }
            setCheckingIds(prev => { const next = new Set(prev); next.delete(userId); return next; });
          }
        };
        const workers = Math.min(3, queue.length);
        for (let i = 0; i < workers; i++) void worker();
      }
    } catch (e) { console.error("Failed to load accounts:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAccounts();
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenu(false);
    };
    document.addEventListener("click", handleOutsideClick);

    // Keyboard shortcuts
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setAddMenu(v => !v);
      }
      if (e.key === "Escape") {
        setSearch("");
        setAddMenu(false);
        setQuickLaunchAccount(null);
        setEditingNotesId(null);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleKey);

    let unlistenAccounts: (() => void) | null = null;
    listen("accounts-updated", () => {
      loadAccounts();
    }).then(fn => { unlistenAccounts = fn; });

    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
      if (unlistenAccounts) unlistenAccounts();
    };
  }, [loadAccounts]);

  // Work out which game (place ID) each account last played, so cards can show its icon.
  // Accounts only store the game's *name*; the session history and recent games know the IDs.
  const [lastPlaceByUser, setLastPlaceByUser] = useState<ReadonlyMap<number, string>>(new Map());
  const [placeByName, setPlaceByName] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const normalize = (s: string) => s.trim().toLowerCase();
    const load = () => {
      Promise.all([
        invoke<Array<{ user_id: number; place_id: string; game_name: string; start_time: string }>>("get_session_history").catch(() => []),
        invoke<Array<{ placeId: string; name: string }>>("get_recent_games").catch(() => []),
      ]).then(([history, recents]) => {
        const byUser = new Map<number, { placeId: string; time: number }>();
        const byName = new Map<string, string>();
        for (const r of history) {
          if (!r.place_id || !/^\d+$/.test(r.place_id)) continue;
          const time = new Date(r.start_time).getTime() || 0;
          const prev = byUser.get(r.user_id);
          if (!prev || time > prev.time) byUser.set(r.user_id, { placeId: r.place_id, time });
          if (r.game_name) byName.set(normalize(r.game_name), r.place_id);
        }
        for (const g of recents) if (g.name && /^\d+$/.test(g.placeId)) byName.set(normalize(g.name), g.placeId);
        setLastPlaceByUser(new Map([...byUser].map(([uid, v]) => [uid, v.placeId])));
        setPlaceByName(byName);
      });
    };
    load();
    let unlisten: (() => void) | null = null;
    listen("session-status-changed", load).then(fn => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);
  const lastPlaceIdOf = (a: Account): string | undefined => {
    if (a.default_place_id && /^\d+$/.test(a.default_place_id)) return a.default_place_id;
    return lastPlaceByUser.get(a.user_id)
      ?? (a.last_played_game ? placeByName.get(a.last_played_game.trim().toLowerCase()) : undefined);
  };

  // Live session count for the "Active" stat pill — fetch on mount, poll, and refresh on status change
  useEffect(() => {
    invoke<Session[]>("get_live_sessions").then(setSessions).catch(() => {});

    let unlistenSessions: (() => void) | null = null;
    listen("session-status-changed", () => {
      invoke<Session[]>("get_live_sessions").then(setSessions).catch(() => {});
    }).then(fn => { unlistenSessions = fn; });

    const interval = setInterval(() => {
      if (document.hidden) return;
      invoke<Session[]>("get_live_sessions").then(sess => {
        setSessions(prev => JSON.stringify(prev) === JSON.stringify(sess) ? prev : sess);
      }).catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      if (unlistenSessions) unlistenSessions();
    };
  }, []);

  const activeUserIds = useMemo(() => new Set(
    sessions.map(session => session.user_id).filter((id): id is number => id !== null),
  ), [sessions]);
  useObservedLaunchSessions(activeUserIds, launchFeedback);
  const online     = sessions.length;
  const favCount   = accounts.filter(a => a.is_favorite).length;
  const validCount = accounts.filter(a => a.cookie_status === "Valid").length;

  // Groups sorted by preset order (Main → Alts → Trading → Farming → others alphabetically)
  const PRESET_GROUP_ORDER = ["Main", "Alts", "Trading", "Farming"];
  const groups = useMemo(() => {
    return Array.from(new Set(accounts.map(a => a.group).filter((g): g is string => !!g)))
      .sort((a, b) => {
        const ai = PRESET_GROUP_ORDER.indexOf(a);
        const bi = PRESET_GROUP_ORDER.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
  }, [accounts]);
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g] = accounts.filter(a => a.group === g).length;
    return counts;
  }, [accounts, groups]);

  // Reset active group if it no longer exists (e.g. all accounts in that group were removed)
  useEffect(() => {
    if (activeGroup !== null && !groups.includes(activeGroup)) setActiveGroup(null);
  }, [groups, activeGroup]);

  const STATUS_ORDER: Record<string, number> = { Valid: 0, Unknown: 1, Expired: 2 };
  const favGamesOf = (a: Account) =>
    (localStorage.getItem("reiya_fav_games_" + a.user_id) || "").split(",").map(x => x.trim()).filter(Boolean);
  const favGameCounts = new Map<string, number>();
  accounts.forEach(a => new Set(favGamesOf(a)).forEach(id => favGameCounts.set(id, (favGameCounts.get(id) || 0) + 1)));
  const favGameList = [...favGameCounts.entries()].sort((x, y) => y[1] - x[1]);

  const visible = [...accounts]
    .filter(a => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.username.toLowerCase().includes(q) || a.display_name.toLowerCase().includes(q) || a.tags?.some(t => t.toLowerCase().includes(q));
      const matchFilter = filter === "all" || (filter === "favorites" && a.is_favorite) || (filter === "valid" && a.cookie_status === "Valid")
        || (filter === "needs_login" && a.cookie_status !== "Valid");
      const matchGroup = activeGroup === null || a.group === activeGroup;
      const matchGame = !gameFilter || favGamesOf(a).includes(gameFilter);
      return matchSearch && matchFilter && matchGroup && matchGame;
    })
    .sort((a, b) => {
      // Favorite / Pinned accounts always sort to the top first
      if (a.is_favorite !== b.is_favorite) {
        return a.is_favorite ? -1 : 1;
      }
      if (sortBy === "custom") {
        const ai = customOrder.indexOf(a.user_id);
        const bi = customOrder.indexOf(b.user_id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      switch (sortBy) {
        case "last_launched":
          if (!a.last_launched_at && !b.last_launched_at) return 0;
          if (!a.last_launched_at) return 1;
          if (!b.last_launched_at) return -1;
          return new Date(b.last_launched_at).getTime() - new Date(a.last_launched_at).getTime();
        case "name_asc":
          return (a.display_name || a.username).localeCompare(b.display_name || b.username);
        case "name_desc":
          return (b.display_name || b.username).localeCompare(a.display_name || a.username);
        case "status":
          return (STATUS_ORDER[a.cookie_status] ?? 3) - (STATUS_ORDER[b.cookie_status] ?? 3);
        case "added":
          return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
        default:
          return 0;
      }
    });

  const handleToggleFav = async (userId: number) => {
    try {
      const updated = await invoke<Account>("toggle_favorite", { userId });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updated : a));
    } catch (e) { console.error(e); }
  };

  const handleRemove = async (userId: number, username: string) => {
    if (!(await confirmDialog({
      title: `${t("remove_account_confirm")}${username}?`,
      message: "The account's saved login and settings will be deleted from this app. Your Roblox account itself isn't affected.",
      confirmLabel: t("remove_account_menu"),
      danger: true,
    }))) return;
    try {
      await invoke("remove_account", { userId });
      forgetAccountLaunch(userId);
      setAccounts(prev => prev.filter(a => a.user_id !== userId));
    } catch (error) { toast.error(String(error)); }
  };

  const handleLaunch = async (userId: number) => {
    try {
      await launchAccount({
        userId, placeId: null, jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
  };

  const handleReplayLaunch = async (userId: number, placeId: string) => {
    try {
      await launchAccount({
        userId, placeId, jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
  };

  const handleCopyUsername = (userId: number, username: string) => {
    navigator.clipboard.writeText(username).catch(() => {});
    setCopiedId(userId);
    setTimeout(() => setCopiedId(c => c === userId ? null : c), 1800);
  };

  const handleCopyUserId = (userId: number) => {
    navigator.clipboard.writeText(String(userId)).catch(() => {});
    setCopiedUid(userId);
    setTimeout(() => setCopiedUid(c => c === userId ? null : c), 1800);
  };

  const handleSaveNotes = async (userId: number, notes: string) => {
    try {
      const updated = await invoke<Account>("update_account_notes", { userId, notes });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updated : a));
    } catch (e) { console.error(e); }
    setEditingNotesId(null);
  };

  const handleQuickLaunch = async () => {
    if (!quickLaunchAccount) return;
    const placeId = quickPlaceId.trim();
    setQuickLaunchAccount(null);
    try {
      await launchAccount({
        userId: quickLaunchAccount.user_id,
        placeId: placeId || null,
        jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
  };

  const handleDragStart = (e: DragEvent, userId: number) => {
    dragSrcId.current = userId;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleDrop = (e: DragEvent, targetId: number) => {
    e.preventDefault();
    const srcId = dragSrcId.current;
    if (srcId === null || srcId === targetId) return;
    // Build new order from current visible list
    const base = visible.map(a => a.user_id);
    const srcIdx = base.indexOf(srcId);
    const tgtIdx = base.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    base.splice(srcIdx, 1);
    base.splice(tgtIdx, 0, srcId);
    setCustomOrder(base);
    localStorage.setItem("reiya_account_order", JSON.stringify(base));
    setSortBy("custom");
  };

  const handleValidate = async (userId: number, quiet = false) => {
    setCheckingIds(prev => new Set(prev).add(userId));
    try {
      const updated = await invoke<Account>("validate_cookie", { userId });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updated : a));
      if (!quiet) {
        if (updated.cookie_status === "Valid") toast.success(`@${updated.username}: ${t("acc_status_ready")}`);
        else toast.warning(`@${updated.username}: ${t("accp_status_expired")}`);
      }
    } catch (e) {
      if (!quiet) toast.error(`${t("acc_recheck")}: ${String(e)}`);
    } finally {
      setCheckingIds(prev => { const next = new Set(prev); next.delete(userId); return next; });
    }
  };

  const handleRelogin = async (username: string) => {
    setLoginLoading(true);
    try {
      const res = await loginOneAccount(username);
      if (res && res.cookie) {
        const acc = await invoke<Account>("add_account", { cookie: res.cookie });
        setAccounts(prev => {
          const idx = prev.findIndex(a => a.user_id === acc.user_id);
          return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
        });
        toast.success(`${acc.username}'s cookie was refreshed.`);
      } else {
        const reason = res?.error || "Login window was closed or cookie extraction failed.";
        toast.warning(`Relogin not saved: ${reason}`);
      }
    } catch (e) {
      toast.error(`Relogin failed: ${String(e)}`);
    } finally {
      setLoginLoading(false);
    }
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
          setAdding(true); setAddError("");
          try {
            const acc = await invoke<Account>("add_account", { cookie: clip });
            setAccounts(prev => {
              const idx = prev.findIndex(a => a.user_id === acc.user_id);
              return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
            });
            return;
          } catch (e) {
            setAddCookie("");
            setAddError(String(e));
            setShowSingle(true);
            return;
          }
          finally { setAdding(false); }
        }
      }
    } catch { }
    setAddCookie(""); setAddError(""); setShowSingle(true);
  };

  const handleAddSingle = async () => {
    if (!addCookie.trim()) return;
    setAdding(true); setAddError("");
    try {
      const acc = await invoke<Account>("add_account", { cookie: addCookie });
      setAccounts(prev => {
        const idx = prev.findIndex(a => a.user_id === acc.user_id);
        return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
      });
      setAddCookie(""); setShowSingle(false);
    } catch (e) { setAddError(String(e)); }
    finally { setAdding(false); }
  };

  const handleBulkImport = async () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;
    setBulkAdding(true); setBulkResults([]);
    try {
      const results = await invoke<BulkAddResult[]>("add_accounts_bulk", { cookies: lines });
      setBulkResults(results);
      await loadAccounts();
    } catch (e) {
      toast.error(String(e));
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
            password: password || null,
          });
        } catch (e) {
          if (unlisten) unlisten();
          toast.error(`Failed to open login window: ${String(e)}`);
          resolve(null);
        }
      });
    });
  };

  const handleManualLogin = async () => {
    setAddMenu(false); setLoginLoading(true);
    try {
      const res = await loginOneAccount();
      if (res && res.cookie) {
        const acc = await invoke<Account>("add_account", { cookie: res.cookie });
        setAccounts(prev => {
          const idx = prev.findIndex(a => a.user_id === acc.user_id);
          return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
        });
      } else {
        const reason = res?.error || "Login window was closed or cookie extraction failed.";
        toast.warning(`Login not saved: ${reason}`);
      }
    } catch (e) {
      toast.error(`Manual login failed: ${String(e)}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleComboImport = async (combosText: string) => {
    const lines = combosText.split("\n").map(l => l.trim()).filter(l => l.includes(":") && l.length > 2);
    if (lines.length === 0) { setLoginError("No valid combos found. Format: username:password"); return; }

    setLoginLoading(true);
    const total = lines.length;
    let successCount = 0;
    let doneCount = 0;

    const pwMap: Record<string, string> = {};
    for (const line of lines) {
      const [u, p] = line.split(":", 2).map(s => s.trim());
      if (u) pwMap[u.toLowerCase()] = p ?? "";
    }

    const results: ComboResult[] = [];

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
            return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
          });
          results.push({ username: acc.username, ok: true, reason: "Imported successfully" });
          successCount++;
        } catch (err) {
          const reason = `Cookie captured but add_account failed: ${String(err)}`;
          console.error("[combo-import] add_account failed for", username, err);
          results.push({ username, ok: false, reason });
        }
      } else {
        const reason = res?.error
          ? `Login window closed — ${res.error}`
          : "Login window closed before the auth cookie could be captured (no error detail returned).";
        console.error(`[combo-import] ${username} failed:`, reason, res);
        results.push({ username, ok: false, reason });
      }
    });

    setLoginError(`All ${total} windows opened — waiting for logins...`);
    await Promise.all(promises);

    setLoginLoading(false); setShowUserPass(false); setComboText("");
    await loadAccounts();

    setComboResults(results);

    if (results.every(r => r.ok)) {
      toast.success(`Imported ${successCount}/${total} accounts successfully.`);
    } else {
      toast.warning(`Imported ${successCount}/${total} accounts — see result details.`);
    }
  };

  // ── Bulk actions ──────────────────────────────────────────────────
  const toggleSelect = (userId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(visible.map(a => a.user_id)));
  const clearSelection = () => setSelected(new Set());

  const handleBulkLaunch = async () => {
    const chosen = accounts.filter(a => selected.has(a.user_id));
    const skipped = chosen.filter(a => a.cookie_status !== "Valid").length;
    const targets = chosen.filter(a => a.cookie_status === "Valid" && !launchingAccounts.has(a.user_id));
    if (skipped > 0) toast.warning(`${skipped} selected ${skipped === 1 ? "account needs" : "accounts need"} to log in again and ${skipped === 1 ? "was" : "were"} skipped.`);
    if (bulkLaunching || targets.length === 0) return;
    setBulkLaunching(true);
    setBulkStatus(`Launching ${targets.length} accounts...`);
    const results = await Promise.allSettled(targets.map(acc => launchAccount({
      userId: acc.user_id, placeId: null, jobId: null, accessCode: null,
      useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
    })));
    const failed = targets.filter((_, index) => results[index].status === "rejected");
    setBulkLaunching(false);
    setBulkStatus(`Launched ${targets.length - failed.length} of ${targets.length} accounts`);
    if (failed.length) toast.error(`Failed to launch: ${failed.map(acc => acc.username).join(", ")}`);
  };

  const handleBulkValidate = async () => {
    const targets = accounts.filter(a => selected.has(a.user_id));
    if (targets.length === 0) return;
    setBulkStatus(`Checking ${targets.length} logins...`);
    let ok = 0;
    for (const acc of targets) {
      setCheckingIds(prev => new Set(prev).add(acc.user_id));
      try {
        const result = await invoke<Account>("validate_cookie", { userId: acc.user_id });
        setAccounts(prev => prev.map(a => a.user_id === acc.user_id ? result : a));
        if (result.cookie_status === "Valid") ok++;
      } catch { }
      setCheckingIds(prev => { const next = new Set(prev); next.delete(acc.user_id); return next; });
    }
    setBulkStatus(`${ok} of ${targets.length} logins working`);
    setTimeout(() => setBulkStatus(""), 4000);
  };

  const deletingAccounts = useRef(false);
  const handleBulkDelete = async () => {
    if (deletingAccounts.current) return;
    const targets = accounts.filter(a => selected.has(a.user_id));
    if (targets.length === 0) return;
    const names = targets.slice(0, 5).map(a => "@" + a.username).join(", ") + (targets.length > 5 ? ` +${targets.length - 5}` : "");
    if (!(await confirmDialog({
      title: `Remove ${targets.length} ${targets.length === 1 ? "account" : "accounts"}?`,
      message: <>{names}<br /><br />Their saved logins and settings will be deleted from this app. The Roblox accounts themselves aren't affected.</>,
      confirmLabel: t("remove_account_menu"),
      danger: true,
    }))) return;
    deletingAccounts.current = true;
    const removed = new Set<number>();
    let firstError = "";
    try {
      for (const account of targets) {
        try {
          await invoke("remove_account", { userId: account.user_id });
          forgetAccountLaunch(account.user_id);
          removed.add(account.user_id);
        } catch (error) {
          if (!firstError) firstError = String(error);
        }
      }
      setAccounts(current => current.filter(account => !removed.has(account.user_id)));
      setSelected(current => new Set([...current].filter(id => !removed.has(id))));
      setBulkStatus("");
      if (firstError) toast.error("Removed " + removed.size + " of " + targets.length + " accounts. " + firstError);
      else toast.success("Removed " + removed.size + " account(s).");
    } finally {
      deletingAccounts.current = false;
    }
  };

  const handleBulkMoveGroup = async () => {
    const targets = accounts.filter(a => selected.has(a.user_id));
    for (const acc of targets) {
      try { await invoke("set_account_group", { userId: acc.user_id, group: groupInput.trim() }); } catch { }
    }
    setAccounts(prev => prev.map(a => selected.has(a.user_id) ? { ...a, group: groupInput.trim() } as any : a));
    setMoveGroupModal(false); setGroupInput(""); clearSelection();
    setBulkStatus(`Moved ${targets.length} accounts to group "${groupInput.trim() || "none"}"`);
    setTimeout(() => setBulkStatus(""), 3000);
  };

  const handleBulkApplyPreset = async (v: BulkEditValue) => {
    setBulkPresetSaving(true); setBulkPresetError("");
    const splitList = (x: string) => x.split(",").map(t => t.trim()).filter(Boolean);
    const addTags = splitList(v.addTags);
    const removeTags = splitList(v.removeTags).map(t => t.toLowerCase());
    const favInput = splitList(v.favGames.replace(/\s+/g, ","));
    const delayNum = v.delay.trim() === "" ? null : Math.max(0, Math.min(300, Number(v.delay)));
    try {
      let changed = 0;
      for (const a of accounts.filter(x => selected.has(x.user_id))) {
        let tags = [...(a.tags || [])];
        if (removeTags.length) tags = tags.filter(t => !removeTags.includes(t.toLowerCase()));
        for (const t of addTags) if (!tags.some(x => x.toLowerCase() === t.toLowerCase())) tags.push(t);
        const notes = v.notes.trim() === "" ? a.notes
          : v.notesMode === "append" ? (a.notes ? a.notes + "\n" : "") + v.notes.trim() : v.notes.trim();
        const launcher = v.launcher === "" ? a.launcher_preference : v.launcher === "global" ? "" : v.launcher;
        await invoke("edit_account", {
          userId: a.user_id,
          displayName: a.display_name,
          notes,
          tags,
          defaultPlaceId: v.placeId.trim() || a.default_place_id,
          defaultGameName: v.gameName.trim() || a.default_game_name,
          launchPresetName: a.launch_preset_name,
          defaultPrivateServer: v.privateServer.trim() || a.default_private_server,
          launcherPreference: launcher,
          launchDelaySeconds: delayNum ?? a.launch_delay_seconds,
          safeLaunchEnabled: a.safe_launch_enabled,
          autoRejoinEnabled: a.auto_rejoin_enabled,
          launchCooldownSeconds: a.launch_cooldown_seconds,
        });
        if (favInput.length) {
          const key = "reiya_fav_games_" + a.user_id;
          const existing = (localStorage.getItem(key) || "").split(",").map(t => t.trim()).filter(Boolean);
          const merged = v.favMode === "replace" ? favInput : [...existing, ...favInput.filter(id => !existing.includes(id))];
          localStorage.setItem(key, merged.join(","));
        }
        changed += 1;
      }
      await loadAccounts();
      setBulkPresetModal(false);
      setBulkStatus(`Updated ${changed} account(s)`);
      clearSelection();
      setTimeout(() => setBulkStatus(""), 3500);
    } catch (e) { setBulkPresetError(String(e)); }
    finally { setBulkPresetSaving(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: "20px 24px 0",
        borderBottom: "1px solid var(--glass-line)",
        background: "var(--g01)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
        position: "relative",
        zIndex: 50,
      }}>
        <AccountsHeaderBar
          t={t}
          totalCount={accounts.length}
          slotPlan={accountPlan}
          usedSlots={new Set(accounts.map(account => account.user_id)).size}
          validCount={validCount}
          favCount={favCount}
          online={online}
          selectedCount={selected.size}
          needsLoginCount={accounts.length - validCount}
          needsLoginActive={filter === "needs_login"}
          onShowNeedsLogin={() => setFilter(filter === "needs_login" ? "all" : "needs_login")}
          addMenu={addMenu}
          setAddMenu={setAddMenu}
          addMenuRef={addMenuRef}
          onImportClick={() => { setImportErr(""); setImportOk(""); setImportPwd(""); setShowImport(true); }}
          onExportClick={() => { setExportErr(""); setExportOk(""); setExportPwd(""); setShowExport(true); }}
          onManualLogin={handleManualLogin}
          onUserPass={() => { setAddMenu(false); setComboText(""); setLoginError(""); setShowUserPass(true); }}
          onOpenCookieMenu={handleOpenCookieMenu}
          onCookiesFile={() => { setAddMenu(false); setBulkText(""); setBulkResults([]); setShowBulk(true); }}
          onCustomLogin={() => setAddMenu(false)}
        />

        <AccountsToolbar
          t={t}
          groups={groups}
          totalCount={accounts.length}
          groupCounts={groupCounts}
          activeGroup={activeGroup}
          setActiveGroup={setActiveGroup}
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          filter={filter}
          setFilter={setFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          viewMode={viewMode}
          setViewMode={setViewMode}
          counts={{ pinned: favCount, ready: validCount, needsLogin: accounts.length - validCount }}
        />

        {favGameList.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 2 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.06em", flexShrink: 0, textTransform: "uppercase" }}>{t("accp_fav_games")}</span>
            {favGameList.map(([id, count]) => (
              <FavGameChip
                key={id}
                placeId={id}
                count={count}
                active={gameFilter === id}
                onClick={() => setGameFilter(gameFilter === id ? null : id)}
              />
            ))}
            {gameFilter && (
              <button onClick={() => setGameFilter(null)} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                {t("acc_clear")}
              </button>
            )}
          </div>
        )}
      </div>

      <BulkActionBar
        selectedCount={selected.size}
        visibleCount={visible.length}
        bulkLaunching={bulkLaunching}
        bulkStatus={bulkStatus}
        onLaunchAll={handleBulkLaunch}
        onValidateAll={handleBulkValidate}
        onMoveToGroup={() => { setGroupInput(""); setMoveGroupModal(true); }}
        onApplyLaunchPreset={() => { setBulkPresetError(""); setBulkPresetModal(true); }}
        onSelectAll={selectAll}
        onDeleteAll={handleBulkDelete}
        onClearSelection={clearSelection}
      />

      {/* ── ACCOUNT LIST GRID ── */}
      <div
        className="scroll"
        style={{
          flex: 1, overflowY: "auto", padding: "20px 24px",
          display: "grid", gridTemplateColumns: viewMode === "card" ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr",
          gap: viewMode === "card" ? 12 : 8, alignContent: "start",
          background: "radial-gradient(circle at top right, var(--g02) 0%, transparent 60%)",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--t3)", fontSize: 12, gridColumn: "1 / -1" }}>
            {t("loading_accounts")}
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "56px 20px",
            color: "var(--t3)", fontSize: 12.5, lineHeight: 1.6,
            border: "1px dashed var(--g08)", borderRadius: 18, gridColumn: "1 / -1",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}>
            {accounts.length === 0 ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 900, color: "var(--t1)" }}>{t("accp_empty_title")}</div>
                <div style={{ maxWidth: 380 }}>{t("accp_empty_body")}</div>
                <button
                  onClick={e => { e.stopPropagation(); setAddMenu(true); }}
                  className="btn glow-btn halloween-primary"
                  style={{ marginTop: 4, padding: "10px 18px", borderRadius: 10, fontSize: 12.5, fontWeight: 900, background: "#FFFFFF", color: "#07080a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <PlusIcon size={12} color="#07080a" /> {t("home_welcome_cta")}
                </button>
              </>
            ) : (
              <>
                <div>{search ? `${t("no_accounts_match")} "${search}"` : t("no_accounts_in_view")}</div>
                <button
                  onClick={() => { setSearch(""); setFilter("all"); setActiveGroup(null); setGameFilter(null); }}
                  className="btn btn-ghost"
                  style={{ padding: "7px 14px", borderRadius: 9, fontSize: 11.5, fontWeight: 800 }}
                >
                  {t("accp_reset_filters")}
                </button>
              </>
            )}
          </div>
        ) : (
          visible.map(account => (
            <AccountCard
              account={account}
              viewMode={viewMode}
              isLaunching={launchingAccounts.has(account.user_id)}
              launchState={launchFeedback.get(account.user_id)}
              isRunning={activeUserIds.has(account.user_id)}
              onRetryLaunch={() => void retryLaunch(account.user_id)}
              isSelected={selected.has(account.user_id)}
              isCopied={copiedId === account.user_id}
              isCopiedUid={copiedUid === account.user_id}
              isEditingNotes={editingNotesId === account.user_id}
              editingNotesText={editingNotesId === account.user_id ? editingNotesText : ""}
              isDraggable={sortBy === "custom"}
              isChecking={checkingIds.has(account.user_id)}
              lastPlaceId={lastPlaceIdOf(account)}
              anySelected={selected.size > 0}
              onToggleSelect={() => toggleSelect(account.user_id)}
              onToggleFav={() => handleToggleFav(account.user_id)}
              onRemove={() => handleRemove(account.user_id, account.username)}
              onLaunch={() => handleLaunch(account.user_id)}
              onValidate={() => handleValidate(account.user_id)}
              onRelogin={() => handleRelogin(account.username)}
              onCopyUsername={() => handleCopyUsername(account.user_id, account.username)}
              onCopyUserId={() => handleCopyUserId(account.user_id)}
              onLaunchGame={(placeId) => handleReplayLaunch(account.user_id, placeId)}
              onReplayGame={account.default_place_id ? () => handleReplayLaunch(account.user_id, account.default_place_id!) : undefined}
              onQuickLaunch={() => { setQuickLaunchAccount(account); setQuickPlaceId(""); }}
              onTagClick={(tag) => setSearch(tag)}
              onStartEditNotes={() => { setEditingNotesId(account.user_id); setEditingNotesText(account.notes || ""); }}
              onNotesChange={(text) => setEditingNotesText(text)}
              onSaveNotes={() => handleSaveNotes(account.user_id, editingNotesText)}
              onCancelEditNotes={() => setEditingNotesId(null)}
              onDragStart={(e) => handleDragStart(e, account.user_id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, account.user_id)}
              onOpenDetails={() => setDetailAccount(account)}
              onOpenUtilities={() => setSelectedUtilAccount(account)}
            />
          ))
        )}
      </div>

      {/* ── MODALS ── */}

      <AccountDetailModal
        account={detailAccount}
        onClose={() => setDetailAccount(null)}
        onLaunch={() => { if (detailAccount) handleLaunch(detailAccount.user_id); }}
        onValidate={() => { if (detailAccount) handleValidate(detailAccount.user_id); }}
        onRelogin={() => { if (detailAccount) handleRelogin(detailAccount.username); }}
        onOpenUtilities={() => {
          if (!detailAccount) return;
          setSelectedUtilAccount(detailAccount);
        }}
        onCopyUsername={() => { if (detailAccount) handleCopyUsername(detailAccount.user_id, detailAccount.username); }}
        onCopyUserId={() => { if (detailAccount) handleCopyUserId(detailAccount.user_id); }}
        onTagClick={(tag) => setSearch(tag)}
        onSaveNotes={(notes) => { if (detailAccount) handleSaveNotes(detailAccount.user_id, notes); }}
      />

      <QuickLaunchModal
        account={quickLaunchAccount}
        quickPlaceId={quickPlaceId}
        setQuickPlaceId={setQuickPlaceId}
        onClose={() => setQuickLaunchAccount(null)}
        onLaunch={handleQuickLaunch}
      />

      <AccSingleCookieModal
        open={showSingle}
        addCookie={addCookie}
        setAddCookie={setAddCookie}
        adding={adding}
        addError={addError}
        onClose={() => { setShowSingle(false); setAddError(""); }}
        onSubmit={handleAddSingle}
      />

      <AccBulkCookieModal
        open={showBulk}
        bulkText={bulkText}
        setBulkText={setBulkText}
        bulkAdding={bulkAdding}
        bulkResults={bulkResults}
        onClose={() => { if (!bulkAdding) { setShowBulk(false); setBulkText(""); setBulkResults([]); } }}
        onCancel={() => { setShowBulk(false); setBulkText(""); setBulkResults([]); }}
        onSubmit={handleBulkImport}
      />

      <AccComboImportModal
        open={showUserPass}
        comboText={comboText}
        setComboText={setComboText}
        loginLoading={loginLoading}
        loginError={loginError}
        onClose={() => { if (!loginLoading) setShowUserPass(false); }}
        onSubmit={() => handleComboImport(comboText)}
      />

      <ComboResultsModal
        comboResults={comboResults}
        onClose={() => setComboResults([])}
      />

      <AccountConfigSidebarModal
        account={selectedUtilAccount}
        onClose={() => setSelectedUtilAccount(null)}
        onRefresh={loadAccounts}
        onRemoveAccount={async (userId) => {
          try {
            await invoke("remove_account", { userId });
            forgetAccountLaunch(userId);
            setAccounts(prev => prev.filter(a => a.user_id !== userId));
            setSelectedUtilAccount(null);
          } catch (e) {
            toast.error(String(e));
          }
        }}
      />

      <ExportAccountsModal
        open={showExport}
        exportPwd={exportPwd}
        setExportPwd={setExportPwd}
        exportLoading={exportLoading}
        exportErr={exportErr}
        exportOk={exportOk}
        onClose={() => { if (!exportLoading) setShowExport(false); }}
        onExport={handleExport}
      />

      <ImportAccountsModal
        open={showImport}
        importPwd={importPwd}
        setImportPwd={setImportPwd}
        importLoading={importLoading}
        importErr={importErr}
        importOk={importOk}
        preview={importPreview}
        selected={importSelection}
        premium={accountPlan.premium}
        onToggleAccount={id => setImportSelection(current => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        onResetPreview={resetImportPreview}
        onClose={() => { resetImportPreview(); setShowImport(false); setImportPwd(""); }}
        onImport={handleImport}
      />

      <BulkEditModal
        open={bulkPresetModal}
        selectedCount={selected.size}
        saving={bulkPresetSaving}
        error={bulkPresetError}
        onClose={() => { if (!bulkPresetSaving) setBulkPresetModal(false); }}
        onApply={handleBulkApplyPreset}
      />

      <MoveToGroupModal
        open={moveGroupModal}
        selectedCount={selected.size}
        groupInput={groupInput}
        setGroupInput={setGroupInput}
        onClose={() => setMoveGroupModal(false)}
        onMove={handleBulkMoveGroup}
      />
    </div>
  );
}

/* ── Account Detail Modal ── */
export function AccountDetailModal({
  account, onClose, onLaunch, onValidate, onRelogin, onOpenUtilities,
  onCopyUsername, onCopyUserId, onTagClick, onSaveNotes,
}: {
  account: Account | null;
  onClose: () => void;
  onLaunch: () => void;
  onValidate: () => void;
  onRelogin: () => void;
  onOpenUtilities: () => void;
  onCopyUsername: () => void;
  onCopyUserId: () => void;
  onTagClick: (tag: string) => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [editingNotes, setEditingNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (account) {
      setEditingNotes(account.notes || "");
      setIsEditing(false);
    }
  }, [account]);

  if (!account) return null;

  const isValid = account.cookie_status === "Valid";
  const statusColor = isValid ? "var(--green)" : "var(--red)";

  const history: Array<{ placeId: string; name: string }> = (() => {
    try { return JSON.parse(localStorage.getItem(`reiya_acc_games_${account.user_id}`) ?? "[]"); }
    catch { return []; }
  })();

  return (
    <AccountModal title="Account Information & Games" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header Profile Hero */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
            background: "var(--g02)", borderRadius: 16, border: "1px solid var(--g06)",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <LazyAvatar name={account.username} avatarUrl={account.avatar_url} size={64} />
            <span
              style={{
                position: "absolute", bottom: 0, right: 0,
                width: 12, height: 12, borderRadius: "50%",
                background: statusColor, border: "2px solid #07080a",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--t1)" }}>{account.display_name || account.username}</span>
              <span
                style={{
                  fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 6,
                  background: statusColor + "18", color: statusColor, border: `1px solid ${statusColor}35`,
                }}
              >
                {account.cookie_status.toUpperCase()}
              </span>
              {account.group && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: "var(--g05)", color: "var(--t2)" }}>
                  {account.group}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 11, color: "var(--t3)" }}>
              <span onClick={onCopyUsername} style={{ cursor: "pointer" }} title="Click to copy">@{account.username}</span>
              <span>·</span>
              <span onClick={onCopyUserId} style={{ cursor: "pointer" }} title="Click to copy">User ID: {account.user_id}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onLaunch}
              disabled={!isValid}
              className="btn"
              style={{ background: "var(--accent)", color: "#000", fontWeight: 800, fontSize: 11, padding: "8px 14px", borderRadius: 8 }}
            >
              🚀 Launch
            </button>
            <button
              onClick={onOpenUtilities}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "8px 12px", borderRadius: 8 }}
            >
              ⚙️ Utilities
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Account Details Box */}
          <div style={{ padding: 14, background: "var(--g03)", borderRadius: 12, border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em" }}>ACCOUNT DETAILS</span>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
              <span style={{ color: "var(--t3)" }}>Last Launched:</span>
              <span>{account.last_launched_at ? new Date(account.last_launched_at).toLocaleString() : "Never"}</span>
            </div>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
              <span style={{ color: "var(--t3)" }}>Added Date:</span>
              <span>{new Date(account.added_at).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
              <span style={{ color: "var(--t3)" }}>Cookie Status:</span>
              <span style={{ color: statusColor, fontWeight: 700 }}>{account.cookie_status}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {!isValid && (
                <button onClick={onRelogin} className="btn" style={{ flex: 1, background: "rgba(248,113,113,0.15)", color: "var(--red)", fontSize: 10, padding: "4px 8px" }}>
                  Relogin Account
                </button>
              )}
              <button onClick={onValidate} className="btn btn-ghost" style={{ flex: 1, fontSize: 10, padding: "4px 8px" }}>
                Re-validate Cookie
              </button>
            </div>
          </div>

          {/* Games Info Box */}
          <div style={{ padding: 14, background: "var(--g03)", borderRadius: 12, border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "#A78BFA", letterSpacing: "0.08em" }}>GAMES & DEFAULTS</span>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
              <span style={{ color: "var(--t3)" }}>Default Game:</span>
              <span style={{ fontWeight: 700, color: "#DDD6FE" }}>{account.default_game_name || (account.default_place_id ? `Place ${account.default_place_id}` : "None")}</span>
            </div>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
              <span style={{ color: "var(--t3)" }}>Last Played Game:</span>
              <span>{account.last_played_game || "None"}</span>
            </div>
            {history.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 700 }}>Recent Games History ({history.length}):</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {history.map((g, i) => (
                    <span key={i} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(167,139,250,0.12)", color: "#C4B5FD", border: "1px solid rgba(167,139,250,0.25)" }}>
                      🎮 {g.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes & Tags Section */}
        <div style={{ padding: 14, background: "var(--g03)", borderRadius: 12, border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "var(--t3)", letterSpacing: "0.08em" }}>NOTES & TAGS</span>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} style={{ background: "none", border: "none", color: "#60A5FA", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                Edit Notes
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { onSaveNotes(editingNotes); setIsEditing(false); }} style={{ background: "none", border: "none", color: "var(--green)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  Save
                </button>
                <button onClick={() => setIsEditing(false)} style={{ background: "none", border: "none", color: "var(--t3)", fontSize: 10, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {account.tags && account.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
              {account.tags.map(t => (
                <span key={t} onClick={() => { onTagClick(t); onClose(); }} style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)", cursor: "pointer" }}>
                  #{t}
                </span>
              ))}
            </div>
          )}

          {isEditing ? (
            <textarea
              value={editingNotes}
              onChange={e => setEditingNotes(e.target.value)}
              rows={3}
              placeholder="Add notes for this account..."
              style={{ width: "100%", fontSize: 11, padding: 8, borderRadius: 6, background: "var(--g02)", border: "1px solid var(--g08)", color: "var(--t1)", outline: "none", resize: "vertical" }}
            />
          ) : (
            <div style={{ fontSize: 11, color: account.notes ? "var(--t2)" : "var(--t3)", fontStyle: account.notes ? "normal" : "italic", lineHeight: 1.4 }}>
              {account.notes || "No notes added for this account yet."}
            </div>
          )}
        </div>
      </div>
    </AccountModal>
  );
}

/* ── Game Thumbnail Badge for Favorite Games ── */
function FavGameChip({ placeId, count, active, onClick }: { placeId: string; count: number; active: boolean; onClick: () => void }) {
  const [name, setName] = useState(() => CATALOG.find(g => g.placeId === placeId)?.name || "");
  useEffect(() => {
    let on = true;
    if (!name) {
      invoke<{ name: string }>("fetch_place_details", { placeId: Number(placeId) })
        .then(d => { if (on && d?.name) setName(d.name); })
        .catch(() => {});
    }
    return () => { on = false; };
  }, [placeId]);
  return (
    <button
      onClick={onClick}
      title={name || `Place ${placeId}`}
      style={{
        display: "flex", alignItems: "center", gap: 7, flexShrink: 0, height: 32, padding: "0 12px 0 4px",
        borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
        background: active ? "var(--g08)" : "var(--g02)",
        border: `1px solid ${active ? "var(--g35)" : "var(--g05)"}`,
        color: active ? "var(--t1)" : "var(--t2)",
      }}
    >
      <span style={{ width: 24, height: 24, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
        <GameIcon placeId={placeId} placeholderSize={12} />
      </span>
      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || placeId}</span>
      <span style={{ color: "var(--t3)" }}>{count}</span>
    </button>
  );
}

export function GameThumbnailBadge({ placeId, size = 26, onLaunch }: { placeId: string; size?: number; onLaunch?: (placeId: string) => void }) {
  const [gameName, setGameName] = useState<string>(() => CATALOG.find(g => g.placeId === placeId)?.name || "");

  useEffect(() => {
    let active = true;
    if (!placeId || gameName) return;
    invoke<{ name: string }>("fetch_place_details", { placeId: Number(placeId) })
      .then(details => { if (active && details?.name) setGameName(details.name); })
      .catch(() => {});
    return () => { active = false; };
  }, [placeId, gameName]);

  const label = gameName || `Place ${placeId}`;
  return (
    <Tooltip content={onLaunch ? `${label} · Click to launch` : label} position="left">
      <div
        onClick={e => {
          if (onLaunch) { e.stopPropagation(); onLaunch(placeId); }
        }}
        style={{
          width: size, height: size, borderRadius: 7, overflow: "hidden",
          border: "1.5px solid var(--g07)", background: "var(--g04)",
          cursor: onLaunch ? "pointer" : "default", flexShrink: 0, transition: "all .15s ease",
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        }}
        onMouseEnter={e => { if (onLaunch) { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.borderColor = "#A78BFA"; } }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = "var(--g07)"; }}
      >
        <GameIcon placeId={placeId} alt={label} placeholderSize={Math.round(size * 0.5)} />
      </div>
    </Tooltip>
  );
}

/* ── Account status in plain words ── */
function relativeTime(iso: string | null | undefined, t: (k: string) => string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return t("time_ago_seconds").replace("{s}", String(sec));
  if (sec < 3600) return t("time_ago_minutes").replace("{m}", String(Math.floor(sec / 60)));
  if (sec < 86400) return t("time_ago_hours").replace("{h}", String(Math.floor(sec / 3600)));
  return t("time_ago_days").replace("{d}", String(Math.floor(sec / 86400)));
}

type CardState = "running" | "checking" | "ready" | "expired" | "unknown";

function cardState(account: Account, isRunning: boolean, isChecking: boolean): CardState {
  if (isRunning) return "running";
  if (isChecking) return "checking";
  if (account.cookie_status === "Valid") return "ready";
  if (account.cookie_status === "Expired") return "expired";
  return "unknown";
}

const STATE_COLOR: Record<CardState, string> = {
  running: "var(--green)", checking: "#FBBF24", ready: "var(--green)", expired: "var(--red)", unknown: "var(--t3)",
};

/* ── Account Card ── */
function AccountCard({
  account, viewMode, isLaunching, launchState, isRunning, onRetryLaunch, isSelected, isCopied,
  isDraggable, isChecking, anySelected, lastPlaceId,
  onToggleSelect, onToggleFav, onRemove, onLaunch, onLaunchGame, onOpenUtilities, onValidate, onRelogin,
  onCopyUsername,
  onDragStart, onDragOver, onDrop, onOpenDetails,
}: {
  account: Account; viewMode: "card" | "list"; isLaunching: boolean; isSelected: boolean;
  launchState?: LaunchFeedback; isRunning: boolean; onRetryLaunch: () => void;
  isCopied: boolean; isCopiedUid: boolean;
  isEditingNotes?: boolean; editingNotesText?: string; isDraggable: boolean;
  /** Login check in progress for this account. */
  isChecking?: boolean;
  /** Any account selected → always show checkboxes. */
  anySelected?: boolean;
  /** Place ID of the game this account last played (for its icon). */
  lastPlaceId?: string;
  onToggleSelect: () => void;
  onToggleFav: () => void; onRemove: () => void;
  onLaunch: () => void; onValidate?: () => void; onRelogin?: () => void; onOpenUtilities: () => void;
  onCopyUsername: () => void; onCopyUserId: () => void;
  onLaunchGame: (placeId: string) => void;
  onReplayGame?: () => void; onQuickLaunch?: () => void;
  onTagClick: (tag: string) => void;
  onStartEditNotes?: () => void; onNotesChange?: (t: string) => void;
  onSaveNotes?: () => void; onCancelEditNotes?: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenDetails: () => void;
}) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const isList = viewMode === "list";
  const state = cardState(account, isRunning, !!isChecking);
  const color = STATE_COLOR[state];
  const lastPlayed = relativeTime(account.last_launched_at, t);
  const statusText =
    state === "running" ? t("acc_status_playing")
    : state === "checking" ? t("acc_status_checking")
    : state === "ready" ? t("acc_status_ready") + (lastPlayed ? ` · ${t("acc_played")} ${lastPlayed}` : "")
    : state === "expired" ? t("accp_status_expired")
    : t("acc_status_unknown");

  const savedGameName = account.default_game_name || (account.default_place_id ? `Place ${account.default_place_id}` : account.last_played_game);
  const favGameIds = (localStorage.getItem("reiya_fav_games_" + account.user_id) || "").split(",").map(s => s.trim()).filter(Boolean);
  const isValid = account.cookie_status === "Valid";
  const canLaunch = isValid && !isLaunching;
  const showCheckbox = hovered || isSelected || !!anySelected;
  const dimmed = state === "expired";

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", cursor: "pointer", padding: 0, borderRadius: 8, flexShrink: 0,
  };

  const checkbox = (
    <div
      onClick={e => { e.stopPropagation(); onToggleSelect(); }}
      role="checkbox"
      aria-checked={isSelected}
      title={isSelected ? t("acc_untick") : t("accp_select_tip")}
      style={{
        width: 18, height: 18, borderRadius: 6, flexShrink: 0, cursor: "pointer",
        border: `2px solid ${isSelected ? "#A78BFA" : "var(--g15)"}`,
        background: isSelected ? "#A78BFA" : "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: showCheckbox ? 1 : 0, transition: "opacity .12s",
      }}
    >
      {isSelected && <CheckIcon size={11} color="#fff" strokeWidth={3} />}
    </div>
  );

  const avatar = (size: number) => (
    <div onClick={onOpenDetails} title={t("accp_details_tip")} style={{ position: "relative", width: size, height: size, flexShrink: 0, cursor: "pointer", opacity: dimmed ? 0.6 : 1 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "var(--g06)" }}>
        <LazyAvatar name={account.username} avatarUrl={account.avatar_url} size={size} />
      </div>
      <span style={{
        position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: "50%",
        background: color, border: "2.5px solid var(--bg, #0B0D11)",
        animation: state === "running" ? "pulse-glow 2s ease-in-out infinite" : "none",
      }} />
    </div>
  );

  const nameBlock = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div onClick={onOpenDetails} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: dimmed ? "var(--t2)" : "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {account.display_name || account.username}
        </span>
        {account.is_favorite && <PinIcon size={11} color="#FBBF24" fill="#FBBF24" />}
      </div>
      <div
        onClick={onCopyUsername}
        title={isCopied ? t("copied") : `${t("accp_copy_username")} · ID ${account.user_id}`}
        style={{ fontSize: 11, color: isCopied ? "var(--green)" : "var(--t3)", cursor: "copy", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}
      >
        {isCopied ? `✓ ${t("copied")}` : `@${account.username}`}
      </div>
    </div>
  );

  const statusLine = launchState?.phase
    ? <AccountLaunchStatus state={launchState} running={isRunning} onRetry={onRetryLaunch} />
    : (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color, minWidth: 0 }}>
        {state === "checking" && <LoaderIcon size={11} style={{ animation: "spin 1s linear infinite" }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusText}</span>
      </div>
    );

  /** Main action: Launch when ready; otherwise the fix for the problem. */
  const actionButton = (width?: number | string) => {
    const base: React.CSSProperties = {
      height: 32, width, padding: width ? 0 : "0 14px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      borderRadius: 9, fontSize: 12, fontWeight: 800, fontFamily: "inherit", whiteSpace: "nowrap",
    };
    if (state === "checking") {
      return <button disabled className="acct-launch" style={{ ...base, border: "1px solid var(--g06)", background: "var(--g03)", color: "var(--t3)", cursor: "default" }}>
        <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} /> {t("checking")}
      </button>;
    }
    if (state === "expired") {
      return <button onClick={onRelogin} className="acct-launch" title={t("accp_relogin_tip")} style={{ ...base, border: "1px solid rgba(248,113,113,0.35)", background: "var(--red-dim)", color: "var(--red)", cursor: "pointer" }}>
        <KeyIcon size={12} /> {t("accp_relogin")}
      </button>;
    }
    if (state === "unknown") {
      return <button onClick={onValidate} className="acct-launch" title={t("acc_recheck")} style={{ ...base, border: "1px solid var(--g10)", background: "var(--g04)", color: "var(--t1)", cursor: "pointer" }}>
        <ShieldCheckIcon size={12} /> {t("accp_check_login")}
      </button>;
    }
    return <button onClick={onLaunch} disabled={!canLaunch} className="acct-launch" style={{
      ...base, border: "none",
      background: canLaunch ? "var(--accent)" : "var(--g04)", color: canLaunch ? "#000" : "var(--t3)",
      cursor: canLaunch ? "pointer" : "not-allowed",
    }}>
      {isLaunching ? <LoaderIcon size={12} style={{ animation: "spin 1s linear infinite" }} /> : <PlayIcon size={11} color={canLaunch ? "#000" : "var(--t3)"} />}
      {isLaunching ? t("launching_suffix") : t("launch")}
    </button>;
  };

  const hoverTools = (
    <div style={{ display: "flex", flexShrink: 0, alignItems: "center" }}>
      <button onClick={onToggleFav} title={account.is_favorite ? t("acc_unpin") : t("acc_pin")} aria-label={account.is_favorite ? t("acc_unpin") : t("acc_pin")}
        style={{ ...iconBtn, opacity: hovered || account.is_favorite ? 1 : 0, transition: "opacity .12s" }}>
        <PinIcon size={13} fill={account.is_favorite ? "#FBBF24" : "none"} color={account.is_favorite ? "#FBBF24" : "var(--t3)"} />
      </button>
      {state !== "checking" && onValidate && (
        <button onClick={onValidate} title={t("acc_recheck")} aria-label={t("acc_recheck")}
          style={{ ...iconBtn, opacity: hovered ? 1 : 0, transition: "opacity .12s", color: "var(--t3)" }}>
          <RefreshIcon size={13} />
        </button>
      )}
      <button onClick={onRemove} title={t("remove_account_menu")} aria-label={t("remove_account_menu")}
        style={{ ...iconBtn, opacity: hovered ? 1 : 0, transition: "opacity .12s" }}>
        <TrashIcon size={13} color="var(--red)" />
      </button>
      <button className="acct-tool" onClick={onOpenUtilities} title={t("accp_tools_tip")} aria-label={t("accp_tools_tip")} style={{ ...iconBtn, color: "var(--t3)" }}>
        <SettingsIcon size={13} />
      </button>
    </div>
  );

  const gameInfo = (
    <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--t3)" }}>
      {account.group && (
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "var(--g05)", color: "var(--t2)" }}>{account.group}</span>
      )}
      {savedGameName && (
        <span style={{ width: 28, height: 28, borderRadius: 7, overflow: "hidden", flexShrink: 0, border: "1px solid var(--g06)" }}>
          {lastPlaceId
            ? <GameIcon placeId={lastPlaceId} placeholderSize={13} />
            : <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--g05)" }}><GamepadIcon size={10} color="var(--t3)" /></span>}
        </span>
      )}
      <span
        onClick={onOpenDetails}
        title={savedGameName ? `${t("accp_last_game")}: ${savedGameName}` : undefined}
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", opacity: savedGameName ? 1 : 0.6 }}
      >
        {savedGameName || t("accp_no_game_yet")}
      </span>
    </div>
  );

  const favThumbs = favGameIds.length > 0 && (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      {favGameIds.slice(0, 3).map(pid => (
        <GameThumbnailBadge key={pid} placeId={pid} size={24} onLaunch={canLaunch ? onLaunchGame : undefined} />
      ))}
    </div>
  );

  const shell: React.CSSProperties = {
    position: "relative",
    background: isSelected ? "rgba(167,139,250,0.08)" : hovered ? "var(--g03)" : "var(--g02)",
    border: `1px solid ${isSelected ? "rgba(167,139,250,0.45)" : state === "expired" ? "rgba(248,113,113,0.18)" : hovered ? "var(--g10)" : "var(--g05)"}`,
    transition: "border-color .15s, background .15s",
    cursor: isDraggable ? "grab" : "default",
  };

  if (!isList) {
    return (
      <div
        className="acct-card"
        draggable={isDraggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ ...shell, display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 16 }}
      >
        {/* Top: checkbox + tools */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: -4 }}>
          {checkbox}
          <div style={{ flex: 1 }} />
          {hoverTools}
        </div>

        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {avatar(48)}
          {nameBlock}
        </div>

        {/* Status */}
        {statusLine}

        {/* Game info */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26 }}>
          {gameInfo}
          {favThumbs}
        </div>

        {/* Main action */}
        {actionButton("100%")}
      </div>
    );
  }

  return (
    <div
      className="acct-card"
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...shell, display: "flex", alignItems: "center", gap: 14, padding: "9px 12px", borderRadius: 12 }}
    >
      {checkbox}
      {avatar(40)}
      <div style={{ width: 200, minWidth: 0, flexShrink: 0, display: "flex" }}>{nameBlock}</div>
      <div style={{ width: 210, minWidth: 0, flexShrink: 0 }}>{statusLine}</div>
      {gameInfo}
      {favThumbs}
      {hoverTools}
      {actionButton(130)}
    </div>
  );
}

/* ── Modal wrapper ── */
export function AccountModal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--modal-bg)",
        border: "1px solid var(--g08)", borderRadius: 20,
        padding: 26, width: wide ? 500 : 440, maxWidth: "93vw", maxHeight: "88vh", overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--t1)" }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center",
              padding: 4, borderRadius: 6, transition: "all .12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--t1)"; e.currentTarget.style.background = "var(--g06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.background = "none"; }}
          >
            <XIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalBtn({ label, onClick, primary, danger, disabled }: {
  label: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 12, fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all .12s",
        border: primary ? "none" : danger ? "1px solid rgba(248,113,113,0.3)" : "1px solid var(--g07)",
        background: primary ? "var(--accent)" : danger ? "rgba(248,113,113,0.1)" : "var(--g03)",
        color: primary ? "#0a0a0a" : danger ? "var(--red)" : "var(--t2)",
        boxShadow: primary && !disabled ? "0 4px 14px var(--g20)" : "none",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.1)"; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.filter = "none"; }}
    >
      {label}
    </button>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 10, marginTop: 16 }}>{children}</div>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, color: "var(--t3)", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{
      fontSize: 11.5, color: "var(--red)", marginBottom: 10, padding: "8px 12px",
      background: "rgba(248,113,113,0.08)", borderRadius: 9,
      border: "1px solid rgba(248,113,113,0.2)",
    }}>
      {msg}
      {isFreeAccountLimit(msg) && <AccountLimitLink />}
    </div>
  );
}

/* â"€â"€ Utility section â"€â"€ */
export function UtilSection({ label, Icon, children }: { label: string; Icon: React.ComponentType<any>; children: ReactNode }) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12,
      background: "var(--g01)", border: "1px solid var(--g05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Icon size={12} color="var(--t3)" />
        <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--t3)", letterSpacing: "0.1em" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function UtilInput({ value, onChange, placeholder, type, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string; disabled?: boolean }) {
  return (
    <input
      type={type ?? "text"}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        flex: 1, height: 34, padding: "0 12px", borderRadius: 9, outline: "none", fontSize: 12,
        background: "var(--g03)", border: "1px solid var(--g07)",
        color: "var(--t1)", opacity: disabled ? 0.5 : 1, transition: "border-color .15s",
      }}
      onFocus={e => e.currentTarget.style.borderColor = "var(--g35)"}
      onBlur={e => e.currentTarget.style.borderColor = "var(--g07)"}
    />
  );
}

export function UtilAction({ label, onClick, disabled, danger, fullWidth }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; fullWidth?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: fullWidth ? "1 1 100%" : undefined,
        height: 34, padding: "0 16px", borderRadius: 9, fontSize: 11.5, fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all .12s",
        background: danger ? "rgba(248,113,113,0.08)" : "var(--g04)",
        color: danger ? "var(--red)" : "var(--t1)",
        border: danger ? "1px solid rgba(248,113,113,0.2)" : "1px solid var(--g07)",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.15)"; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.filter = "none"; }}
    >
      {label}
    </button>
  );
}

/* â"€â"€ Avatar â"€â"€ */
export function Avatar({ name, avatarUrl, size }: { name: string; avatarUrl: string; size: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hue = name.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl} alt={name}
        loading="lazy" decoding="async"
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `hsl(${hue},20%,18%)`, border: `2px solid hsl(${hue},20%,28%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.3, fontWeight: 800, color: `hsl(${hue},50%,65%)`,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function LazyAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: "80px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: size, height: size }}>
      {visible
        ? <Avatar name={name} avatarUrl={avatarUrl} size={size} />
        : <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--g05)" }} />
      }
    </div>
  );
}

