# Changelog

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
