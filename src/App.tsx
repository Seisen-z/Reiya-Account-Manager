import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import TitleBar     from "./components/TitleBar";
import Sidebar      from "./components/Sidebar";
import Home         from "./pages/Home";
import Accounts     from "./pages/Accounts";
import Hub          from "./pages/Hub";
import Rscripts     from "./pages/Rscripts";
import Utilities    from "./pages/Utilities";
import Settings     from "./pages/Settings";
import Bootstrapper from "./pages/Bootstrapper";
import ThemePage    from "./pages/Theme";
import Changelog     from "./pages/Changelog";
import LaunchProgress from "./pages/LaunchProgress";
import Onboarding    from "./pages/Onboarding";
import UpdatePrompt  from "./pages/UpdatePrompt";
import AppLock       from "./pages/AppLock";
import SecuritySetup from "./pages/SecuritySetup";
import VaultUnlock   from "./pages/VaultUnlock";
import { BootstrapperProvider } from "./context/BootstrapperContext";
import { SavedGamesProvider } from "./context/SavedGamesContext";
import { UpdateProvider, useUpdate } from "./context/UpdateContext";
import { useLanguage } from "./context/LanguageContext";

const PAGE_LABELS: Record<string, string> = {
  "/":             "On Home",
  "/accounts":     "Managing Accounts",
  "/hub":          "Using Hub",
  "/rscript":      "Browsing Rscripts",
  "/utilities":    "Using Utilities",
  "/bootstrapper": "Using Bootstrapper",
  "/theme":        "Customizing Themes",
  "/settings":     "In Settings",
  "/changelog":    "Viewing Changelog",
};

function AppContent() {
  const location = useLocation();
  const isProgressWindow = location.pathname === "/launch-progress";

  useEffect(() => {
    if (isProgressWindow) return;
    if (localStorage.getItem("reiya_discord_rpc_enabled") === "false") return;
    const label = PAGE_LABELS[location.pathname] ?? "In App";
    invoke("update_discord_rpc", { page: label }).catch(() => {});
  }, [location.pathname]);

  if (isProgressWindow) {
    return (
      <Routes>
        <Route path="/launch-progress" element={<LaunchProgress />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/"             element={<Home />} />
            <Route path="/accounts"     element={<Accounts />} />
            <Route path="/hub"          element={<Hub />} />
            <Route path="/rscript"      element={<Rscripts />} />
            <Route path="/utilities"    element={<Utilities />} />
            <Route path="/bootstrapper" element={<Bootstrapper />} />
            <Route path="/theme"        element={<ThemePage />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/changelog"    element={<Changelog />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppInner() {
  const { updateInfo } = useUpdate();
  const { t, setLanguage } = useLanguage();
  const { setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem("reiya_onboarding_v1") === "done"
  );
  const [securitySetupDone, setSecuritySetupDone] = useState(
    () => localStorage.getItem("reiya_security_setup_v1") === "done" || localStorage.getItem("reiya_onboarding_v1") === "done"
  );
  const [securityMode, setSecurityMode]   = useState<"default" | "password" | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [locked, setLocked]               = useState(false);
  const [lockOnMinimize, setLockOnMinimize] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<any>("get_settings").catch(() => ({})),
      invoke<string>("get_security_mode").catch(() => "default"),
    ]).then(([settings, secMode]) => {
      setReady(true);
      setSecurityMode(secMode === "password" ? "password" : "default");
      if (secMode !== "password") setVaultUnlocked(true);
      if (settings?.Language) setLanguage(settings.Language);
      if (settings?.ThemeName) {
        const saved = THEMES.find(t => t.id === settings.ThemeName);
        if (saved) setTheme(saved);
        else applyTheme(THEMES[0]);
      }
      if (settings?.AppLockEnabled) setLocked(true);
      if (settings?.AppLockOnMinimize) setLockOnMinimize(true);
      localStorage.setItem("reiya_use_bootstrapper", settings?.UseBootstrapperLaunch !== false ? "true" : "false");
      const rpcEnabled = settings?.DiscordRpcEnabled !== false;
      localStorage.setItem("reiya_discord_rpc_enabled", rpcEnabled ? "true" : "false");
      if (rpcEnabled) invoke("start_discord_rpc").catch(() => {});
    });
  }, []);

  // Presence heartbeat — powers the "online now" count shown in the sidebar
  useEffect(() => {
    invoke("send_heartbeat").catch(() => {});
    const id = setInterval(() => invoke("send_heartbeat").catch(() => {}), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!lockOnMinimize) return;
    let unlisten: (() => void) | null = null;
    listen("window-restored-from-tray", () => setLocked(true)).then(u => { unlisten = u; });
    return () => { if (unlisten) unlisten(); };
  }, [lockOnMinimize]);

  if (!ready) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "#07080a",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>{t("loading_config")}</span>
        </div>
      </div>
    );
  }

  const needsVaultUnlock = securityMode === "password" && !vaultUnlocked;

  return (
    <BrowserRouter>
      <BootstrapperProvider>
        <SavedGamesProvider>
          {needsVaultUnlock && <VaultUnlock onUnlocked={() => setVaultUnlocked(true)} />}
          {!needsVaultUnlock && locked && <AppLock onUnlocked={() => setLocked(false)} />}
          {!needsVaultUnlock && updateInfo && <UpdatePrompt info={updateInfo} />}
          {!needsVaultUnlock && !updateInfo && !securitySetupDone && (
            <SecuritySetup onDone={(mode) => {
              setSecurityMode(mode);
              setVaultUnlocked(true);
              setSecuritySetupDone(true);
              localStorage.setItem("reiya_security_setup_v1", "done");
            }} />
          )}
          {!needsVaultUnlock && !updateInfo && securitySetupDone && !onboardingDone && (
            <Onboarding onDone={() => setOnboardingDone(true)} />
          )}
          {!needsVaultUnlock && <AppContent />}
        </SavedGamesProvider>
      </BootstrapperProvider>
    </BrowserRouter>
  );
}

import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider, useTheme, THEMES, applyTheme } from "./context/ThemeContext";
import { ToastProvider } from "./components/Toast";

export default function App() {
  if (window.location.pathname === "/launch-progress") {
    return (
      <LanguageProvider>
        <ThemeProvider>
          <LaunchProgress />
        </ThemeProvider>
      </LanguageProvider>
    );
  }

  return (
    <UpdateProvider>
      <LanguageProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppInner />
          </ToastProvider>
        </ThemeProvider>
      </LanguageProvider>
    </UpdateProvider>
  );
}
