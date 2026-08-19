# Changelog

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
