import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../components/Toast";
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  SettingsIcon,
  StarIcon, TrashIcon, XIcon, CheckIcon,
  GamepadIcon, ZapIcon,
} from "../components/Icons";
import { QuickLaunchModal } from "../components/QuickLaunchModal";
import { AccSingleCookieModal } from "../components/AccSingleCookieModal";
import { AccBulkCookieModal } from "../components/AccBulkCookieModal";
import { AccComboImportModal } from "../components/AccComboImportModal";
import { ComboResultsModal } from "../components/ComboResultsModal";
import { AccUtilitiesModal } from "../components/AccUtilitiesModal";
import { ExportAccountsModal } from "../components/ExportAccountsModal";
import { ImportAccountsModal } from "../components/ImportAccountsModal";
import { MoveToGroupModal } from "../components/MoveToGroupModal";
import { AccountsHeaderBar } from "../components/AccountsHeaderBar";
import { AccountsToolbar } from "../components/AccountsToolbar";
import { BulkActionBar } from "../components/BulkActionBar";

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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function Accounts() {
  const { t } = useLanguage();
  const toast = useToast();
  const [accounts,    setAccounts]    = useState<Account[]>([]);
  const [filter,      setFilter]      = useState<FilterTab>("all");
  const [search,      setSearch]      = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [launching,   setLaunching]   = useState<number | null>(null);
  const [sortBy,      setSortBy]      = useState<SortBy>("last_launched");
  const [copiedId,    setCopiedId]    = useState<number | null>(null);
  const [copiedUid,   setCopiedUid]   = useState<number | null>(null);
  const [sessions,    setSessions]    = useState<Session[]>([]);

  // Quick place ID launch
  const [quickLaunchAccount, setQuickLaunchAccount] = useState<Account | null>(null);
  const [quickPlaceId,       setQuickPlaceId]       = useState("");

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
  const [utilNewDisplayName, setUtilNewDisplayName] = useState("");
  const [utilCurrentPassword, setUtilCurrentPassword] = useState("");
  const [utilNewPassword, setUtilNewPassword] = useState("");
  const [utilTargetUser, setUtilTargetUser] = useState("");
  const [utilStatus, setUtilStatus] = useState("");
  const [utilIsError, setUtilIsError] = useState(false);
  const [utilLoading, setUtilLoading] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await invoke<Account[]>("get_accounts");
      setAccounts(data);
      // Auto re-validate Unknown cookies silently on startup
      const unknowns = data.filter(a => a.cookie_status === "Unknown" || !a.cookie_status);
      if (unknowns.length > 0) {
        unknowns.forEach(async (acc) => {
          try {
            const updated = await invoke<Account>("validate_cookie", { userId: acc.user_id });
            setAccounts(prev => prev.map(a => a.user_id === acc.user_id ? updated : a));
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

  const handleSetDisplayName = async () => {
    if (!selectedUtilAccount || !utilNewDisplayName.trim()) return;
    setUtilLoading(true); setUtilStatus("Updating display name..."); setUtilIsError(false);
    try {
      const msg = await invoke<string>("set_display_name", { userId: selectedUtilAccount.user_id, newName: utilNewDisplayName.trim() });
      setUtilStatus(msg);
      setAccounts(prev => prev.map(a => a.user_id === selectedUtilAccount.user_id ? { ...a, display_name: utilNewDisplayName.trim() } : a));
    } catch (e) { setUtilIsError(true); setUtilStatus(String(e)); }
    finally { setUtilLoading(false); }
  };

  const handleChangePassword = async () => {
    if (!selectedUtilAccount || !utilCurrentPassword || !utilNewPassword) return;
    setUtilLoading(true); setUtilStatus("Changing password..."); setUtilIsError(false);
    try {
      const msg = await invoke<string>("change_password", { userId: selectedUtilAccount.user_id, currentPw: utilCurrentPassword, newPw: utilNewPassword });
      setUtilStatus(msg); setUtilCurrentPassword(""); setUtilNewPassword("");
    } catch (e) { setUtilIsError(true); setUtilStatus(String(e)); }
    finally { setUtilLoading(false); }
  };

  const handleSignOutAll = async () => {
    if (!selectedUtilAccount) return;
    if (!confirm("This will sign out all other sessions for this account. Continue?")) return;
    setUtilLoading(true); setUtilStatus("Signing out all sessions..."); setUtilIsError(false);
    try {
      const msg = await invoke<string>("sign_out_all_sessions", { userId: selectedUtilAccount.user_id });
      setUtilStatus(msg);
    } catch (e) { setUtilIsError(true); setUtilStatus(String(e)); }
    finally { setUtilLoading(false); }
  };

  const handleSendFriendRequest = async () => {
    if (!selectedUtilAccount || !utilTargetUser.trim()) return;
    setUtilLoading(true); setUtilStatus(`Sending friend request to @${utilTargetUser}...`); setUtilIsError(false);
    try {
      const msg = await invoke<string>("send_friend_request", { userId: selectedUtilAccount.user_id, targetUsername: utilTargetUser.trim() });
      setUtilStatus(msg);
    } catch (e) { setUtilIsError(true); setUtilStatus(String(e)); }
    finally { setUtilLoading(false); }
  };

  const handleBlockUser = async () => {
    if (!selectedUtilAccount || !utilTargetUser.trim()) return;
    setUtilLoading(true); setUtilStatus(`Blocking @${utilTargetUser}...`); setUtilIsError(false);
    try {
      const msg = await invoke<string>("block_user", { userId: selectedUtilAccount.user_id, targetUsername: utilTargetUser.trim() });
      setUtilStatus(msg);
    } catch (e) { setUtilIsError(true); setUtilStatus(String(e)); }
    finally { setUtilLoading(false); }
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
        padding: "16px 24px",
        borderBottom: "1px solid var(--g04)",
        background: "var(--g01)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
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

      {/* ── ACCOUNT LIST ── */}
      <div
        className="scroll"
        style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "grid", gridTemplateColumns: "1fr",
          gap: 10, alignContent: "start",
          background: "radial-gradient(circle at top right, var(--g02) 0%, transparent 60%)",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--t3)", fontSize: 12 }}>
            {t("loading_accounts")}
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            color: "var(--t3)", fontSize: 12.5,
            border: "1px dashed var(--g06)", borderRadius: 16,
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
              onOpenUtilities={() => {
                setSelectedUtilAccount(account);
                setUtilNewDisplayName(account.display_name || "");
                setUtilCurrentPassword(""); setUtilNewPassword("");
                setUtilTargetUser(""); setUtilStatus(""); setUtilIsError(false);
              }}
            />
          ))
        )}
      </div>

      {/* â"€â"€ MODALS â"€â"€ */}

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

      <AccUtilitiesModal
        account={selectedUtilAccount}
        utilNewDisplayName={utilNewDisplayName}
        setUtilNewDisplayName={setUtilNewDisplayName}
        utilCurrentPassword={utilCurrentPassword}
        setUtilCurrentPassword={setUtilCurrentPassword}
        utilNewPassword={utilNewPassword}
        setUtilNewPassword={setUtilNewPassword}
        utilTargetUser={utilTargetUser}
        setUtilTargetUser={setUtilTargetUser}
        utilStatus={utilStatus}
        utilIsError={utilIsError}
        utilLoading={utilLoading}
        onClose={() => { if (!utilLoading) { setSelectedUtilAccount(null); setUtilStatus(""); } }}
        onSetDisplayName={handleSetDisplayName}
        onChangePassword={handleChangePassword}
        onSendFriendRequest={handleSendFriendRequest}
        onBlockUser={handleBlockUser}
        onSignOutAll={handleSignOutAll}
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

/* ── Account Card ── */
function AccountCard({
  account, isLaunching, isSelected, isCopied, isCopiedUid,
  isEditingNotes, editingNotesText, isDraggable,
  onToggleSelect, onToggleFav, onRemove, onLaunch, onValidate, onRelogin, onOpenUtilities,
  onCopyUsername, onCopyUserId, onReplayGame, onQuickLaunch, onTagClick,
  onStartEditNotes, onNotesChange, onSaveNotes, onCancelEditNotes,
  onDragStart, onDragOver, onDrop,
}: {
  account: Account; isLaunching: boolean; isSelected: boolean;
  isCopied: boolean; isCopiedUid: boolean;
  isEditingNotes: boolean; editingNotesText: string; isDraggable: boolean;
  onToggleSelect: () => void;
  onToggleFav: () => void; onRemove: () => void;
  onLaunch: () => void; onValidate: () => void; onRelogin: () => void; onOpenUtilities: () => void;
  onCopyUsername: () => void; onCopyUserId: () => void;
  onReplayGame?: () => void; onQuickLaunch: () => void;
  onTagClick: (tag: string) => void;
  onStartEditNotes: () => void; onNotesChange: (t: string) => void;
  onSaveNotes: () => void; onCancelEditNotes: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const isValid = account.cookie_status === "Valid";
  const isUnknown = account.cookie_status === "Unknown";
  const statusColor = isValid ? "var(--green)" : isUnknown ? "var(--amber)" : "var(--red)";
  const statusLabel = isValid ? "Valid" : isUnknown ? "Unknown" : "Expired";

  const lastLaunchedDisplay = account.last_launched_at
    ? new Date(account.last_launched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : t("never");

  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 18px",
        background: isSelected ? "rgba(167,139,250,0.06)" : "var(--g01)",
        border: `1px solid ${isSelected ? "rgba(167,139,250,0.25)" : hovered ? "var(--g07)" : "var(--g04)"}`,
        borderRadius: 16, transition: "all .15s", cursor: isDraggable ? "grab" : "default",
      }}
    >
      {/* Drag handle hint */}
      {isDraggable && (
        <div style={{ color: "var(--t3)", fontSize: 14, lineHeight: 1, flexShrink: 0, opacity: hovered ? 0.7 : 0.2, transition: "opacity .12s", userSelect: "none" }}>⠿</div>
      )}
      {/* Checkbox */}
      <div
        onClick={onToggleSelect}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          border: `2px solid ${isSelected ? "#A78BFA" : "var(--g12)"}`,
          background: isSelected ? "#A78BFA" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all .12s",
          opacity: hovered || isSelected ? 1 : 0.5,
        }}
      >
        {isSelected && <CheckIcon size={11} color="#fff" />}
      </div>

      {/* Avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <LazyAvatar name={account.username} avatarUrl={account.avatar_url} size={48} />
        <span
          title={`Cookie: ${statusLabel}`}
          style={{
            position: "absolute", bottom: 1, right: 1,
            width: 10, height: 10, borderRadius: "50%",
            background: statusColor,
            border: "2px solid #07080a",
            boxShadow: isValid ? "0 0 5px var(--green)" : "none",
            cursor: "default",
          }}
        />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{account.display_name}</span>
          {account.is_favorite && <StarIcon size={11} fill="var(--amber)" color="var(--amber)" />}
        </div>
        {/* Username + User ID row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: account.tags?.length || account.notes ? 4 : 3 }}>
          <span
            onClick={onCopyUsername}
            title={isCopied ? "Copied!" : "Click to copy @username"}
            style={{
              fontSize: 11, color: isCopied ? "var(--green)" : "var(--t2)",
              cursor: "pointer", transition: "color .15s", userSelect: "none",
            }}
          >
            {isCopied ? "✓ Copied!" : `@${account.username}`}
          </span>
          <span style={{ color: "var(--t3)", fontSize: 11 }}>·</span>
          <span
            onClick={onCopyUserId}
            title={isCopiedUid ? "Copied!" : "Click to copy User ID"}
            style={{
              fontSize: 11, color: isCopiedUid ? "var(--green)" : "var(--t3)",
              cursor: "pointer", transition: "color .15s", userSelect: "none",
            }}
          >
            {isCopiedUid ? "✓ ID Copied!" : `ID: ${account.user_id}`}
          </span>
        </div>
        {/* Tags — clickable to filter */}
        {account.tags && account.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
            {account.tags.map(tag => (
              <span
                key={tag}
                onClick={() => onTagClick(tag)}
                title={`Filter by tag: ${tag}`}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                  background: "rgba(96,165,250,0.1)", color: "#60A5FA",
                  border: "1px solid rgba(96,165,250,0.2)",
                  cursor: "pointer", transition: "background .12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.22)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(96,165,250,0.1)"; }}
              >{tag}</span>
            ))}
          </div>
        )}
        {/* Notes — inline editable on double-click */}
        {isEditingNotes ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <input
              autoFocus
              value={editingNotesText}
              onChange={e => onNotesChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSaveNotes(); if (e.key === "Escape") onCancelEditNotes(); }}
              placeholder="Add a note..."
              style={{
                flex: 1, fontSize: 10, padding: "2px 7px", borderRadius: 5,
                background: "var(--g03)", border: "1px solid var(--g10)",
                color: "var(--t1)", outline: "none", minWidth: 0,
              }}
            />
            <span onClick={onSaveNotes} style={{ fontSize: 9, color: "var(--green)", cursor: "pointer", fontWeight: 700 }}>✓</span>
            <span onClick={onCancelEditNotes} style={{ fontSize: 9, color: "var(--t3)", cursor: "pointer" }}>✕</span>
          </div>
        ) : (
          <div
            onDoubleClick={onStartEditNotes}
            title="Double-click to edit notes"
            style={{ fontSize: 10, color: "var(--t3)", fontStyle: "italic", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text", minHeight: 14 }}
          >
            {account.notes || (account.last_played_game ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontStyle: "normal" }}>
                <GamepadIcon size={10} color="var(--t3)" />{account.last_played_game}
              </span>
            ) : <span style={{ opacity: 0.4 }}>Double-click to add notes…</span>)}
          </div>
        )}
      </div>

      {/* Cookie status */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 110 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 5,
            background: statusColor + "14",
            color: statusColor,
            border: `1px solid ${statusColor}30`,
            letterSpacing: "0.05em",
          }}>
            {statusLabel.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--t3)" }}>{t("last_launched")}: {lastLaunchedDisplay}</div>
        {account.cookie_updated_at && (
          <div style={{ fontSize: 9.5, color: "var(--t3)" }}>
            Cookie updated: {new Date(account.cookie_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <div style={{ fontSize: 9.5, color: "var(--t3)" }}>
          Added: {new Date(account.added_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
          {!isValid && (
            <button
              onClick={onRelogin}
              style={{
                marginTop: 5, fontSize: 9, padding: "2px 9px", borderRadius: 5,
                border: "1px solid var(--red)", background: "transparent",
                color: "var(--red)", cursor: "pointer", fontWeight: 600,
                opacity: hovered ? 1 : 0.5, transition: "opacity .12s",
              }}
              onFocus={() => setHovered(true)}
              onBlur={() => setHovered(false)}
            >
              {t("relogin_btn")}
            </button>
          )}
          <button
            onClick={onValidate}
            style={{
              marginTop: 5, fontSize: 9, padding: "2px 9px", borderRadius: 5,
              border: "1px solid var(--g06)", background: "transparent",
              color: "var(--t3)", cursor: "pointer", fontWeight: 600,
              opacity: hovered ? 1 : 0.5, transition: "opacity .12s",
            }}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
          >
            {t("re_validate_btn")}
          </button>
        </div>
      </div>

      {/* Icon actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
        <button
          onClick={onQuickLaunch}
          title="Quick Launch (custom Place ID)"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--t3)", padding: 5, borderRadius: 7,
            opacity: hovered ? 1 : 0.5, transition: "all .12s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#60A5FA"; e.currentTarget.style.background = "var(--g08)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.background = "none"; }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/>
          </svg>
        </button>
        <button
          onClick={onOpenUtilities}
          title="Account Utilities"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--t3)", padding: 5, borderRadius: 7,
            opacity: hovered ? 1 : 0.5, transition: "all .12s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--amber)"; e.currentTarget.style.background = "var(--g08)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; e.currentTarget.style.background = "none"; }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <SettingsIcon size={14} />
        </button>
        <button
          onClick={onToggleFav}
          title="Toggle favorite"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: account.is_favorite ? "var(--amber)" : "var(--t3)",
            transition: "all .12s", padding: 5, borderRadius: 7,
            opacity: hovered || account.is_favorite ? 1 : 0.5,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--g08)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <StarIcon size={13} fill={account.is_favorite ? "var(--amber)" : "none"} color={account.is_favorite ? "var(--amber)" : "var(--t3)"} />
        </button>
        <button
          onClick={onRemove}
          title="Remove account"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--red)", padding: 5, borderRadius: 7,
            opacity: hovered ? 0.7 : 0.5, transition: "all .12s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(248,113,113,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = hovered ? "0.7" : "0.5"; e.currentTarget.style.background = "none"; }}
          onFocus={e => { setHovered(true); e.currentTarget.style.opacity = "1"; }}
          onBlur={e => { setHovered(false); e.currentTarget.style.opacity = "0.5"; }}
        >
          <TrashIcon size={13} color="var(--red)" />
        </button>
      </div>

      {/* Launch buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
        <button
          onClick={onLaunch}
          disabled={isLaunching || !isValid}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 18px", borderRadius: 10, border: "none",
            background: isLaunching
              ? "var(--g04)"
              : isValid
                ? "var(--accent)"
                : "var(--g04)",
            color: isLaunching ? "var(--t3)" : isValid ? "var(--accent-text)" : "var(--t3)",
            fontSize: 12, fontWeight: 800,
            cursor: isLaunching || !isValid ? "not-allowed" : "pointer",
            boxShadow: isValid && !isLaunching ? "0 4px 14px var(--g20)" : "none",
            transition: "all .12s",
            filter: hovered && isValid && !isLaunching ? "brightness(1.08)" : "none",
          }}
        >
          <ZapIcon size={12} color={isValid && !isLaunching ? "var(--accent-text)" : "var(--t3)"} />
          {isLaunching ? t("launching_suffix") : t("quick_launch_btn")}
        </button>
        {onReplayGame && account.default_place_id && (
          <button
            onClick={onReplayGame}
            disabled={isLaunching || !isValid}
            title="Replay last game"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, border: "1px solid var(--g06)",
              background: "transparent",
              color: isValid ? "var(--t2)" : "var(--t3)",
              fontSize: 10, fontWeight: 700,
              cursor: isLaunching || !isValid ? "not-allowed" : "pointer",
              transition: "all .12s",
            }}
            onMouseEnter={e => { if (isValid && !isLaunching) { e.currentTarget.style.background = "var(--g04)"; e.currentTarget.style.borderColor = "var(--g10)"; }}}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--g06)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Replay
          </button>
        )}
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

