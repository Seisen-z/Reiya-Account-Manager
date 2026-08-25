import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  SettingsIcon,
  StarIcon, TrashIcon, XIcon, CheckIcon,
  ZapIcon,
} from "../components/Icons";
import { QuickLaunchModal } from "../components/QuickLaunchModal";
import { AccSingleCookieModal } from "../components/AccSingleCookieModal";
import { AccBulkCookieModal } from "../components/AccBulkCookieModal";
import { AccComboImportModal } from "../components/AccComboImportModal";
import { ComboResultsModal } from "../components/ComboResultsModal";
import { AccountConfigSidebarModal } from "../components/AccountConfigSidebarModal";
import { ExportAccountsModal } from "../components/ExportAccountsModal";
import { ImportAccountsModal } from "../components/ImportAccountsModal";
import { MoveToGroupModal } from "../components/MoveToGroupModal";
import { AccountsHeaderBar } from "../components/AccountsHeaderBar";
import { AccountsToolbar } from "../components/AccountsToolbar";
import { BulkActionBar } from "../components/BulkActionBar";
import Tooltip from "../components/ui/Tooltip";
import { CATALOG } from "../data/catalog";

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

type FilterTab = "all" | "favorites" | "valid";
type SortBy = "last_launched" | "name_asc" | "name_desc" | "status" | "added" | "custom";

const accountsCache = {
  accounts: [] as Account[],
  loaded: false,
};

/* ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── */
export default function Accounts() {
  const { t } = useLanguage();
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
  const [launching,   setLaunching]   = useState<number | null>(null);
  const [sortBy,      setSortBy]      = useState<SortBy>("last_launched");
  const [copiedId,    setCopiedId]    = useState<number | null>(null);
  const [copiedUid,   setCopiedUid]   = useState<number | null>(null);
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
  const [importErr, setImportErr] = useState("");
  const [exportOk,  setExportOk]  = useState("");
  const [importOk,  setImportOk]  = useState("");

  const handleExport = async () => {
    const pwd = exportPwd.trim();
    setExportLoading(true); setExportErr(""); setExportOk("");
    try {
      const path = await invoke<string>("export_accounts", { password: pwd });
      setExportOk(`Saved to: ${path}`);
      setExportPwd("");
    } catch (e) {
      if (String(e) !== "cancelled") setExportErr(String(e));
    } finally { setExportLoading(false); }
  };

  const handleImport = async () => {
    const pwd = importPwd.trim();
    setImportLoading(true); setImportErr(""); setImportOk("");
    try {
      const added = await invoke<number>("import_accounts", { password: pwd });
      setImportOk(`Imported ${added} new account${added !== 1 ? "s" : ""}.`);
      setImportPwd("");
      await loadAccounts();
    } catch (e) {
      if (String(e) !== "cancelled") setImportErr(String(e));
    } finally { setImportLoading(false); }
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
        unknowns.forEach(async (acc) => {
          try {
            const updated = await invoke<Account>("validate_cookie", { userId: acc.user_id });
            setAccounts(prev => {
              const next = prev.map(a => a.user_id === acc.user_id ? updated : a);
              accountsCache.accounts = next;
              try { localStorage.setItem("reiya_accounts_cache", JSON.stringify(next)); } catch {}
              return next;
            });
          } catch { /* silent */ }
        });
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

  const visible = [...accounts]
    .filter(a => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.username.toLowerCase().includes(q) || a.display_name.toLowerCase().includes(q) || a.tags?.some(t => t.toLowerCase().includes(q));
      const matchFilter = filter === "all" || (filter === "favorites" && a.is_favorite) || (filter === "valid" && a.cookie_status === "Valid");
      const matchGroup = activeGroup === null || a.group === activeGroup;
      return matchSearch && matchFilter && matchGroup;
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
    if (!confirm(`${t("remove_account_confirm")}${username}?`)) return;
    try {
      await invoke("remove_account", { userId });
      setAccounts(prev => prev.filter(a => a.user_id !== userId));
    } catch (e) { console.error(e); }
  };

  const handleLaunch = async (userId: number) => {
    setLaunching(userId);
    try {
      await invoke("launch_account", {
        userId, placeId: null, jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
    finally { setLaunching(null); }
  };

  const handleReplayLaunch = async (userId: number, placeId: string) => {
    setLaunching(userId);
    try {
      await invoke("launch_account", {
        userId, placeId, jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
    finally { setLaunching(null); }
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
    setLaunching(quickLaunchAccount.user_id);
    setQuickLaunchAccount(null);
    try {
      await invoke("launch_account", {
        userId: quickLaunchAccount.user_id,
        placeId: placeId || null,
        jobId: null, accessCode: null,
        useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
      });
    } catch (e) { toast.error(`Launch failed: ${e}`); }
    finally { setLaunching(null); }
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

  const handleValidate = async (userId: number) => {
    try {
      const updated = await invoke<Account>("validate_cookie", { userId });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updated : a));
    } catch (e) { console.error(e); }
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
        if (confirm("A Roblox cookie was detected in your clipboard. Import it?")) {
          setAdding(true); setAddError("");
          try {
            const acc = await invoke<Account>("add_account", { cookie: clip });
            setAccounts(prev => {
              const idx = prev.findIndex(a => a.user_id === acc.user_id);
              return idx >= 0 ? prev.map((a, i) => i === idx ? acc : a) : [...prev, acc];
            });
            return;
          } catch (e) { setAddError(String(e)); }
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
    const targets = accounts.filter(a => selected.has(a.user_id) && a.cookie_status === "Valid");
    if (targets.length === 0) return;
    setBulkLaunching(true);
    const DELAY = 1500;
    for (let i = 0; i < targets.length; i++) {
      const acc = targets[i];
      setBulkStatus(`Launching ${i + 1}/${targets.length}: @${acc.username}`);
      try {
        await invoke("launch_account", {
          userId: acc.user_id, placeId: null, jobId: null, accessCode: null,
          useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
        });
      } catch { }
      if (i < targets.length - 1) {
        // Countdown display between launches
        for (let s = Math.ceil(DELAY / 1000); s > 0; s--) {
          setBulkStatus(`Launched @${acc.username} — next in ${s}s…`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    setBulkLaunching(false); setBulkStatus(`✓ Launched ${targets.length} accounts`);
    setTimeout(() => setBulkStatus(""), 3000);
  };

  const handleBulkValidate = async () => {
    const targets = accounts.filter(a => selected.has(a.user_id));
    if (targets.length === 0) return;
    setBulkStatus(`Validating ${targets.length} cookies...`);
    let updated = [...accounts];
    for (const acc of targets) {
      try {
        const result = await invoke<Account>("validate_cookie", { userId: acc.user_id });
        updated = updated.map(a => a.user_id === acc.user_id ? result : a);
      } catch { }
    }
    setAccounts(updated);
    setBulkStatus(`Validated ${targets.length} cookies`);
    setTimeout(() => setBulkStatus(""), 3000);
  };

  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const handleBulkDelete = async () => {
    const targets = accounts.filter(a => selected.has(a.user_id));
    if (targets.length === 0) return;
    if (!deleteConfirmPending) {
      setDeleteConfirmPending(true);
      toast.warning(`Click Delete again to confirm removing ${targets.length} account(s).`);
      setTimeout(() => setDeleteConfirmPending(false), 4000);
      return;
    }
    setDeleteConfirmPending(false);
    for (const acc of targets) {
      try { await invoke("remove_account", { userId: acc.user_id }); } catch { }
    }
    setAccounts(prev => prev.filter(a => !selected.has(a.user_id)));
    setSelected(new Set());
    setBulkStatus("");
    toast.success(`Removed ${targets.length} account(s).`);
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
          validCount={validCount}
          favCount={favCount}
          online={online}
          selectedCount={selected.size}
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
        />
      </div>

      <BulkActionBar
        selectedCount={selected.size}
        bulkLaunching={bulkLaunching}
        bulkStatus={bulkStatus}
        onLaunchAll={handleBulkLaunch}
        onValidateAll={handleBulkValidate}
        onMoveToGroup={() => { setGroupInput(""); setMoveGroupModal(true); }}
        onSelectAll={selectAll}
        onDeleteAll={handleBulkDelete}
        onClearSelection={clearSelection}
      />

      {/* ── ACCOUNT LIST GRID ── */}
      <div
        className="scroll"
        style={{
          flex: 1, overflowY: "auto", padding: "20px 24px",
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 16, alignContent: "start",
          background: "radial-gradient(circle at top right, var(--g02) 0%, transparent 60%)",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--t3)", fontSize: 12, gridColumn: "1 / -1" }}>
            {t("loading_accounts")}
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            color: "var(--t3)", fontSize: 12.5,
            border: "1px dashed var(--g06)", borderRadius: 16, gridColumn: "1 / -1",
          }}>
            {accounts.length === 0
              ? t("no_accounts_yet")
              : search ? `${t("no_accounts_match")} "${search}"` : t("no_accounts_in_view")}
          </div>
        ) : (
          visible.map(account => (
            <AccountCard
              key={account.user_id}
              account={account}
              isLaunching={launching === account.user_id}
              isSelected={selected.has(account.user_id)}
              isCopied={copiedId === account.user_id}
              isCopiedUid={copiedUid === account.user_id}
              isEditingNotes={editingNotesId === account.user_id}
              editingNotesText={editingNotesId === account.user_id ? editingNotesText : ""}
              isDraggable={sortBy === "custom"}
              onToggleSelect={() => toggleSelect(account.user_id)}
              onToggleFav={() => handleToggleFav(account.user_id)}
              onRemove={() => handleRemove(account.user_id, account.username)}
              onLaunch={() => handleLaunch(account.user_id)}
              onValidate={() => handleValidate(account.user_id)}
              onRelogin={() => handleRelogin(account.username)}
              onCopyUsername={() => handleCopyUsername(account.user_id, account.username)}
              onCopyUserId={() => handleCopyUserId(account.user_id)}
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
        onClose={() => { if (!importLoading) setShowImport(false); }}
        onImport={handleImport}
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
export function GameThumbnailBadge({ placeId, size = 26, onLaunch }: { placeId: string; size?: number; onLaunch?: (placeId: string) => void }) {
  const [thumbUrl, setThumbUrl] = useState<string>("");
  const [gameName, setGameName] = useState<string>(() => CATALOG.find(g => g.placeId === placeId)?.name || "");

  useEffect(() => {
    let active = true;
    if (!placeId) return;

    // 1. First try Tauri backend command fetch_place_thumbnails
    invoke<Record<string, string>>("fetch_place_thumbnails", { placeIds: [placeId] })
      .then(map => {
        if (active && map && map[placeId]) {
          setThumbUrl(map[placeId]);
          return;
        }
        // 2. Fetch directly from Roblox Places API endpoint
        fetch(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=150x150&format=Png&isCircular=false`)
          .then(res => res.json())
          .then(json => {
            const img = json?.data?.[0]?.imageUrl;
            if (active && img) setThumbUrl(img);
          })
          .catch(() => {});
      })
      .catch(() => {
        fetch(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=150x150&format=Png&isCircular=false`)
          .then(res => res.json())
          .then(json => {
            const img = json?.data?.[0]?.imageUrl;
            if (active && img) setThumbUrl(img);
          })
          .catch(() => {});
      });

    return () => { active = false; };
  }, [placeId]);

  useEffect(() => {
    let active = true;
    if (!placeId || gameName) return;

    invoke<{ name: string }>("fetch_place_details", { placeId: Number(placeId) })
      .then(details => {
        if (active && details?.name) setGameName(details.name);
      })
      .catch(() => {});

    return () => { active = false; };
  }, [placeId, gameName]);

  return (
    <Tooltip content={`${gameName || `Place ${placeId}`} · Click to launch`} position="left">
      <div
        onClick={e => {
          if (onLaunch) { e.stopPropagation(); onLaunch(placeId); }
        }}
        style={{
          width: size, height: size, borderRadius: 7, overflow: "hidden",
          border: "1.5px solid var(--g07)", background: "var(--g04)",
          cursor: "pointer", flexShrink: 0, transition: "all .15s ease",
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.borderColor = "#A78BFA"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.borderColor = "var(--g07)"; }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={gameName || `Place ${placeId}`}
            onError={e => {
              const target = e.currentTarget;
              if (!target.dataset.triedFallback) {
                target.dataset.triedFallback = "true";
                target.src = `https://www.roblox.com/asset-thumbnail/image?assetId=${placeId}&width=150&height=150&format=png`;
              }
            }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: size * 0.4 }}>🎮</span>
        )}
      </div>
    </Tooltip>
  );
}

/* ── Account Card (Team 4 Inspired Layout) ── */
function AccountCard({
  account, isLaunching, isSelected, isCopied, isCopiedUid,
  isDraggable,
  onToggleSelect, onToggleFav, onRemove, onLaunch, onOpenUtilities,
  onCopyUsername, onCopyUserId, onTagClick,
  onDragStart, onDragOver, onDrop, onOpenDetails,
}: {
  account: Account; isLaunching: boolean; isSelected: boolean;
  isCopied: boolean; isCopiedUid: boolean;
  isEditingNotes?: boolean; editingNotesText?: string; isDraggable: boolean;
  onToggleSelect: () => void;
  onToggleFav: () => void; onRemove: () => void;
  onLaunch: () => void; onValidate?: () => void; onRelogin?: () => void; onOpenUtilities: () => void;
  onCopyUsername: () => void; onCopyUserId: () => void;
  onReplayGame?: () => void; onQuickLaunch?: () => void;
  onTagClick: (tag: string) => void;
  onStartEditNotes?: () => void; onNotesChange?: (t: string) => void;
  onSaveNotes?: () => void; onCancelEditNotes?: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenDetails: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isValid = account.cookie_status === "Valid";
  const isUnknown = account.cookie_status === "Unknown";
  const statusColor = isValid ? "var(--green)" : isUnknown ? "var(--amber)" : "var(--red)";
  const statusLabel = isValid ? "Valid" : isUnknown ? "Unknown" : "Expired";

  const savedGameName = account.default_game_name || (account.default_place_id ? `Place ${account.default_place_id}` : account.last_played_game);

  const favGamesStr = localStorage.getItem("reiya_fav_games_" + account.user_id) || "";
  const favGameIds = favGamesStr.split(",").map(s => s.trim()).filter(Boolean);

  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        padding: "20px 16px 16px",
        background: isSelected ? "rgba(167,139,250,0.08)" : "var(--g02)",
        border: `1px solid ${isSelected ? "rgba(167,139,250,0.35)" : hovered ? "var(--g08)" : "var(--g04)"}`,
        borderRadius: 22, transition: "all .25s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: isDraggable ? "grab" : "default",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? "0 12px 28px rgba(0,0,0,0.35)" : "none",
      }}
    >
      {/* Top Header Actions overlay */}
      <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
        {/* Checkbox */}
        <div
          onClick={onToggleSelect}
          style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
            border: `2px solid ${isSelected ? "#A78BFA" : "var(--g12)"}`,
            background: isSelected ? "#A78BFA" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all .12s",
            opacity: hovered || isSelected ? 1 : 0.4,
          }}
        >
          {isSelected && <CheckIcon size={11} color="#fff" />}
        </div>

        {/* Top-right Icon buttons */}
        <div style={{ display: "flex", gap: 3, opacity: hovered || account.is_favorite ? 1 : 0.4, transition: "opacity .12s" }}>
          <button
            onClick={onToggleFav}
            title="Favorite"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: account.is_favorite ? "var(--amber)" : "var(--t3)" }}
          >
            <StarIcon size={13} fill={account.is_favorite ? "var(--amber)" : "none"} color={account.is_favorite ? "var(--amber)" : "var(--t3)"} />
          </button>
          <button
            onClick={onRemove}
            title="Remove"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "var(--red)" }}
          >
            <TrashIcon size={13} color="var(--red)" />
          </button>
        </div>
      </div>

      {/* Right-side Vertical Favorite Games Stack (Max 4 games) */}
      {favGameIds.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
            zIndex: 3,
          }}
        >
          {favGameIds.slice(0, 4).map(pid => (
            <GameThumbnailBadge
              key={pid}
              placeId={pid}
              size={26}
              onLaunch={(pId) => {
                invoke("launch_account", {
                  userId: account.user_id,
                  placeId: pId,
                  jobId: null, accessCode: null, gameName: null,
                  useBootstrapper: localStorage.getItem("reiya_use_bootstrapper") === "true",
                });
              }}
            />
          ))}
        </div>
      )}

      {/* Team 4 Style Circular Avatar with Ring Effect */}
      <div
        onClick={onOpenDetails}
        title="Click to view account details & games"
        style={{
          position: "relative",
          width: 96, height: 96,
          margin: "10px auto 14px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "100%", height: "100%", borderRadius: "50%",
            padding: 3,
            background: isSelected
              ? "linear-gradient(135deg, #A78BFA, #60A5FA)"
              : hovered
                ? "linear-gradient(135deg, rgba(255,255,255,0.25), var(--g08))"
                : "var(--g06)",
            transition: "all 0.3s ease",
            transform: hovered ? "scale(1.05)" : "scale(1)",
            overflow: "hidden",
          }}
        >
          <LazyAvatar name={account.username} avatarUrl={account.avatar_url} size={90} />
        </div>
        {/* Cookie Health Status Dot */}
        <span
          title={`Status: ${statusLabel}`}
          style={{
            position: "absolute", bottom: 2, right: 2,
            width: 14, height: 14, borderRadius: "50%",
            background: statusColor,
            border: "2.5px solid #0B0D11",
            boxShadow: isValid ? "0 0 8px var(--green)" : "none",
          }}
        />
      </div>

      {/* Account Info Center */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginBottom: 12 }}>
        <span
          onClick={onOpenDetails}
          title="View account info & games"
          style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%", cursor: "pointer" }}
        >
          {account.display_name || account.username}
        </span>

        {/* Username & User ID */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--t3)", marginBottom: 4 }}>
          <span onClick={onCopyUsername} title={isCopied ? "Copied!" : "Copy @username"} style={{ cursor: "pointer", color: isCopied ? "var(--green)" : "var(--t2)" }}>
            {isCopied ? "✓ Copied" : `@${account.username}`}
          </span>
          <span>·</span>
          <span onClick={onCopyUserId} title={isCopiedUid ? "Copied!" : "Copy User ID"} style={{ cursor: "pointer", color: isCopiedUid ? "var(--green)" : "var(--t3)" }}>
            {isCopiedUid ? "✓ ID Copied" : `ID: ${account.user_id}`}
          </span>
        </div>

        {/* Status & Group Tags */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", justifyContent: "center", marginBottom: 4 }}>
          <span
            style={{
              fontSize: 8.5, fontWeight: 900, padding: "2px 7px", borderRadius: 5,
              background: statusColor + "15", color: statusColor, border: `1px solid ${statusColor}30`,
              letterSpacing: "0.04em",
            }}
          >
            {statusLabel.toUpperCase()}
          </span>
          {account.group && (
            <span style={{ fontSize: 8.5, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: "var(--g05)", color: "var(--t2)", border: "1px solid var(--g07)" }}>
              {account.group}
            </span>
          )}
        </div>

        {/* Saved Game Tag */}
        {savedGameName && (
          <div
            onClick={onOpenDetails}
            title={`Saved/Last game: ${savedGameName} (Click for details)`}
            style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
              background: "rgba(167,139,250,0.12)", color: "#C4B5FD", border: "1px solid rgba(167,139,250,0.25)",
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "90%",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            🎮 {savedGameName}
          </div>
        )}

        {/* Tags */}
        {account.tags && account.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", marginTop: 2 }}>
            {account.tags.map(tag => (
              <span
                key={tag}
                onClick={() => onTagClick(tag)}
                style={{
                  fontSize: 8.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                  background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)",
                  cursor: "pointer",
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Notes preview */}
        {account.notes && (
          <div
            onClick={onOpenDetails}
            title={account.notes}
            style={{
              fontSize: 9.5, color: "var(--t3)", fontStyle: "italic", marginTop: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%",
              cursor: "pointer",
            }}
          >
            "{account.notes}"
          </div>
        )}
      </div>

      {/* Card Action Footer */}
      <div style={{ width: "100%", display: "flex", gap: 6, marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--g04)" }}>
        <button
          onClick={onLaunch}
          disabled={isLaunching || !isValid}
          style={{
            flex: 2, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            borderRadius: 9, border: "none",
            background: isLaunching ? "var(--g04)" : isValid ? "var(--accent)" : "var(--g04)",
            color: isLaunching ? "var(--t3)" : isValid ? "#000" : "var(--t3)",
            fontSize: 11, fontWeight: 800,
            cursor: isLaunching || !isValid ? "not-allowed" : "pointer",
            transition: "all .12s",
          }}
        >
          <ZapIcon size={11} color={isValid && !isLaunching ? "#000" : "var(--t3)"} />
          {isLaunching ? "..." : "Launch"}
        </button>

        <button
          onClick={onOpenDetails}
          title="Account Details & Games"
          style={{
            flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            borderRadius: 9, border: "1px solid var(--g06)", background: "var(--g03)",
            color: "var(--t2)", fontSize: 10.5, fontWeight: 700, cursor: "pointer",
          }}
        >
          👁️ Info
        </button>

        <button
          onClick={onOpenUtilities}
          title="Utilities"
          style={{
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 9, border: "1px solid var(--g06)", background: "var(--g03)",
            color: "var(--t3)", cursor: "pointer", flexShrink: 0,
          }}
        >
          <SettingsIcon size={13} />
        </button>
      </div>
    </div>
  );
}

/* â"€â"€ Modal wrapper â"€â"€ */
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
    }}>{msg}</div>
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

