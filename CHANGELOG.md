# Changelog

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
