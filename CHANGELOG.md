# Changelog

## v1.2.2 - 2026-11-26

### Added
- Redesigned Home page: pick an account on the left, a game in the middle, and press Launch in the bar at the bottom. Advanced options (Job ID, private server code) live under Options.
- Search for any Roblox game by name from the Home page, or paste a Place ID or game link into the same box.
- Drag and drop your pinned games on Home to put them in your own order.
- "Launch again" cards on Home relaunch your last few account and game combinations in one click.
- A quick tips card and a welcome screen help new users get started.
- You can now support Reiya on Ko-fi from the sidebar or the Changelog page. Thank you!
- Hub: added Anime Astral Simulator, Anime Dice, Blox Fruits, Murder Mystery 2, Pet Simulator 99, Project Slayers 2, Tap Simulator Reborn and Throw Food For Animals. Fish It is supported again (16 supported games).

### Improved
- Accounts show their status in plain words, like "Ready · played 2h ago", "Playing" or "Login expired".
- Expired accounts now show a "Log in again" button right on the card, and a "Needs login" filter shows them all at once.
- Clearer multi-select on the Accounts page: a visible checkbox on each card, plus Select all and Clear.
- Pinned is now called Pinned everywhere (it was Favorites on some pages), and the Hub pin adds games to your Home page.
- Hub: one-click Play on Home, pinned games are saved, and each game shows whether it's supported, not listed or discontinued.
- Redesigned Bootstrapper with clear sections, a plain-language status, and a FastFlags tab that warns you before losing unsaved changes.
- Confirmation dialogs now match the app's style and explain what will happen.
- The header shows your login health at a glance. Click it to re-check every account.
- New text is translated into all supported languages.

### Fixed
- Hub: choosing or pinning a game now uses its correct Roblox place, so Play on Home opens the right game. Games pinned with the old wrong ID are fixed automatically.
- Game icons that stopped loading are fetched again automatically, and accounts show the icon of the game they last played.
- The System Status card shows real information instead of always saying everything is fine.
- You can no longer select a launcher that isn't installed.
- Saving a password with the Enter key now works the same as clicking Save, and failures are reported.
- Drag and drop works inside the app on Windows, including custom account order.
- Login checks at startup run a few at a time, so large account lists are less likely to be rate-limited by Roblox.

## v1.2.0 - 2026-10-31

### Added
- Favorite-games filter: pick a game icon above the accounts to show only the accounts that have it as a favorite.
- Bulk edit: select several accounts and set their game, launcher, startup delay, favorite games, notes and tags in one step. Blank fields stay unchanged.

### Improved
- Safer updates: Reiya now only installs updates published by the official release channel and checks each installer's digital signature before running it.
- Stronger account protection: cookies are encrypted with a key that is protected by your Windows login instead of one derived from the computer name. Existing accounts are upgraded automatically.
- Saved passwords never leave the app's secure side. Copy password now places it on the clipboard and clears it after 30 seconds.
- Backups use a password you choose (at least 8 characters) with a much stronger key derivation, and they restore on a fresh Windows install. Older backups still import.
- Vault password lock now requires 8 or more characters, slows down repeated wrong attempts, and can only be reset from the lock screen. Switching lock modes can no longer leave accounts half-converted.
- Cleaner Accounts tab: compact account cards and list rows, one-line header stats, and a Launch button that no longer dominates the screen.
- Easier to read and use: brighter secondary text, visible keyboard focus everywhere, labelled window buttons, and a tidier sidebar.

### Fixed
- A damaged accounts file is now set aside instead of being treated as empty and overwritten, and a rolling backup of the last good file is kept.
- The sidebar's online count now shows only the real number of users, and the two social icons that linked to generic home pages were removed.
- Favorite-game icons now show on accounts with expired cookies too.

## v1.1.19 - 2026-10-10

### Improved
- Refined all eight seasonal palettes with readable text, coordinated controls and distinct holiday accents. Halloween now uses warm charcoal instead of purple.

### Added
- St. Patrick's Day seasonal theme: March 17 every year, emerald-and-gold cartoon shamrocks, and manual selection.

## v1.1.18 - 2026-10-10

### Added
- My Premium account portal with email-code login, saved keys, downloads and refund requests.
- Purchase key save/copy dialog and email key backup.

### Improved
- Expired subscriptions keep all local Free-mode data; cloud features pause until renewal.
- Authenticated account metadata sync with verified ownership; plaintext cloud credentials removed.
- Premium status uses database time and clear active, expired, disabled and refunded states.

### Fixed
- Completed refunds revoke keys, stop renewal, and purge cloud backups and owned metadata.
- Local erasure occurs only after a completed refund with explicit customer consent, when the updated app reconnects.
- Refund requests and pending refunds do not erase data; ordinary expiration never triggers refund erasure.

## v1.1.17 - 2026-10-10

### Added
- Premium cloud backup and restore in the same app, activated with a Premium key.
- Optional automatic cloud backups and support for up to three activated computers.
- Seven recurring seasonal themes with matching cartoon artwork and manual overrides.

### Improved
- Cloud backups retain up to five snapshots, each for 15 days after upload.
- Expired cloud snapshots are automatically deleted and excluded from restore.
- The website now includes a redesigned homepage, actual-app browser demo, Premium plans, and policy pages.
- Website admin sections use separate tabs, sortable metadata, ten-row pagination, and audited Premium access controls.

### Fixed
- Cloud restore replaces stale managed data and applies preferences only after the file restore commits.
- Restore failures recover destination files and browser preferences.
- Premium access controls now display validation and updated expiry/status after changes.
- Local checkout stays on localhost; production uses the HTTPS website.


## v1.1.16 - 2026-10-02

### Added
- Card and list layouts for Accounts, with the selected layout remembered.
- Per-account launch presets and bulk preset assignment.
- Downloaded Roblox build management and Launch Health diagnostics.

### Improved
- One-click repair for Reiya files, FastFlags, protocol registration, and missing Roblox components.

### Fixed
- Duplicate launch-progress window errors and overlapping launch requests.
- Copy Password is available again for accounts with a stored password.

## v1.1.14 — 2026-09-03

### Changed
- Bootstrapper updates now download new Roblox builds locally without replacing the current build. Select a downloaded build from **Installed Locally** when you want to switch.


## v1.1.8 — 2026-08-19

### Added
- **Roblox version control** on the Bootstrapper page: pick a specific build to install instead of always using the newest one, an "Auto-update" toggle to stop Reiya from checking/installing Roblox updates automatically, and an "Installed Locally" list to switch instantly between builds you've already downloaded — no re-download needed
- Pinned accounts now show as a shufflable "hero" card above the account list, replacing the old star/favorite toggle
- Cookie-check button now shows live progress and an inline retry with an error count when checks fail
- Update-download progress screen now shows an animated status label and progress bar

### Changed
- Redesigned and componentized the Home and Accounts pages — both were single ~3000+ line files with no shared structure; broken into 37 focused components (modals, header bars, sidebars, sections) with no behavior changes, plus tightened spacing and clearer section separation throughout
- Account rows now keep their action buttons (favorite/pin, remove, re-validate, quick-launch) visibly dimmed at rest instead of fully hidden until hover, and they're keyboard-focusable

### Fixed
- Accounts page: three places that rendered literal `{t("...")}` placeholder text instead of the actual translated string
- Accounts page: the "Active" account stat was hardcoded to always show 0 — now reflects real live session count
- Roblox version picker now clearly marks builds Roblox no longer publishes a hash for as "Unavailable" instead of silently failing to install

## v1.1.7 — 2026-08-15

### Fixed
- **Combo import crash**: app no longer crashes after a successful combo login when `save_account_password` is called — replaced `tokio::spawn` with `tauri::async_runtime::spawn` so the call works from any thread context
- **Combo import now fully works**: login window stays open long enough for Roblox's JavaScript to finalize the session; cookie is captured on page-load completion rather than immediately after the login API response (which returned a preliminary token that caused HTTP 401)

## v1.1.6 — 2026-08-13

### Changed
- Online count now updates at slower 1–2 minute intervals to reduce server load

## v1.1.5

### Removed
- Key system removed
### Added
- Minimize-on-launch setting

## v1.1.4

### Improved
- Major CPU and memory performance optimizations

## v1.1.3

### Fixed
- Roblox multi-instance mutex persistence
- Removed warning modal
