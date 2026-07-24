export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangeEntry {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogRelease {
  version: string;       // e.g. "1.0.20", or "Unreleased"
  date: string | null;   // ISO date, or null for unreleased
  title: string;
  changes: ChangeEntry[];
}

function parseVersion(v: string): number[] | null {
  if (!/^\d+(\.\d+)*$/.test(v)) return null;
  return v.split(".").map(Number);
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Releases strictly newer than `fromVersion` and up to (inclusive of) `toVersion`, newest first. */
export function getChangesSince(fromVersion: string, toVersion: string): ChangelogRelease[] {
  const from = parseVersion(fromVersion);
  const to = parseVersion(toVersion);
  if (!from || !to) return [];
  return CHANGELOG.filter(r => {
    const rv = parseVersion(r.version);
    if (!rv) return false;
    return compareVersions(rv, from) > 0 && compareVersions(rv, to) <= 0;
  });
}

// Newest first. Dates reflect when each version actually shipped.
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.1.4",
    date: "2026-07-24",
    title: "Major CPU & Memory Performance Optimizations",
    changes: [
      { kind: "improved", text: "GPU Compositing: Replaced CPU box-shadow repaints with hardware-accelerated composite keyframe animations in WebView2." },
      { kind: "improved", text: "Idle Process Monitoring: Rust session tracker dynamically reduces scan frequency when no active games are running, cutting CPU usage by over 60%." },
      { kind: "improved", text: "Background Visibility: Background polling and re-renders automatically pause when the manager is minimized or hidden in tray." },
      { kind: "fixed", text: "Eliminated unnecessary root component re-render loops and unmemoized effect calculations." },
      { kind: "improved", text: "Asynchronous Image Decoding: Added off-thread decoding and lazy loading for account avatar thumbnails." },
    ],
  },
  {
    version: "1.1.3",
    date: "2026-07-23",
    title: "Roblox Multi-Instance persistent handles & launch fixes",
    changes: [
      { kind: "fixed", text: "Multi-Instance Roblox: singleton mutex and event handles remain active continuously so opening another game no longer closes active Roblox windows." },
      { kind: "fixed", text: "Direct launching: Roblox launches execute RobloxPlayerBeta.exe directly, preventing the launcher from terminating active Roblox instances." },
      { kind: "improved", text: "Session monitor: Removed automatic process termination during loading screens and place teleports." },
      { kind: "improved", text: "Removed unnecessary multi-instance conflict warning dialog." },
    ],
  },
  {
    version: "1.1.2",
    date: "2026-07-15",
    title: "MultiRoblox conflict warning, crash logging",
    changes: [
      { kind: "new", text: "If MultiRoblox can't activate because a Roblox window was already open before Reiya launched, you'll now get a clear warning with a one-click \"Close All Roblox Windows\" button instead of it silently only running one account." },
      { kind: "improved", text: "Crashes now get logged with a full error message and stack trace instead of vanishing silently." },
      { kind: "fixed", text: "Fixed the \"Get a Free Key\" link and website button pointing at an old domain." },
    ],
  },
  {
    version: "1.1.1",
    date: "2026-07-14",
    title: "Password-locked encryption, multi-launch, MultiRoblox fix",
    changes: [
      { kind: "new", text: "Added an optional password-locked encryption mode — set a password and Reiya will ask for it every launch before decrypting your accounts. Available on first run or later from Settings." },
      { kind: "new", text: "You can now select multiple accounts in the Home list and launch them all into the same game at once." },
      { kind: "improved", text: "Backup export/import no longer requires a password — leave it blank to skip, or set one for extra protection. Old password-only backups still restore normally." },
      { kind: "fixed", text: "MultiRoblox could silently stop working after the first launch — the shared multi-instance handles were being released as soon as any single launch finished, even while other accounts were still starting up. Handles are now only released once every in-flight launch is done." },
      { kind: "improved", text: "MultiRoblox is now enabled by default." },
      { kind: "fixed", text: "The tray icon's left-click opened the right-click menu instead of showing/hiding the window. Left-click now toggles the window; right-click shows the menu." },
      { kind: "improved", text: "Launching an account or game no longer minimizes the main window." },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-06",
    title: "Changelog tab, backup fixes",
    changes: [
      { kind: "new", text: "Added a Changelog tab so you can see what's new, improved, or fixed in every update." },
      { kind: "fixed", text: "Restoring a backup could say \"Wrong password or corrupt file\" even with the correct password, if a stray space had snuck into the password field. The password is now cleaned up automatically before it's used." },
      { kind: "fixed", text: "Restoring a backup could report \"0 accounts imported\" even when the accounts weren't already saved. New accounts from a backup are now correctly recognized and added." },
    ],
  },
  {
    version: "1.0.20",
    date: "2026-07-06",
    title: "Rscripts tab, global rating & live user count, sidebar redesign",
    changes: [
      { kind: "new", text: "Added a Rscripts tab for browsing, sorting, and copying scripts." },
      { kind: "new", text: "Added a global app rating so you can see (and leave) a rating for Reiya." },
      { kind: "new", text: "Added a live count of how many people are using Reiya right now." },
      { kind: "improved", text: "Redesigned the sidebar for a cleaner layout." },
    ],
  },
  {
    version: "1.0.19",
    date: "2026-07-04",
    title: "Per-account relogin, password encryption",
    changes: [
      { kind: "new", text: "You can now relog a single account without touching any of your other accounts." },
      { kind: "improved", text: "Saved account passwords are now encrypted at rest instead of stored as plain text." },
    ],
  },
  {
    version: "1.0.18",
    date: "2026-06-25",
    title: "Toast notifications, MultiRoblox fix, launch error state",
    changes: [
      { kind: "new", text: "Added toast pop-up notifications for quick feedback on actions across the app." },
      { kind: "fixed", text: "MultiRoblox (running more than one Roblox window at once) not working correctly." },
      { kind: "fixed", text: "The launch progress screen now properly shows an error state when a launch fails, instead of hanging silently." },
    ],
  },
  {
    version: "1.0.17",
    date: "2026-06-24",
    title: "Version reporting for update enforcement",
    changes: [
      { kind: "improved", text: "The app now tells the server which version you're running, so it can prompt out-of-date installs to update." },
    ],
  },
  {
    version: "1.0.16",
    date: "2026-06-24",
    title: "Backend migration, mandatory updates, tampered key detection",
    changes: [
      { kind: "improved", text: "Migrated to new backend infrastructure for better reliability and uptime." },
      { kind: "new", text: "Added a mandatory update prompt so everyone stays on a current, secure version." },
      { kind: "new", text: "Added detection for tampered or modified license keys." },
    ],
  },
  {
    version: "1.0.15",
    date: "2026-06-23",
    title: "Cookie timestamps, HWID reset, security hardening",
    changes: [
      { kind: "new", text: "Accounts now show when their login cookie was last refreshed." },
      { kind: "new", text: "Added a way to reset your hardware ID lock if you switch devices." },
      { kind: "improved", text: "General security hardening across account storage and login handling." },
    ],
  },
  {
    version: "1.0.14",
    date: "2026-06-22",
    title: "Discord Rich Presence",
    changes: [
      { kind: "new", text: "Reiya can now show what you're doing in your Discord status." },
    ],
  },
  {
    version: "1.0.13",
    date: "2026-06-21",
    title: "Persistent sessions, login warnings",
    changes: [
      { kind: "improved", text: "Login sessions now persist between app restarts, so you're logged in less often." },
      { kind: "new", text: "Added warnings to help you avoid risky login mistakes." },
    ],
  },
  {
    version: "1.0.12",
    date: "2026-06-21",
    title: "Full light mode, 32 themes, Theme page overhaul",
    changes: [
      { kind: "new", text: "Added full light mode support." },
      { kind: "new", text: "Added 32 selectable color themes." },
      { kind: "improved", text: "Reworked the Theme page for easier browsing and switching." },
    ],
  },
  {
    version: "1.0.11",
    date: "2026-06-20",
    title: "Themes, backup import/export, tray notifications",
    changes: [
      { kind: "new", text: "Added the first theming system." },
      { kind: "new", text: "Added encrypted backup export/import for your accounts." },
      { kind: "new", text: "Added system tray notifications." },
    ],
  },
  {
    version: "1.0.10",
    date: "2026-06-20",
    title: "More FastFlag presets",
    changes: [
      { kind: "new", text: "Expanded the FastFlag preset library from 27 to 45 options." },
    ],
  },
  {
    version: "1.0.9",
    date: "2026-06-20",
    title: "Recent games, thumbnails, login, update fixes",
    changes: [
      { kind: "fixed", text: "Recent games list not restoring correctly after restarting the app." },
      { kind: "improved", text: "Game thumbnails now load more reliably." },
      { kind: "improved", text: "Cleaned up the login pop-up and the update experience." },
    ],
  },
  {
    version: "1.0.8",
    date: "2026-06-20",
    title: "UX, reliability & security overhaul",
    changes: [
      { kind: "improved", text: "Broad round of usability, reliability, and security improvements across the app." },
    ],
  },
  {
    version: "1.0.0 – 1.0.7",
    date: "2026-06-19",
    title: "Initial release and early foundation",
    changes: [
      { kind: "new", text: "First public release of Reiya Account Manager." },
      { kind: "new", text: "Added language support, system tray controls, the bootstrapper, and multi-instance launching." },
      { kind: "improved", text: "Early rounds of update and installer reliability fixes." },
    ],
  },
];
