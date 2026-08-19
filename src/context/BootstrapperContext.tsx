import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BootstrapperStatus {
  installed_version: string | null;
  latest_version: string | null;
  install_path: string;
  needs_update: boolean;
  exe_path: string | null;
}

export interface BootstrapperProgress {
  stage: string;
  package: string;
  package_index: number;
  total_packages: number;
  percent: number;
  speed_kbps: number;
  done: boolean;
  error: string | null;
}

export interface RobloxInstall {
  name: string;
  kind: "official" | "bloxstrap" | "fishstrap" | "reiya";
  exe_path: string | null;
  version: string | null;
  install_dir: string;
  found: boolean;
  is_protocol_handler: boolean;
}

export interface DetectedInstalls {
  installs: RobloxInstall[];
  protocol_handler_path: string | null;
}

export interface RobloxDeployVersion {
  version: string;
  date: string;
}

export interface InstalledRobloxVersion {
  version: string;
  installed_at: string | null;
  is_current: boolean;
}

interface BootstrapperContextValue {
  status: BootstrapperStatus | null;
  progress: BootstrapperProgress | null;
  installing: boolean;
  checking: boolean;
  error: string;
  successMsg: string;
  detectedInstalls: DetectedInstalls | null;
  detecting: boolean;
  preferredLauncher: string;
  autoUpdate: boolean;
  deployVersions: RobloxDeployVersion[];
  loadingVersions: boolean;
  installedVersions: InstalledRobloxVersion[];
  loadingInstalledVersions: boolean;
  channel: string;
  setChannel: (ch: string) => void;
  customVersionHash: string;
  setCustomVersionHash: (hash: string) => void;
  installMode: "latest" | "custom";
  setInstallMode: (mode: "latest" | "custom") => void;
  refreshStatus: () => Promise<void>;
  checkUpdate: (customChannel?: string) => Promise<void>;
  startInstall: (versionHash?: string, customChannel?: string) => Promise<void>;
  scanInstalls: () => Promise<void>;
  updateLauncherPreference: (kind: string) => Promise<void>;
  updateAutoUpdate: (enabled: boolean) => Promise<void>;
  loadDeployVersions: () => Promise<void>;
  loadInstalledVersions: () => Promise<void>;
  useInstalledVersion: (versionHash: string) => Promise<void>;
  clearMessages: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────
const BootstrapperContext = createContext<BootstrapperContextValue | null>(null);

export function useBootstrapper() {
  const ctx = useContext(BootstrapperContext);
  if (!ctx) throw new Error("useBootstrapper must be used inside BootstrapperProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function BootstrapperProvider({ children }: { children: ReactNode }) {
  const [status, setStatus]             = useState<BootstrapperStatus | null>(null);
  const [progress, setProgress]         = useState<BootstrapperProgress | null>(null);
  const [installing, setInstalling]     = useState(false);
  const [checking, setChecking]         = useState(false);
  const [error, setError]               = useState("");
  const [successMsg, setSuccessMsg]     = useState("");
  const [detectedInstalls, setDetected] = useState<DetectedInstalls | null>(null);
  const [detecting, setDetecting]       = useState(false);
  const [preferredLauncher, setPreferredLauncher] = useState<string>("auto");
  const [autoUpdate, setAutoUpdate]     = useState<boolean>(true);
  const [deployVersions, setDeployVersions] = useState<RobloxDeployVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installedVersions, setInstalledVersions] = useState<InstalledRobloxVersion[]>([]);
  const [loadingInstalledVersions, setLoadingInstalledVersions] = useState(false);

  const [channel, setChannelState] = useState<string>(() => localStorage.getItem("reiya_bootstrapper_channel") || "LIVE");
  const [customVersionHash, setCustomVersionHashState] = useState<string>(() => localStorage.getItem("reiya_bootstrapper_version_hash") || "");
  const [installMode, setInstallModeState] = useState<"latest" | "custom">(
    () => (localStorage.getItem("reiya_bootstrapper_install_mode") as "latest" | "custom") || "latest"
  );

  const setChannel = (c: string) => {
    setChannelState(c);
    localStorage.setItem("reiya_bootstrapper_channel", c);
  };

  const setCustomVersionHash = (v: string) => {
    setCustomVersionHashState(v);
    localStorage.setItem("reiya_bootstrapper_version_hash", v);
  };

  const setInstallMode = (mode: "latest" | "custom") => {
    setInstallModeState(mode);
    localStorage.setItem("reiya_bootstrapper_install_mode", mode);
  };

  const unlistenRef                     = useRef<(() => void) | null>(null);

  // Load initial status once on mount and register the persistent event listener
  useEffect(() => {
    if ((window as any).__TAURI_INTERNALS__) {
      refreshStatus();
      scanInstalls();
      
      // Load launcher preference
      invoke<string>("get_launcher_preference")
        .then(setPreferredLauncher)
        .catch(() => {});

      // Load auto-update preference
      invoke<boolean>("get_auto_update_preference")
        .then(setAutoUpdate)
        .catch(() => {});

      // Register the event listener at app level — survives navigation
      const setupListener = async () => {
        if (unlistenRef.current) unlistenRef.current();
        unlistenRef.current = await listen<BootstrapperProgress>("bootstrapper-progress", ({ payload }) => {
          setProgress(payload);
          if (payload.done) {
            setInstalling(false);
            setSuccessMsg("Roblox installed successfully! Protocol registered.");
            refreshStatus();
            scanInstalls(); // Re-scan after install
          }
          if (payload.error) {
            setInstalling(false);
            setError(payload.error);
          }
        });
      };
      setupListener();
    } else {
      // Mock data for browser testing
      setDetected({
        installs: [
          {
            name: "Roblox (Official)",
            kind: "official",
            found: true,
            exe_path: "C:\\Users\\Mock\\AppData\\Local\\Roblox\\Versions\\version-mock1\\RobloxPlayerBeta.exe",
            version: "version-mock1",
            install_dir: "C:\\Users\\Mock\\AppData\\Local\\Roblox",
            is_protocol_handler: false,
          },
          {
            name: "Bloxstrap",
            kind: "bloxstrap",
            found: true,
            exe_path: "C:\\Users\\Mock\\AppData\\Local\\Bloxstrap\\Bloxstrap.exe",
            version: "version-mock2",
            install_dir: "C:\\Users\\Mock\\AppData\\Local\\Bloxstrap",
            is_protocol_handler: true,
          },
          {
            name: "Fishstrap",
            kind: "fishstrap",
            found: false,
            exe_path: null,
            version: null,
            install_dir: "",
            is_protocol_handler: false,
          },
          {
            name: "Reiya (Built-in)",
            kind: "reiya",
            found: true,
            exe_path: "C:\\Users\\Mock\\AppData\\Local\\Seistem\\Versions\\version-mock3\\RobloxPlayerBeta.exe",
            version: "version-mock3",
            install_dir: "C:\\Users\\Mock\\AppData\\Local\\Seistem",
            is_protocol_handler: false,
          }
        ],
        protocol_handler_path: "\"C:\\Users\\Mock\\AppData\\Local\\Bloxstrap\\Bloxstrap.exe\" \"%1\""
      });
      setStatus({
        installed_version: "version-mock3",
        latest_version: "version-mock3",
        install_path: "C:\\Users\\Mock\\AppData\\Local\\Seistem\\Versions",
        needs_update: false,
        exe_path: "C:\\Users\\Mock\\AppData\\Local\\Seistem\\Versions\\version-mock3\\RobloxPlayerBeta.exe"
      });
      setPreferredLauncher("auto");
    }

    return () => {
      if (unlistenRef.current) unlistenRef.current();
    };
  }, []);

  const refreshStatus = async () => {
    try {
      const s = await invoke<BootstrapperStatus>("bootstrapper_get_status");
      setStatus(s);
    } catch {}
  };

  const checkUpdate = async (customChannel?: string) => {
    setChecking(true);
    setError("");
    setSuccessMsg("");
    try {
      const ch = customChannel ?? channel;
      const s = await invoke<BootstrapperStatus>("bootstrapper_check_update", { channel: ch || null });
      setStatus(s);
      if (!s.needs_update) setSuccessMsg("Roblox is already up to date!");
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  };

  const startInstall = async (versionHash?: string, customChannel?: string) => {
    // Don't start if already running
    if (installing) return;
    setInstalling(true);
    setError("");
    setSuccessMsg("");
    setProgress(null);
    try {
      const ch = customChannel ?? channel;
      const v = versionHash !== undefined ? versionHash : (installMode === "custom" ? customVersionHash : undefined);
      await invoke("bootstrapper_install", { versionHash: v || null, channel: ch || null });
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  };

  const scanInstalls = async () => {
    setDetecting(true);
    try {
      const result = await invoke<DetectedInstalls>("detect_roblox_installs");
      setDetected(result);
    } catch {}
    setDetecting(false);
  };

  const updateLauncherPreference = async (kind: string) => {
    try {
      await invoke("set_launcher_preference", { kind });
      setPreferredLauncher(kind);
    } catch (e) {
      setError(`Failed to set preference: ${e}`);
    }
  };

  const updateAutoUpdate = async (enabled: boolean) => {
    try {
      await invoke("set_auto_update_preference", { enabled });
      setAutoUpdate(enabled);
    } catch (e) {
      setError(`Failed to set auto-update preference: ${e}`);
    }
  };

  const loadDeployVersions = async () => {
    setLoadingVersions(true);
    try {
      const versions = await invoke<RobloxDeployVersion[]>("get_roblox_deploy_history");
      setDeployVersions(versions);
    } catch (e) {
      setError(`Failed to load version history: ${e}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  const loadInstalledVersions = async () => {
    setLoadingInstalledVersions(true);
    try {
      const versions = await invoke<InstalledRobloxVersion[]>("list_installed_roblox_versions");
      setInstalledVersions(versions);
    } catch (e) {
      setError(`Failed to list installed versions: ${e}`);
    } finally {
      setLoadingInstalledVersions(false);
    }
  };

  const useInstalledVersion = async (versionHash: string) => {
    try {
      await invoke("use_installed_roblox_version", { versionHash });
      setSuccessMsg(`Switched to installed version ${versionHash}`);
      await refreshStatus();
      await loadInstalledVersions();
    } catch (e) {
      setError(`Failed to switch version: ${e}`);
    }
  };

  const clearMessages = () => {
    setError("");
    setSuccessMsg("");
  };

  return (
    <BootstrapperContext.Provider value={{
      status, progress, installing, checking, error, successMsg,
      detectedInstalls, detecting, preferredLauncher, autoUpdate, deployVersions, loadingVersions,
      installedVersions, loadingInstalledVersions,
      channel, setChannel, customVersionHash, setCustomVersionHash, installMode, setInstallMode,
      refreshStatus, checkUpdate, startInstall, scanInstalls, updateLauncherPreference, updateAutoUpdate,
      loadDeployVersions, loadInstalledVersions, useInstalledVersion, clearMessages,
    }}>
      {children}
    </BootstrapperContext.Provider>
  );
}
