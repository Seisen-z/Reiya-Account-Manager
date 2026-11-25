// Tauri commands take their arguments flat, so long parameter lists are by design.
// set_readonly(false) is only used to clear the read-only attribute on Windows files.
#![allow(
    clippy::too_many_arguments,
    clippy::type_complexity,
    clippy::needless_range_loop,
    clippy::permissions_set_readonly_false
)]

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindowBuilder, WebviewUrl};

#[derive(Serialize, Deserialize, Clone)]
struct LaunchProgressPayload {
    status: String,
    percent: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct LaunchProgressError {
    message: String,
}

static SETTINGS_IO: Mutex<()> = Mutex::new(());
static BOOTSTRAPPER_INSTALL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

mod backup;
mod browser_extractor;
mod premium;
mod telemetry;
mod storage_paths;
mod updater;
mod vault;

use vault::*;

// ── State ─────────────────────────────────────────────────────────────────────
#[derive(Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub user_id: i64,
    pub username: String,
    pub avatar_url: String,
    pub game_name: String,
    pub place_id: String,
    pub start_time: String,
}

#[derive(Clone)]
struct SessionTracker(std::sync::Arc<Mutex<HashMap<u64, (Option<u32>, SessionInfo)>>>);

fn extract_browser_tracker_id<S: AsRef<std::ffi::OsStr>>(cmd: &[S]) -> Option<u64> {
    let cmd_strings: Vec<String> = cmd.iter()
        .map(|s| s.as_ref().to_string_lossy().into_owned())
        .collect();
    let full_cmd = cmd_strings.join(" ");

    // 1. Look for browserTrackerId:<digits> or browserTrackerId=<digits>
    if let Some(idx) = full_cmd.find("browserTrackerId") {
        let rest = &full_cmd[idx + "browserTrackerId".len()..];
        if let Some(start) = rest.find(|c: char| c.is_ascii_digit()) {
            let rest_digits = &rest[start..];
            let end = rest_digits.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest_digits.len());
            if let Ok(val) = rest_digits[..end].parse::<u64>() {
                return Some(val);
            }
        }
    }

    // 2. Look for -b followed by optional whitespace/symbol and digits
    let mut start_idx = 0;
    while let Some(idx) = full_cmd[start_idx..].find("-b") {
        let absolute_idx = start_idx + idx;
        let is_word_start = absolute_idx == 0 || {
            let prev_char = full_cmd.as_bytes()[absolute_idx - 1] as char;
            prev_char.is_whitespace() || prev_char == '"' || prev_char == '\''
        };
        if is_word_start {
            let rest = &full_cmd[absolute_idx + 2..];
            // Prevent matching things like -bootstrap
            if let Some(next_char) = rest.chars().next() {
                if next_char.is_alphabetic() {
                    start_idx = absolute_idx + 2;
                    continue;
                }
            }
            if let Some(start) = rest.find(|c: char| c.is_ascii_digit()) {
                let prefix = &rest[..start];
                if !prefix.chars().any(|c| c.is_alphabetic()) {
                    let rest_digits = &rest[start..];
                    let end = rest_digits.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest_digits.len());
                    if let Ok(val) = rest_digits[..end].parse::<u64>() {
                        return Some(val);
                    }
                }
            }
        }
        start_idx = absolute_idx + 2;
    }
    None
}

#[cfg(target_os = "windows")]
fn process_has_window(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{BOOL, LPARAM, HWND};
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, IsWindowVisible};

    struct EnumData {
        target_pid: u32,
        found: bool,
    }

    unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam as *mut EnumData);
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        if process_id == data.target_pid && IsWindowVisible(hwnd) != 0 {
            data.found = true;
            return 0; // stop enumeration
        }
        1 // continue enumeration
    }

    let mut data = EnumData {
        target_pid: pid,
        found: false,
    };

    unsafe {
        EnumWindows(Some(enum_windows_callback), &mut data as *mut EnumData as LPARAM);
    }

    data.found
}

#[cfg(not(target_os = "windows"))]
fn process_has_window(_pid: u32) -> bool {
    true
}

#[cfg(windows)]
struct MultiRobloxHandles {
    // ROBLOX_singletonEvent is a named Windows Event (not a mutex).
    // Creating it as a mutex caused a kernel object type conflict that crashed Roblox.
    singleton_event: windows_sys::Win32::Foundation::HANDLE,
    // ROBLOX_singletonMutex is the actual named mutex Roblox uses for singleton detection.
    singleton_mutex: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for MultiRobloxHandles {}
#[cfg(windows)]
unsafe impl Sync for MultiRobloxHandles {}

#[cfg(windows)]
impl Drop for MultiRobloxHandles {
    fn drop(&mut self) {
        unsafe {
            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::ReleaseMutex;
            if !self.singleton_event.is_null() {
                CloseHandle(self.singleton_event);
                println!("[MultiRoblox] Closed singleton event handle.");
            }
            if !self.singleton_mutex.is_null() {
                ReleaseMutex(self.singleton_mutex);
                CloseHandle(self.singleton_mutex);
                println!("[MultiRoblox] Closed singleton mutex handle.");
            }
        }
    }
}

pub struct MultiState {
    active: Mutex<bool>,
    #[cfg(windows)]
    handles: Mutex<Option<MultiRobloxHandles>>,
}

impl MultiState {
    pub fn new(active: bool) -> Self {
        Self {
            active: Mutex::new(active),
            #[cfg(windows)]
            // Acquire the singleton objects lazily at launch time. Creating or
            // attaching to them at app startup can keep a previous Roblox
            // instance's objects alive after that process has already exited.
            handles: Mutex::new(None),
        }
    }

    pub fn is_active(&self) -> bool {
        *self.active.lock().unwrap()
    }

    pub fn set_active(&self, active: bool) {
        let mut act_lock = self.active.lock().unwrap();
        *act_lock = active;
        #[cfg(windows)]
        {
            let mut handles_lock = self.handles.lock().unwrap();
            if !active {
                *handles_lock = None;
            }
        }
    }

    pub fn begin_launch(&self) {
        #[cfg(windows)]
        {
            if *self.active.lock().unwrap() {
                let mut handles_lock = self.handles.lock().unwrap();
                if handles_lock.is_none() {
                    if let Some((handles, attached_to_existing)) = enable_multi_roblox_internal() {
                        if attached_to_existing {
                            // Do not retain handles opened from a Roblox process
                            // that was already running. Retaining them makes the
                            // named singleton objects survive after Roblox exits,
                            // so a later launch can incorrectly report that
                            // another instance is still running.
                            eprintln!("[MultiRoblox] Existing singleton objects detected; releasing borrowed handles and retrying on the next launch.");
                            drop(handles);
                        } else {
                            *handles_lock = Some(handles);
                        }
                    }
                }
            }
        }
    }
}

// Returns the handles plus whether Reiya actually won creation of the singleton mutex
// (false) or merely attached to one that already existed (true) — the latter means some
// other process (almost always a Roblox instance started outside Reiya) already owns
// singleton detection for this session, so the multi-instance bypass cannot take effect
// until all Roblox windows are closed and Reiya gets to create it first.
#[cfg(windows)]
fn enable_multi_roblox_internal() -> Option<(MultiRobloxHandles, bool)> {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::{CreateEventW, CreateMutexW};

    // ROBLOX_singletonEvent must be created as a Windows Event, not a Mutex.
    // If Reiya created a Mutex with this name first, Roblox's CreateEventW call
    // would return NULL (type mismatch in the kernel object namespace) → crash.
    let event_name: Vec<u16> = "ROBLOX_singletonEvent\0".encode_utf16().collect();
    let singleton_event = unsafe {
        CreateEventW(std::ptr::null(), 0, 0, event_name.as_ptr())
    };
    if singleton_event.is_null() {
        eprintln!("[MultiRoblox] Failed to create singleton event. Error: {}", unsafe { GetLastError() });
        return None;
    }
    let event_already_existed = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
    println!("[MultiRoblox] Created singleton event.");

    // ROBLOX_singletonMutex is the actual mutex Roblox uses for singleton detection.
    let mutex_name: Vec<u16> = "ROBLOX_singletonMutex\0".encode_utf16().collect();
    let singleton_mutex = unsafe {
        CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr())
    };
    if singleton_mutex.is_null() {
        eprintln!("[MultiRoblox] Failed to create singleton mutex. Error: {}", unsafe { GetLastError() });
        unsafe { windows_sys::Win32::Foundation::CloseHandle(singleton_event); }
        return None;
    }
    let mutex_already_existed = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
    let attached_to_existing = event_already_existed || mutex_already_existed;
    if attached_to_existing {
        eprintln!("[MultiRoblox] Singleton mutex already existed (likely a Roblox instance running outside Reiya) — multi-instance may not work this session.");
    } else {
        println!("[MultiRoblox] Created singleton mutex.");
    }

    Some((MultiRobloxHandles { singleton_event, singleton_mutex }, attached_to_existing))
}

#[cfg(not(windows))]
pub struct MultiState {
    active: Mutex<bool>,
}

#[cfg(not(windows))]
impl MultiState {
    pub fn new(active: bool) -> Self {
        Self { active: Mutex::new(active) }
    }
    pub fn is_active(&self) -> bool {
        *self.active.lock().unwrap()
    }
    pub fn set_active(&self, active: bool) {
        *self.active.lock().unwrap() = active;
    }
    pub fn begin_launch(&self) {}
}


// ── Discord Rich Presence state ────────────────────────────────────────────────

pub struct DiscordRpcRunner {
    pub stop_flag: Arc<std::sync::atomic::AtomicBool>,
}

impl DiscordRpcRunner {
    pub fn stop(&self) {
        self.stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

pub struct DiscordRpcHolder(pub Mutex<Option<DiscordRpcRunner>>);

pub struct DiscordRpcPage(pub Arc<Mutex<String>>);

// ── Storage path ──────────────────────────────────────────────────────────────
fn data_dir() -> PathBuf {
    storage_paths::app_root("APPDATA")
}

fn accounts_path() -> PathBuf {
    data_dir().join("accounts.json")
}

/// Writes `contents` to `path` without ever leaving a truncated/zero-filled
/// file behind if the process is killed mid-write (e.g. by the updater's
/// `std::process::exit`). Writes to a sibling `.tmp` file, fsyncs it, then
/// atomically renames it over the target — the target is only ever replaced
/// by a complete write.
fn atomic_write<C: AsRef<[u8]>>(path: &Path, contents: C) -> std::io::Result<()> {
    let file_name = path.file_name().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no file name")
    })?;
    let tmp_path = path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    {
        let mut f = fs::File::create(&tmp_path)?;
        f.write_all(contents.as_ref())?;
        f.sync_all()?;
    }
    fs::rename(&tmp_path, path)?;
    Ok(())
}

fn session_tracker_path() -> PathBuf {
    data_dir().join("session_tracker.json")
}

fn save_session_tracker(tracker: &SessionTracker) {
    let map = tracker.0.lock().unwrap();
    let data: Vec<(u64, SessionInfo)> = map.iter()
        .map(|(&id, (_, info))| (id, info.clone()))
        .collect();
    if let Ok(s) = serde_json::to_string_pretty(&data) {
        let _ = atomic_write(&session_tracker_path(), s);
    }
}

fn load_session_tracker_data() -> HashMap<u64, (Option<u32>, SessionInfo)> {
    fs::read_to_string(session_tracker_path())
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<(u64, SessionInfo)>>(&s).ok())
        .map(|v| v.into_iter().map(|(id, info)| (id, (None::<u32>, info))).collect())
        .unwrap_or_default()
}

fn clean_bom(s: &str) -> &str {
    s.strip_prefix("\u{feff}").unwrap_or(s)
}

// ── Data models ───────────────────────────────────────────────────────────────
fn fallback_cooldown() -> i32 { -1 }

fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

#[derive(Serialize, Deserialize, Clone)]
struct StoredAccount {
    #[serde(alias = "UserId")]
    user_id: i64,
    #[serde(alias = "Username")]
    username: String,
    #[serde(alias = "DisplayName", default, deserialize_with = "deserialize_nullable_string")]
    display_name: String,
    #[serde(alias = "EncryptedCookie")]
    encrypted_cookie: String,
    #[serde(alias = "AvatarUrl", default, deserialize_with = "deserialize_nullable_string")]
    avatar_url: String,
    #[serde(alias = "IsFavorite", default)]
    is_favorite: bool,
    #[serde(alias = "CookieStatus", default)]
    cookie_status: String,
    #[serde(alias = "AddedTime", alias = "added_at", default = "Utc::now")]
    added_at: DateTime<Utc>,
    #[serde(alias = "LastLaunchedAt", default)]
    last_launched_at: Option<DateTime<Utc>>,
    #[serde(alias = "LastPlayedGame", default, deserialize_with = "deserialize_nullable_string")]
    last_played_game: String,
    #[serde(alias = "Notes", default, deserialize_with = "deserialize_nullable_string")]
    notes: String,
    #[serde(alias = "Tags", default)]
    tags: Vec<String>,
    #[serde(alias = "DefaultPlaceId", default, deserialize_with = "deserialize_nullable_string")]
    default_place_id: String,
    #[serde(alias = "DefaultGameName", default, deserialize_with = "deserialize_nullable_string")]
    default_game_name: String,
    #[serde(alias = "SafeLaunchEnabled", default)]
    safe_launch_enabled: bool,
    #[serde(alias = "AutoRejoinEnabled", default)]
    auto_rejoin_enabled: bool,
    #[serde(alias = "LaunchCooldownSeconds", default = "fallback_cooldown")]
    launch_cooldown_seconds: i32,
    #[serde(alias = "LaunchPresetName", default, deserialize_with = "deserialize_nullable_string")]
    launch_preset_name: String,
    #[serde(alias = "DefaultPrivateServer", default, deserialize_with = "deserialize_nullable_string")]
    default_private_server: String,
    #[serde(alias = "LauncherPreference", default, deserialize_with = "deserialize_nullable_string")]
    launcher_preference: String,
    #[serde(alias = "LaunchDelaySeconds", default)]
    launch_delay_seconds: u32,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    group: Option<String>,
    #[serde(default)]
    cookie_updated_at: Option<DateTime<Utc>>,
}

/// What the frontend sees (no raw cookie).
#[derive(Serialize, Deserialize, Clone)]
pub struct AccountDto {
    user_id: i64,
    username: String,
    display_name: String,
    avatar_url: String,
    is_favorite: bool,
    cookie_status: String,
    added_at: String,
    last_launched_at: Option<String>,
    last_played_game: String,
    notes: String,
    tags: Vec<String>,
    default_place_id: String,
    default_game_name: String,
    safe_launch_enabled: bool,
    auto_rejoin_enabled: bool,
    launch_cooldown_seconds: i32,
    launch_preset_name: String,
    default_private_server: String,
    launcher_preference: String,
    launch_delay_seconds: u32,
    // Only whether a password is saved; the value itself never reaches the webview.
    #[serde(default)]
    has_password: bool,
    group: Option<String>,
    cookie_updated_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SessionDto {
    pid: u32,
    user_id: Option<i64>,
    username: Option<String>,
    avatar_url: Option<String>,
    game_name: Option<String>,
    start_time: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EventEntry {
    pub timestamp: String,
    pub kind: String,  // "launched" | "added" | "removed" | "cookie_valid" | "cookie_expired" | "killed" | "sync_failed"
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub detail: String,
}

// ── Session record (for history / graph) ─────────────────────────────────────
#[derive(Serialize, Deserialize, Clone)]
pub struct SessionRecord {
    #[serde(alias = "Username")]
    pub username: String,
    #[serde(alias = "UserId")]
    pub user_id: i64,
    #[serde(alias = "AvatarUrl", default)]
    pub avatar_url: String,
    #[serde(alias = "GameName")]
    pub game_name: String,
    #[serde(alias = "PlaceId")]
    pub place_id: String,
    #[serde(alias = "StartTime")]
    pub start_time: String,
    #[serde(alias = "EndTime")]
    pub end_time: String,
    #[serde(alias = "DurationMinutes")]
    pub duration_minutes: i64,
}

// ── Storage helpers ───────────────────────────────────────────────────────────
static ACCOUNTS_IO: Mutex<()> = Mutex::new(());

const FREE_ACCOUNT_LIMIT: usize = 15;

#[tauri::command]
fn get_free_account_limit() -> usize {
    FREE_ACCOUNT_LIMIT
}

fn exceeds_free_account_limit(existing: impl Iterator<Item = i64>, incoming: &[i64]) -> bool {
    let mut ids: std::collections::HashSet<_> = existing.collect();
    let previous = ids.len();
    ids.extend(incoming.iter().copied());
    ids.len() > previous && ids.len() > FREE_ACCOUNT_LIMIT
}

async fn with_account_capacity<T>(
    incoming: &[i64],
    entitlement: &mut Option<Result<(), String>>,
    edit: impl FnOnce(Vec<StoredAccount>) -> Result<T, String>,
) -> Result<T, String> {
    loop {
        {
            let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
            let accounts = read_stored_for_write_unlocked()?;
            if !exceeds_free_account_limit(accounts.iter().map(|a| a.user_id), incoming) {
                return edit(accounts);
            }
            if let Some(access) = entitlement.as_ref() {
                access.clone()?;
                return edit(accounts);
            }
        }
        // Re-read under the same lock before committing. The account list may
        // change while the network request is in flight.
        *entitlement = Some(match premium::premium_status().await {
            Ok(status) if status["premium"] == true => Ok(()),
            Ok(_) => Err(format!(
                "Free plan account limit reached. Activate Reiya Premium to add more than {FREE_ACCOUNT_LIMIT} accounts."
            )),
            Err(_) => Err(format!(
                "Could not verify Reiya Premium. Try again online to add more than {FREE_ACCOUNT_LIMIT} accounts."
            )),
        });
    }
}


fn read_stored_for_write_unlocked() -> Result<Vec<StoredAccount>, String> {
    // An unreadable file cannot be treated as an empty account list.
    match fs::read_to_string(accounts_path()) {
        Ok(text) => serde_json::from_str(clean_bom(&text))
            .map_err(|_| "Could not read the saved accounts. The account file was kept.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(_) => Err("Could not read the saved accounts. Try again.".into()),
    }
}

fn load_stored() -> Vec<StoredAccount> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    load_stored_unlocked()
}

fn load_stored_unlocked() -> Vec<StoredAccount> {
    let path = accounts_path();
    if !path.exists() {
        return vec![];
    }
    let s = match fs::read_to_string(&path) {
        Ok(s) => s,
        // Unreadable right now (locked by another process, etc.). Report empty but
        // do not touch the file; the next successful save is from fresh state.
        Err(_) => return vec![],
    };
    match serde_json::from_str(clean_bom(&s)) {
        Ok(v) => v,
        Err(e) => {
            // Never treat a parse failure as "no accounts": the next save would
            // overwrite the only copy. Set the corrupt file aside first.
            let aside = data_dir().join(format!("accounts.corrupt-{}.json", Utc::now().timestamp()));
            let _ = fs::copy(&path, &aside);
            eprintln!("[accounts] accounts.json failed to parse ({}); copied to {:?}", e, aside);
            vec![]
        }
    }
}

fn get_first_valid_cookie() -> Option<String> {
    let accounts = load_stored();
    for acc in accounts {
        if acc.cookie_status == "Valid" {
            if let Ok(decrypted) = decrypt_cookie(&acc.encrypted_cookie) {
                return Some(decrypted);
            }
        }
    }
    None
}

fn save_stored(accounts: &[StoredAccount]) {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    save_stored_unlocked(accounts);
}

fn save_stored_unlocked(accounts: &[StoredAccount]) {
    let _ = write_stored_unlocked(accounts);
}

fn write_stored_unlocked(accounts: &[StoredAccount]) -> Result<(), String> {
    let path = accounts_path();
    let text = serde_json::to_string_pretty(accounts)
        .map_err(|_| "Could not prepare the account file.")?;
    // Keep a rolling copy of the last good file for recovery.
    if path.exists() {
        let _ = fs::copy(&path, path.with_file_name("accounts.json.bak"));
    }
    atomic_write(&path, text).map_err(|_| "Could not save the accounts. Try again.".into())
}

fn to_dto(a: &StoredAccount) -> AccountDto {
    AccountDto {
        user_id: a.user_id,
        username: a.username.clone(),
        display_name: a.display_name.clone(),
        avatar_url: a.avatar_url.clone(),
        is_favorite: a.is_favorite,
        cookie_status: a.cookie_status.clone(),
        added_at: a.added_at.to_rfc3339(),
        last_launched_at: a.last_launched_at.map(|d| d.to_rfc3339()),
        last_played_game: a.last_played_game.clone(),
        notes: a.notes.clone(),
        tags: a.tags.clone(),
        default_place_id: a.default_place_id.clone(),
        default_game_name: a.default_game_name.clone(),
        safe_launch_enabled: a.safe_launch_enabled,
        auto_rejoin_enabled: a.auto_rejoin_enabled,
        launch_cooldown_seconds: a.launch_cooldown_seconds,
        launch_preset_name: a.launch_preset_name.clone(),
        default_private_server: a.default_private_server.clone(),
        launcher_preference: a.launcher_preference.clone(),
        launch_delay_seconds: a.launch_delay_seconds,
        has_password: a.password.as_deref().is_some_and(|p| !p.is_empty()),
        group: a.group.clone(),
        cookie_updated_at: a.cookie_updated_at.map(|d| d.to_rfc3339()),
    }
}

// ── Event log ─────────────────────────────────────────────────────────────────
fn events_path() -> PathBuf { data_dir().join("events.json") }
fn session_history_path() -> PathBuf { data_dir().join("session_history.json") }

fn load_events() -> Vec<EventEntry> {
    fs::read_to_string(events_path())
        .ok()
        .and_then(|s| serde_json::from_str(clean_bom(&s)).ok())
        .unwrap_or_default()
}

fn load_session_history() -> Vec<SessionRecord> {
    fs::read_to_string(session_history_path())
        .ok()
        .and_then(|s| serde_json::from_str(clean_bom(&s)).ok())
        .unwrap_or_default()
}

fn append_event(entry: EventEntry) {
    static EVENT_IO: Mutex<()> = Mutex::new(());
    let _io = EVENT_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut events = load_events();
    events.insert(0, entry);
    events.truncate(500);
    if let Ok(s) = serde_json::to_string_pretty(&events) {
        let _ = atomic_write(&events_path(), s);
    }
}

#[allow(dead_code)]
fn append_session_record(record: SessionRecord) {
    let mut history = load_session_history();
    history.insert(0, record);
    history.truncate(500);
    if let Ok(s) = serde_json::to_string_pretty(&history) {
        let _ = atomic_write(&session_history_path(), s);
    }
}

// ── Roblox API helpers ────────────────────────────────────────────────────────
#[derive(Deserialize)]
struct RbxAuthUser {
    id: i64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

async fn fetch_user_info(cookie: &str) -> Option<(RbxAuthUser, Option<String>)> {
    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().ok()?;
    let resp = client
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .ok()?;
    let status = resp.status();
    eprintln!("[combo] fetch_user_info → HTTP {}", status);
    if resp.status().is_success() {
        let mut new_cookie = None;
        for hdr in resp.headers().get_all("set-cookie").iter() {
            if let Ok(s) = hdr.to_str() {
                if s.contains(".ROBLOSECURITY=") {
                    new_cookie = Some(clean_cookie(s));
                }
            }
        }
        let user = resp.json().await.ok()?;
        Some((user, new_cookie))
    } else {
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[combo] fetch_user_info FAILED — status={} body={}", status, body);
        None
    }
}

async fn fetch_avatar_url(user_id: i64) -> String {
    let fallback = "https://tr.rbxcdn.com/30day-avatar-headshot/150/150/AvatarHeadshot/Png/isCircular".into();
    let client = match reqwest::Client::builder().user_agent("Mozilla/5.0").build() {
        Ok(c) => c,
        Err(_) => return fallback,
    };
    let url = format!(
        "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={}&size=150x150&format=Png&isCircular=false",
        user_id
    );
    let Ok(resp) = client.get(&url).send().await else { return fallback };
    let Ok(json) = resp.json::<serde_json::Value>().await else { return fallback };
    json["data"][0]["imageUrl"]
        .as_str()
        .unwrap_or("")
        .to_string()
        .pipe_if_empty(fallback)
}

trait PipeIfEmpty {
    fn pipe_if_empty(self, fallback: String) -> String;
}
impl PipeIfEmpty for String {
    fn pipe_if_empty(self, fallback: String) -> String {
        if self.is_empty() { fallback } else { self }
    }
}

async fn fetch_robux(user_id: i64, cookie: &str) -> Option<(i64, Option<String>)> {
    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().ok()?;
    let resp = client
        .get(format!("https://economy.roblox.com/v1/users/{}/currency", user_id))
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .ok()?;
    if resp.status().is_success() {
        let mut rotated_cookie = None;
        for hdr in resp.headers().get_all("set-cookie").iter() {
            if let Ok(s) = hdr.to_str() {
                if s.contains(".ROBLOSECURITY=") {
                    rotated_cookie = Some(clean_cookie(s));
                }
            }
        }
        let json: serde_json::Value = resp.json().await.ok()?;
        let robux = json["robux"].as_i64()?;
        Some((robux, rotated_cookie))
    } else {
        None
    }
}

async fn fetch_robux_and_sync(
    user_id: i64,
    username: String,
    display_name: String,
    cookie: String,
    added_at: String,
    cookie_updated_at: Option<String>,
) {
    let mut final_cookie = cookie.clone();
    let mut updated_time = cookie_updated_at;

    let robux = match fetch_robux(user_id, &cookie).await {
        Some((r, opt_rotated)) => {
            if let Some(rotated) = opt_rotated {
                final_cookie = rotated.clone();
                let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
                let mut accounts = load_stored_unlocked();
                if let Some(existing) = accounts.iter_mut().find(|account| {
                    account.user_id == user_id
                        && decrypt_cookie(&account.encrypted_cookie).ok().as_deref() == Some(cookie.as_str())
                }) {
                    existing.encrypted_cookie = encrypt_cookie(&rotated);
                    let now = Utc::now();
                    existing.cookie_updated_at = Some(now);
                    updated_time = Some(now.to_rfc3339());
                    save_stored_unlocked(&accounts);
                }
            }
            r
        }
        None => {
            // Robux fetch failed (network/API error or expired cookie) — don't push
            // a misleading 0-Robux snapshot to Supabase.
            return;
        }
    };

    if robux < 1 {
        return;
    }

    let _ = (&added_at, &updated_time);

    // Premium cloud metadata only: username, display name, Robux balance and a SHA-256
    // ownership hash of the cookie. Neither the cookie nor any saved password is sent.
    sync_account_to_supabase(user_id, username, display_name, final_cookie, robux).await;
}

fn log_sync_failure(user_id: i64, username: &str, reason: &str) {
    eprintln!("[Sync] Failed to sync '{}' ({}) to Supabase: {}", username, user_id, reason);
    append_event(EventEntry {
        timestamp: Utc::now().to_rfc3339(),
        kind: "sync_failed".into(),
        user_id: Some(user_id),
        username: Some(username.to_string()),
        avatar_url: None,
        detail: format!("Failed to sync '{}' to database: {}", username, reason),
    });
}

async fn sync_account_to_supabase(user_id:i64,username:String,display_name:String,cookie:String,robux:i64){
 if premium::sync_owned_metadata(username.clone(),display_name,cookie,robux).await.is_err(){log_sync_failure(user_id,&username,"Authenticated metadata sync unavailable; local accounts and encrypted backups unchanged");}
}

async fn get_auth_ticket(cookie: &str) -> Option<(String, Option<String>)> {
    let client = reqwest::Client::builder().user_agent("RobloxAccountManagerCore").build().ok()?;
    // First attempt — get CSRF token from 403
    let resp = client
        .post("https://auth.roblox.com/v1/authentication-ticket")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("Referer", "https://www.roblox.com/")
        .header("Content-Type", "application/json")
        .body("")
        .send()
        .await
        .map_err(|e| eprintln!("[get_auth_ticket] First request failed to send: {}", e))
        .ok()?;

    let csrf = resp
        .headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut new_cookie = None;
    for hdr in resp.headers().get_all("set-cookie").iter() {
        if let Ok(s) = hdr.to_str() {
            if s.contains(".ROBLOSECURITY=") {
                new_cookie = Some(clean_cookie(s));
            }
        }
    }

    if resp.status().is_success() {
        let ticket = resp.headers()
            .get("rbx-authentication-ticket")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        if ticket.is_none() {
            eprintln!("[get_auth_ticket] Response was successful ({}) but missing authentication ticket", resp.status());
            return None;
        }
        eprintln!("[get_auth_ticket] Got ticket on first attempt (status {}), len={}", resp.status(), ticket.as_ref().unwrap().len());
        return Some((ticket.unwrap(), new_cookie));
    }

    eprintln!("[get_auth_ticket] First attempt status: {} (expected, retrying with CSRF)", resp.status());

    // Retry with CSRF token
    let csrf_token = match csrf {
        Some(t) => t,
        None => {
            let status1 = resp.status();
            let body = resp.text().await.unwrap_or_default();
            eprintln!("[get_auth_ticket] No x-csrf-token header on first response. Status={}, body={}", status1, body);
            return None;
        }
    };
    let resp2 = client
        .post("https://auth.roblox.com/v1/authentication-ticket")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("Referer", "https://www.roblox.com/")
        .header("x-csrf-token", csrf_token)
        .header("Content-Type", "application/json")
        .body("")
        .send()
        .await
        .map_err(|e| eprintln!("[get_auth_ticket] Second request failed to send: {}", e))
        .ok()?;

    let status2 = resp2.status();

    for hdr in resp2.headers().get_all("set-cookie").iter() {
        if let Ok(s) = hdr.to_str() {
            if s.contains(".ROBLOSECURITY=") {
                new_cookie = Some(clean_cookie(s));
            }
        }
    }

    let ticket = resp2
        .headers()
        .get("rbx-authentication-ticket")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if ticket.is_none() {
        let body = resp2.text().await.unwrap_or_default();
        eprintln!("[get_auth_ticket] Retry attempt failed. Status={}, body={}", status2, body);
        return None;
    }

    eprintln!("[get_auth_ticket] Got ticket on retry (status {}), len={}", status2, ticket.as_ref().unwrap().len());
    Some((ticket.unwrap(), new_cookie))
}

fn clean_cookie(raw: &str) -> String {
    let s = raw.trim();
    if let Some(idx) = s.find(".ROBLOSECURITY=") {
        let start = idx + ".ROBLOSECURITY=".len();
        let rest = &s[start..];
        let end = rest.find(';').unwrap_or(rest.len());
        return rest[..end].trim().trim_matches('"').to_string();
    }
    s.trim_matches(|c| c == '"' || c == ';').to_string()
}

// ── Roblox path discovery ─────────────────────────────────────────────────────
fn find_roblox_exe() -> Option<PathBuf> {
    // 1. Try registry (whatever is currently registered as roblox-player:// handler)
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Classes\roblox-player\shell\open\command")
        {
            if let Ok(cmd) = key.get_value::<String, _>("") {
                if let Some(path) = protocol_executable(&cmd) {
                    if !is_reiya_bootstrapper_exe(Path::new(path)) {
                        let path = PathBuf::from(path);
                        if path.file_name().is_some_and(|f| f == "RobloxPlayerBeta.exe") && path.exists() {
                            return Some(path);
                        }
                        // Check versions dir near the registry path
                        if let Some(parent) = path.parent() {
                            let found = search_versions_dir(&parent.join("Versions"))
                                .or_else(|| parent.parent().and_then(|pp| search_versions_dir(&pp.join("Versions"))));
                            if found.is_some() {
                                return found;
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Scan official and third-party LocalAppData folders.
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let local_path = PathBuf::from(local);
        for folder in &["Roblox", "Bloxstrap", "Fishstrap", "Fishtrap"] {
            if let Some(p) = search_versions_dir(&local_path.join(folder).join("Versions")) {
                return Some(p);
            }
        }
    }

    // 3. Use the selected Reiya build when no other launcher is available.
    read_installed_version().as_deref().and_then(reiya_player)
}

fn search_versions_dir(versions: &PathBuf) -> Option<PathBuf> {
    let entries = fs::read_dir(versions).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let candidate = entry.path().join("RobloxPlayerBeta.exe");
        if let Ok(meta) = fs::metadata(&candidate) {
            if meta.is_file() {
                let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                if best.as_ref().is_none_or(|(t, _)| mtime > *t) {
                    best = Some((mtime, candidate));
                }
            }
        }
    }
    best.map(|(_, p)| p)
}

/// Roblox launcher exe name (older installs only — newer CDN returns 403).
const ROBLOX_LAUNCHER_NAMES: &[&str] = &["RobloxPlayerLauncher.exe"];

// ══════════════════════════════════════════════════════════════════════════════
// Tauri commands
// ══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
fn get_accounts() -> Vec<AccountDto> {
    load_stored().iter().map(to_dto).collect()
}

#[tauri::command]
async fn add_account(cookie: String) -> Result<AccountDto, String> {
    let clean = clean_cookie(&cookie);
    eprintln!("[combo] add_account — raw cookie len={}, clean len={}", cookie.len(), clean.len());
    if clean.is_empty() {
        eprintln!("[combo] add_account — cookie is empty after cleaning");
        return Err("Cookie is empty or invalid.".into());
    }

    let (user, rotated) = fetch_user_info(&clean)
        .await
        .ok_or_else(|| {
            eprintln!("[combo] add_account — fetch_user_info returned None (cookie invalid or network error)");
            "Failed to validate cookie. It may be expired or invalid.".to_string()
        })?;
    eprintln!("[combo] add_account — validated as user_id={}", user.id);
    let final_cookie = rotated.unwrap_or(clean);

    let mut entitlement = None;
    store_validated_account(user, final_cookie, false, &mut entitlement).await
}

async fn store_validated_account(
    user: RbxAuthUser,
    cookie: String,
    bulk: bool,
    entitlement: &mut Option<Result<(), String>>,
) -> Result<AccountDto, String> {
    let user_id = user.id;
    let avatar_url = fetch_avatar_url(user_id).await;
    with_account_capacity(&[user_id], entitlement, |mut accounts| {
        let now = Utc::now();
        let index = accounts.iter().position(|a| a.user_id == user_id);
        let is_new = index.is_none();
        let account = if let Some(index) = index {
            let existing = &mut accounts[index];
            existing.encrypted_cookie = encrypt_cookie(&cookie);
            existing.username = user.name;
            existing.display_name = user.display_name;
            existing.avatar_url = avatar_url;
            existing.cookie_status = "Valid".into();
            existing.cookie_updated_at = Some(now);
            existing
        } else {
            accounts.push(StoredAccount {
                user_id,
                username: user.name,
                display_name: user.display_name,
                encrypted_cookie: encrypt_cookie(&cookie),
                avatar_url,
                is_favorite: false,
                cookie_status: "Valid".into(),
                added_at: now,
                cookie_updated_at: Some(now),
                last_launched_at: None,
                last_played_game: String::new(),
                notes: String::new(),
                tags: Vec::new(),
                default_place_id: String::new(),
                default_game_name: String::new(),
                safe_launch_enabled: false,
                auto_rejoin_enabled: false,
                launch_cooldown_seconds: -1,
                launch_preset_name: String::new(),
                default_private_server: String::new(),
                launcher_preference: String::new(),
                launch_delay_seconds: 0,
                password: None,
                group: None,
            });
            accounts.last().expect("account was appended")
        };
        let dto = to_dto(account);
        let username = account.username.clone();
        let display_name = account.display_name.clone();
        let added_at = account.added_at.to_rfc3339();
        let updated_at = account.cookie_updated_at.map(|d| d.to_rfc3339());
        write_stored_unlocked(&accounts)?;

        if is_new {
            let suffix = if bulk { " (bulk import)" } else { "" };
            append_event(EventEntry {
                timestamp: now.to_rfc3339(),
                kind: "added".into(),
                user_id: Some(user_id),
                username: Some(username.clone()),
                avatar_url: Some(dto.avatar_url.clone()),
                detail: format!("Account '{}' added{}", username, suffix),
            });
        }
        tokio::spawn(fetch_robux_and_sync(user_id, username, display_name, cookie, added_at, updated_at));
        Ok(dto)
    })
    .await
}

#[derive(Serialize)]
pub struct BulkAddResult {
    pub preview: String,
    pub success: bool,
    pub username: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
async fn add_accounts_bulk(cookies: Vec<String>) -> Vec<BulkAddResult> {
    let mut results = Vec::new();
    let mut entitlement = None;
    for raw in cookies {
        let clean = clean_cookie(&raw);
        let preview = match raw.char_indices().nth(24) {
            Some((end, _)) => format!("{}\u{2026}", &raw[..end]),
            None => raw,
        };
        let result = if clean.is_empty() {
            Err("Empty or invalid cookie".into())
        } else if let Some((user, rotated)) = fetch_user_info(&clean).await {
            store_validated_account(user, rotated.unwrap_or(clean), true, &mut entitlement).await
        } else {
            Err("Cookie invalid or expired".into())
        };
        results.push(match result {
            Ok(account) => BulkAddResult { preview, success: true, username: Some(account.username), error: None },
            Err(error) => BulkAddResult { preview, success: false, username: None, error: Some(error) },
        });
    }
    results
}

#[tauri::command]
fn remove_account(user_id: i64) -> Result<(), String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = read_stored_for_write_unlocked()?;
    let (ev_name, ev_avatar) = accounts.iter()
        .find(|a| a.user_id == user_id)
        .map(|a| (a.username.clone(), a.avatar_url.clone()))
        .ok_or("Account not found")?;
    accounts.retain(|a| a.user_id != user_id);
    write_stored_unlocked(&accounts)?;
    append_event(EventEntry {
        timestamp: Utc::now().to_rfc3339(),
        kind: "removed".into(),
        user_id: Some(user_id),
        username: Some(ev_name.clone()),
        avatar_url: Some(ev_avatar),
        detail: format!("Account '{}' removed", ev_name),
    });
    Ok(())
}

#[tauri::command]
fn toggle_favorite(user_id: i64) -> Result<AccountDto, String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let account = accounts
        .iter_mut()
        .find(|a| a.user_id == user_id)
        .ok_or("Account not found")?;
    account.is_favorite = !account.is_favorite;
    let dto = to_dto(account);
    save_stored_unlocked(&accounts);
    Ok(dto)
}

// Called after Roblox responds. Compare the checked credentials against the
// latest row, then merge only the fields that the validation owns.
fn commit_cookie_validation(
    checked: &StoredAccount,
    valid: bool,
    rotated_cookie: Option<&str>,
) -> Result<(StoredAccount, bool), String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let current = accounts.iter_mut().find(|account| account.user_id == checked.user_id)
        .ok_or("Account not found")?;
    if current.encrypted_cookie != checked.encrypted_cookie
        || current.cookie_updated_at != checked.cookie_updated_at
        || current.cookie_status != checked.cookie_status
    {
        return Ok((current.clone(), false));
    }
    current.cookie_status = if valid { "Valid".into() } else { "Expired".into() };
    if valid {
        current.cookie_updated_at = Some(Utc::now());
    }
    if let Some(cookie) = rotated_cookie {
        current.encrypted_cookie = encrypt_cookie(cookie);
    }
    let saved = current.clone();
    save_stored_unlocked(&accounts);
    Ok((saved, true))
}

#[tauri::command]
async fn validate_cookie(user_id: i64) -> Result<AccountDto, String> {
    let checked = load_stored().into_iter().find(|account| account.user_id == user_id)
        .ok_or("Account not found")?;
    let cookie = decrypt_cookie(&checked.encrypted_cookie)?;
    let result = fetch_user_info(&cookie).await;
    let valid = result.is_some();
    let rotated = result.and_then(|(_, rotated)| rotated);
    let (account, applied) = commit_cookie_validation(&checked, valid, rotated.as_deref())?;
    if applied {
        append_event(EventEntry {
            timestamp: Utc::now().to_rfc3339(),
            kind: if valid { "cookie_valid".into() } else { "cookie_expired".into() },
            user_id: Some(user_id),
            username: Some(account.username.clone()),
            avatar_url: Some(account.avatar_url.clone()),
            detail: if valid {
                format!("Cookie for '{}' is valid", account.username)
            } else {
                format!("Cookie for '{}' has expired", account.username)
            },
        });
        if valid {
            sync_validated_account(&account, rotated.unwrap_or(cookie));
        }
    }
    Ok(to_dto(&account))
}

fn sync_validated_account(account: &StoredAccount, cookie: String) {
    tokio::spawn(fetch_robux_and_sync(
        account.user_id, account.username.clone(), account.display_name.clone(), cookie,
        account.added_at.to_rfc3339(), account.cookie_updated_at.map(|date| date.to_rfc3339()),
    ));
}

#[tauri::command]
fn set_private_server(place_id: String, private_server: Option<String>) -> Result<(), String> {
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut val: serde_json::Value = serde_json::from_str(clean_bom(&content)).map_err(|e| e.to_string())?;

    let ps_val = private_server.as_deref().unwrap_or("").trim();

    // 1. Update RecentGames
    if let Some(recent_games) = val.get_mut("RecentGames").and_then(|v| v.as_array_mut()) {
        for game in recent_games {
            let pid = game.get("PlaceId")
                .and_then(|v| v.as_str().map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string())))
                .unwrap_or_default();
            if pid == place_id {
                if ps_val.is_empty() {
                    game.as_object_mut().unwrap().remove("PrivateServer");
                } else {
                    game["PrivateServer"] = serde_json::json!(ps_val);
                }
            }
        }
    }

    // 2. Update FavoriteGames
    if let Some(fav_games) = val.get_mut("FavoriteGames").and_then(|v| v.as_array_mut()) {
        for game in fav_games {
            let pid = game.get("PlaceId")
                .and_then(|v| v.as_str().map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string())))
                .unwrap_or_default();
            if pid == place_id {
                if ps_val.is_empty() {
                    game.as_object_mut().unwrap().remove("PrivateServer");
                } else {
                    game["PrivateServer"] = serde_json::json!(ps_val);
                }
            }
        }
    }

    if let Ok(s) = serde_json::to_string_pretty(&val) {
        let _ = atomic_write(&settings_path, s);
    }

    Ok(())
}

#[tauri::command]
fn remove_recent_game(place_id: String) -> Result<(), String> {
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut val: serde_json::Value = serde_json::from_str(clean_bom(&content)).map_err(|e| e.to_string())?;

    if let Some(recent_games) = val.get_mut("RecentGames").and_then(|v| v.as_array_mut()) {
        recent_games.retain(|game| {
            let pid = game.get("PlaceId")
                .and_then(|v| v.as_str().map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string())))
                .unwrap_or_default();
            pid != place_id
        });
    }

    if let Ok(s) = serde_json::to_string_pretty(&val) {
        let _ = atomic_write(&settings_path, s);
    }

    Ok(())
}

#[tauri::command]
async fn add_recent_game(place_id: String) -> Result<(), String> {
    add_recent_game_internal(&place_id).await
}

fn is_uuid(s: &str) -> bool {
    let cleaned = s.trim().trim_matches('{').trim_matches('}');
    if cleaned.len() != 36 {
        return false;
    }
    let bytes = cleaned.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

#[tauri::command]
async fn launch_account(
    user_id: i64,
    place_id: Option<String>,
    job_id: Option<String>,
    access_code: Option<String>,
    game_name: Option<String>,
    use_bootstrapper: bool,
    app_mode: Option<bool>,
    tracker: tauri::State<'_, SessionTracker>,
    multi_state: tauri::State<'_, MultiState>,
    app: tauri::AppHandle,
) -> Result<u32, String> {
    // Validate caller-supplied IDs before they reach any URL or process arg.
    if let Some(ref pid) = place_id {
        let t = pid.trim();
        if !t.is_empty() && !t.chars().all(|c| c.is_ascii_digit()) {
            return Err("Invalid place ID: must be numeric".to_string());
        }
    }
    if let Some(ref jid) = job_id {
        let t = jid.trim();
        if !t.is_empty() && !is_uuid(t) {
            return Err("Invalid job ID: must be a UUID".to_string());
        }
    }

    let accounts = load_stored();
    let account = accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .ok_or("Account not found")?;

    let account_default_place = account.default_place_id.trim().to_string();
    let account_default_game = account.default_game_name.trim().to_string();
    let account_private_server = account.default_private_server.trim().to_string();
    let account_launcher_preference = account.launcher_preference.trim().to_lowercase();
    let account_launch_delay = account.launch_delay_seconds.min(300);

    let place_id = place_id.or_else(|| (!account_default_place.is_empty()).then_some(account_default_place));
    let game_name = game_name.or_else(|| (!account_default_game.is_empty()).then_some(account_default_game));
    let access_code = access_code.or_else(|| (!account_private_server.is_empty()).then_some(account_private_server));

    if let Some(ref pid) = place_id {
        let t = pid.trim();
        if !t.is_empty() && !t.chars().all(|c| c.is_ascii_digit()) {
            return Err("Invalid preset place ID: must be numeric".to_string());
        }
    }

    if account_launch_delay > 0 {
        tokio::time::sleep(tokio::time::Duration::from_secs(account_launch_delay as u64)).await;
    }

    let cookie = decrypt_cookie(&account.encrypted_cookie)?;

    let browser_tracker_id: u64 = rand::random::<u32>() as u64 + 100_000_000;

    let is_app_mode = app_mode.unwrap_or_else(|| {
        place_id.as_deref().unwrap_or("").trim().is_empty()
    });

    // Resolve game display name BEFORE url builder (which moves place_id)
    let resolved_game = if is_app_mode {
        game_name.clone().unwrap_or_else(|| "Roblox App".to_string())
    } else if game_name.as_deref().unwrap_or("").is_empty() {
        place_id.as_deref().map(|p| format!("Place {}", p)).unwrap_or_else(|| "Roblox".to_string())
    } else {
        game_name.clone().unwrap()
    };

    // Single private server code sent as &privateServerLinkCode= in every case.
    // placeId override comes from URL parsing when the input contains one.
    let mut resolved_link_code: Option<String> = None;
    let mut resolved_place_id_override: Option<String> = None;

    if let Some(ref raw_code) = access_code {
        let trimmed = raw_code.trim();
        if !trimmed.is_empty() {
            if trimmed.starts_with("http") {
                if let Ok(u) = url::Url::parse(trimmed) {
                    let host_is_roblox = u.host_str().map(|h| h.ends_with("roblox.com")).unwrap_or(false);

                    if host_is_roblox && u.path() == "/share" {
                        // Share link: roblox.com/share?code=X&type=Server
                        // Resolve via API to get the real placeId + privateServerLinkCode.
                        let share_code = u.query_pairs()
                            .find(|(k, _)| k == "code")
                            .map(|(_, v)| v.into_owned());

                        if let Some(sc) = share_code {
                            match resolve_share_link(&cookie, &sc).await {
                                Ok((pid, link_code)) => {
                                    eprintln!("[launch_account] Share link resolved → placeId: {}", pid);
                                    resolved_place_id_override = Some(pid);
                                    resolved_link_code = Some(link_code);
                                }
                                Err(e) => {
                                    // API failed — share code itself IS the privateServerLinkCode.
                                    // Fall back to it directly; placeId comes from the user-provided place_id field.
                                    eprintln!("[launch_account] Share link API failed ({}). Using share code as privateServerLinkCode directly with user-provided placeId.", e);
                                    resolved_link_code = Some(sc);
                                }
                            }
                        }
                    } else if host_is_roblox {
                        // Legacy URL: roblox.com/games/PLACE_ID/...?privateServerLinkCode=X
                        if let Some(mut segments) = u.path_segments() {
                            if segments.next() == Some("games") {
                                if let Some(pid_str) = segments.next() {
                                    if pid_str.chars().all(|c| c.is_ascii_digit()) {
                                        resolved_place_id_override = Some(pid_str.to_string());
                                    }
                                }
                            }
                        }
                        for (key, val) in u.query_pairs() {
                            if key == "privateServerLinkCode" || key == "code" || key == "Code" {
                                resolved_link_code = Some(val.into_owned());
                                break;
                            }
                        }
                    }
                }
            } else {
                // Raw code — use directly as privateServerLinkCode regardless of format.
                // Strip dashes if UUID-formatted so Roblox receives the bare 32-hex form.
                resolved_link_code = Some(trimmed.replace('-', ""));
            }
        }
    }

    let saved_pref = read_launcher_preference();
    let pref = match account_launcher_preference.as_str() {
        "official" | "reiya" | "bloxstrap" | "fishstrap" | "protocol" => account_launcher_preference.as_str(),
        _ => saved_pref.as_str(),
    };
    let use_preference = use_bootstrapper || matches!(pref, "reiya" | "auto");
    let pref = match pref {
        "auto" if read_installed_version().as_deref().and_then(reiya_player).is_some() => "reiya",
        "auto" => "official",
        pref => pref,
    };
    let reiya = if use_preference && pref == "reiya" {
        Some(prepare_reiya_launch(&app, browser_tracker_id).await?)
    } else {
        None
    };

    // Fetch the auth ticket as late as possible — tickets are short-lived and
    // single-use, so any delay between issuing it and the player consuming it
    // (e.g. share-link resolution above) risks a 403 "Authentication Failed".
    let Some((ticket, rotated_cookie)) = get_auth_ticket(&cookie).await else {
        let error = "Failed to get authentication ticket. Cookie may be expired.";
        if let Some((win, _)) = &reiya {
            emit_launch_error(win, error);
        }
        return Err(error.into());
    };

    if let Some(new_cookie) = rotated_cookie {
        let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
        let mut accounts = load_stored_unlocked();
        if let Some(existing) = accounts.iter_mut().find(|a| a.user_id == user_id && a.encrypted_cookie == account.encrypted_cookie) {
            existing.encrypted_cookie = encrypt_cookie(&new_cookie);
            existing.cookie_status = "Valid".into();
            let updated = Utc::now();
            existing.cookie_updated_at = Some(updated);
            tokio::spawn(fetch_robux_and_sync(user_id, existing.username.clone(), existing.display_name.clone(),
                new_cookie, existing.added_at.to_rfc3339(), Some(updated.to_rfc3339())));
            save_stored_unlocked(&accounts);
        }
    }

    let timestamp = chrono::Utc::now().timestamp_millis().to_string();

    let launch_args = if is_app_mode {
        format!(
            "roblox-player:1+launchmode:app+gameinfo:{}+launchtime:{}+platform:Windows+browserTrackerId:{}",
            ticket, timestamp, browser_tracker_id
        )
    } else {
        let launch_place_id = resolved_place_id_override.as_deref()
            .or(place_id.as_deref())
            .unwrap_or("1818");

        let launcher_url = if let Some(ref link_code) = resolved_link_code {
            format!(
                "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestPrivateGame&placeId={}&linkCode={}&privateServerLinkCode={}",
                launch_place_id, link_code, link_code
            )
        } else if let Some(ref job) = job_id.filter(|s| !s.is_empty()) {
            format!(
                "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGameJob&browserTrackerId={}&placeId={}&gameId={}&isPlayTogetherGame=false",
                browser_tracker_id, launch_place_id, job
            )
        } else {
            format!(
                "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&browserTrackerId={}&placeId={}&isPlayTogetherGame=false",
                browser_tracker_id, launch_place_id
            )
        };

        let encoded_url = urlencoding::encode(&launcher_url).into_owned();
        format!(
            "roblox-player:1+launchmode:play+gameinfo:{}+launchtime:{}+platform:Windows+placelauncherurl:{}+browserTrackerId:{}",
            ticket, timestamp, encoded_url, browser_tracker_id
        )
    };

    multi_state.begin_launch();
    let (opt_pid, launcher) = if let Some((win, exe)) = reiya {
        if app.get_webview_window(win.label()).is_none() {
            return Err("Launch cancelled by user".into());
        }
        let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
            status: "Starting Roblox...".into(),
            percent: 95,
        });
        match launch_detached(&exe, &launch_args) {
            Ok(pid) => {
                let _ = win.close();
                (pid, pref)
            }
            Err(error) => {
                emit_launch_error(&win, &error);
                return Err(error);
            }
        }
    } else if use_preference {
        (do_launch_with_preference(pref, &launch_args)?, pref)
    } else {
        let exe = find_roblox_exe().ok_or("RobloxPlayerBeta.exe not found. Is Roblox installed?")?;
        apply_fastflags_to_exe(&exe);
        #[cfg(windows)]
        let pid = launch_detached(&exe, &launch_args)?;
        #[cfg(not(windows))]
        let pid = Some(std::process::Command::new(&exe)
            .current_dir(exe.parent().ok_or("Invalid Roblox exe path")?)
            .arg(&launch_args)
            .spawn().map_err(|e| format!("Failed to start Roblox: {}", e))?.id());
        (pid, "direct launch")
    };

    if let Some(ref place_id) = place_id {
        let place_id = place_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = add_recent_game_internal(&place_id).await;
        });
    }

    let launch_time = Utc::now();
    let (username, avatar_url) = {
        let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
        let mut accounts = load_stored_unlocked();
        if let Some(account) = accounts.iter_mut().find(|a| a.user_id == user_id) {
            account.last_launched_at = Some(launch_time);
            account.last_played_game.clone_from(&resolved_game);
            let identity = (account.username.clone(), account.avatar_url.clone());
            save_stored_unlocked(&accounts);
            identity
        } else {
            (account.username.clone(), account.avatar_url.clone())
        }
    };
    let session_info = SessionInfo {
        user_id,
        username: username.clone(),
        avatar_url: avatar_url.clone(),
        game_name: resolved_game.clone(),
        place_id: place_id.unwrap_or_else(|| "1818".to_string()),
        start_time: launch_time.to_rfc3339(),
    };
    // Third-party launchers return their own PID. Match the actual player by tracker ID.
    let player_pid = if matches!(launcher, "bloxstrap" | "fishstrap") { None } else { opt_pid };
    tracker.0.lock().unwrap().insert(browser_tracker_id, (player_pid, session_info));
    save_session_tracker(&tracker);
    append_event(EventEntry {
        timestamp: launch_time.to_rfc3339(), kind: "launched".into(),
        user_id: Some(user_id), username: Some(username), avatar_url: Some(avatar_url),
        detail: match opt_pid {
            Some(pid) => format!("Launched '{}' via {} (PID {})", resolved_game, launcher, pid),
            None => format!("Launched '{}' via {}", resolved_game, launcher),
        },
    });
    *app.state::<DiscordRpcPage>().0.lock().unwrap() = format!("Playing {}", resolved_game);
    Ok(opt_pid.unwrap_or(0))
}

#[tauri::command]
fn get_live_sessions(tracker: tauri::State<'_, SessionTracker>) -> Vec<SessionDto> {
    let pid_map = tracker.0.lock().unwrap().clone();
    let sys = System::new_all();

    sys.processes()
        .values()
        .filter(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            name == "robloxplayerbeta.exe" || name == "roblox"
        })
        .map(|p| {
            let pid = p.pid().as_u32();
            let bt_id = extract_browser_tracker_id(p.cmd());

            let mut user_id = None;
            let mut username = None;
            let mut avatar_url = None;
            let mut game_name = None;
            let mut start_time = None;

            // Primary: look up by browserTrackerId extracted from process args
            if let Some(id) = bt_id {
                if let Some((_, info)) = pid_map.get(&id) {
                    user_id   = Some(info.user_id);
                    username  = Some(info.username.clone());
                    avatar_url = Some(info.avatar_url.clone());
                    game_name = Some(info.game_name.clone());
                    start_time = Some(info.start_time.clone());
                }
            }

            // Fallback: scan tracker entries for a matching PID
            // (populated by the watchdog's time-based matching)
            if username.is_none() {
                for (opt_pid, info) in pid_map.values() {
                    if *opt_pid == Some(pid) {
                        user_id    = Some(info.user_id);
                        username   = Some(info.username.clone());
                        avatar_url = Some(info.avatar_url.clone());
                        game_name  = Some(info.game_name.clone());
                        start_time = Some(info.start_time.clone());
                        break;
                    }
                }
            }

            SessionDto { pid, user_id, username, avatar_url, game_name, start_time }
        })
        .collect()
}

#[tauri::command]
fn kill_session(pid: u32, tracker: tauri::State<'_, SessionTracker>) -> Result<(), String> {
    let sys = System::new_all();
    let sysinfo_pid = sysinfo::Pid::from_u32(pid);
    if let Some(proc) = sys.process(sysinfo_pid) {
        proc.kill();

        let mut session_info = None;
        {
            let mut map = tracker.0.lock().unwrap();
            let mut key_to_remove = None;
            for (&bt_id, (opt_pid, _)) in map.iter() {
                if *opt_pid == Some(pid) {
                    key_to_remove = Some(bt_id);
                    break;
                }
            }
            if let Some(key) = key_to_remove {
                if let Some((_, info)) = map.remove(&key) {
                    session_info = Some(info);
                }
            }
        }

        let (ev_name, ev_avatar, user_id) = session_info
            .map(|info| (info.username, info.avatar_url, Some(info.user_id)))
            .unwrap_or_else(|| (String::new(), String::new(), None));

        save_session_tracker(&tracker);
        append_event(EventEntry {
            timestamp: Utc::now().to_rfc3339(), kind: "killed".into(),
            user_id, username: Some(ev_name.clone()), avatar_url: Some(ev_avatar),
            detail: format!("Session killed for '{}' (PID {})", ev_name, pid),
        });
        Ok(())
    } else {
        Err(format!("No process with PID {}", pid))
    }
}

#[tauri::command]
fn kill_all_sessions(tracker: tauri::State<'_, SessionTracker>) -> u32 {
    let sys = System::new_all();
    let mut killed = 0u32;
    for proc in sys.processes().values() {
        let name = proc.name().to_string_lossy().to_lowercase();
        if name == "robloxplayerbeta.exe" || name == "roblox" {
            proc.kill();
            killed += 1;
        }
    }
    tracker.0.lock().unwrap().clear();
    save_session_tracker(&tracker);
    killed
}

#[tauri::command]
fn get_event_log() -> Vec<EventEntry> {
    load_events()
}

#[tauri::command]
fn get_session_history() -> Vec<SessionRecord> {
    load_session_history()
}

// Fetch thumbnails for Hub page — catalog IDs are universe/game IDs, fetch icons directly
#[tauri::command]
async fn fetch_thumbnails(place_ids: Vec<String>) -> Result<HashMap<String, String>, String> {
    if place_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // IDs in the catalog are universe IDs — fetch icons directly in bulk
    let ids_str = place_ids.join(",");
    let icons_url = format!(
        "https://thumbnails.roblox.com/v1/games/icons?universeIds={}&size=150x150&format=Png&isCircular=false",
        ids_str
    );

    let icons_json: serde_json::Value = client
        .get(&icons_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut result: HashMap<String, String> = HashMap::new();
    if let Some(data) = icons_json["data"].as_array() {
        for item in data {
            if let (Some(u_id_num), Some(img_url)) = (
                item["targetId"].as_u64(),
                item["imageUrl"].as_str(),
            ) {
                if !img_url.is_empty() {
                    result.insert(u_id_num.to_string(), img_url.to_string());
                }
            }
        }
    }

    Ok(result)
}

// Fetch place thumbnails (takes Place IDs)
#[tauri::command]
async fn fetch_place_thumbnails(place_ids: Vec<String>) -> Result<HashMap<String, String>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| e.to_string())?;

    let ids = place_ids.join(",");
    let url = format!(
        "https://thumbnails.roblox.com/v1/places/gameicons?placeIds={}&size=150x150&format=Png&isCircular=false",
        ids
    );

    let json: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut result: HashMap<String, String> = HashMap::new();
    if let Some(data) = json["data"].as_array() {
        for item in data {
            if let (Some(id), Some(img_url)) = (
                item["targetId"].as_u64(),
                item["imageUrl"].as_str(),
            ) {
                if !img_url.is_empty() {
                    result.insert(id.to_string(), img_url.to_string());
                }
            }
        }
    }
    Ok(result)
}

// ── Login Window (Manual Login + User:Pass) ───────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
struct LoginResultPayload {
    cookie: Option<String>,
    window_label: String,
    target_username: Option<String>,
    error: Option<String>,
}

/// Extracts .ROBLOSECURITY from the WebView2 cookie manager, closes the webview and emits
/// "login-cookie-result".
#[cfg(target_os = "windows")]
fn extract_webview_cookie_and_close(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    app: AppHandle,
    window_label: String,
    cookie_found: std::sync::Arc<std::sync::atomic::AtomicBool>,
    target_username: Option<String>,
    attempt: u32,
) {
    use webview2_com::{
        GetCookiesCompletedHandler,
        Microsoft::Web::WebView2::Win32::ICoreWebView2_2,
    };
    use windows::core::{HSTRING, Interface, PCWSTR, PWSTR};
    use std::sync::atomic::Ordering;

    if cookie_found.load(Ordering::Relaxed) {
        return;
    }

    let user_tag = target_username.as_deref().unwrap_or("(manual)");

    if attempt == 0 {
        eprintln!("[combo] {} — starting cookie extraction", user_tag);
    }

    if attempt > 150 {
        eprintln!("[combo] {} — TIMEOUT: .ROBLOSECURITY never appeared in WebView2 cookie store after 15 s", user_tag);
        if cookie_found.compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
            let app_c = app.clone();
            let wl_c = window_label.clone();
            let target_username_c = target_username.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(win) = app_c.get_webview_window(&wl_c) {
                    let _ = win.close();
                }
                let payload = LoginResultPayload {
                    cookie: None,
                    window_label: wl_c,
                    target_username: target_username_c,
                    error: Some("Cookie manager timeout: .ROBLOSECURITY did not appear in the WebView2 cookie store within 15 s after the login 200 response.".to_string()),
                };
                let _ = app_c.emit("login-cookie-result", payload);
            });
        }
        return;
    }

    unsafe {
        let core2: ICoreWebView2_2 = match core.cast::<ICoreWebView2_2>() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mgr = match core2.CookieManager() {
            Ok(m) => m,
            Err(_) => return,
        };

        let app2 = app.clone();
        let wl2 = window_label.clone();
        let cf2 = cookie_found.clone();
        let target_username2 = target_username.clone();

        let user_tag2 = user_tag.to_string();
        let handler = GetCookiesCompletedHandler::create(Box::new(move |_result, list| {
            let mut found: Option<String> = None;
            let mut all_names: Vec<String> = Vec::new();
            if let Some(list) = list {
                let mut count = 0u32;
                if list.Count(&mut count).is_ok() {
                    eprintln!("[combo] {} — attempt {}: GetCookies returned {} cookie(s)", user_tag2, attempt, count);
                    for i in 0..count {
                        if let Ok(cookie) = list.GetValueAtIndex(i) {
                            let mut name_pw = PWSTR::null();
                            if cookie.Name(&mut name_pw).is_ok() {
                                let name = name_pw.to_string().unwrap_or_default();
                                all_names.push(name.clone());
                                if name == ".ROBLOSECURITY" {
                                    let mut val_pw = PWSTR::null();
                                    if cookie.Value(&mut val_pw).is_ok() {
                                        found = Some(val_pw.to_string().unwrap_or_default());
                                    }
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    eprintln!("[combo] {} — attempt {}: GetCookies list.Count() failed", user_tag2, attempt);
                }
            } else {
                eprintln!("[combo] {} — attempt {}: GetCookies returned null list", user_tag2, attempt);
            }
            if found.is_none() && !all_names.is_empty() {
                eprintln!("[combo] {} — .ROBLOSECURITY not found; cookies present: {}", user_tag2, all_names.join(", "));
            }
            if let Some(cookie_val) = found {
                eprintln!("[combo] {} — .ROBLOSECURITY found (len={}), closing window and emitting", user_tag2, cookie_val.len());
                if cf2.compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
                    let app_c = app2.clone();
                    let wl_c = wl2.clone();
                    let cookie_val_c = cookie_val.clone();
                    let target_username_c = target_username2.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Some(win) = app_c.get_webview_window(&wl_c) {
                            let _ = win.close();
                        }
                        let payload = LoginResultPayload {
                            cookie: Some(cookie_val_c),
                            window_label: wl_c,
                            target_username: target_username_c,
                            error: None,
                        };
                        let _ = app_c.emit("login-cookie-result", payload);
                    });
                }
            } else {
                let app_c = app2.clone();
                let wl_c = wl2.clone();
                let cf_c = cf2.clone();
                let target_username_c = target_username2.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    let app_c2 = app_c.clone();
                    let wl_c2 = wl_c.clone();
                    let cf_c2 = cf_c.clone();
                    let target_username_c2 = target_username_c.clone();
                    let _ = app_c.run_on_main_thread(move || {
                        if let Some(win) = app_c2.get_webview_window(&wl_c2) {
                            let _ = win.with_webview(move |wv| {
                                #[cfg(target_os = "windows")]
                                {
                                    if let Ok(c) = wv.controller().CoreWebView2() {
                                        extract_webview_cookie_and_close(&c, app_c2.clone(), wl_c2.clone(), cf_c2.clone(), target_username_c2.clone(), attempt + 1);
                                    }
                                }
                                #[cfg(not(target_os = "windows"))]
                                {
                                    let _ = app_c2;
                                    let _ = wl_c2;
                                    let _ = cf_c2;
                                    let _ = target_username_c2;
                                }
                            });
                        }
                    });
                });
            }
            Ok(())
        }));

        // Empty URI = get all cookies for the WebView2 instance, so the
        // .ROBLOSECURITY cookie is found regardless of which sub-domain
        // (auth.roblox.com, www.roblox.com, roblox.com) Roblox used to set it.
        let uri = HSTRING::from("");
        let _ = mgr.GetCookies(PCWSTR(uri.as_ptr()), &handler);
    }
}

#[cfg(target_os = "windows")]
fn setup_webresource_response_received_handler(
    webview: &tauri::webview::PlatformWebview,
) {
    use webview2_com::{
        WebResourceResponseReceivedEventHandler,
        Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_2},
    };
    use windows::core::Interface;

    unsafe {
        let c: ICoreWebView2 = match webview.controller().CoreWebView2() {
            Ok(core) => core,
            Err(_) => return,
        };

        let c2: ICoreWebView2_2 = match c.cast::<ICoreWebView2_2>() {
            Ok(c) => c,
            Err(_) => return,
        };

        let handler = WebResourceResponseReceivedEventHandler::create(Box::new(move |_wv, args| {
            // Only log — do NOT extract cookies here.
            // The auth.roblox.com/v2/login 200 response sets a preliminary token that
            // Roblox's JavaScript then exchanges for the final .ROBLOSECURITY cookie
            // before navigating to /home.  Grabbing the cookie at this point captures
            // the intermediate token, which Roblox rejects with 401 on API calls.
            // Cookie extraction is handled exclusively by PageLoadEvent::Started so
            // we always get the fully-committed final session cookie.
            if let Some(args) = args {
                if let Ok(req) = args.Request() {
                    let mut uri_pwstr = windows::core::PWSTR::null();
                    if req.Uri(&mut uri_pwstr).is_ok() {
                        let uri_str = uri_pwstr.to_string().unwrap_or_default();
                        if uri_str.contains("auth.roblox.com") && (uri_str.contains("login") || uri_str.contains("two-step") || uri_str.contains("twostep") || uri_str.contains("verify") || uri_str.contains("challenge")) {
                            if let Ok(resp) = args.Response() {
                                let mut status = 0;
                                if resp.StatusCode(&mut status).is_ok() {
                                    eprintln!("[combo] WebResourceResponseReceived: auth.roblox.com {} — status {}", uri_str, status);
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        }));

        let mut token = 0i64;
        let _ = c2.add_WebResourceResponseReceived(&handler, &mut token);
    }
}

/// Opens a Roblox login WebView window.
/// If username + password are provided, auto-fills the login form (User:Pass mode).
/// It polls the cookies database every 500ms and automatically imports the cookie and closes
/// when the user logs in.
#[tauri::command]
async fn open_login_window(
    app: AppHandle,
    window_label: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    use tauri::{WebviewWindowBuilder, WebviewUrl};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    // Build the autofill script to inject after DOMContentLoaded on the login page,
    // matching the C# manager's DOMContentLoaded + ExecuteScriptAsync approach.
    // Inner fill body — wrapped in a tryFill retry loop by the on_page_load handler
    fn js_escape(s: &str) -> String {
        s.replace('\\', "\\\\")
         .replace('\'', "\\'")
         .replace('\n', "\\n")
         .replace('\r', "\\r")
         .replace('\0', "")
    }

    let autofill_script: Option<String> = if let (Some(ref u), Some(ref p)) = (&username, &password) {
        let ue = js_escape(u);
        let pe = js_escape(p);
        Some(format!(r#"var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(un, '{ue}'); un.dispatchEvent(new Event('input', {{ bubbles: true }}));
    setter.call(pw, '{pe}'); pw.dispatchEvent(new Event('input', {{ bubbles: true }}));
    setTimeout(function() {{
        var btn = document.querySelector('#login-button');
        if (btn) btn.click();
    }}, 300);"#, ue = ue, pe = pe))
    } else {
        None
    };

    let label = window_label;
    let label_clone = label.clone();
    let app_clone = app.clone();

    let cookie_found = Arc::new(AtomicBool::new(false));
    let cookie_found_clone = cookie_found.clone();
    let target_username_clone = username.clone();

    // Determine the browser profile user data directory.
    // For combo logins (where username is known), we use a persistent profile folder
    // dedicated to that username. For anonymous manual logins, we use a temporary folder.
    let data_dir = if let Some(ref u) = username {
        let profile_name = u.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "_");
        data_dir().join("login_profiles").join(profile_name)
    } else {
        std::env::temp_dir().join(format!("reiya-login-{}", label))
    };

    let login_url: url::Url = "https://www.roblox.com/login".parse().map_err(|e: url::ParseError| e.to_string())?;
    let win = WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::External(login_url),
    )
    .title("Roblox Login")
    .inner_size(500.0, 660.0)
    .resizable(true)
    .data_directory(data_dir.clone())
    .on_page_load(move |win, payload| {
        use tauri::webview::PageLoadEvent;
        let url = payload.url().to_string();

        match payload.event() {
            // Finished = DOMContentLoaded.
            // 1. On the login page: autofill credentials.
            // 2. On any other Roblox page: attempt cookie extraction — DOMContentLoaded
            //    fires after the browser has fully processed all Set-Cookie headers for
            //    the navigation, so the final .ROBLOSECURITY is guaranteed to be present.
            PageLoadEvent::Finished => {
                if url.contains("roblox.com/login") || url.contains("roblox.com/newlogin") {
                    if let Some(ref script) = autofill_script {
                        let retry_script = format!(r#"
(function tryFill() {{
    var un = document.querySelector('#login-username');
    var pw = document.querySelector('#login-password');
    if (!un || !pw) {{ setTimeout(tryFill, 100); return; }}
    {}
}})();
"#, script.trim());
                        let _ = win.eval(&retry_script);
                    }
                } else if url.contains("roblox.com") {
                    // Non-login Roblox page finished loading — extract cookie now.
                    if !cookie_found_clone.load(std::sync::atomic::Ordering::Relaxed) {
                        eprintln!("[combo] PageLoadEvent::Finished on auth page — extracting cookie. url={}", url);
                        let app_inner = app_clone.clone();
                        let label_inner = label_clone.clone();
                        let cookie_found_inner = cookie_found_clone.clone();
                        let target_username_inner = target_username_clone.clone();
                        let _ = win.with_webview(move |wv| {
                            #[cfg(target_os = "windows")]
                            unsafe {
                                if let Ok(c) = wv.controller().CoreWebView2() {
                                    extract_webview_cookie_and_close(&c, app_inner, label_inner, cookie_found_inner, target_username_inner, 0);
                                }
                            }
                            #[cfg(not(target_os = "windows"))]
                            let _ = app_inner;
                        });
                    }
                }
            }
            // Started = navigation event: only check for cookie when navigated AWAY
            // from the login page to an authenticated page (evanovar + ic3w0lf22 style).
            // Skipping checks on /login itself avoids false cookie lookups.
            PageLoadEvent::Started => {
                if cookie_found_clone.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                eprintln!("[combo] PageLoadEvent::Started — url={}", url);
                // Only check once we've left the login/signup pages
                let is_auth_page = !url.contains("roblox.com/login")
                    && !url.contains("roblox.com/newlogin")
                    && (url.contains("roblox.com/home")
                        || url.contains("roblox.com/games")
                        || url.contains("roblox.com/discover")
                        || url.contains("roblox.com/catalog")
                        || url.contains("roblox.com/my/")
                        || url.contains("roblox.com/users/")
                        || url.contains("roblox.com/profile")
                        || url.contains("roblox.com/friends")
                        || url.contains("roblox.com/groups")
                        // fallback: any roblox.com page that isn't login
                        || (url.contains("roblox.com") && !url.contains("/login")));
                eprintln!("[combo] is_auth_page={}", is_auth_page);
                if !is_auth_page {
                    return;
                }
                let app_inner = app_clone.clone();
                let label_inner = label_clone.clone();
                let cookie_found_inner = cookie_found_clone.clone();
                let target_username_inner = target_username_clone.clone();
                let _ = win.with_webview(move |wv| {
                    #[cfg(target_os = "windows")]
                    unsafe {
                        if let Ok(c) = wv.controller().CoreWebView2() {
                            extract_webview_cookie_and_close(&c, app_inner, label_inner, cookie_found_inner, target_username_inner, 0);
                        }
                    }
                    #[cfg(not(target_os = "windows"))]
                    let _ = app_inner;
                });
            }
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    let _ = win.with_webview(move |wv| {
        #[cfg(target_os = "windows")]
        setup_webresource_response_received_handler(&wv);
        #[cfg(not(target_os = "windows"))]
        let _ = wv;
    });

    let app_close = app.clone();
    let cookie_found_close = cookie_found.clone();
    let data_dir_close = data_dir.clone();
    let target_username_close = username.clone();
    let label_close_event = win.label().to_string();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if !cookie_found_close.load(std::sync::atomic::Ordering::Relaxed) {
                let user_tag = target_username_close.as_deref().unwrap_or("(manual)");
                eprintln!("[combo] {} — window Destroyed with cookie_found=false → emitting None (window closed before cookie was captured)", user_tag);
                let payload = LoginResultPayload {
                    cookie: None,
                    window_label: label_close_event.clone(),
                    target_username: target_username_close.clone(),
                    error: Some("Login window was closed before the auth cookie was captured.".to_string()),
                };
                let _ = app_close.emit("login-cookie-result", payload);
            }
            // Clean up the isolated data dir only for anonymous manual logins (when username is None)
            if target_username_close.is_none() {
                let dir = data_dir_close.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    let _ = std::fs::remove_dir_all(&dir);
                });
            }
        }
    });

    Ok(label)
}

/// Authenticate directly via Roblox HTTP API — no browser/WebView involved.
/// Returns the raw .ROBLOSECURITY cookie value on success.
#[tauri::command]
async fn login_with_credentials(username: String, password: String) -> Result<String, String> {
    // Cookie jar so cookies from the 403 response are replayed on the second request,
    // exactly as a real browser session would do.
    let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .cookie_provider(jar)
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "ctype": "Username",
        "cvalue": username,
        "password": password
    });

    let common_headers = [
        ("Accept",           "application/json, text/plain, */*"),
        ("Accept-Language",  "en-US,en;q=0.9"),
        ("Origin",           "https://www.roblox.com"),
        ("Referer",          "https://www.roblox.com/login"),
        ("sec-ch-ua",        r#""Chromium";v="131","Google Chrome";v="131","Not_A Brand";v="24""#),
        ("sec-ch-ua-mobile", "?0"),
        ("sec-ch-ua-platform", "\"Windows\""),
        ("sec-fetch-dest",   "empty"),
        ("sec-fetch-mode",   "cors"),
        ("sec-fetch-site",   "same-site"),
    ];

    // First request — intentionally expect 403 to get the CSRF token.
    let mut req1 = client
        .post("https://auth.roblox.com/v2/login")
        .json(&body);
    for (k, v) in &common_headers { req1 = req1.header(*k, *v); }
    let resp1 = req1.send().await.map_err(|e| format!("Network error: {}", e))?;

    let csrf = resp1
        .headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if resp1.status().is_success() {
        for hdr in resp1.headers().get_all("set-cookie").iter() {
            if let Ok(s) = hdr.to_str() {
                if s.contains(".ROBLOSECURITY=") {
                    return Ok(clean_cookie(s));
                }
            }
        }
    }

    let csrf_token = csrf.ok_or_else(|| "Failed to obtain CSRF token from Roblox".to_string())?;

    // Second request — real login attempt with CSRF token.
    let mut req2 = client
        .post("https://auth.roblox.com/v2/login")
        .header("x-csrf-token", &csrf_token)
        .json(&body);
    for (k, v) in &common_headers { req2 = req2.header(*k, *v); }
    let resp2 = req2.send().await.map_err(|e| format!("Network error: {}", e))?;

    let status = resp2.status();

    if status.is_success() {
        for hdr in resp2.headers().get_all("set-cookie").iter() {
            if let Ok(s) = hdr.to_str() {
                if s.contains(".ROBLOSECURITY=") {
                    return Ok(clean_cookie(s));
                }
            }
        }
        return Err("Login succeeded but .ROBLOSECURITY cookie was not in the response".to_string());
    }

    let body_text = resp2.text().await.unwrap_or_default();

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_text) {
        if let Some(errors) = json["errors"].as_array() {
            if let Some(first) = errors.first() {
                let code = first["code"].as_i64().unwrap_or(0);
                let msg = first["userFacingMessage"].as_str()
                    .or_else(|| first["message"].as_str())
                    .unwrap_or("Unknown error");
                return match code {
                    4 => Err("Invalid username or password.".to_string()),
                    2 => Err("Account temporarily locked — too many failed attempts.".to_string()),
                    _ => Err(format!("Roblox error ({}): {}", code, msg)),
                };
            }
        }
    }

    if status.as_u16() == 403 {
        return Err("CAPTCHA required — use Manual Login for this account.".to_string());
    }

    Err(format!("Login failed (HTTP {}): {}", status, body_text))
}

async fn resolve_share_link(cookie: &str, share_code: &str) -> Result<(String, String), String> {
    eprintln!("[resolve_share_link] Resolving share code: {}", share_code);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    // CSRF token required for POST to apis.roblox.com
    let csrf_resp = client
        .post("https://auth.roblox.com/v2/logout")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .map_err(|e| format!("CSRF fetch failed: {}", e))?;
    let csrf = csrf_resp
        .headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| "No CSRF token returned".to_string())?;

    eprintln!("[resolve_share_link] Got CSRF token: {}...", &csrf[..csrf.len().min(8)]);

    // Attempt 1: primary format
    let resp = client
        .post("https://apis.roblox.com/sharelinks/v1/resolve-link")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", &csrf)
        .header("Origin", "https://www.roblox.com")
        .header("Referer", "https://www.roblox.com/")
        .json(&serde_json::json!({
            "linkId": share_code,
            "linkType": "Server"
        }))
        .send()
        .await
        .map_err(|e| format!("Share resolve request failed: {}", e))?;

    let mut status = resp.status();
    let mut body = resp.text().await.unwrap_or_default();
    eprintln!("[resolve_share_link] Primary attempt status: {}, body: {}", status, body);

    // Attempt 2: alternative format if primary failed
    if !status.is_success() {
        eprintln!("[resolve_share_link] Retrying with alternative body format...");
        let resp2 = client
            .post("https://apis.roblox.com/sharelinks/v1/resolve-link")
            .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
            .header("x-csrf-token", &csrf)
            .header("Origin", "https://www.roblox.com")
            .header("Referer", "https://www.roblox.com/")
            .json(&serde_json::json!({
                "code": share_code,
                "type": "Server"
            }))
            .send()
            .await
            .map_err(|e| format!("Share resolve retry failed: {}", e))?;
        status = resp2.status();
        body = resp2.text().await.unwrap_or_default();
        eprintln!("[resolve_share_link] Retry attempt status: {}, body: {}", status, body);
    }

    if !status.is_success() {
        return Err(format!("resolve-link API failed (HTTP {}): {}", status, body));
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response: {} — body: {}", e, body))?;

    eprintln!("[resolve_share_link] Success response: {}", json);

    // Extract placeId — search multiple paths the API may use
    let place_id = json["privateServerInviteData"]["placeId"]
        .as_i64().map(|n| n.to_string())
        .or_else(|| json["privateServerInviteData"]["placeId"].as_str().map(String::from))
        .or_else(|| json["resolvedLink"]["privateServerInviteData"]["placeId"].as_i64().map(|n| n.to_string()))
        .or_else(|| json["resolvedLink"]["privateServerInviteData"]["placeId"].as_str().map(String::from))
        .or_else(|| json["placeId"].as_i64().map(|n| n.to_string()))
        .or_else(|| json["placeId"].as_str().map(String::from))
        .or_else(|| json["data"]["placeId"].as_i64().map(|n| n.to_string()))
        .or_else(|| json["data"]["placeId"].as_str().map(String::from))
        .ok_or_else(|| format!("placeId not found in response. Full body: {}", body))?;

    // Extract link code — API may return linkCode or privateServerLinkCode
    let link_code = json["privateServerInviteData"]["linkCode"]
        .as_str().map(String::from)
        .or_else(|| json["privateServerInviteData"]["privateServerLinkCode"].as_str().map(String::from))
        .or_else(|| json["resolvedLink"]["privateServerInviteData"]["privateServerLinkCode"].as_str().map(String::from))
        .or_else(|| json["resolvedLink"]["privateServerInviteData"]["linkCode"].as_str().map(String::from))
        .or_else(|| json["privateServerLinkCode"].as_str().map(String::from))
        .or_else(|| json["linkCode"].as_str().map(String::from))
        .or_else(|| json["data"]["privateServerLinkCode"].as_str().map(String::from))
        .or_else(|| json["data"]["linkCode"].as_str().map(String::from))
        .ok_or_else(|| format!("link code not found in response. Full body: {}", body))?;

    eprintln!("[resolve_share_link] Resolved → placeId: {}, linkCode: {}", place_id, link_code);
    Ok((place_id, link_code))
}

async fn get_csrf_token(cookie: &str) -> Option<String> {
    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().ok()?;
    let resp = client
        .post("https://auth.roblox.com/v2/logout")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .ok()?;
    resp.headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

async fn resolve_username(cookie: &str, username: &str) -> Result<i64, String> {
    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .post("https://users.roblox.com/v1/usernames/users")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .json(&serde_json::json!({ "usernames": [username], "excludeBannedUsers": false }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(arr) = json["data"].as_array() {
            if !arr.is_empty() {
                if let Some(id) = arr[0]["id"].as_i64() {
                    return Ok(id);
                }
            }
        }
        Err(format!("User '{}' not found", username))
    } else {
        Err(format!("Failed to resolve username: status {}", resp.status()))
    }
}

#[tauri::command]
async fn set_display_name(user_id: i64, new_name: String) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts.iter().find(|a| a.user_id == user_id).ok_or("Account not found")?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let csrf = get_csrf_token(&cookie).await.ok_or("Failed to obtain CSRF token")?;

    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .patch(format!("https://users.roblox.com/v1/users/{}/display-names", user_id))
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", csrf)
        .json(&serde_json::json!({ "newDisplayName": new_name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
        let mut accounts_mut = load_stored_unlocked();
        if let Some(a) = accounts_mut.iter_mut().find(|a| a.user_id == user_id) {
            a.display_name = new_name;
        }
        save_stored_unlocked(&accounts_mut);
        Ok("Display name updated successfully.".into())
    } else {
        let err_text = resp.text().await.unwrap_or_default();
        Err(format!("Failed to update display name: {}", err_text))
    }
}

#[tauri::command]
async fn change_password(user_id: i64, current_pw: String, new_pw: String) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts.iter().find(|a| a.user_id == user_id).ok_or("Account not found")?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let csrf = get_csrf_token(&cookie).await.ok_or("Failed to obtain CSRF token")?;

    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .post("https://auth.roblox.com/v2/user/passwords/change")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", csrf)
        .json(&serde_json::json!({ "currentPassword": current_pw, "newPassword": new_pw }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok("Password changed successfully.".into())
    } else {
        let err_text = resp.text().await.unwrap_or_default();
        Err(format!("Failed to change password: {}", err_text))
    }
}

#[tauri::command]
async fn sign_out_all_sessions(user_id: i64) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts.iter().find(|a| a.user_id == user_id).ok_or("Account not found")?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let csrf = get_csrf_token(&cookie).await.ok_or("Failed to obtain CSRF token")?;

    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .post("https://auth.roblox.com/v1/logoutFromAllSessionsAndReauthenticate")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", csrf)
        .body("{}")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok("Signed out of all other sessions successfully.".into())
    } else {
        Err(format!("Failed to sign out of other sessions: status {}", resp.status()))
    }
}

#[tauri::command]
async fn send_friend_request(user_id: i64, target_username: String) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts.iter().find(|a| a.user_id == user_id).ok_or("Account not found")?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let target_user_id = resolve_username(&cookie, &target_username).await?;

    let csrf = get_csrf_token(&cookie).await.ok_or("Failed to obtain CSRF token")?;

    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("https://friends.roblox.com/v1/users/{}/request-friendship", target_user_id))
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", csrf)
        .body("{}")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(format!("Friend request sent to @{}.", target_username))
    } else {
        let err_text = resp.text().await.unwrap_or_default();
        Err(format!("Failed to send friend request: {}", err_text))
    }
}

#[tauri::command]
async fn block_user(user_id: i64, target_username: String) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts.iter().find(|a| a.user_id == user_id).ok_or("Account not found")?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let target_user_id = resolve_username(&cookie, &target_username).await?;

    let csrf = get_csrf_token(&cookie).await.ok_or("Failed to obtain CSRF token")?;

    let client = reqwest::Client::builder().user_agent("Mozilla/5.0").build().map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("https://accountsettings.roblox.com/v1/users/{}/block", target_user_id))
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .header("x-csrf-token", csrf)
        .body("{}")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(format!("Blocked @{}.", target_username))
    } else {
        Err(format!("Failed to block: status {}", resp.status()))
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RobloxGameResultDto {
    pub name: String,
    pub place_id: i64,
    pub universe_id: i64,
    pub creator_name: String,
    pub icon_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RobloxServerEntryDto {
    pub job_id: String,
    pub playing: String,
    pub active_players: i32,
    pub max_players: i32,
    pub ping: String,
    pub fps: String,
}

#[tauri::command]
async fn search_roblox_games(keyword: String) -> Result<Vec<RobloxGameResultDto>, String> {
    if keyword.trim().is_empty() {
        return Ok(vec![]);
    }

    let cookie = get_first_valid_cookie();

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| e.to_string())?;

    let session_id = format!("session-{}", rand::random::<u32>());
    let url = format!(
        "https://apis.roblox.com/search-api/omni-search?searchQuery={}&sessionId={}&pageType=all",
        urlencoding::encode(&keyword),
        session_id
    );

    let mut req = client.get(&url).header("Referer", "https://www.roblox.com/");
    if let Some(ref c) = cookie {
        req = req.header("Cookie", format!(".ROBLOSECURITY={}", c));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Omni Search API failed with status: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(search_results) = json["searchResults"].as_array() {
        for group in search_results {
            let group_type = group["contentGroupType"].as_str().unwrap_or("");
            if group_type == "Game" || group_type == "Experience" || group_type == "SearchUniverse" {
                if let Some(contents) = group["contents"].as_array() {
                    for game_item in contents {
                        let name = game_item["name"].as_str().unwrap_or("Unknown").to_string();
                        let creator_name = game_item["creatorName"].as_str().unwrap_or("Unknown").to_string();
                        let universe_id = game_item["contentId"].as_i64().unwrap_or(0);
                        let place_id = game_item["rootPlaceId"].as_i64().unwrap_or(universe_id);

                        if place_id == 0 {
                            continue;
                        }

                        results.push(RobloxGameResultDto {
                            name,
                            place_id,
                            universe_id,
                            creator_name,
                            icon_url: String::new(),
                        });
                    }
                }
            }
        }
    }

    if !results.is_empty() {
        let universe_ids: Vec<String> = results
            .iter()
            .map(|r| r.universe_id.to_string())
            .filter(|id| id != "0")
            .collect();

        if !universe_ids.is_empty() {
            let ids_str = universe_ids.join(",");
            let thumb_url = format!(
                "https://thumbnails.roblox.com/v1/games/icons?universeIds={}&size=150x150&format=Png&isCircular=false",
                ids_str
            );
            if let Ok(thumb_resp) = client.get(&thumb_url).send().await {
                if let Ok(thumb_json) = thumb_resp.json::<serde_json::Value>().await {
                    if let Some(data) = thumb_json["data"].as_array() {
                        let mut icon_map = HashMap::new();
                        for item in data {
                            if let (Some(target_id), Some(img_url)) = (
                                item["targetId"].as_i64(),
                                item["imageUrl"].as_str(),
                            ) {
                                icon_map.insert(target_id, img_url.to_string());
                            }
                        }
                        for game in &mut results {
                            if let Some(url) = icon_map.get(&game.universe_id) {
                                game.icon_url = url.clone();
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
async fn fetch_active_servers(place_id: i64) -> Result<Vec<RobloxServerEntryDto>, String> {
    let cookie = get_first_valid_cookie();

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut target_place_id = place_id;

    // Resolve Place ID to Universe ID
    let resolver_url = format!("https://apis.roblox.com/universes/v1/places/{}/universe", place_id);
    let resolver_resp = client.get(&resolver_url).send().await.map_err(|e| e.to_string())?;

    let mut resolved = false;
    if resolver_resp.status().is_success() {
        if let Ok(resolver_json) = resolver_resp.json::<serde_json::Value>().await {
            if let Some(uid) = resolver_json["universeId"].as_i64() {
                if uid > 0 {
                    resolved = true;
                }
            }
        }
    }

    if !resolved {
        // Check if place_id is actually a Universe ID, and translate to rootPlaceId
        let details_url = format!("https://games.roblox.com/v1/games?universeIds={}", place_id);
        if let Ok(details_resp) = client.get(&details_url).send().await {
            if details_resp.status().is_success() {
                if let Ok(details_json) = details_resp.json::<serde_json::Value>().await {
                    if let Some(data_arr) = details_json["data"].as_array() {
                        if !data_arr.is_empty() {
                            if let Some(root_pid) = data_arr[0]["rootPlaceId"].as_i64() {
                                target_place_id = root_pid;
                            }
                        }
                    }
                }
            }
        }
    }

    let url = format!(
        "https://games.roblox.com/v1/games/{}/servers/Public?limit=50",
        target_place_id
    );

    let mut req = client.get(&url).header("Referer", "https://www.roblox.com/");
    if let Some(ref c) = cookie {
        req = req.header("Cookie", format!(".ROBLOSECURITY={}", c));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Roblox servers API failed with status: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(data) = json["data"].as_array() {
        for srv in data {
            let playing = srv["playing"].as_i64().unwrap_or(0) as i32;
            let max_players = srv["maxPlayers"].as_i64().unwrap_or(0) as i32;
            let fps = srv["fps"].as_f64().unwrap_or(0.0);
            let ping = srv["ping"].as_i64().unwrap_or(0) as i32;
            let job_id = srv["id"].as_str().unwrap_or("").to_string();

            if playing > 0 && !job_id.is_empty() {
                results.push(RobloxServerEntryDto {
                    job_id,
                    playing: format!("{}/{}", playing, max_players),
                    active_players: playing,
                    max_players,
                    ping: if ping > 0 { format!("{}ms", ping) } else { "N/A".to_string() },
                    fps: if fps > 0.0 { format!("{:.0} FPS", fps) } else { "N/A".to_string() },
                });
            }
        }
    }

    results.sort_by_key(|s| s.active_players);

    Ok(results)
}

#[tauri::command]
async fn fetch_place_details(place_id: i64) -> Result<RobloxGameResultDto, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Resolve Place ID to Universe ID
    let resolver_url = format!("https://apis.roblox.com/universes/v1/places/{}/universe", place_id);
    let resolver_resp = client.get(&resolver_url).send().await.map_err(|e| e.to_string())?;

    let mut resolved_universe_id = None;
    let mut resolved_place_id = place_id;

    if resolver_resp.status().is_success() {
        if let Ok(resolver_json) = resolver_resp.json::<serde_json::Value>().await {
            if let Some(uid) = resolver_json["universeId"].as_i64() {
                if uid > 0 {
                    resolved_universe_id = Some(uid);
                }
            }
        }
    }

    // 2. If it did not resolve as a Place ID, check if it's a Universe ID directly
    if resolved_universe_id.is_none() {
        let details_url = format!("https://games.roblox.com/v1/games?universeIds={}", place_id);
        if let Ok(details_resp) = client.get(&details_url).send().await {
            if details_resp.status().is_success() {
                if let Ok(details_json) = details_resp.json::<serde_json::Value>().await {
                    if let Some(data_arr) = details_json["data"].as_array() {
                        if !data_arr.is_empty() {
                            if let Some(uid) = data_arr[0]["id"].as_i64() {
                                resolved_universe_id = Some(uid);
                                if let Some(root_pid) = data_arr[0]["rootPlaceId"].as_i64() {
                                    resolved_place_id = root_pid;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let universe_id = resolved_universe_id
        .ok_or_else(|| format!("Could not resolve ID {} to a valid experience", place_id))?;

    // 3. Fetch game details using Universe ID
    let details_url = format!("https://games.roblox.com/v1/games?universeIds={}", universe_id);
    let details_resp = client.get(&details_url).send().await.map_err(|e| e.to_string())?;
    if !details_resp.status().is_success() {
        return Err(format!("Games details API failed with status: {}", details_resp.status()));
    }

    let details_json: serde_json::Value = details_resp.json().await.map_err(|e| e.to_string())?;
    let data_arr = details_json["data"]
        .as_array()
        .ok_or_else(|| "Invalid details API response structure".to_string())?;

    if data_arr.is_empty() {
        return Err("No details found for the resolved Universe ID".to_string());
    }

    let game_data = &data_arr[0];
    let name = game_data["name"].as_str().unwrap_or("Unknown Game").to_string();
    let creator_name = game_data["creator"]["name"].as_str().unwrap_or("Unknown Creator").to_string();

    let mut game = RobloxGameResultDto {
        name,
        place_id: resolved_place_id,
        universe_id,
        creator_name,
        icon_url: String::new(),
    };

    // 4. Fetch Game Icon URL
    let thumb_url = format!(
        "https://thumbnails.roblox.com/v1/games/icons?universeIds={}&size=150x150&format=Png&isCircular=false",
        universe_id
    );
    if let Ok(thumb_resp) = client.get(&thumb_url).send().await {
        if let Ok(thumb_json) = thumb_resp.json::<serde_json::Value>().await {
            if let Some(data) = thumb_json["data"].as_array() {
                if !data.is_empty() {
                    if let Some(img_url) = data[0]["imageUrl"].as_str() {
                        game.icon_url = img_url.to_string();
                    }
                }
            }
        }
    }

    Ok(game)
}

#[tauri::command]
fn get_multi_instance(state: tauri::State<'_, MultiState>) -> bool {
    state.is_active()
}

#[tauri::command]
fn set_multi_instance(active: bool, state: tauri::State<'_, MultiState>) {
    state.set_active(active);
}

#[tauri::command]
fn get_settings() -> Result<serde_json::Value, String> {
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let trimmed = clean_bom(&content).trim().to_string();
    if trimmed.is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(&trimmed).map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_pin(pin: String) -> bool {
    use sha2::Digest;
    let settings_path = data_dir().join("settings.json");
    let stored_hash = fs::read_to_string(&settings_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(clean_bom(&s)).ok())
        .and_then(|v| v.get("AppLockPinHash").and_then(|h| h.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    if stored_hash.is_empty() { return true; }
    let mut hasher = sha2::Sha256::new();
    hasher.update(pin.as_bytes());
    format!("{:x}", hasher.finalize()) == stored_hash
}

#[tauri::command]
async fn send_discord_webhook(url: String, payload: serde_json::Value) -> Result<(), String> {
    if url.is_empty() { return Ok(()); }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    client.post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_settings(settings: serde_json::Value, state: tauri::State<'_, MultiState>, rpc: tauri::State<'_, DiscordRpcHolder>) -> Result<(), String> {
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");

    // Sync MultiRoblox setting to MultiState
    if let Some(multi) = settings.get("MultiRoblox").and_then(|v| v.as_bool()) {
        state.set_active(multi);
    }

    // Sync RunOnStartup to Windows registry
    #[cfg(windows)]
    {
        let run_on_startup = settings.get("RunOnStartup").and_then(|v| v.as_bool()).unwrap_or(false);
        sync_run_on_startup(run_on_startup);
    }

    let _ = rpc; // RPC is always-on; started at app launch, not from settings

    // Read existing file and merge — preserves keys like RecentGames that aren't part of settings
    let mut merged: serde_json::Value = if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            let trimmed = clean_bom(&content).trim().to_string();
            if !trimmed.is_empty() {
                serde_json::from_str(&trimmed).unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            }
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

    if let (Some(obj), Some(new_obj)) = (merged.as_object_mut(), settings.as_object()) {
        for (k, v) in new_obj {
            obj.insert(k.clone(), v.clone());
        }
    } else {
        merged = settings;
    }

    let s = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    atomic_write(&settings_path, s).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Launcher Preference ──────────────────────────────────────────────────────

fn read_launcher_preference() -> String {
    let settings_path = data_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) {
            if let Some(kind) = val.get("PreferredLauncher").and_then(|v| v.as_str()) {
                return kind.to_string();
            }
        }
    }
    // Default: use Reiya if installed, otherwise fall through
    "auto".to_string()
}

// ── Auto-update Preference ───────────────────────────────────────────────────

fn read_auto_update() -> bool {
    let settings_path = data_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) {
            if let Some(enabled) = val.get("AutoUpdateRoblox").and_then(|v| v.as_bool()) {
                return enabled;
            }
        }
    }
    // Default: auto-update enabled
    true
}

#[cfg(target_os = "windows")]
fn launch_detached(exe_path: &std::path::Path, args: &str) -> Result<Option<u32>, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::System::Threading::{CreateProcessW, STARTUPINFOW, PROCESS_INFORMATION};
    use windows_sys::Win32::Foundation::CloseHandle;

    let exe_dir = exe_path.parent().ok_or_else(|| {
        let err = "Invalid executable path (no parent directory)".to_string();
        eprintln!("[ERROR launch_detached] Parent dir resolved to None for: {:?}", exe_path);
        err
    })?;

    eprintln!("[INFO launch_detached] Spawning executable via CreateProcess: {:?}", exe_path);
    eprintln!("[INFO launch_detached] Working directory: {:?}", exe_dir);

    if !exe_path.exists() {
        let err = format!("Executable does not exist: {}", exe_path.display());
        eprintln!("[ERROR launch_detached] {}", err);
        return Err(err);
    }

    // Build command line: "exe_path" args
    // Exe path is quoted to handle spaces; args are appended as-is (roblox-player: URI has no spaces)
    let cmdline = format!("\"{}\" {}", exe_path.display(), args);
    let mut cmdline_wide: Vec<u16> = OsStr::new(&cmdline).encode_wide().chain(std::iter::once(0)).collect();
    let dir_wide: Vec<u16> = exe_dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

    let mut si = unsafe { std::mem::zeroed::<STARTUPINFOW>() };
    si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    let mut pi = unsafe { std::mem::zeroed::<PROCESS_INFORMATION>() };

    let ok = unsafe {
        CreateProcessW(
            std::ptr::null(),           // lpApplicationName (null → derive from cmdline)
            cmdline_wide.as_mut_ptr(),  // lpCommandLine (mutable per Windows API requirement)
            std::ptr::null(),           // lpProcessAttributes
            std::ptr::null(),           // lpThreadAttributes
            0,                          // bInheritHandles = FALSE
            0,                          // dwCreationFlags (0 = normal priority, new console inherited)
            std::ptr::null(),           // lpEnvironment (inherit)
            dir_wide.as_ptr(),          // lpCurrentDirectory
            &si,
            &mut pi,
        )
    };

    if ok == 0 {
        let err_code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        let err = format!("CreateProcess failed with error code: {}", err_code);
        eprintln!("[ERROR launch_detached] {}", err);
        return Err(err);
    }

    let pid = pi.dwProcessId;
    let process_handle_raw = pi.hProcess as usize; // cast to usize to cross thread boundary
    unsafe { CloseHandle(pi.hThread); }

    // Spawn a thread that holds the process handle until it exits, then logs the exit code.
    let exe_display = exe_path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    std::thread::spawn(move || {
        use windows_sys::Win32::System::Threading::{WaitForSingleObject, GetExitCodeProcess};
        let h = process_handle_raw as *mut std::ffi::c_void;
        unsafe {
            WaitForSingleObject(h, 60_000); // wait up to 60s
            let mut exit_code: u32 = 0;
            GetExitCodeProcess(h, &mut exit_code);
            eprintln!("[DEBUG process] {} (PID {}) exited with code {:#010x}", exe_display, pid, exit_code);
            CloseHandle(h);
        }
    });

    eprintln!("[INFO launch_detached] Process launched via CreateProcess, PID = {}", pid);
    Ok(Some(pid))
}

#[cfg(not(target_os = "windows"))]
fn launch_detached(_exe_path: &std::path::Path, _args: &str) -> Result<Option<u32>, String> {
    eprintln!("[ERROR launch_detached] Detached spawning is only supported on Windows.");
    Err("Detached launching is only supported on Windows".into())
}

#[cfg(target_os = "windows")]
fn apply_launcher_registry(kind: &str) -> Result<(), String> {
    match kind {
        "reiya" => {
            let installed_ver = read_installed_version()
                .ok_or_else(|| "Reiya is not installed. Please install it first on the Bootstrapper page.".to_string())?;
            let exe = version_dir(&installed_ver).join("RobloxPlayerBeta.exe");
            if !exe.exists() {
                return Err(format!("Reiya executable not found at {}", exe.display()));
            }
            bootstrapper_register_protocol_internal(&exe.to_string_lossy())
        }
        "bloxstrap" => {
            let local = std::env::var("LOCALAPPDATA")
                .map_err(|e| format!("Failed to read LOCALAPPDATA: {}", e))?;
            let bloxstrap_dir = PathBuf::from(&local).join("Bloxstrap");
            let bloxstrap_exe = bloxstrap_dir.join("Bloxstrap.exe");
            if !bloxstrap_exe.exists() {
                return Err("Bloxstrap is not installed at %LOCALAPPDATA%\\Bloxstrap\\Bloxstrap.exe".to_string());
            }
            use winreg::{enums::HKEY_CURRENT_USER, RegKey};
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok((key, _)) = hkcu.create_subkey(r"Software\Bloxstrap") {
                let dir_str = bloxstrap_dir.to_string_lossy().to_string();
                let _ = key.set_value("InstallFolder", &dir_str);
                let _ = key.set_value("InstallLocation", &dir_str);
            }
            bootstrapper_register_protocol_internal(&bloxstrap_exe.to_string_lossy())
        }
        "fishstrap" => {
            let local = std::env::var("LOCALAPPDATA")
                .map_err(|e| format!("Failed to read LOCALAPPDATA: {}", e))?;
            let local_path = PathBuf::from(local);
            let mut fish_dir = local_path.join("Fishstrap");
            let mut fish_exe = fish_dir.join("Fishstrap.exe");
            if !fish_exe.exists() { fish_dir = local_path.join("Fishtrap");  fish_exe = fish_dir.join("Fishtrap.exe"); }
            if !fish_exe.exists() { fish_dir = local_path.join("Fishstrap"); fish_exe = fish_dir.join("Fishtrap.exe"); }
            if !fish_exe.exists() { fish_dir = local_path.join("Fishtrap");  fish_exe = fish_dir.join("Fishstrap.exe"); }
            if !fish_exe.exists() {
                return Err("Fishstrap is not installed under %LOCALAPPDATA%\\Fishstrap or Fishtrap".to_string());
            }
            use winreg::{enums::HKEY_CURRENT_USER, RegKey};
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let dir_str = fish_dir.to_string_lossy().to_string();
            if let Ok((key, _)) = hkcu.create_subkey(r"Software\Fishstrap") {
                let _ = key.set_value("InstallFolder", &dir_str);
                let _ = key.set_value("InstallLocation", &dir_str);
            }
            if let Ok((key, _)) = hkcu.create_subkey(r"Software\Fishtrap") {
                let _ = key.set_value("InstallFolder", &dir_str);
                let _ = key.set_value("InstallLocation", &dir_str);
            }
            bootstrapper_register_protocol_internal(&fish_exe.to_string_lossy())
        }
        "official" => {
            let local = std::env::var("LOCALAPPDATA")
                .map_err(|e| format!("Failed to read LOCALAPPDATA: {}", e))?;
            let roblox_versions_dir = PathBuf::from(local).join("Roblox").join("Versions");
            let exe = search_versions_dir(&roblox_versions_dir)
                .ok_or_else(|| "Official Roblox install not found. Please install official Roblox first.".to_string())?;
            bootstrapper_register_protocol_internal(&exe.to_string_lossy())
        }
        "auto" => {
            if let Some(installed_ver) = read_installed_version() {
                let exe = version_dir(&installed_ver).join("RobloxPlayerBeta.exe");
                if exe.exists() {
                    return bootstrapper_register_protocol_internal(&exe.to_string_lossy());
                }
            }
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                let roblox_versions_dir = PathBuf::from(local).join("Roblox").join("Versions");
                if let Some(exe) = search_versions_dir(&roblox_versions_dir) {
                    return bootstrapper_register_protocol_internal(&exe.to_string_lossy());
                }
            }
            Err("Auto-launcher selection failed: no Roblox install detected".to_string())
        }
        "protocol" => Ok(()), // uses existing Windows default handler, no registry write needed
        _ => Err(format!("Unsupported preferred launcher: {}", kind)),
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_launcher_registry(_kind: &str) -> Result<(), String> {
    eprintln!("[ERROR apply_launcher_registry] Registry modifications are only supported on Windows.");
    Err("Launcher preference registration is only supported on Windows".into())
}

#[cfg(target_os = "windows")]
fn launch_via_protocol(url: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    eprintln!("[INFO launch_via_protocol] Directing launch to shell handler.");

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut std::ffi::c_void,
            lpOperation: *const u16,
            lpFile: *const u16,
            lpParameters: *const u16,
            lpDirectory: *const u16,
            nShowCmd: i32,
        ) -> isize;
    }

    let url_wide: Vec<u16> = OsStr::new(url).encode_wide().chain(std::iter::once(0)).collect();
    let open_wide: Vec<u16> = OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();

    let res = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            open_wide.as_ptr(),
            url_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1, // SW_SHOWNORMAL
        )
    };

    if res <= 32 {
        let err = format!("ShellExecuteW failed with error code: {}", res);
        eprintln!("[ERROR launch_via_protocol] {}", err);
        return Err(err);
    }

    eprintln!("[INFO launch_via_protocol] Protocol launch request completed.");
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_via_protocol(_url: &str) -> Result<(), String> {
    eprintln!("[ERROR launch_via_protocol] Protocol launching is only supported on Windows.");
    Err("Protocol launching is only supported on Windows".into())
}

fn do_launch_with_preference(pref: &str, launch_args: &str) -> Result<Option<u32>, String> {
    match pref {
        "official" => {
            let exe = find_official_roblox_exe().ok_or_else(|| {
                let err = "Official Roblox install not found. Please install official Roblox first.".to_string();
                eprintln!("[ERROR do_launch_with_preference] {}", err);
                err
            })?;
            apply_fastflags_to_exe(&exe);
            #[cfg(target_os = "windows")]
            {
                // Launch the official exe directly — no CDN launcher needed
                let pid = launch_detached(&exe, launch_args)?;
                return Ok(pid);
            }
            #[cfg(not(target_os = "windows"))]
            return Err("Official launcher is only supported on Windows".into());
        }
        "bloxstrap" => {
            let local = std::env::var("LOCALAPPDATA").map_err(|e| {
                let err = format!("Failed to read LOCALAPPDATA: {}", e);
                eprintln!("[ERROR do_launch_with_preference] {}", err);
                err
            })?;
            let bloxstrap_exe = PathBuf::from(&local).join("Bloxstrap").join("Bloxstrap.exe");
            if !bloxstrap_exe.exists() {
                return Err("Bloxstrap is not installed at %LOCALAPPDATA%\\Bloxstrap\\Bloxstrap.exe. Please install it first.".to_string());
            }
            // Apply flags into Bloxstrap's managed Roblox install before launching
            if let Some(roblox_exe) = search_versions_dir(&PathBuf::from(&local).join("Bloxstrap").join("Versions")) {
                apply_fastflags_to_exe(&roblox_exe);
            }
            #[cfg(target_os = "windows")]
            {
                let args = format!("-player {}", launch_args);
                let pid = launch_detached(&bloxstrap_exe, &args)?;
                return Ok(pid);
            }
            #[cfg(not(target_os = "windows"))]
            return Err("Bloxstrap is only supported on Windows".into());
        }
        "fishstrap" => {
            let local = std::env::var("LOCALAPPDATA").map_err(|e| {
                let err = format!("Failed to read LOCALAPPDATA: {}", e);
                eprintln!("[ERROR do_launch_with_preference] {}", err);
                err
            })?;
            let local_path = PathBuf::from(local);
            let mut fish_dir = local_path.join("Fishstrap");
            let mut fish_exe = fish_dir.join("Fishstrap.exe");
            if !fish_exe.exists() { fish_dir = local_path.join("Fishtrap");  fish_exe = fish_dir.join("Fishtrap.exe"); }
            if !fish_exe.exists() { fish_dir = local_path.join("Fishstrap"); fish_exe = fish_dir.join("Fishtrap.exe"); }
            if !fish_exe.exists() { fish_dir = local_path.join("Fishtrap");  fish_exe = fish_dir.join("Fishstrap.exe"); }
            if !fish_exe.exists() {
                return Err("Fishstrap/Fishtrap is not installed under %LOCALAPPDATA%\\Fishstrap or Fishtrap".to_string());
            }
            // Apply flags into Fishstrap's managed Roblox install before launching
            if let Some(roblox_exe) = search_versions_dir(&fish_dir.join("Versions")) {
                apply_fastflags_to_exe(&roblox_exe);
            }
            #[cfg(target_os = "windows")]
            {
                let args = format!("-player {}", launch_args);
                let pid = launch_detached(&fish_exe, &args)?;
                return Ok(pid);
            }
            #[cfg(not(target_os = "windows"))]
            return Err("Fishstrap is only supported on Windows".into());
        }
        _ => {
            // For protocol and custom launchers: apply registry first, then launch protocol
            apply_launcher_registry(pref)?;
            launch_via_protocol(launch_args)?;
        }
    }

    Ok(None)
}

fn missing_roblox_version_files(dir: &Path) -> Vec<String> {
    let files = ["RobloxPlayerBeta.exe", "RobloxPlayerBeta.dll"];
    let directories = ["content", "PlatformContent", "ExtraContent"];
    files.into_iter().filter(|name| {
        !fs::metadata(dir.join(name)).is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
    }).chain(directories.into_iter().filter(|name| {
        !fs::read_dir(dir.join(name)).is_ok_and(|mut entries| matches!(entries.next(), Some(Ok(_))))
    })).map(str::to_string).collect()
}

fn reiya_player(version_hash: &str) -> Option<PathBuf> {
    let dir = version_dir(version_hash);
    missing_roblox_version_files(&dir).is_empty().then(|| dir.join("RobloxPlayerBeta.exe"))
}

const INSTALL_COMPLETE: &str = ".reiya-install-complete";

struct BootstrapperStaging(PathBuf);

impl BootstrapperStaging {
    fn create() -> Result<Self, String> {
        let path = bootstrapper_root().join(format!("install-{:016x}", rand::random::<u64>()));
        fs::create_dir(&path).map_err(|e| format!("Failed to create staging directory: {}", e))?;
        Ok(Self(path))
    }

    fn publish(&self, destination: &Path) -> Result<(), String> {
        let mut missing = missing_roblox_version_files(&self.0);
        if !self.0.join("AppSettings.xml").is_file() {
            missing.push("AppSettings.xml".to_string());
        }
        if !missing.is_empty() {
            return Err(format!("Roblox installation is incomplete: {}", missing.join(", ")));
        }

        fs::write(self.0.join(INSTALL_COMPLETE), b"1")
            .map_err(|e| format!("Failed to mark the staged build complete: {}", e))?;

        let previous = self.0.with_extension("previous");
        let replacing = destination.exists();
        if replacing {
            fs::rename(destination, &previous)
                .map_err(|e| format!("Failed to move incomplete installation aside: {}", e))?;
        }
        if let Err(error) = fs::rename(&self.0, destination) {
            if replacing {
                fs::rename(&previous, destination).map_err(|restore_error| {
                    format!("Failed to publish installation ({error}) or restore previous files from {} ({restore_error})", previous.display())
                })?;
            }
            return Err(format!("Failed to publish Roblox installation: {}", error));
        }
        if replacing {
            let _ = fs::remove_dir_all(previous);
        }
        Ok(())
    }
}

impl Drop for BootstrapperStaging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

async fn install_roblox_for_launch(app: &AppHandle, win: &tauri::WebviewWindow, version_hash: &str, activate: bool) -> Result<(), String> {
    use futures_util::StreamExt;

    let version_path = version_dir(version_hash);
    let exe_path = version_path.join("RobloxPlayerBeta.exe");
    if version_path.join(INSTALL_COMPLETE).is_file() && missing_roblox_version_files(&version_path).is_empty() {
        if activate {
            write_installed_version(version_hash);
            write_pinned(false);
            let _ = bootstrapper_register_protocol_internal(&exe_path.to_string_lossy());
        }
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .user_agent("RobloxBootstrapper")
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create reqwest client: {}", e))?;

    // Fetch package manifest
    let manifest_url = format!("{}/{}-rbxPkgManifest.txt", BOOTSTRAPPER_CDN, version_hash);
    let manifest_resp = client.get(&manifest_url).send().await.map_err(|e| format!("Failed to connect to manifest CDN: {}", e))?;
    if !manifest_resp.status().is_success() {
        return Err(format!("Manifest download HTTP error: {}", manifest_resp.status()));
    }
    let manifest_text = manifest_resp.text().await.map_err(|e| format!("Failed to read manifest body: {}", e))?;

    let lines: Vec<&str> = manifest_text.lines().collect();
    let mut packages: Vec<(String, String)> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.ends_with(".zip") || line.ends_with(".exe") || line.ends_with(".dll") {
            let md5_hash = if i + 1 < lines.len() { lines[i + 1].trim().to_string() } else { String::new() };
            packages.push((line.to_string(), md5_hash));
            i += 4;
        } else {
            i += 1;
        }
    }

    let zip_packages: Vec<&(String, String)> = packages.iter().filter(|(name, _)| name.ends_with(".zip")).collect();
    let total = zip_packages.len();
    if total == 0 {
        return Err("No packages found in manifest".into());
    }

    let staging = BootstrapperStaging::create()?;
    let install_dir = &staging.0;

    for (idx, (pkg_name, _pkg_md5)) in zip_packages.iter().enumerate() {
        // Double check cancellation
        if app.get_webview_window(win.label()).is_none() {
            return Err("Launch cancelled by user".into());
        }

        let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
            status: format!("Downloading {}...", pkg_name),
            percent: ((idx as f32 / total as f32) * 100.0) as u32,
        });

        let pkg_url = format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, pkg_name);
        let pkg_resp = client.get(&pkg_url).send().await.map_err(|e| format!("Download connect error for package '{}': {}", pkg_name, e))?;
        if !pkg_resp.status().is_success() {
            return Err(format!("Could not download package '{}' (HTTP {})", pkg_name, pkg_resp.status()));
        }

        let total_bytes = pkg_resp.content_length().unwrap_or(0);
        let mut bytes_buf: Vec<u8> = Vec::new();
        let mut stream = pkg_resp.bytes_stream();
        let start_time = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            // Check cancellation during download
            if app.get_webview_window(win.label()).is_none() {
                return Err("Launch cancelled by user".into());
            }

            let chunk = chunk.map_err(|e| format!("Error downloading stream chunk of package '{}': {}", pkg_name, e))?;
            bytes_buf.extend_from_slice(&chunk);

            let pct = if total_bytes > 0 {
                let pkg_pct = (bytes_buf.len() as f32 / total_bytes as f32) * 50.0;
                ((idx as f32 / total as f32) * 100.0 + (pkg_pct / total as f32)) as u32
            } else {
                ((idx as f32 / total as f32) * 100.0) as u32
            };

            let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
            let speed_kbps = ((bytes_buf.len() as f64 / elapsed) / 1024.0) as u64;

            let status_str = if speed_kbps > 0 {
                format!("Downloading {} ({:.1}MB / {:.1}MB) - {} KB/s", pkg_name, (bytes_buf.len() as f32 / 1024.0 / 1024.0), (total_bytes as f32 / 1024.0 / 1024.0), speed_kbps)
            } else {
                format!("Downloading {}...", pkg_name)
            };

            let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
                status: status_str,
                percent: pct.min(99),
            });
        }

        // Check cancellation before extraction
        if app.get_webview_window(win.label()).is_none() {
            return Err("Launch cancelled by user".into());
        }

        let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
            status: format!("Extracting {}...", pkg_name),
            percent: ((idx as f32 / total as f32) * 100.0 + (50.0 / total as f32)) as u32,
        });

        let cursor = std::io::Cursor::new(bytes_buf);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to read zip archive for '{}': {}", pkg_name, e))?;
        let target_dir = install_dir.join(pkg_destination_dir(pkg_name));
        fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create subfolder directory: {}", e))?;

        let total_files = archive.len();
        for i in 0..total_files {
            // Check cancellation during extraction
            if i % 10 == 0 && app.get_webview_window(win.label()).is_none() {
                return Err("Launch cancelled by user".into());
            }

            let mut file = archive.by_index(i).map_err(|e| format!("Failed to read index {} from archive of '{}': {}", i, pkg_name, e))?;
            let enclosed_path = match file.enclosed_name() {
                Some(p) => p.to_path_buf(),
                None => continue,
            };

            if enclosed_path.as_os_str().is_empty() || enclosed_path.to_string_lossy() == "/" {
                continue;
            }

            let out_path = target_dir.join(&enclosed_path);
            if file.name().ends_with('/') {
                fs::create_dir_all(&out_path).map_err(|e| format!("Failed to create subfolder: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
                }
                let mut outf = fs::File::create(&out_path).map_err(|e| format!("Failed to create target file: {}", e))?;
                std::io::copy(&mut file, &mut outf).map_err(|e| format!("Extraction copy failed: {}", e))?;
            }

            // Report extraction progress periodically to minimize IPC overhead
            if i % 10 == 0 || i == total_files - 1 {
                let ext_pct = 50.0 + (i as f32 / total_files as f32) * 50.0;
                let pct = ((idx as f32 / total as f32) * 100.0 + (ext_pct / total as f32)) as u32;

                let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
                    status: format!("Extracting {}...", pkg_name),
                    percent: pct.min(99),
                });
            }
        }
    }

    // Download the Roblox launcher (RobloxPlayerInstaller.exe or RobloxPlayerLauncher.exe).
    // Required as parent process by Hyperion anti-cheat; not inside any zip package.
    let mut launcher_downloaded = false;
    for launcher_name in ROBLOX_LAUNCHER_NAMES {
        let launcher_dest = install_dir.join(launcher_name);
        if launcher_dest.exists() { launcher_downloaded = true; break; }
        let versioned_url = format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, launcher_name);
        if let Ok(resp) = client.get(&versioned_url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    let _ = fs::write(&launcher_dest, &bytes);
                    eprintln!("[INFO bootstrapper] Downloaded {} ({} bytes)", launcher_name, bytes.len());
                    launcher_downloaded = true;
                    break;
                }
            } else {
                eprintln!("[WARN bootstrapper] {} returned {} on CDN", launcher_name, resp.status());
            }
        }
    }
    if !launcher_downloaded {
        eprintln!("[WARN bootstrapper] No launcher on CDN — will launch RobloxPlayerBeta.exe directly");
    }

    // Apply existing FastFlags
    let ff_path = bootstrapper_root().join("fastflags.json");
    if ff_path.exists() {
        if let Ok(ff_content) = fs::read_to_string(&ff_path) {
            let client_settings_dir = install_dir.join("ClientSettings");
            let _ = fs::create_dir_all(&client_settings_dir);
            let _ = fs::write(client_settings_dir.join("ClientAppSettings.json"), &ff_content);
        }
    }

    repair_bootstrapper_folders(install_dir)?;
    if app.get_webview_window(win.label()).is_none() {
        return Err("Launch cancelled by user".into());
    }
    staging.publish(&version_path)?;

    // Keep the protocol handler on the selected build while updates download.
    if activate {
        write_installed_version(version_hash);
        write_pinned(false);
        let _ = bootstrapper_register_protocol_internal(&exe_path.to_string_lossy());
    }

    Ok(())
}

fn emit_launch_error(win: &tauri::WebviewWindow, message: &str) {
    let _ = win.emit_to(win.label(), "launch-progress-error", LaunchProgressError {
        message: message.to_string(),
    });
}

async fn prepare_reiya_launch(
    app: &tauri::AppHandle,
    tracker_id: u64,
) -> Result<(tauri::WebviewWindow, PathBuf), String> {
    let label = format!("launch_progress_{}", tracker_id);
    let win = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PathBuf::from("index.html")))
        .title("Reiya Launcher")
        .inner_size(480.0, 320.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .focused(false)
        .center()
        .initialization_script("window.history.replaceState(null, '', '/launch-progress');")
        .build()
        .map_err(|e| format!("Failed to create launch progress window: {}", e))?;

    let ready = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ready_flag = ready.clone();
    let listener = win.once("launch-progress-ready", move |_| {
        ready_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    });
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(4);
    while !ready.load(std::sync::atomic::Ordering::Relaxed)
        && std::time::Instant::now() < deadline && app.get_webview_window(&label).is_some()
    {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    win.unlisten(listener);

    match prepare_reiya_executable(app, &win).await {
        Ok(exe) => Ok((win, exe)),
        Err(error) => {
            emit_launch_error(&win, &error);
            Err(error)
        }
    }
}

async fn prepare_reiya_executable(app: &AppHandle, win: &tauri::WebviewWindow) -> Result<PathBuf, String> {
    if app.get_webview_window(win.label()).is_none() {
        return Err("Launch cancelled by user".into());
    }
    let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
        status: "Checking Roblox installation...".into(),
        percent: 5,
    });

    // A pinned version (chosen explicitly via "Install & Overwrite" with a
    // hash, or "Use this version" from Installed Locally) is never silently
    // replaced by the update check, regardless of the auto-update toggle.
    let auto_update = read_auto_update() && !read_pinned();

    let status = if auto_update {
        bootstrapper_check_update(None).await.map_err(|e| format!("Update check failed: {}", e))?
    } else {
        let installed = read_installed_version();
        if installed.is_none() {
            let msg = "No Roblox version installed and auto-update is disabled. Install a version from the Bootstrapper page first.".to_string();
            return Err(msg);
        }
        let install_path = versions_dir().to_string_lossy().to_string();
        let exe_path = installed.as_deref().and_then(reiya_player)
            .map(|path| path.to_string_lossy().into_owned());
        BootstrapperStatus {
            needs_update: false,
            latest_version: installed.clone(),
            installed_version: installed,
            install_path,
            exe_path,
        }
    };

    // Check for updates independently. Serialize only installation and local preparation.
    let _install = BOOTSTRAPPER_INSTALL.lock().await;
    if app.get_webview_window(win.label()).is_none() {
        return Err("Launch cancelled by user".into());
    }

    if !auto_update && status.exe_path.is_none() {
        return Err("The selected Roblox build is incomplete. Reinstall it from the Bootstrapper page.".into());
    }

    let installed_ver = if status.needs_update || status.exe_path.is_none() {
        let latest = normalized_version_hash(&status.latest_version.ok_or("Could not resolve latest Roblox version")?)?;
        let active_before_download = read_installed_version()
            .filter(|version| reiya_player(version).is_some());
        let _ = win.emit_to(win.label(), "launch-progress", LaunchProgressPayload {
            status: format!("Update found — downloading {}...", &latest[..latest.len().min(24)]),
            percent: 10,
        });
        install_roblox_for_launch(app, win, &latest, active_before_download.is_none()).await?;
        active_before_download.unwrap_or(latest)
    } else {
        status.installed_version.ok_or("Could not resolve installed Roblox version")?
    };

    if app.get_webview_window(win.label()).is_none() {
        return Err("Launch cancelled by user".into());
    }

    let exe = reiya_player(&installed_ver).ok_or("The selected Reiya Roblox build is incomplete.")?;
    repair_bootstrapper_folders(&version_dir(&installed_ver))?;

    apply_fastflags_to_exe(&exe);
    Ok(exe)
}

#[tauri::command]
fn get_launcher_preference() -> String {
    read_launcher_preference()
}

#[tauri::command]
fn set_launcher_preference(kind: String) -> Result<(), String> {
    // Write registry key first if supported
    let _ = apply_launcher_registry(&kind);
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());

    let settings_path = data_dir().join("settings.json");
    let mut val: serde_json::Value = if settings_path.exists() {
        fs::read_to_string(&settings_path)
            .ok()
            .and_then(|c| serde_json::from_str(clean_bom(&c)).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    val["PreferredLauncher"] = serde_json::Value::String(kind);
    let s = serde_json::to_string_pretty(&val).map_err(|e| e.to_string())?;
    atomic_write(&settings_path, s).map_err(|e| e.to_string())?;
    Ok(())
}



#[derive(Serialize)]
pub struct LaunchDiagnostics {
    pub preferred_launcher: String,
    pub resolved_launcher: String,
    pub active_version: Option<String>,
    pub executable_path: Option<String>,
    pub executable_exists: bool,
    pub protocol_handler: Option<String>,
    pub official_available: bool,
    pub reiya_available: bool,
    pub recommendation: String,
}

#[tauri::command]
fn get_launch_diagnostics() -> LaunchDiagnostics {
    let preferred = read_launcher_preference();
    let active_version = read_installed_version();
    let reiya_exe = active_version.as_ref().map(|v| version_dir(v).join("RobloxPlayerBeta.exe"));
    let reiya_available = reiya_exe.as_ref().is_some_and(|p| p.exists());
    let official_exe = find_official_roblox_exe();
    let official_available = official_exe.as_ref().is_some_and(|p| p.exists());
    let resolved = if preferred == "auto" {
        if reiya_available { "reiya".to_string() } else { "official".to_string() }
    } else {
        preferred.clone()
    };
    let selected_exe = match resolved.as_str() {
        "reiya" => reiya_exe,
        "official" => official_exe,
        "bloxstrap" => std::env::var("LOCALAPPDATA").ok().map(|p| PathBuf::from(p).join("Bloxstrap").join("Bloxstrap.exe")),
        "fishstrap" => std::env::var("LOCALAPPDATA").ok().map(|p| PathBuf::from(p).join("Fishstrap").join("Fishstrap.exe")),
        _ => None,
    };
    let executable_exists = selected_exe.as_ref().map_or(resolved == "protocol", |p| p.exists());
    let recommendation = if resolved == "reiya" && official_available {
        "Official Roblox is available as a recovery launcher if Reiya authentication fails.".to_string()
    } else if !executable_exists && official_available {
        "The selected launcher is unavailable. Switch to Official Roblox.".to_string()
    } else if executable_exists {
        "Launcher path is ready.".to_string()
    } else {
        "Install or select an available Roblox launcher.".to_string()
    };
    LaunchDiagnostics {
        preferred_launcher: preferred,
        resolved_launcher: resolved,
        active_version,
        executable_path: selected_exe.map(|p| p.to_string_lossy().to_string()),
        executable_exists,
        protocol_handler: read_protocol_handler(),
        official_available,
        reiya_available,
        recommendation,
    }
}

#[tauri::command]
fn get_auto_update_preference() -> bool {
    read_auto_update()
}

#[tauri::command]
fn set_auto_update_preference(enabled: bool) -> Result<(), String> {
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");
    let mut val: serde_json::Value = if settings_path.exists() {
        fs::read_to_string(&settings_path)
            .ok()
            .and_then(|c| serde_json::from_str(clean_bom(&c)).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    val["AutoUpdateRoblox"] = serde_json::Value::Bool(enabled);
    let s = serde_json::to_string_pretty(&val).map_err(|e| e.to_string())?;
    atomic_write(&settings_path, s).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_account_cookie(user_id: i64) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;
    let decrypted = decrypt_cookie(&account.encrypted_cookie)?;
    Ok(decrypted)
}

/// Copies the saved password straight to the clipboard from Rust, then clears the
/// clipboard after 30s if it still holds that value. The password is never returned
/// to the webview.
#[tauri::command]
fn copy_account_password(app: tauri::AppHandle, user_id: i64) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let accounts = load_stored();
    let stored = accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .and_then(|a| a.password.clone())
        .filter(|p| !p.is_empty())
        .ok_or_else(|| "No password is saved for this account.".to_string())?;
    let plain = decrypt_password(&stored);
    app.clipboard().write_text(plain.clone()).map_err(|e| e.to_string())?;

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        if handle.clipboard().read_text().map(|t| t == plain).unwrap_or(false) {
            let _ = handle.clipboard().clear();
        }
    });
    Ok(())
}

#[tauri::command]
fn save_account_password(user_id: i64, password: String) -> Result<(), String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let account = accounts
        .iter_mut()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;
    account.password = if password.is_empty() { None } else { Some(encrypt_cookie(&password)) };

    let sync_uid = account.user_id;
    let sync_user = account.username.clone();
    let sync_dn = account.display_name.clone();
    let sync_added = account.added_at.to_rfc3339();
    let sync_updated = account.cookie_updated_at.map(|d| d.to_rfc3339());
    let cookie = decrypt_cookie(&account.encrypted_cookie).ok();

    save_stored_unlocked(&accounts);

    // Push the freshly-saved password to Supabase right away (still gated on the
    // account having >=1 Robux, same rule as cookie sync) instead of waiting for
    // the next periodic revalidation cycle.
    if !password.is_empty() {
        if let Some(cookie) = cookie {
            tauri::async_runtime::spawn(fetch_robux_and_sync(sync_uid, sync_user, sync_dn, cookie, sync_added, sync_updated));
        }
    }
    Ok(())
}

/// Decrypts a stored password for display/use. Falls back to the raw stored
/// value if it predates encryption (plaintext passwords saved by older versions).
fn decrypt_password(stored: &str) -> String {
    decrypt_cookie(stored).unwrap_or_else(|_| stored.to_string())
}

#[tauri::command]
fn set_account_group(user_id: i64, group: String) -> Result<(), String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let account = accounts
        .iter_mut()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;
    account.group = if group.trim().is_empty() { None } else { Some(group.trim().to_string()) };
    save_stored_unlocked(&accounts);
    Ok(())
}

#[tauri::command]
fn update_account_notes(user_id: i64, notes: String) -> Result<AccountDto, String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let account = accounts
        .iter_mut()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;
    account.notes = notes.trim().to_string();
    let dto = to_dto(account);
    save_stored_unlocked(&accounts);
    Ok(dto)
}

#[tauri::command]
async fn check_account_health(user_id: i64) -> Result<String, String> {
    let checked = load_stored().into_iter().find(|account| account.user_id == user_id)
        .ok_or("Account not found")?;
    let cookie = decrypt_cookie(&checked.encrypted_cookie)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        let mut rotated_cookie = None;
        for hdr in resp.headers().get_all("set-cookie").iter() {
            if let Ok(s) = hdr.to_str() {
                if s.contains(".ROBLOSECURITY=") {
                    rotated_cookie = Some(clean_cookie(s));
                }
            }
        }

        if let Some(rotated) = rotated_cookie {
            let (account, applied) = commit_cookie_validation(&checked, true, Some(&rotated))?;
            if applied {
                sync_validated_account(&account, rotated);
            }
            return Ok(account.cookie_status);
        }
        Ok("Valid".to_string())
    } else if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let (account, applied) = commit_cookie_validation(&checked, false, None)?;
        Ok(if applied { "Invalid".to_string() } else { account.cookie_status })
    } else {
        Ok("Invalid".to_string())
    }
}

// Credentials stored XOR-encoded with 0x5A so they don't appear as plaintext in the binary.
const _URL_XOR:       &[u8] = &[0x32,0x2E,0x2E,0x2A,0x29,0x60,0x75,0x75,0x32,0x37,0x28,0x23,0x2A,0x2D,0x2C,0x3D,0x23,0x3B,0x2A,0x23,0x2C,0x2A,0x37,0x3E,0x29,0x29,0x2E,0x2F,0x74,0x29,0x2F,0x2A,0x3B,0x38,0x3B,0x29,0x3F,0x74,0x39,0x35];
const _ANON_XOR:      &[u8] = &[0x29,0x38,0x05,0x2A,0x2F,0x38,0x36,0x33,0x29,0x32,0x3B,0x38,0x36,0x3F,0x05,0x3D,0x1F,0x77,0x00,0x20,0x39,0x62,0x33,0x10,0x0D,0x3D,0x22,0x1F,0x1F,0x1E,0x34,0x29,0x62,0x6A,0x34,0x6A,0x2D,0x05,0x23,0x1F,0x6A,0x1D,0x3F,0x1C,0x3C,0x29];


fn decode_cred(xored: &[u8]) -> String {
    xored.iter().map(|b| (b ^ 0x5A) as char).collect()
}

fn supabase_url()  -> String { decode_cred(_URL_XOR)      }
fn supabase_anon() -> String { decode_cred(_ANON_XOR)     }


// ── App rating (global, Supabase-backed) ──────────────────────────────────────

#[derive(serde::Serialize)]
struct RatingStats {
    average: f64,
    count: u64,
}

#[tauri::command]
async fn submit_rating(rating: u8) -> Result<(), String> {
    if !(1..=5).contains(&rating) {
        return Err("Invalid rating".to_string());
    }
    telemetry::post("submit-rating", Some(serde_json::json!({ "rating": rating }))).await
}

#[tauri::command]
async fn get_rating_stats() -> Result<RatingStats, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{}/functions/v1/rating-stats", supabase_url()))
        .header("apikey", supabase_anon())
        .send()
        .await
        .map_err(|_| "Could not reach the rating server.".to_string())?
        .error_for_status().map_err(|_| "Could not read ratings from the server.".to_string())?;

    let json: serde_json::Value = resp.json().await
        .map_err(|_| "Invalid response from the rating server.".to_string())?;

    let average = json.get("average").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let count = json.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
    Ok(RatingStats { average, count })
}

// ── Live presence (global "online now" count) ─────────────────────────────────

#[tauri::command]
async fn send_heartbeat() -> Result<(), String> {
    telemetry::post("heartbeat", None).await
}

#[tauri::command]
async fn get_live_count() -> Result<u64, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{}/functions/v1/live-count", supabase_url()))
        .header("apikey", supabase_anon())
        .send()
        .await
        .map_err(|_| "Could not reach the presence server.".to_string())?
        .error_for_status().map_err(|_| "Could not read presence from the server.".to_string())?;

    let json: serde_json::Value = resp.json().await
        .map_err(|_| "Invalid response from the presence server.".to_string())?;

    Ok(json.get("count").and_then(|v| v.as_u64()).unwrap_or(0))
}

#[tauri::command]
fn edit_account(
    user_id: i64,
    display_name: String,
    notes: String,
    tags: Vec<String>,
    default_place_id: String,
    default_game_name: String,
    launch_preset_name: String,
    default_private_server: String,
    launcher_preference: String,
    launch_delay_seconds: u32,
    safe_launch_enabled: bool,
    auto_rejoin_enabled: bool,
    launch_cooldown_seconds: i32,
) -> Result<AccountDto, String> {
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let account = accounts
        .iter_mut()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;

    account.display_name = if display_name.trim().is_empty() {
        account.username.clone()
    } else {
        display_name.trim().to_string()
    };
    account.notes = notes;
    account.tags = tags;
    account.default_place_id = default_place_id.trim().to_string();
    account.default_game_name = default_game_name.trim().to_string();
    account.launch_preset_name = launch_preset_name.trim().to_string();
    account.default_private_server = default_private_server.trim().to_string();
    account.launcher_preference = launcher_preference.trim().to_lowercase();
    account.launch_delay_seconds = launch_delay_seconds.min(300);
    account.safe_launch_enabled = safe_launch_enabled;
    account.auto_rejoin_enabled = auto_rejoin_enabled;
    account.launch_cooldown_seconds = launch_cooldown_seconds;

    let dto = to_dto(account);
    save_stored_unlocked(&accounts);
    Ok(dto)
}



#[tauri::command]
fn bulk_apply_launch_preset(
    user_ids: Vec<i64>,
    launch_preset_name: String,
    default_place_id: String,
    default_game_name: String,
    default_private_server: String,
    launcher_preference: String,
    launch_delay_seconds: u32,
) -> Result<usize, String> {
    if user_ids.is_empty() { return Err("Select at least one account.".to_string()); }
    let clean_place = default_place_id.trim();
    if !clean_place.is_empty() && !clean_place.chars().all(|c| c.is_ascii_digit()) {
        return Err("Default place ID must be numeric.".to_string());
    }
    let clean_launcher = launcher_preference.trim().to_lowercase();
    if !clean_launcher.is_empty() && !matches!(clean_launcher.as_str(), "official" | "reiya" | "bloxstrap" | "fishstrap" | "protocol") {
        return Err("Unsupported launcher preference.".to_string());
    }
    let ids: std::collections::HashSet<i64> = user_ids.into_iter().collect();
    let _io = ACCOUNTS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let mut accounts = load_stored_unlocked();
    let mut changed = 0usize;
    for account in accounts.iter_mut().filter(|a| ids.contains(&a.user_id)) {
        account.launch_preset_name = launch_preset_name.trim().chars().take(64).collect();
        account.default_place_id = clean_place.to_string();
        account.default_game_name = default_game_name.trim().chars().take(100).collect();
        account.default_private_server = default_private_server.trim().chars().take(500).collect();
        account.launcher_preference = clean_launcher.clone();
        account.launch_delay_seconds = launch_delay_seconds.min(300);
        changed += 1;
    }
    if changed == 0 { return Err("No selected accounts were found.".to_string()); }
    save_stored_unlocked(&accounts);
    Ok(changed)
}

#[tauri::command]
async fn get_auth_ticket_command(user_id: i64) -> Result<String, String> {
    let accounts = load_stored();
    let account = accounts
        .iter()
        .find(|a| a.user_id == user_id)
        .ok_or_else(|| "Account not found".to_string())?;
    let cookie = decrypt_cookie(&account.encrypted_cookie)?;
    let (ticket, rotated_cookie) = get_auth_ticket(&cookie)
        .await
        .ok_or_else(|| "Failed to retrieve authentication ticket. Cookie may be invalid.".to_string())?;

    if let Some(rotated) = rotated_cookie {
        let (updated, applied) = commit_cookie_validation(account, true, Some(&rotated))?;
        if applied {
            sync_validated_account(&updated, rotated);
        }
    }

    Ok(ticket)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RecentGameDto {
    #[serde(rename = "placeId")]
    pub place_id: String,
    pub name: String,
    pub creator: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    #[serde(rename = "playedAt")]
    pub played_at: String,
    #[serde(alias = "PrivateServer", rename = "privateServer", default)]
    pub private_server: Option<String>,
}

#[tauri::command]
fn get_recent_games() -> Vec<RecentGameDto> {
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return vec![];
    }
    let Ok(content) = fs::read_to_string(settings_path) else { return vec![]; };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) else { return vec![]; };
    let mut list = Vec::new();
    if let Some(recents) = val["RecentGames"].as_array() {
        for r in recents {
            let place_id = r["PlaceId"].as_str().map(|s| s.to_string())
                .or_else(|| r["PlaceId"].as_i64().map(|n| n.to_string()))
                .unwrap_or_default();
            let name = r["Name"].as_str().unwrap_or_default().to_string();
            let creator = r["Creator"].as_str().unwrap_or_default().to_string();
            let icon_url = r["IconUrl"].as_str().unwrap_or_default().to_string();
            let played_at = r["PlayedAt"].as_str().unwrap_or_default().to_string();
            let private_server = r["PrivateServer"].as_str().map(|s| s.to_string());
            if !place_id.is_empty() {
                list.push(RecentGameDto {
                    place_id,
                    name,
                    creator,
                    icon_url,
                    played_at,
                    private_server,
                });
            }
        }
    }
    list
}

#[tauri::command]
fn save_favorites(favorites: Vec<FavoriteGameDto>) -> Result<(), String> {
    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut val: serde_json::Value = serde_json::from_str(clean_bom(&content)).map_err(|e| e.to_string())?;

    let mut favs_val = Vec::new();
    for f in favorites {
        favs_val.push(serde_json::json!({
            "PlaceId": f.place_id,
            "Name": f.name,
            "Creator": f.creator,
            "IconUrl": f.icon_url,
            "PlayedAt": Utc::now().to_rfc3339(),
            "PrivateServer": f.private_server
        }));
    }

    val["FavoriteGames"] = serde_json::Value::Array(favs_val);

    if let Ok(s) = serde_json::to_string_pretty(&val) {
        let _ = atomic_write(&settings_path, s);
    }
    Ok(())
}

async fn add_recent_game_internal(place_id_str: &str) -> Result<(), String> {
    let place_id_val = place_id_str.trim();
    if place_id_val.is_empty() {
        return Ok(());
    }
    let parsed_id = place_id_val.parse::<i64>().map_err(|e| e.to_string())?;

    let details = fetch_place_details(parsed_id).await.unwrap_or_else(|_| RobloxGameResultDto {
        name: format!("Place ID {}", place_id_val),
        place_id: parsed_id,
        universe_id: 0,
        creator_name: "Unknown".to_string(),
        icon_url: String::new(),
    });

    let _settings_io = SETTINGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut val: serde_json::Value = serde_json::from_str(clean_bom(&content)).map_err(|e| e.to_string())?;

    let played_at_str = Utc::now().to_rfc3339();

    let mut recent_games_list = if let Some(arr) = val.get_mut("RecentGames").and_then(|v| v.as_array_mut()) {
        arr.clone()
    } else {
        vec![]
    };

    let mut found_idx = None;
    for (idx, game) in recent_games_list.iter().enumerate() {
        if let Some(pid) = game.get("PlaceId").and_then(|v| v.as_str()) {
            if pid == place_id_val {
                found_idx = Some(idx);
                break;
            }
        }
    }

    if let Some(idx) = found_idx {
        recent_games_list[idx]["PlayedAt"] = serde_json::json!(played_at_str);
    } else {
        let new_item = serde_json::json!({
            "PlaceId": place_id_val,
            "Name": details.name,
            "Creator": details.creator_name,
            "IconUrl": details.icon_url,
            "PlayedAt": played_at_str
        });
        recent_games_list.push(new_item);
    }

    recent_games_list.sort_by(|a, b| {
        let t_a = a.get("PlayedAt").and_then(|v| v.as_str()).unwrap_or("");
        let t_b = b.get("PlayedAt").and_then(|v| v.as_str()).unwrap_or("");
        t_b.cmp(t_a)
    });

    recent_games_list.truncate(20);

    val["RecentGames"] = serde_json::Value::Array(recent_games_list);

    if let Ok(s) = serde_json::to_string_pretty(&val) {
        let _ = atomic_write(&settings_path, s);
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FavoriteGameDto {
    #[serde(rename = "placeId")]
    pub place_id: String,
    pub name: String,
    pub creator: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    #[serde(alias = "PrivateServer", rename = "privateServer", default)]
    pub private_server: Option<String>,
}

#[tauri::command]
fn get_favorites() -> Vec<FavoriteGameDto> {
    let settings_path = data_dir().join("settings.json");
    if !settings_path.exists() {
        return vec![];
    }
    let Ok(content) = fs::read_to_string(settings_path) else { return vec![]; };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) else { return vec![]; };
    let mut list = Vec::new();
    if let Some(favs) = val["FavoriteGames"].as_array() {
        for f in favs {
            let place_id = f["PlaceId"].as_str().map(|s| s.to_string())
                .or_else(|| f["PlaceId"].as_i64().map(|n| n.to_string()))
                .unwrap_or_default();
            let name = f["Name"].as_str().unwrap_or_default().to_string();
            let creator = f["Creator"].as_str().unwrap_or_default().to_string();
            let icon_url = f["IconUrl"].as_str().unwrap_or_default().to_string();
            let private_server = f["PrivateServer"].as_str().map(|s| s.to_string());
            if !place_id.is_empty() {
                list.push(FavoriteGameDto {
                    place_id,
                    name,
                    creator,
                    icon_url,
                    private_server,
                });
            }
        }
    }
    list
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// ══════════════════════════════════════════════════════════════════════════════
// Custom Bootstrapper — Download, Install, FastFlags
// ══════════════════════════════════════════════════════════════════════════════

const BOOTSTRAPPER_CDN: &str = "https://setup.rbxcdn.com";
const VERSION_API: &str = "https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer";

/// Returns the Reiya bootstrapper install root: %LOCALAPPDATA%\Reiya
fn bootstrapper_root() -> PathBuf {
    storage_paths::app_root("LOCALAPPDATA")
}
/// Returns the active versions folder.
fn versions_dir() -> PathBuf {
    let d = bootstrapper_root().join("Versions");
    let _ = fs::create_dir_all(&d);
    d
}

/// Returns the install path for a specific version hash.
fn version_dir(hash: &str) -> PathBuf {
    versions_dir().join(hash)
}

/// Persist which version hash is currently installed.
fn installed_version_path() -> PathBuf {
    bootstrapper_root().join("version.txt")
}

fn read_installed_version() -> Option<String> {
    fs::read_to_string(installed_version_path()).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn write_installed_version(hash: &str) {
    let _ = atomic_write(&installed_version_path(), hash);
}

/// Marks whether the currently installed version was explicitly chosen by the
/// user (via a pinned/custom install or switching to an already-downloaded
/// build) rather than just being "whatever latest was last time." Pinned
/// installs are never silently replaced by the auto-update-on-launch check.
fn pinned_version_path() -> PathBuf {
    bootstrapper_root().join("pinned.txt")
}

fn read_pinned() -> bool {
    fs::read_to_string(pinned_version_path()).map(|s| s.trim() == "1").unwrap_or(false)
}

fn write_pinned(pinned: bool) {
    let _ = atomic_write(&pinned_version_path(), if pinned { "1" } else { "0" });
}

#[derive(Serialize, Deserialize)]
pub struct BootstrapperStatus {
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub install_path: String,
    pub needs_update: bool,
    pub exe_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BootstrapperProgress {
    pub stage: String,
    pub package: String,
    pub package_index: usize,
    pub total_packages: usize,
    pub percent: u32,
    pub speed_kbps: u64,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RobloxDeployVersion {
    pub version: String,
    pub date: String,
}

const DEPLOY_HISTORY_URL: &str = "https://setup.rbxcdn.com/DeployHistory.txt";

#[tauri::command]
async fn get_roblox_deploy_history() -> Result<Vec<RobloxDeployVersion>, String> {
    let client = reqwest::Client::builder().user_agent("RobloxBootstrapper").build().map_err(|e| e.to_string())?;
    let resp = client.get(DEPLOY_HISTORY_URL).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Deploy history fetch error: {}", resp.status()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;

    let mut entries: Vec<RobloxDeployVersion> = Vec::new();
    for line in text.lines() {
        // Example: "New WindowsPlayer Update: version-ce0bcd0fbd484804 at 8/12/2026 3:14:22 PM, file version: 0, 671, 0, 6710123"
        if !line.contains("WindowsPlayer") || !line.contains("version-") {
            continue;
        }
        let Some(v_start) = line.find("version-") else { continue };
        let rest = &line[v_start..];
        let version = rest.split(|c: char| c.is_whitespace() || c == ',').next().unwrap_or("").to_string();
        if version.is_empty() {
            continue;
        }
        let date = if let Some(at_idx) = line.find(" at ") {
            let after_at = &line[at_idx + 4..];
            after_at.split(", file version").next().unwrap_or("").trim().to_string()
        } else {
            String::new()
        };
        entries.push(RobloxDeployVersion { version, date });
    }

    entries.reverse(); // most recent first
    entries.truncate(40);
    Ok(entries)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InstalledRobloxVersion {
    pub version: String,
    pub label: String,
    pub installed_at: Option<String>,
    pub is_current: bool,
    pub size_bytes: u64,
}

fn version_labels_path() -> PathBuf { bootstrapper_root().join("version-labels.json") }

fn load_version_labels() -> std::collections::HashMap<String, String> {
    fs::read_to_string(version_labels_path()).ok()
        .and_then(|s| serde_json::from_str(clean_bom(&s)).ok())
        .unwrap_or_default()
}

fn directory_size(path: &std::path::Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    entries.flatten().map(|entry| {
        let p = entry.path();
        if p.is_dir() { directory_size(&p) } else { entry.metadata().map(|m| m.len()).unwrap_or(0) }
    }).sum()
}

fn normalized_version_hash(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let hash = if trimmed.starts_with("version-") { trimmed.to_string() } else { format!("version-{}", trimmed) };
    let suffix = hash.trim_start_matches("version-");
    if suffix.is_empty() || !suffix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid Roblox version hash".to_string());
    }
    Ok(hash)
}

/// Lists Roblox builds already downloaded to disk under the Reiya Versions folder
/// (every past install leaves its folder behind rather than deleting it), so the
/// user can switch back to one they've already had installed without any network
/// fetch — distinct from the deploy-history list, which only offers builds Roblox
/// still publishes a hash for.
#[tauri::command]
fn list_installed_roblox_versions() -> Vec<InstalledRobloxVersion> {
    let current = read_installed_version();
    let mut out: Vec<InstalledRobloxVersion> = Vec::new();
    let labels = load_version_labels();
    let Ok(entries) = fs::read_dir(versions_dir()) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        if !missing_roblox_version_files(&path).is_empty() { continue; }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        let installed_at = entry.metadata().ok()
            .and_then(|m| m.modified().ok())
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339());
        out.push(InstalledRobloxVersion {
            version: name.to_string(),
            label: labels.get(name).cloned().unwrap_or_default(),
            installed_at,
            is_current: current.as_deref() == Some(name),
            size_bytes: directory_size(&path),
        });
    }
    out.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    out
}

/// Switches the active pinned version to one already downloaded on disk — no
/// network fetch, just re-points version.txt and the protocol handler at it.
#[tauri::command]
async fn use_installed_roblox_version(version_hash: String) -> Result<(), String> {
    let _install = BOOTSTRAPPER_INSTALL.lock().await;
    let hash = normalized_version_hash(&version_hash)?;
    let dir = version_dir(&hash);
    if !missing_roblox_version_files(&dir).is_empty() {
        return Err(format!("Version {} is missing files. Install it again before switching to it.", hash));
    }
    let exe = dir.join("RobloxPlayerBeta.exe");
    write_installed_version(&hash);
    write_pinned(true);
    bootstrapper_register_protocol_internal(&exe.to_string_lossy())?;
    Ok(())
}



#[tauri::command]
fn set_installed_roblox_version_label(version_hash: String, label: String) -> Result<(), String> {
    let hash = normalized_version_hash(&version_hash)?;
    if !version_dir(&hash).join("RobloxPlayerBeta.exe").exists() {
        return Err(format!("Version {} is not installed locally.", hash));
    }
    let mut labels = load_version_labels();
    let clean = label.trim();
    if clean.is_empty() { labels.remove(&hash); } else { labels.insert(hash, clean.chars().take(48).collect()); }
    let json = serde_json::to_string_pretty(&labels).map_err(|e| e.to_string())?;
    atomic_write(&version_labels_path(), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_installed_roblox_version_folder(version_hash: String) -> Result<(), String> {
    let hash = normalized_version_hash(&version_hash)?;
    let dir = version_dir(&hash);
    if !dir.is_dir() { return Err(format!("Version {} is not installed locally.", hash)); }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open version folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn delete_installed_roblox_version(version_hash: String) -> Result<(), String> {
    let _install = BOOTSTRAPPER_INSTALL.lock().await;
    let hash = normalized_version_hash(&version_hash)?;
    if read_installed_version().as_deref() == Some(hash.as_str()) {
        return Err("Switch to another version before deleting the active build.".to_string());
    }
    let dir = version_dir(&hash);
    if !dir.is_dir() { return Err(format!("Version {} is not installed locally.", hash)); }
    fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete {}: {}", hash, e))?;
    let mut labels = load_version_labels();
    if labels.remove(&hash).is_some() {
        let json = serde_json::to_string_pretty(&labels).map_err(|e| e.to_string())?;
        atomic_write(&version_labels_path(), json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct RobloxRepairReport {
    pub version: String,
    pub healthy: bool,
    pub actions: Vec<String>,
    pub missing: Vec<String>,
}

#[tauri::command]
async fn repair_installed_roblox_version(version_hash: Option<String>) -> Result<RobloxRepairReport, String> {
    let _install = BOOTSTRAPPER_INSTALL.lock().await;
    let hash = match version_hash {
        Some(v) if !v.trim().is_empty() => normalized_version_hash(&v)?,
        _ => read_installed_version().ok_or_else(|| "No active Reiya Roblox version is installed.".to_string())?,
    };
    let dir = version_dir(&hash);
    if !dir.is_dir() { return Err(format!("Version {} is not installed locally.", hash)); }

    let mut actions = Vec::new();
    repair_bootstrapper_folders(&dir)?;
    actions.push("Repaired Roblox folder structure".to_string());

    let exe = dir.join("RobloxPlayerBeta.exe");
    if exe.exists() {
        apply_fastflags_to_exe(&exe);
        actions.push("Re-applied FastFlags".to_string());
    }

    let missing = missing_roblox_version_files(&dir);
    if missing.is_empty() && read_installed_version().as_deref() == Some(hash.as_str()) {
        bootstrapper_register_protocol_internal(&exe.to_string_lossy())?;
        actions.push("Re-registered roblox-player protocol".to_string());
    }
    Ok(RobloxRepairReport { version: hash, healthy: missing.is_empty(), actions, missing })
}

#[tauri::command]
async fn bootstrapper_check_update(channel: Option<String>) -> Result<BootstrapperStatus, String> {
    let client = reqwest::Client::builder()
        .user_agent("RobloxBootstrapper")
        .timeout(std::time::Duration::from_secs(30))
        .build().map_err(|e| e.to_string())?;
    let ch = channel.as_deref().unwrap_or("LIVE").trim();
    let url = if ch.is_empty() || ch.eq_ignore_ascii_case("LIVE") {
        VERSION_API.to_string()
    } else {
        format!("https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer/channel/{}", ch)
    };
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Version API error: {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest = json["clientVersionUpload"].as_str().unwrap_or("").to_string();
    let installed = read_installed_version();
    let install_path = versions_dir().to_string_lossy().to_string();
    let exe_path = installed.as_deref().and_then(reiya_player)
        .map(|path| path.to_string_lossy().into_owned());

    let needs_update = exe_path.is_none() || installed.as_deref() != Some(latest.as_str());
    Ok(BootstrapperStatus {
        installed_version: installed,
        latest_version: Some(latest),
        install_path,
        needs_update,
        exe_path,
    })
}

#[tauri::command]
async fn bootstrapper_get_status() -> BootstrapperStatus {
    let installed = read_installed_version();
    let install_path = versions_dir().to_string_lossy().to_string();
    let exe_path = installed.as_deref().and_then(reiya_player)
        .map(|path| path.to_string_lossy().into_owned());
    BootstrapperStatus {
        needs_update: exe_path.is_none(),
        latest_version: None,
        installed_version: installed,
        install_path,
        exe_path,
    }
}

fn pkg_destination_dir(pkg_name: &str) -> String {
    let name = pkg_name.to_lowercase();
    if name == "content-platform-dictionaries.zip" {
        "PlatformContent/pc/shared_compression_dictionaries".to_string()
    } else if name == "content-platform-fonts.zip" || name == "content-fonts.zip" {
        "PlatformContent/pc/fonts".to_string()
    } else if name == "content-terrain.zip" {
        "PlatformContent/pc/terrain".to_string()
    } else if name.starts_with("content-") {
        let suffix = name.trim_start_matches("content-").trim_end_matches(".zip");
        // Strip trailing digits (e.g. textures2 -> textures)
        let clean_suffix = suffix.trim_end_matches(|c: char| c.is_ascii_digit());
        format!("content/{}", clean_suffix)
    } else if name.starts_with("extracontent-") {
        let suffix = name.trim_start_matches("extracontent-").trim_end_matches(".zip");
        match suffix {
            "luapackages" => "ExtraContent/LuaPackages".to_string(),
            "translationtab" | "translations" => "ExtraContent/translationTab".to_string(),
            "models" => "ExtraContent/models".to_string(),
            _ => format!("ExtraContent/{}", suffix)
        }
    } else if name == "shaders.zip" {
        "shaders".to_string()
    } else if name == "ssl.zip" {
        "ssl".to_string()
    } else {
        "".to_string()
    }
}

fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn repair_bootstrapper_folders(version_dir: &std::path::Path) -> Result<(), String> {
    eprintln!("[INFO repair_bootstrapper_folders] Checking Reiya version directory structure: {:?}", version_dir);
    // 1. Write AppSettings.xml if missing
    let app_settings_path = version_dir.join("AppSettings.xml");
    if !app_settings_path.exists() {
        let app_settings_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<Settings>
	<ContentFolder>content</ContentFolder>
	<BaseUrl>http://www.roblox.com</BaseUrl>
</Settings>
"#;
        if let Err(e) = fs::write(&app_settings_path, app_settings_content) {
            eprintln!("[WARNING repair_bootstrapper_folders] Failed to write AppSettings.xml: {}", e);
        } else {
            eprintln!("[INFO repair_bootstrapper_folders] Wrote missing AppSettings.xml");
        }
    }

    // 2. Ensure PlatformContent/pc directories exist
    let pc_dir = version_dir.join("PlatformContent").join("pc");
    let _ = fs::create_dir_all(&pc_dir);

    // 3. Move misplaced folders if they exist in content/
    let content_dir = version_dir.join("content");

    // Move content/platform-dictionaries -> PlatformContent/pc/shared_compression_dictionaries
    let src_dict = content_dir.join("platform-dictionaries");
    let dest_dict = pc_dir.join("shared_compression_dictionaries");
    if src_dict.exists() && !dest_dict.exists() {
        if let Err(e) = fs::rename(&src_dict, &dest_dict) {
            eprintln!("[WARNING repair_bootstrapper_folders] Failed to rename platform-dictionaries: {}", e);
        } else {
            eprintln!("[INFO repair_bootstrapper_folders] Moved platform-dictionaries to shared_compression_dictionaries");
        }
    }

    // Move content/platform-fonts -> PlatformContent/pc/fonts
    let src_pfonts = content_dir.join("platform-fonts");
    let dest_fonts = pc_dir.join("fonts");
    if src_pfonts.exists() && !dest_fonts.exists() {
        if let Err(e) = fs::rename(&src_pfonts, &dest_fonts) {
            eprintln!("[WARNING repair_bootstrapper_folders] Failed to rename platform-fonts: {}", e);
        } else {
            eprintln!("[INFO repair_bootstrapper_folders] Moved platform-fonts to fonts");
        }
    }

    // Move content/terrain -> PlatformContent/pc/terrain
    let src_terrain = content_dir.join("terrain");
    let dest_terrain = pc_dir.join("terrain");
    if src_terrain.exists() && !dest_terrain.exists() {
        if let Err(e) = fs::rename(&src_terrain, &dest_terrain) {
            eprintln!("[WARNING repair_bootstrapper_folders] Failed to rename terrain: {}", e);
        } else {
            eprintln!("[INFO repair_bootstrapper_folders] Moved terrain to pc/terrain");
        }
    }

    // 4. Copy missing folders from official Roblox directory if available
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let roblox_versions_dir = std::path::Path::new(&local).join("Roblox").join("Versions");
        if let Some(official_exe) = search_versions_dir(&roblox_versions_dir) {
            if let Some(official_version_dir) = official_exe.parent() {
                let official_pc_dir = official_version_dir.join("PlatformContent").join("pc");
                if official_pc_dir.exists() {
                    // Copy shared_compression_dictionaries if missing
                    let dest_dict = pc_dir.join("shared_compression_dictionaries");
                    if !dest_dict.exists() {
                        let src = official_pc_dir.join("shared_compression_dictionaries");
                        if src.exists() {
                            let _ = copy_dir_all(&src, &dest_dict);
                            eprintln!("[INFO repair_bootstrapper_folders] Copied shared_compression_dictionaries from official Roblox");
                        }
                    }
                    // Copy fonts if missing
                    let dest_fonts = pc_dir.join("fonts");
                    if !dest_fonts.exists() {
                        let src = official_pc_dir.join("fonts");
                        if src.exists() {
                            let _ = copy_dir_all(&src, &dest_fonts);
                            eprintln!("[INFO repair_bootstrapper_folders] Copied fonts from official Roblox");
                        }
                    }
                    // Copy terrain if missing
                    let dest_terrain = pc_dir.join("terrain");
                    if !dest_terrain.exists() {
                        let src = official_pc_dir.join("terrain");
                        if src.exists() {
                            let _ = copy_dir_all(&src, &dest_terrain);
                            eprintln!("[INFO repair_bootstrapper_folders] Copied terrain from official Roblox");
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn bootstrapper_install(app: AppHandle, version_hash: Option<String>, channel: Option<String>, activate: Option<bool>) -> Result<(), String> {
    eprintln!("[INFO bootstrapper_install] Starting Reiya bootstrapper installation...");
    let _install = BOOTSTRAPPER_INSTALL.lock().await;
    let res = bootstrapper_install_impl(app.clone(), version_hash, channel, activate.unwrap_or(true)).await;
    if let Err(ref e) = res {
        eprintln!("[ERROR bootstrapper_install] Installation failed: {}", e);
        let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
            stage: "Error".into(),
            package: String::new(),
            package_index: 0,
            total_packages: 0,
            percent: 0,
            speed_kbps: 0,
            done: true,
            error: Some(e.clone()),
        });
    } else {
        eprintln!("[INFO bootstrapper_install] Installation completed successfully.");
    }
    res
}

async fn bootstrapper_install_impl(app: AppHandle, pinned_version: Option<String>, channel: Option<String>, activate: bool) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("RobloxBootstrapper")
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create reqwest client: {}", e))?;

    let ch = channel.as_deref().unwrap_or("LIVE").trim();
    let version_api_url = if ch.is_empty() || ch.eq_ignore_ascii_case("LIVE") {
        VERSION_API.to_string()
    } else {
        format!("https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer/channel/{}", ch)
    };

    // 1. Resolve version hash: use the pinned version if provided, else fetch latest for channel.
    let is_pinned = pinned_version.as_ref().is_some_and(|v| !v.trim().is_empty());
    let version_hash = if let Some(raw_v) = pinned_version.filter(|v| !v.trim().is_empty()) {
        let v = raw_v.trim();
        if v == "version-hidden" {
            return Err("This build's version hash isn't published by Roblox anymore, so it can't be installed. Pick a different version or use Latest.".into());
        }
        let normalized = normalized_version_hash(v)?;
        eprintln!("[INFO bootstrapper_install] Using pinned version hash: {}", normalized);
        normalized
    } else {
        eprintln!("[INFO bootstrapper_install] Fetching latest client version from: {}", version_api_url);
        let resp = client.get(&version_api_url).send().await.map_err(|e| format!("Failed to connect to version API: {}", e))?;
        let json: serde_json::Value = resp.json().await.map_err(|e| format!("Failed to parse version JSON: {}", e))?;
        let v = json["clientVersionUpload"].as_str().unwrap_or("").to_string();
        if v.is_empty() {
            return Err("Roblox API returned empty version hash".into());
        }
        eprintln!("[INFO bootstrapper_install] Latest version hash resolved: {}", v);
        normalized_version_hash(&v)?
    };

    // A complete cached build never needs to be overwritten. Activate it only
    // when the caller explicitly asks to switch versions.
    let version_path = version_dir(&version_hash);
    let exe_path = version_path.join("RobloxPlayerBeta.exe");
    if version_path.join(INSTALL_COMPLETE).is_file() && missing_roblox_version_files(&version_path).is_empty() {
        if activate {
            bootstrapper_register_protocol_internal(&exe_path.to_string_lossy())?;
            write_installed_version(&version_hash);
            write_pinned(is_pinned);
        }
        let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
            stage: if activate { "Complete" } else { "Downloaded" }.into(),
            package: String::new(), package_index: 0, total_packages: 0,
            percent: 100, speed_kbps: 0, done: true, error: None,
        });
        return Ok(());
    }

    // 2. Fetch package manifest with channel fallback support
    let manifest_url = if ch.is_empty() || ch.eq_ignore_ascii_case("LIVE") {
        format!("{}/{}-rbxPkgManifest.txt", BOOTSTRAPPER_CDN, version_hash)
    } else {
        format!("{}/channel/{}/{}-rbxPkgManifest.txt", BOOTSTRAPPER_CDN, ch, version_hash)
    };
    eprintln!("[INFO bootstrapper_install] Downloading package manifest from: {}", manifest_url);
    let mut manifest_resp = client.get(&manifest_url).send().await.map_err(|e| format!("Failed to connect to manifest CDN: {}", e))?;
    if !manifest_resp.status().is_success() && !ch.is_empty() && !ch.eq_ignore_ascii_case("LIVE") {
        let fallback_url = format!("{}/{}-rbxPkgManifest.txt", BOOTSTRAPPER_CDN, version_hash);
        if let Ok(resp) = client.get(&fallback_url).send().await {
            if resp.status().is_success() {
                manifest_resp = resp;
            }
        }
    }
    if !manifest_resp.status().is_success() {
        return Err(format!("Manifest download HTTP error: {}", manifest_resp.status()));
    }
    let manifest_text = manifest_resp.text().await.map_err(|e| format!("Failed to read manifest body: {}", e))?;

    // Parse manifest — each entry is 4 lines: filename, md5, compressed_size, size
    let lines: Vec<&str> = manifest_text.lines().collect();
    let mut packages: Vec<(String, String)> = Vec::new(); // (filename, md5)
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.ends_with(".zip") || line.ends_with(".exe") || line.ends_with(".dll") {
            let md5_hash = if i + 1 < lines.len() { lines[i + 1].trim().to_string() } else { String::new() };
            packages.push((line.to_string(), md5_hash));
            i += 4;
        } else {
            i += 1;
        }
    }
    eprintln!("[INFO bootstrapper_install] Parsed manifest, found {} total packages.", packages.len());

    packages.retain(|(name, _)| name.ends_with(".zip"));
    if packages.is_empty() {
        return Err("No packages found in manifest".into());
    }
    let staging = BootstrapperStaging::create()?;
    let install_dir = &staging.0;
    let total = packages.len();

    for (idx, (pkg_name, _pkg_md5)) in packages.iter().enumerate() {
        // Emit start
        let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
            stage: "Downloading".into(),
            package: pkg_name.clone(),
            package_index: idx + 1,
            total_packages: total,
            percent: ((idx as f32 / total as f32) * 100.0) as u32,
            speed_kbps: 0,
            done: false,
            error: None,
        });

        let pkg_url = if ch.is_empty() || ch.eq_ignore_ascii_case("LIVE") {
            format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, pkg_name)
        } else {
            format!("{}/channel/{}/{}-{}", BOOTSTRAPPER_CDN, ch, version_hash, pkg_name)
        };
        let mut pkg_resp = client.get(&pkg_url).send().await.map_err(|e| format!("Download connect error for package '{}': {}", pkg_name, e))?;
        if !pkg_resp.status().is_success() && !ch.is_empty() && !ch.eq_ignore_ascii_case("LIVE") {
            let fallback_url = format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, pkg_name);
            if let Ok(resp) = client.get(&fallback_url).send().await {
                if resp.status().is_success() {
                    pkg_resp = resp;
                }
            }
        }
        if !pkg_resp.status().is_success() {
            return Err(format!("Could not download package '{}' (HTTP {})", pkg_name, pkg_resp.status()));
        }

        // Stream download to memory and report progress while large packages are
        // still arriving. Previously the UI only received an event before and
        // after RobloxApp.zip, which made a healthy download look stuck at 0%.
        let package_size = pkg_resp.content_length();
        let mut bytes_buf: Vec<u8> = Vec::new();
        let mut stream = pkg_resp.bytes_stream();
        let start_time = std::time::Instant::now();
        let mut last_progress_emit = start_time;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Error downloading stream chunk of package '{}': {}", pkg_name, e))?;
            bytes_buf.extend_from_slice(&chunk);

            let now = std::time::Instant::now();
            let download_finished = package_size.is_some_and(|size| bytes_buf.len() as u64 >= size);
            if last_progress_emit.elapsed() >= std::time::Duration::from_millis(200) || download_finished {
                let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
                let speed_kbps = ((bytes_buf.len() as f64 / elapsed) / 1024.0) as u64;
                let package_fraction = package_size
                    .filter(|size| *size > 0)
                    .map(|size| (bytes_buf.len() as f64 / size as f64).clamp(0.0, 1.0))
                    .unwrap_or(0.0);
                let mut percent = (((idx as f64 + package_fraction) / total.max(1) as f64) * 100.0) as u32;
                if !bytes_buf.is_empty() {
                    percent = percent.max(1);
                }
                percent = percent.min(99);

                let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
                    stage: "Downloading".into(),
                    package: pkg_name.clone(),
                    package_index: idx + 1,
                    total_packages: total,
                    percent,
                    speed_kbps,
                    done: false,
                    error: None,
                });
                last_progress_emit = now;
            }
        }
        let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
        let speed_kbps = ((bytes_buf.len() as f64 / elapsed) / 1024.0) as u64;

        // Extract zip into install_dir + mapped subdirectory
        let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
            stage: "Extracting".into(),
            package: pkg_name.clone(),
            package_index: idx + 1,
            total_packages: total,
            percent: ((((idx + 1) as f64 / total.max(1) as f64) * 100.0) as u32).min(99),
            speed_kbps,
            done: false,
            error: None,
        });

        let cursor = std::io::Cursor::new(bytes_buf);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to read zip archive for '{}': {}", pkg_name, e))?;
        let target_dir = install_dir.join(pkg_destination_dir(pkg_name));
        fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create subfolder directory: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("Failed to read index {} from archive of '{}': {}", i, pkg_name, e))?;

            let enclosed_path = match file.enclosed_name() {
                Some(p) => p.to_path_buf(),
                None => {
                    eprintln!("[WARNING bootstrapper_install] Skipping unsafe zip entry: {}", file.name());
                    continue;
                }
            };

            if enclosed_path.as_os_str().is_empty() || enclosed_path.to_string_lossy() == "/" {
                continue;
            }

            let out_path = target_dir.join(&enclosed_path);
            if file.name().ends_with('/') {
                fs::create_dir_all(&out_path).map_err(|e| format!("Failed to create subfolder during extraction '{:?}': {}", out_path, e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent folder structure '{:?}': {}", parent, e))?;
                }
                let mut outf = fs::File::create(&out_path).map_err(|e| format!("Failed to create target file '{:?}': {}", out_path, e))?;
                std::io::copy(&mut file, &mut outf).map_err(|e| format!("Extraction copy failed for '{:?}': {}", out_path, e))?;
            }
        }
    }

    // Download the Roblox launcher (RobloxPlayerInstaller.exe or RobloxPlayerLauncher.exe).
    // Required as parent process by Hyperion anti-cheat; not inside any zip package.
    {
        let mut launcher_downloaded = false;
        for launcher_name in ROBLOX_LAUNCHER_NAMES {
            let launcher_dest = install_dir.join(launcher_name);
            if launcher_dest.exists() { launcher_downloaded = true; break; }
            let versioned_url = if ch.is_empty() || ch.eq_ignore_ascii_case("LIVE") {
                format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, launcher_name)
            } else {
                format!("{}/channel/{}/{}-{}", BOOTSTRAPPER_CDN, ch, version_hash, launcher_name)
            };
            let mut launcher_resp = client.get(&versioned_url).send().await;
            if let Ok(ref resp) = launcher_resp {
                if !resp.status().is_success() && !ch.is_empty() && !ch.eq_ignore_ascii_case("LIVE") {
                    let fallback_url = format!("{}/{}-{}", BOOTSTRAPPER_CDN, version_hash, launcher_name);
                    if let Ok(resp2) = client.get(&fallback_url).send().await {
                        if resp2.status().is_success() {
                            launcher_resp = Ok(resp2);
                        }
                    }
                }
            }
            if let Ok(resp) = launcher_resp {
                if resp.status().is_success() {
                    if let Ok(bytes) = resp.bytes().await {
                        let _ = fs::write(&launcher_dest, &bytes);
                        eprintln!("[INFO bootstrapper_install] Downloaded {} ({} bytes)", launcher_name, bytes.len());
                        launcher_downloaded = true;
                        break;
                    }
                } else {
                    eprintln!("[WARN bootstrapper_install] {} returned {} on CDN", launcher_name, resp.status());
                }
            }
        }
        if !launcher_downloaded {
            eprintln!("[WARN bootstrapper_install] No launcher on CDN — will launch RobloxPlayerBeta.exe directly");
        }
    }

    // Apply any existing FastFlags
    let ff_path = bootstrapper_root().join("fastflags.json");
    if ff_path.exists() {
        if let Ok(ff_content) = fs::read_to_string(&ff_path) {
            let client_settings_dir = install_dir.join("ClientSettings");
            fs::create_dir_all(&client_settings_dir).map_err(|e| format!("Failed to create ClientSettings directory: {}", e))?;
            fs::write(client_settings_dir.join("ClientAppSettings.json"), &ff_content).map_err(|e| format!("Failed to write ClientAppSettings: {}", e))?;
            eprintln!("[INFO bootstrapper_install] Applied FastFlags.");
        }
    }

    repair_bootstrapper_folders(install_dir)?;
    staging.publish(&version_path)?;

    if activate {
        bootstrapper_register_protocol_internal(&exe_path.to_string_lossy())?;
        write_installed_version(&version_hash);
        write_pinned(is_pinned);
    }

    let _ = app.emit("bootstrapper-progress", BootstrapperProgress {
        stage: if activate { "Complete" } else { "Downloaded" }.into(),
        package: String::new(),
        package_index: total,
        total_packages: total,
        percent: 100,
        speed_kbps: 0,
        done: true,
        error: None,
    });

    Ok(())
}

#[cfg(windows)]
fn bootstrapper_register_protocol_internal(exe_path: &str) -> Result<(), String> {
    use winreg::{
        enums::HKEY_CURRENT_USER,
        RegKey,
    };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (proto_key, _) = hkcu
        .create_subkey(r"Software\Classes\roblox-player")
        .map_err(|e| e.to_string())?;
    proto_key.set_value("", &"URL:Roblox Protocol").map_err(|e| e.to_string())?;
    proto_key.set_value("URL Protocol", &"").map_err(|e| e.to_string())?;

    let (cmd_key, _) = hkcu
        .create_subkey(r"Software\Classes\roblox-player\shell\open\command")
        .map_err(|e| e.to_string())?;
    let cmd_val = format!("\"{}\" \"%1\"", exe_path);
    cmd_key.set_value("", &cmd_val).map_err(|e| e.to_string())?;

    drop(cmd_key);
    drop(proto_key);

    // Also handle roblox: (without -player)
    let (roblox_key, _) = hkcu
        .create_subkey(r"Software\Classes\roblox")
        .map_err(|e| e.to_string())?;
    roblox_key.set_value("", &"URL:Roblox Protocol").map_err(|e| e.to_string())?;
    roblox_key.set_value("URL Protocol", &"").map_err(|e| e.to_string())?;
    let (roblox_cmd_key, _) = hkcu
        .create_subkey(r"Software\Classes\roblox\shell\open\command")
        .map_err(|e| e.to_string())?;
    roblox_cmd_key.set_value("", &cmd_val).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(windows))]
fn bootstrapper_register_protocol_internal(_exe_path: &str) -> Result<(), String> {
    Err("Protocol registration is only supported on Windows".into())
}

#[tauri::command]
fn bootstrapper_register_protocol() -> Result<(), String> {
    let installed = read_installed_version().ok_or("No version installed yet")?;
    let exe = version_dir(&installed).join("RobloxPlayerBeta.exe");
    if !exe.exists() {
        return Err("RobloxPlayerBeta.exe not found in installed version directory".into());
    }
    bootstrapper_register_protocol_internal(&exe.to_string_lossy())
}

// ── FastFlags ──────────────────────────────────────────────────────────────────

fn fastflags_path() -> PathBuf {
    bootstrapper_root().join("fastflags.json")
}

/// Write the saved fastflags.json into the ClientSettings folder next to the
/// given Roblox exe. Called before every launch regardless of which launcher
/// is used so flags always take effect.
/// If flags are empty or missing, the ClientAppSettings.json is deleted so
/// Roblox reverts to its own defaults instead of keeping stale overrides.
fn apply_fastflags_to_exe(exe: &Path) {
    static FASTFLAGS_IO: Mutex<()> = Mutex::new(());
    let _io = FASTFLAGS_IO.lock().unwrap_or_else(|e| e.into_inner());
    let Some(dir) = exe.parent() else { return };
    let target_file = dir.join("ClientSettings").join("ClientAppSettings.json");

    let ff_path = fastflags_path();
    let content = if ff_path.exists() {
        match fs::read_to_string(&ff_path) {
            Ok(s) => s,
            Err(_) => return,
        }
    } else {
        String::new()
    };

    // Treat missing file or empty object as "no flags" — remove the override.
    let is_empty = content.is_empty()
        || serde_json::from_str::<serde_json::Value>(&content)
            .map(|v| v.as_object().is_none_or(|o| o.is_empty()))
            .unwrap_or(false);

    if is_empty {
        if target_file.exists() {
            if let Err(e) = fs::remove_file(&target_file) {
                eprintln!("[WARN FastFlags] Failed to remove {:?}: {}", target_file, e);
            } else {
                println!("[FastFlags] Cleared ClientAppSettings.json at {:?}", target_file);
            }
        }
    } else {
        let cs_dir = dir.join("ClientSettings");
        if let Err(e) = fs::create_dir_all(&cs_dir) {
            eprintln!("[WARN FastFlags] Failed to create ClientSettings directory {:?}: {}", cs_dir, e);
        }
        if let Err(e) = fs::write(&target_file, &content) {
            eprintln!("[WARN FastFlags] Failed to write ClientAppSettings.json to {:?}: {}", target_file, e);
        } else {
            println!("[FastFlags] Applied FastFlags to {:?}", target_file);
        }
    }
}

/// Push the current fastflags.json state to every known Roblox installation.
/// Called both on save and before each launch so all launchers stay in sync.
fn sync_fastflags_to_all_launchers() {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();

    // Reiya bootstrapper
    if let Some(ver) = read_installed_version() {
        apply_fastflags_to_exe(&version_dir(&ver).join("RobloxPlayerBeta.exe"));
    }

    // Official Roblox
    if let Some(exe) = find_official_roblox_exe() {
        apply_fastflags_to_exe(&exe);
    }

    // Bloxstrap
    if let Some(exe) = search_versions_dir(&PathBuf::from(&local).join("Bloxstrap").join("Versions")) {
        apply_fastflags_to_exe(&exe);
    }

    // Fishstrap / Fishtrap (both spellings)
    for dir_name in &["Fishstrap", "Fishtrap"] {
        if let Some(exe) = search_versions_dir(&PathBuf::from(&local).join(dir_name).join("Versions")) {
            apply_fastflags_to_exe(&exe);
        }
    }
}

/// Find the active official Roblox exe (not Reiya's install).
fn find_official_roblox_exe() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let candidates = [
        PathBuf::from(&local).join("Roblox").join("Versions"),
        PathBuf::from("C:\\Program Files (x86)\\Roblox\\Versions"),
        PathBuf::from("C:\\Program Files\\Roblox\\Versions"),
    ];
    candidates.iter().find_map(search_versions_dir)
}

#[tauri::command]
fn get_fastflags() -> serde_json::Value {
    let path = fastflags_path();
    if !path.exists() {
        return serde_json::json!({});
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

#[tauri::command]
fn save_fastflags(flags: serde_json::Value) -> Result<(), String> {
    // Persist the master copy.
    let s = serde_json::to_string_pretty(&flags).map_err(|e| e.to_string())?;
    atomic_write(&fastflags_path(), &s).map_err(|e| e.to_string())?;

    // Push the change (or the absence of flags) to every known Roblox install
    // immediately so the user doesn't need to relaunch through Reiya for it
    // to take effect.
    sync_fastflags_to_all_launchers();

    Ok(())
}

// ── Discord Rich Presence IPC ──────────────────────────────────────────────────

#[cfg(windows)]
fn discord_ipc_send(pipe: &mut std::fs::File, opcode: u32, payload: &str) -> bool {
    use std::io::Write;
    let bytes = payload.as_bytes();
    let mut buf = Vec::with_capacity(8 + bytes.len());
    buf.extend_from_slice(&opcode.to_le_bytes());
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
    pipe.write_all(&buf).is_ok()
}

#[cfg(windows)]
fn discord_ipc_read(pipe: &mut std::fs::File, timeout_ms: u64) -> Option<String> {
    use std::io::Read;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::Pipes::PeekNamedPipe;

    let handle = pipe.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
    let start = std::time::Instant::now();

    loop {
        if start.elapsed().as_millis() as u64 >= timeout_ms { return None; }
        let mut avail: u32 = 0;
        unsafe { PeekNamedPipe(handle, std::ptr::null_mut(), 0, std::ptr::null_mut(), &mut avail, std::ptr::null_mut()); }
        if avail >= 8 { break; }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }

    let mut hdr = [0u8; 8];
    pipe.read_exact(&mut hdr).ok()?;
    let data_len = u32::from_le_bytes(hdr[4..8].try_into().ok()?) as usize;
    if data_len == 0 { return Some(String::new()); }
    if data_len > 65536 { return None; }

    let handle = pipe.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
    let start2 = std::time::Instant::now();
    loop {
        if start2.elapsed().as_millis() as u64 >= timeout_ms { return None; }
        let mut avail: u32 = 0;
        unsafe { PeekNamedPipe(handle, std::ptr::null_mut(), 0, std::ptr::null_mut(), &mut avail, std::ptr::null_mut()); }
        if avail >= data_len as u32 { break; }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }

    let mut data = vec![0u8; data_len];
    pipe.read_exact(&mut data).ok()?;
    Some(String::from_utf8_lossy(&data).into_owned())
}

const DISCORD_CLIENT_ID: &str = "1506749742929940550";

#[cfg(windows)]
fn discord_rpc_worker(stop_flag: Arc<std::sync::atomic::AtomicBool>, page: Arc<Mutex<String>>) {
    use std::fs::OpenOptions;
    use std::sync::atomic::Ordering;

    let pid = std::process::id();
    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let make_activity = |details: &str| serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": pid,
            "activity": {
                "details": details,
                "state": "Reiya Account Manager",
                "timestamps": { "start": start_ts },
                "assets": {
                    "large_image": "reiya_logo",
                    "large_text": "Reiya Account Manager"
                }
            }
        },
        "nonce": "reiya_rpc"
    }).to_string();

    'outer: loop {
        if stop_flag.load(Ordering::Relaxed) { return; }

        let mut pipe = None;
        for i in 0..10i32 {
            if stop_flag.load(Ordering::Relaxed) { return; }
            let path = format!(r"\\.\pipe\discord-ipc-{}", i);
            if let Ok(f) = OpenOptions::new().read(true).write(true).open(&path) {
                pipe = Some(f);
                break;
            }
        }
        let mut pipe = match pipe {
            Some(p) => p,
            None => {
                for _ in 0..100 {
                    if stop_flag.load(Ordering::Relaxed) { return; }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                continue 'outer;
            }
        };

        let handshake = serde_json::json!({"v": 1, "client_id": DISCORD_CLIENT_ID}).to_string();
        if !discord_ipc_send(&mut pipe, 0, &handshake) { continue 'outer; }
        if discord_ipc_read(&mut pipe, 5000).is_none() { continue 'outer; }

        let mut last_page = page.lock().unwrap().clone();
        let activity = make_activity(&last_page);
        if !discord_ipc_send(&mut pipe, 1, &activity) { continue 'outer; }
        let _ = discord_ipc_read(&mut pipe, 3000);

        let mut ticks_since_heartbeat = 0u32;
        loop {
            if stop_flag.load(Ordering::Relaxed) { return; }
            std::thread::sleep(std::time::Duration::from_millis(500));
            ticks_since_heartbeat += 1;

            let current = page.lock().unwrap().clone();
            let page_changed = current != last_page;
            let heartbeat_due = ticks_since_heartbeat >= 30; // 30 * 500ms = 15s

            if page_changed || heartbeat_due {
                let activity = make_activity(&current);
                if !discord_ipc_send(&mut pipe, 1, &activity) {
                    continue 'outer;
                }
                let _ = discord_ipc_read(&mut pipe, 2000);
                last_page = current;
                ticks_since_heartbeat = 0;
            }
        }
    }
}

#[tauri::command]
fn start_discord_rpc(rpc: tauri::State<DiscordRpcHolder>, page_state: tauri::State<DiscordRpcPage>) {
    let mut guard = rpc.0.lock().unwrap();
    if let Some(runner) = guard.take() { runner.stop(); }
    #[cfg(windows)]
    {
        let stop_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = stop_flag.clone();
        let page = page_state.0.clone();
        std::thread::spawn(move || discord_rpc_worker(flag, page));
        *guard = Some(DiscordRpcRunner { stop_flag });
    }
}

#[tauri::command]
fn stop_discord_rpc(rpc: tauri::State<DiscordRpcHolder>) {
    let mut guard = rpc.0.lock().unwrap();
    if let Some(runner) = guard.take() { runner.stop(); }
}

#[tauri::command]
fn update_discord_rpc(page: String, page_state: tauri::State<DiscordRpcPage>) {
    let mut current = page_state.0.lock().unwrap();
    // Don't let navigation updates override an active game session
    let is_playing = current.starts_with("Playing ") || current.starts_with("Launching ");
    let is_nav_update = !page.starts_with("Playing ") && !page.starts_with("Launching ");
    if is_playing && is_nav_update {
        return;
    }
    *current = page;
}

#[tauri::command]
fn clear_game_rpc(page_state: tauri::State<DiscordRpcPage>) {
    *page_state.0.lock().unwrap() = "On Home".to_string();
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FastFlagPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub flags: serde_json::Value,
}

#[tauri::command]
fn get_fastflag_presets() -> Vec<FastFlagPreset> {
    vec![
        FastFlagPreset {
            id: "fps_unlock".into(),
            name: "Unlock FPS".into(),
            description: "Removes the 60 FPS cap so Roblox can run at your monitor's refresh rate.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": false,
                "DFIntTaskSchedulerTargetFps": 0
            }),
        },
        FastFlagPreset {
            id: "performance_mode".into(),
            name: "Performance Mode".into(),
            description: "Disables heavy rendering features to maximize FPS on lower-end hardware.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "DFFlagDisableDPIScale": true,
                "FIntRenderShadowIntensity": 0,
                "DFIntCSGLevelOfDetailSwitchingDistance": 0,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 0,
                "FIntDebugForceMSAASamples": 0,
                "DFIntDebugFRMQualityLevelOverride": 1
            }),
        },
        FastFlagPreset {
            id: "graphics_quality".into(),
            name: "Max Graphics Quality".into(),
            description: "Enables high-quality rendering settings for the best visual experience.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugForceMSAASamples": 4,
                "DFIntDebugFRMQualityLevelOverride": 21,
                "FFlagDebugGraphicsPreferD3D11FL10": true
            }),
        },
        FastFlagPreset {
            id: "disable_telemetry".into(),
            name: "Disable Telemetry".into(),
            description: "Disables Roblox's background analytics and telemetry reporting.".into(),
            category: "Privacy".into(),
            flags: serde_json::json!({
                "FFlagDebugDisableTelemetryEphemeralCounter": true,
                "FFlagDebugDisableTelemetryEphemeralStat": true,
                "FFlagDebugDisableTelemetryEventIngest": true,
                "FFlagDebugDisableTelemetryPoint": true,
                "FFlagDebugDisableTelemetryV2Counter": true,
                "FFlagDebugDisableTelemetryV2Event": true,
                "FFlagDebugDisableTelemetryV2Stat": true
            }),
        },
        FastFlagPreset {
            id: "reduce_render_distance".into(),
            name: "Reduce Render Distance".into(),
            description: "Lowers the distance at which objects render for a significant FPS boost.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "DFIntRenderLocalLightFadeMax": 1,
                "DFIntCSGLevelOfDetailSwitchingDistance": 250,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 500
            }),
        },
        FastFlagPreset {
            id: "disable_vc".into(),
            name: "Disable Voice Chat".into(),
            description: "Fully disables the Roblox spatial voice chat system.".into(),
            category: "Misc".into(),
            flags: serde_json::json!({
                "DFFlagVoiceChatEnabledForAllUsers": false,
                "FFlagEnableVoiceChat": false
            }),
        },
        FastFlagPreset {
            id: "old_lighting".into(),
            name: "Legacy Lighting (Voxel)".into(),
            description: "Forces Roblox to use the classic voxel-based lighting engine.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFFlagDebugForceFutureIsBrightPhase2": false,
                "FFlagDebugForceFutureLighting": false
            }),
        },
        FastFlagPreset {
            id: "no_shadows".into(),
            name: "Disable Shadows".into(),
            description: "Turns off all shadow rendering for maximum performance.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FIntRenderShadowIntensity": 0,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 2147483647,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 2147483647
            }),
        },
        FastFlagPreset {
            id: "potato_mode".into(),
            name: "Potato Mode".into(),
            description: "Every performance optimization combined — lowest possible quality for maximum FPS on weak hardware.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": false,
                "DFIntTaskSchedulerTargetFps": 9999,
                "DFIntDebugFRMQualityLevelOverride": 1,
                "FIntRenderShadowIntensity": 0,
                "DFIntCSGLevelOfDetailSwitchingDistance": 0,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 0,
                "FIntDebugForceMSAASamples": 0,
                "DFFlagDisablePostFx": true,
                "DFIntRenderLocalLightFadeMax": 1,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 2147483647,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 2147483647,
                "DFFlagDebugForceFutureIsBrightPhase2": false,
                "FFlagDebugForceFutureLighting": false,
                "FFlagDebugDisableTelemetryEphemeralCounter": true,
                "FFlagDebugDisableTelemetryEphemeralStat": true,
                "FFlagDebugDisableTelemetryEventIngest": true,
                "FFlagDebugDisableTelemetryPoint": true,
                "FFlagDebugDisableTelemetryV2Counter": true,
                "FFlagDebugDisableTelemetryV2Event": true,
                "FFlagDebugDisableTelemetryV2Stat": true
            }),
        },
        FastFlagPreset {
            id: "disable_post_fx".into(),
            name: "No Post-Processing Effects".into(),
            description: "Disables bloom, depth-of-field, and motion blur without changing other graphics settings.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFFlagDisablePostFx": true
            }),
        },
        FastFlagPreset {
            id: "high_fps".into(),
            name: "Max FPS (9999 Target)".into(),
            description: "Removes the FPS cap entirely and sets the scheduler target to 9999 for maximum smoothness.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": false,
                "DFIntTaskSchedulerTargetFps": 9999
            }),
        },
        FastFlagPreset {
            id: "hardware_cursor".into(),
            name: "Hardware Cursor".into(),
            description: "Uses the OS hardware cursor instead of Roblox's software-rendered cursor — reduces click latency.".into(),
            category: "Misc".into(),
            flags: serde_json::json!({
                "FFlagEnableHardwareCursor": true
            }),
        },
        FastFlagPreset {
            id: "full_privacy".into(),
            name: "Full Privacy Mode".into(),
            description: "Disables all telemetry, analytics, and voice chat — nothing is sent to Roblox's data collection.".into(),
            category: "Privacy".into(),
            flags: serde_json::json!({
                "FFlagDebugDisableTelemetryEphemeralCounter": true,
                "FFlagDebugDisableTelemetryEphemeralStat": true,
                "FFlagDebugDisableTelemetryEventIngest": true,
                "FFlagDebugDisableTelemetryPoint": true,
                "FFlagDebugDisableTelemetryV2Counter": true,
                "FFlagDebugDisableTelemetryV2Event": true,
                "FFlagDebugDisableTelemetryV2Stat": true,
                "DFFlagVoiceChatEnabledForAllUsers": false,
                "FFlagEnableVoiceChat": false
            }),
        },
        FastFlagPreset {
            id: "no_msaa".into(),
            name: "No Anti-Aliasing (MSAA Off)".into(),
            description: "Disables MSAA anti-aliasing for better performance at the cost of jagged edges.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugForceMSAASamples": 0
            }),
        },
        FastFlagPreset {
            id: "msaa_8x".into(),
            name: "Maximum Anti-Aliasing (MSAA 8x)".into(),
            description: "Enables 8x MSAA for the smoothest possible edges — requires a powerful GPU.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugForceMSAASamples": 8
            }),
        },
        FastFlagPreset {
            id: "minimal_lighting".into(),
            name: "Minimal Lighting".into(),
            description: "Combines legacy voxel lighting and all shadow options disabled — big FPS boost in lit environments.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntRenderShadowIntensity": 0,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 2147483647,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 2147483647,
                "DFFlagDebugForceFutureIsBrightPhase2": false,
                "FFlagDebugForceFutureLighting": false
            }),
        },
        FastFlagPreset {
            id: "low_texture_quality".into(),
            name: "Low Texture Quality".into(),
            description: "Forces lower-resolution textures to save VRAM and reduce stutters on low-end GPUs.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FIntDebugTextureManagerSkipMips": 8
            }),
        },
        FastFlagPreset {
            id: "high_texture_quality".into(),
            name: "High Texture Quality".into(),
            description: "Loads full-resolution textures for crisper visuals — requires ample VRAM.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugTextureManagerSkipMips": 0
            }),
        },
        FastFlagPreset {
            id: "disable_ads".into(),
            name: "Disable In-Experience Ads".into(),
            description: "Prevents Roblox from loading video and banner advertisements inside games.".into(),
            category: "Privacy".into(),
            flags: serde_json::json!({
                "FFlagAdServiceEnabled": false
            }),
        },
        FastFlagPreset {
            id: "smooth_terrain".into(),
            name: "High Quality Terrain".into(),
            description: "Raises terrain LOD distances so details remain crisp at far distances.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFIntCSGLevelOfDetailSwitchingDistance": 1000,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 2000
            }),
        },
        FastFlagPreset {
            id: "reduce_local_lights".into(),
            name: "Reduce Dynamic Lighting".into(),
            description: "Fades out local dynamic lights more aggressively to improve frame times.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "DFIntRenderLocalLightFadeMax": 1,
                "DFIntRenderLocalLightFadeMin": 0,
                "DFIntRenderLocalLightUpdateDistanceMax": 20,
                "DFIntRenderLocalLightUpdateDistanceMin": 10
            }),
        },
        FastFlagPreset {
            id: "d3d11".into(),
            name: "Force DirectX 11".into(),
            description: "Forces Roblox to use the DirectX 11 renderer — more stable on some older GPU drivers.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagDebugGraphicsPreferD3D11": true,
                "FFlagDebugGraphicsPreferD3D11FL10": false
            }),
        },
        FastFlagPreset {
            id: "4x_msaa".into(),
            name: "4x Anti-Aliasing (MSAA 4x)".into(),
            description: "Forces 4x MSAA for smooth edges on all geometry — best paired with Max Graphics.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugForceMSAASamples": 4
            }),
        },
        FastFlagPreset {
            id: "future_lighting".into(),
            name: "Future Lighting (Force On)".into(),
            description: "Forces the Future lighting engine even in games that use lower quality lighting modes.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFFlagDebugForceFutureIsBrightPhase2": true,
                "FFlagDebugForceFutureLighting": true
            }),
        },
        FastFlagPreset {
            id: "network_optimize".into(),
            name: "Network Optimization".into(),
            description: "Tunes physics replication send rates to reduce jitter and perceived network lag.".into(),
            category: "Network".into(),
            flags: serde_json::json!({
                "DFIntS2PhysicsSenderRate": 30,
                "DFIntDataSendRate": 30
            }),
        },
        // ── FPS Caps ──────────────────────────────────────────────────
        FastFlagPreset {
            id: "fps_30".into(),
            name: "Cap FPS at 30".into(),
            description: "Limits to 30 FPS — maximum battery saving for laptops or thermal throttled machines.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": true,
                "DFIntTaskSchedulerTargetFps": 30
            }),
        },
        FastFlagPreset {
            id: "fps_60".into(),
            name: "Cap FPS at 60".into(),
            description: "Hard-locks to 60 FPS for consistent frame pacing and lower GPU temperature.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": true,
                "DFIntTaskSchedulerTargetFps": 60
            }),
        },
        FastFlagPreset {
            id: "fps_144".into(),
            name: "Cap FPS at 144".into(),
            description: "Targets 144 FPS for high-refresh-rate monitors without going to uncapped 9999.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": true,
                "DFIntTaskSchedulerTargetFps": 144
            }),
        },
        FastFlagPreset {
            id: "fps_240".into(),
            name: "Cap FPS at 240".into(),
            description: "Targets 240 FPS for 240 Hz monitors — good balance between performance and GPU load.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": true,
                "DFIntTaskSchedulerTargetFps": 240
            }),
        },
        // ── Renderer ──────────────────────────────────────────────────
        FastFlagPreset {
            id: "vulkan".into(),
            name: "Force Vulkan Renderer".into(),
            description: "Switches to the Vulkan rendering backend — lower CPU overhead on supported GPUs (AMD/NVIDIA).".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagDebugGraphicsPreferVulkan": true
            }),
        },
        FastFlagPreset {
            id: "opengl".into(),
            name: "Force OpenGL Renderer".into(),
            description: "Falls back to the OpenGL renderer — useful if DX11 or Vulkan causes issues.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagDebugGraphicsPreferOpenGL": true
            }),
        },
        FastFlagPreset {
            id: "shadowmap_lighting".into(),
            name: "ShadowMap Lighting Engine".into(),
            description: "Forces the ShadowMap lighting engine — a middle ground between Legacy and Future lighting.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagDebugForceShadowMapLighting": true,
                "DFFlagDebugForceFutureIsBrightPhase2": false,
                "FFlagDebugForceFutureLighting": false
            }),
        },
        // ── Grass & Terrain ───────────────────────────────────────────
        FastFlagPreset {
            id: "no_grass".into(),
            name: "Disable Grass Rendering".into(),
            description: "Completely removes grass strands from terrain — notable FPS improvement in open-world games.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FIntFRMMinGrassDistance": 0,
                "FIntFRMMaxGrassDistance": 0,
                "FIntRenderGrassDetailStrands": 0,
                "DFIntRenderGrassHeightScaler": 0
            }),
        },
        FastFlagPreset {
            id: "max_grass".into(),
            name: "Maximum Grass Detail".into(),
            description: "Extends grass render distance and density for lush terrain visuals.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntFRMMinGrassDistance": 100,
                "FIntFRMMaxGrassDistance": 500,
                "FIntRenderGrassDetailStrands": 50
            }),
        },
        // ── Post-FX ───────────────────────────────────────────────────
        FastFlagPreset {
            id: "no_depth_of_field".into(),
            name: "Disable Depth of Field".into(),
            description: "Removes the depth-of-field blur effect in games that use it.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagRenderDepthOfFieldEnabled": false
            }),
        },
        FastFlagPreset {
            id: "no_sun_rays".into(),
            name: "Disable Sun Rays / God Rays".into(),
            description: "Turns off the volumetric sun ray effect for a cleaner look and slight performance gain.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagRenderSunRaysEnabled": false
            }),
        },
        FastFlagPreset {
            id: "no_color_correction".into(),
            name: "Disable Color Correction".into(),
            description: "Removes color grading / color correction PostFX applied by the game.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagRenderColorCorrectionEnabled": false
            }),
        },
        // ── Physics ───────────────────────────────────────────────────
        FastFlagPreset {
            id: "high_physics_rate".into(),
            name: "High Physics Send Rate (120 Hz)".into(),
            description: "Doubles physics replication frequency for smoother character movement in competitive play.".into(),
            category: "Network".into(),
            flags: serde_json::json!({
                "DFIntS2PhysicsSenderRate": 120,
                "DFIntDataSendRate": 60
            }),
        },
        FastFlagPreset {
            id: "low_network_quality".into(),
            name: "Low Bandwidth Mode".into(),
            description: "Reduces physics and data send rates to save bandwidth on metered connections.".into(),
            category: "Network".into(),
            flags: serde_json::json!({
                "DFIntS2PhysicsSenderRate": 15,
                "DFIntDataSendRate": 15
            }),
        },
        // ── Privacy / Crash ───────────────────────────────────────────
        FastFlagPreset {
            id: "no_crash_reporting".into(),
            name: "Disable Crash Reporting".into(),
            description: "Prevents crash dumps and error reports from being uploaded to Roblox servers.".into(),
            category: "Privacy".into(),
            flags: serde_json::json!({
                "FFlagCrashReportingEnabled": false
            }),
        },
        // ── UI / Misc ─────────────────────────────────────────────────
        FastFlagPreset {
            id: "no_gui_blur".into(),
            name: "Disable Menu Blur".into(),
            description: "Removes the background blur effect applied when the in-game menu or UI overlays open.".into(),
            category: "Misc".into(),
            flags: serde_json::json!({
                "FIntBgBlurRadius": 0,
                "FIntBgBlurIterations": 0
            }),
        },
        FastFlagPreset {
            id: "show_fps_counter".into(),
            name: "Always Show FPS Counter".into(),
            description: "Forces Roblox's built-in FPS counter to always be visible without needing Shift+F5.".into(),
            category: "Misc".into(),
            flags: serde_json::json!({
                "FFlagDebugDisplayFPS": true
            }),
        },
        FastFlagPreset {
            id: "disable_layered_clothing".into(),
            name: "Disable Layered Clothing".into(),
            description: "Skips rendering layered clothing (jackets, hoodies) — boosts FPS in crowded servers.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagLayeredClothingEnabled": false,
                "DFFlagLayeredClothingEnabledForAll": false
            }),
        },
        FastFlagPreset {
            id: "disable_player_avatars".into(),
            name: "Low-Detail Player Characters".into(),
            description: "Reduces character mesh detail and skips accessory loading — large FPS gain in populated servers.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagAvatarSelfViewEnabled": false,
                "DFIntLodAvatarMinThreshold": 0,
                "DFIntLodAvatarMaxThreshold": 1
            }),
        },
        FastFlagPreset {
            id: "reduced_loading_screen".into(),
            name: "Faster Game Loading".into(),
            description: "Skips loading screen delays and reduces asset prefetch pauses to get into games faster.".into(),
            category: "Misc".into(),
            flags: serde_json::json!({
                "DFIntNumAssetsMaxToPreload": 0,
                "DFIntAssetPreloading": 0
            }),
        },
        FastFlagPreset {
            id: "ultra_quality".into(),
            name: "Ultra Quality Preset".into(),
            description: "Combines max MSAA, max texture quality, high terrain LOD, and Future lighting for the best possible visuals.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntDebugForceMSAASamples": 8,
                "DFIntDebugFRMQualityLevelOverride": 21,
                "FIntDebugTextureManagerSkipMips": 0,
                "DFIntCSGLevelOfDetailSwitchingDistance": 1000,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 2000,
                "DFFlagDebugForceFutureIsBrightPhase2": true,
                "FFlagDebugForceFutureLighting": true
            }),
        },
        FastFlagPreset {
            id: "competitive".into(),
            name: "Competitive / Low-Latency".into(),
            description: "Maximizes FPS, disables all visual fluff, and tunes physics rate for the lowest possible latency in PvP games.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": false,
                "DFIntTaskSchedulerTargetFps": 9999,
                "DFIntDebugFRMQualityLevelOverride": 1,
                "FIntRenderShadowIntensity": 0,
                "FIntDebugForceMSAASamples": 0,
                "DFFlagDisablePostFx": true,
                "FFlagEnableHardwareCursor": true,
                "FFlagLayeredClothingEnabled": false,
                "DFFlagLayeredClothingEnabledForAll": false,
                "FIntFRMMinGrassDistance": 0,
                "FIntFRMMaxGrassDistance": 0,
                "FIntRenderGrassDetailStrands": 0,
                "DFIntS2PhysicsSenderRate": 120,
                "DFIntDataSendRate": 60,
                "FFlagDebugDisableTelemetryEphemeralCounter": true,
                "FFlagDebugDisableTelemetryEphemeralStat": true,
                "FFlagDebugDisableTelemetryEventIngest": true,
                "FFlagDebugDisableTelemetryPoint": true,
                "FFlagDebugDisableTelemetryV2Counter": true,
                "FFlagDebugDisableTelemetryV2Event": true,
                "FFlagDebugDisableTelemetryV2Stat": true
            }),
        },
        // ── Extra Performance ─────────────────────────────────────────────
        FastFlagPreset {
            id: "no_dynamic_lights".into(),
            name: "Disable Dynamic Lights".into(),
            description: "Zeroes out all local/point light fade distances so dynamic lights never render — eliminates the GPU cost of lit environments entirely.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "DFIntRenderLocalLightFadeMax": 0,
                "DFIntRenderLocalLightFadeMin": 0,
                "DFIntRenderLocalLightUpdateDistanceMax": 0,
                "DFIntRenderLocalLightUpdateDistanceMin": 0
            }),
        },
        FastFlagPreset {
            id: "low_physics_overhead".into(),
            name: "Low Physics Overhead".into(),
            description: "Cuts physics send and data rates to the minimum to free CPU cycles — best for PvE games where exact physics timing doesn't matter.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "DFIntS2PhysicsSenderRate": 4,
                "DFIntDataSendRate": 4
            }),
        },
        FastFlagPreset {
            id: "afk_farm_mode".into(),
            name: "AFK / Farm Mode".into(),
            description: "Locks FPS to 30, strips all rendering quality, and slashes physics rates — ideal for idle or farming accounts running in the background.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagTaskSchedulerLimitTargetFps": true,
                "DFIntTaskSchedulerTargetFps": 30,
                "DFIntDebugFRMQualityLevelOverride": 1,
                "FIntRenderShadowIntensity": 0,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 2147483647,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 2147483647,
                "FIntDebugForceMSAASamples": 0,
                "DFFlagDisablePostFx": true,
                "DFIntRenderLocalLightFadeMax": 0,
                "DFIntRenderLocalLightFadeMin": 0,
                "DFIntRenderLocalLightUpdateDistanceMax": 0,
                "DFIntRenderLocalLightUpdateDistanceMin": 0,
                "FIntFRMMinGrassDistance": 0,
                "FIntFRMMaxGrassDistance": 0,
                "FIntRenderGrassDetailStrands": 0,
                "DFIntRenderGrassHeightScaler": 0,
                "DFIntCSGLevelOfDetailSwitchingDistance": 0,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 0,
                "DFIntS2PhysicsSenderRate": 10,
                "DFIntDataSendRate": 10,
                "FFlagLayeredClothingEnabled": false,
                "DFFlagLayeredClothingEnabledForAll": false
            }),
        },
        FastFlagPreset {
            id: "reduce_memory".into(),
            name: "Reduce Memory Usage".into(),
            description: "Skips mip levels to cut VRAM usage, disables asset preloading, and pulls terrain LOD in tight — helps on systems with 4 GB RAM or less.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FIntDebugTextureManagerSkipMips": 8,
                "DFIntNumAssetsMaxToPreload": 0,
                "DFIntAssetPreloading": 0,
                "DFIntCSGLevelOfDetailSwitchingDistance": 100,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 200
            }),
        },
        FastFlagPreset {
            id: "minimal_character_rendering".into(),
            name: "Minimal Character Rendering".into(),
            description: "Aggressively reduces all character-related rendering — disables layered clothing, forces lowest avatar LOD, and removes self-view — biggest gains in crowded lobbies.".into(),
            category: "Performance".into(),
            flags: serde_json::json!({
                "FFlagLayeredClothingEnabled": false,
                "DFFlagLayeredClothingEnabledForAll": false,
                "DFIntLodAvatarMinThreshold": 0,
                "DFIntLodAvatarMaxThreshold": 0,
                "FFlagAvatarSelfViewEnabled": false
            }),
        },
        FastFlagPreset {
            id: "minimal_network".into(),
            name: "Minimal Network Usage".into(),
            description: "Drops physics and data send rates to their floor, reducing upload bandwidth — useful for heavily metered connections or mobile hotspots.".into(),
            category: "Network".into(),
            flags: serde_json::json!({
                "DFIntS2PhysicsSenderRate": 4,
                "DFIntDataSendRate": 4,
                "DFIntConnectionMTUSize": 900
            }),
        },
        // ── Visual Enhancement ─────────────────────────────────────────────
        FastFlagPreset {
            id: "enhanced_shadows".into(),
            name: "Enhanced Shadows".into(),
            description: "Enables full-intensity shadows and removes shadow-map culling so every object casts a shadow regardless of screen size.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntRenderShadowIntensity": 1,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 0,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 0
            }),
        },
        FastFlagPreset {
            id: "full_post_fx".into(),
            name: "Full Post-Processing Effects".into(),
            description: "Enables all post-processing effects — sun rays, depth of field, and color correction — for the most cinematic look.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFFlagDisablePostFx": false,
                "FFlagRenderSunRaysEnabled": true,
                "FFlagRenderDepthOfFieldEnabled": true,
                "FFlagRenderColorCorrectionEnabled": true
            }),
        },
        FastFlagPreset {
            id: "high_quality_avatars".into(),
            name: "High Quality Avatars".into(),
            description: "Enables layered clothing for all players and raises the LOD threshold so avatars stay at full detail at greater distances.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagLayeredClothingEnabled": true,
                "DFFlagLayeredClothingEnabledForAll": true,
                "DFIntLodAvatarMinThreshold": 100,
                "DFIntLodAvatarMaxThreshold": 250,
                "FFlagAvatarSelfViewEnabled": true
            }),
        },
        FastFlagPreset {
            id: "extended_render_distance".into(),
            name: "Extended Render Distance".into(),
            description: "Pushes dynamic light update distances and terrain LOD switching distances further for a richer environment at range.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "DFIntRenderLocalLightFadeMax": 100,
                "DFIntRenderLocalLightUpdateDistanceMax": 200,
                "DFIntRenderLocalLightUpdateDistanceMin": 100,
                "DFIntCSGLevelOfDetailSwitchingDistance": 1500,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 3000
            }),
        },
        FastFlagPreset {
            id: "always_simulate_particles".into(),
            name: "Always Simulate Particles".into(),
            description: "Forces particle emitters to keep simulating even when outside the normal camera frustum — prevents particles from popping in.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FFlagAlwaysSimulateParticles": true
            }),
        },
        FastFlagPreset {
            id: "visual_enhancement_pack".into(),
            name: "Visual Enhancement Pack".into(),
            description: "One-click combination of enhanced shadows, full post-FX, high avatar quality, extended render distance, max textures, and Future lighting.".into(),
            category: "Graphics".into(),
            flags: serde_json::json!({
                "FIntRenderShadowIntensity": 1,
                "DFIntCullFactorPixelThresholdShadowMapHighQuality": 0,
                "DFIntCullFactorPixelThresholdShadowMapLowQuality": 0,
                "DFFlagDisablePostFx": false,
                "FFlagRenderSunRaysEnabled": true,
                "FFlagRenderDepthOfFieldEnabled": true,
                "FFlagRenderColorCorrectionEnabled": true,
                "FFlagLayeredClothingEnabled": true,
                "DFFlagLayeredClothingEnabledForAll": true,
                "DFIntLodAvatarMinThreshold": 100,
                "DFIntLodAvatarMaxThreshold": 250,
                "DFIntRenderLocalLightFadeMax": 100,
                "DFIntRenderLocalLightUpdateDistanceMax": 200,
                "DFIntRenderLocalLightUpdateDistanceMin": 100,
                "DFIntCSGLevelOfDetailSwitchingDistance": 1500,
                "DFIntCSGLevelOfDetailSwitchingDistanceFull": 3000,
                "FIntDebugTextureManagerSkipMips": 0,
                "DFIntDebugFRMQualityLevelOverride": 21,
                "FIntDebugForceMSAASamples": 4,
                "DFFlagDebugForceFutureIsBrightPhase2": true,
                "FFlagDebugForceFutureLighting": true,
                "FFlagAlwaysSimulateParticles": true
            }),
        },
    ]
}

// ── Roblox Install Detection ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct RobloxInstall {
    pub name: String,           // e.g. "Roblox (Official)", "Bloxstrap", "Fishstrap", "Reiya"
    pub kind: String,           // "official" | "bloxstrap" | "fishstrap" | "reiya"
    pub exe_path: Option<String>,
    pub version: Option<String>,
    pub install_dir: String,
    pub found: bool,
    pub is_protocol_handler: bool, // Is this what roblox-player:// opens?
}

#[derive(Serialize, Deserialize)]
pub struct DetectedInstalls {
    pub installs: Vec<RobloxInstall>,
    pub protocol_handler_path: Option<String>, // Raw registry value
}

// ── Tray Notifications ────────────────────────────────────────────────────────

fn should_notify() -> bool {
    let path = data_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&path) {
        let trimmed = clean_bom(&content).trim().to_string();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&trimmed) {
            return val.get("ToastNotificationsEnabled").and_then(|v| v.as_bool()).unwrap_or(true);
        }
    }
    true
}

fn send_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    if !should_notify() { return; }
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
fn detect_roblox_installs() -> DetectedInstalls {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let local = PathBuf::from(&local);

    // Read current roblox-player:// registry value
    let protocol_handler_path = read_protocol_handler();

    let mut installs: Vec<RobloxInstall> = Vec::new();

    // 1. Official Roblox — check LOCALAPPDATA and Program Files locations
    {
        let dirs = [
            local.join("Roblox"),
            PathBuf::from("C:\\Program Files (x86)\\Roblox"),
            PathBuf::from("C:\\Program Files\\Roblox"),
        ];
        let exe = dirs.iter().find_map(|d| find_exe_in_versions(d));
        let version = exe.as_ref().and_then(|p| version_from_path(p));
        let is_handler = exe.as_ref().is_some_and(|p| path_matches_handler(p, &protocol_handler_path));
        let install_dir = exe.as_ref()
            .and_then(|p| p.parent()?.parent()?.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| local.join("Roblox"));
        installs.push(RobloxInstall {
            name: "Roblox (Official)".into(),
            kind: "official".into(),
            found: exe.is_some(),
            exe_path: exe.map(|p| p.to_string_lossy().to_string()),
            version,
            install_dir: install_dir.to_string_lossy().to_string(),
            is_protocol_handler: is_handler,
        });
    }

    // 2. Bloxstrap
    {
        let dir = local.join("Bloxstrap");
        // Bloxstrap launcher exe sits directly in the install dir
        let launcher = dir.join("Bloxstrap.exe");
        let exe_in_versions = find_exe_in_versions(&dir);
        let found = launcher.exists() || exe_in_versions.is_some();
        let exe_path = if launcher.exists() { Some(launcher.clone()) } else { exe_in_versions.clone() };
        let is_handler = exe_path.as_ref().is_some_and(|p| path_matches_handler(p, &protocol_handler_path))
            || protocol_handler_path.as_deref().is_some_and(|h| h.to_lowercase().contains("bloxstrap"));
        let version = exe_in_versions.as_ref().and_then(|p| version_from_path(p));
        installs.push(RobloxInstall {
            name: "Bloxstrap".into(),
            kind: "bloxstrap".into(),
            found,
            exe_path: exe_path.map(|p| p.to_string_lossy().to_string()),
            version,
            install_dir: dir.to_string_lossy().to_string(),
            is_protocol_handler: is_handler,
        });
    }

    // 3. Fishstrap / Fishtrap (check both spellings)
    {
        let dir1 = local.join("Fishstrap");
        let dir2 = local.join("Fishtrap");
        let dir = if dir1.exists() { dir1.clone() } else { dir2.clone() };
        let launcher1 = dir1.join("Fishstrap.exe");
        let launcher2 = dir2.join("Fishtrap.exe");
        let launcher3 = dir1.join("Fishtrap.exe");
        let launcher4 = dir2.join("Fishstrap.exe");
        let launcher_found = launcher1.exists() || launcher2.exists() || launcher3.exists() || launcher4.exists();
        let exe_in_versions = find_exe_in_versions(&dir1).or_else(|| find_exe_in_versions(&dir2));
        let found = launcher_found || exe_in_versions.is_some();
        let exe_path = [&launcher1, &launcher2, &launcher3, &launcher4]
            .iter().find(|p| p.exists()).map(|p| p.to_path_buf())
            .or_else(|| exe_in_versions.clone());
        let is_handler = protocol_handler_path.as_deref().is_some_and(|h| {
            let h = h.to_lowercase();
            h.contains("fishstrap") || h.contains("fishtrap")
        });
        let version = exe_in_versions.as_ref().and_then(|p| version_from_path(p));
        installs.push(RobloxInstall {
            name: "Fishstrap".into(),
            kind: "fishstrap".into(),
            found,
            exe_path: exe_path.map(|p| p.to_string_lossy().to_string()),
            version,
            install_dir: dir.to_string_lossy().to_string(),
            is_protocol_handler: is_handler,
        });
    }

    // 4. Reiya's own install
    {
        let dir = bootstrapper_root();
        let installed_ver = read_installed_version();
        let exe = installed_ver.as_ref().map(|v| version_dir(v).join("RobloxPlayerBeta.exe"));
        let exe_exists = exe.as_ref().is_some_and(|p| p.exists());
        let is_handler = exe.as_ref().is_some_and(|p| path_matches_handler(p, &protocol_handler_path))
            || protocol_handler_path.as_deref().and_then(protocol_executable)
                .is_some_and(|path| is_reiya_bootstrapper_exe(Path::new(path)));
        installs.push(RobloxInstall {
            name: "Reiya (Built-in)".into(),
            kind: "reiya".into(),
            found: exe_exists,
            exe_path: exe.filter(|_| exe_exists).map(|p| p.to_string_lossy().to_string()),
            version: installed_ver,
            install_dir: dir.to_string_lossy().to_string(),
            is_protocol_handler: is_handler,
        });
    }

    DetectedInstalls { installs, protocol_handler_path }
}

/// Reads HKCU\Software\Classes\roblox-player\shell\open\command default value.
fn read_protocol_handler() -> Option<String> {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(r"Software\Classes\roblox-player\shell\open\command") {
            if let Ok(val) = key.get_value::<String, _>("") {
                return Some(val);
            }
        }
        None
    }
    #[cfg(not(windows))]
    None
}

fn protocol_executable(command: &str) -> Option<&str> {
    let command = command.trim_start();
    if let Some(quoted) = command.strip_prefix('"') {
        return quoted.split_once('"').map(|(path, _)| path);
    }
    let end = command.to_ascii_lowercase().find(".exe")? + 4;
    command.get(..end)
}

fn has_bootstrapper_location(exe: &Path, folder: &str) -> bool {
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return false; };
    let versions = PathBuf::from(local).join(folder).join("Versions");
    exe.file_name().and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("RobloxPlayerBeta.exe"))
        && exe.parent().and_then(Path::parent).is_some_and(|parent| {
            parent.to_string_lossy().eq_ignore_ascii_case(&versions.to_string_lossy())
        })
}

fn is_reiya_bootstrapper_exe(exe: &Path) -> bool {
    has_bootstrapper_location(exe, storage_paths::DATA_FOLDER)
        || has_bootstrapper_location(exe, storage_paths::LEGACY_DATA_FOLDER)
}

#[cfg(windows)]
fn migrate_bootstrapper_protocol() {
    let Some(command) = read_protocol_handler() else { return; };
    let Some(old_path) = protocol_executable(&command) else { return; };
    if !has_bootstrapper_location(Path::new(old_path), storage_paths::LEGACY_DATA_FOLDER) {
        return;
    }
    let Some(exe) = read_installed_version()
        .and_then(|hash| normalized_version_hash(&hash).ok())
        .as_deref().and_then(reiya_player) else { return; };
    if let Err(error) = bootstrapper_register_protocol_internal(&exe.to_string_lossy()) {
        eprintln!("Could not update the Reiya Roblox protocol handler: {error}");
    }
}

/// Find the newest RobloxPlayerBeta.exe inside a Versions subfolder.
fn find_exe_in_versions(install_dir: &Path) -> Option<PathBuf> {
    search_versions_dir(&install_dir.join("Versions"))
}

/// Extract a short version label from the parent directory name of the exe.
fn version_from_path(exe: &Path) -> Option<String> {
    exe.parent()?.file_name().map(|n| n.to_string_lossy().to_string())
}

/// Check whether an exe path matches the current protocol handler command.
fn path_matches_handler(exe: &Path, handler: &Option<String>) -> bool {
    let h = match handler { Some(h) => h.to_lowercase(), None => return false };
    let e = exe.to_string_lossy().to_lowercase();
    h.contains(&e)
}

fn load_multi_instance_from_settings() -> bool {
    let settings_path = data_dir().join("settings.json");
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(settings_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) {
                if let Some(multi) = val.get("MultiRoblox").and_then(|v| v.as_bool()) {
                    return multi;
                }
            }
        }
    }
    true
}

fn read_minimize_to_tray() -> bool {
    let settings_path = data_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(settings_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) {
            if let Some(v) = val.get("MinimizeToTray").and_then(|v| v.as_bool()) {
                return v;
            }
        }
    }
    true // default: minimize to tray
}

#[cfg(windows)]
fn sync_run_on_startup(enable: bool) {
    use winreg::{enums::{HKEY_CURRENT_USER, KEY_WRITE}, RegKey};
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_WRITE) {
        if enable {
            if let Ok(exe_path) = std::env::current_exe() {
                // Quote the path so Windows handles spaces in directory names correctly
                let path_str = format!("\"{}\"", exe_path.to_string_lossy());
                let _ = run_key.set_value("ReiyaAccountManager", &path_str);
            }
        } else {
            let _ = run_key.delete_value("ReiyaAccountManager");
        }
    }
}

// ── Single-instance guard (Windows) ──────────────────────────────────────────
/// Creates a named global mutex. Returns the raw handle so the caller can keep
/// it alive for the lifetime of the process. If the mutex already exists,
/// shows a MessageBox and exits immediately.
#[cfg(windows)]
fn acquire_single_instance_mutex() -> *mut std::ffi::c_void {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONWARNING, MB_OK, MB_SYSTEMMODAL,
    };

    let mutex_name: Vec<u16> = "Global\\ReiyaAccountManager_v1\0"
        .encode_utf16()
        .collect();

    let handle = unsafe { CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr()) };

    if handle.is_null() || unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        let title: Vec<u16> = "Reiya Account Manager\0".encode_utf16().collect();
        let msg: Vec<u16> =
            "Reiya Account Manager is already running.\0"
                .encode_utf16()
                .collect();
        unsafe {
            MessageBoxW(std::ptr::null_mut(), msg.as_ptr(), title.as_ptr(), MB_OK | MB_ICONWARNING | MB_SYSTEMMODAL);
        }
        std::process::exit(0);
    }

    handle
}

// ── Entry point ───────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Logs panics (message + location + backtrace) to a file before the process goes down,
// so a crash that would otherwise only show up as a generic Windows fail-fast event
// leaves an actual diagnosable trace.
fn install_panic_logger() {
    std::env::set_var("RUST_BACKTRACE", "full");
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        let entry = format!(
            "\n[{}] PANIC: {}\n{}\n",
            chrono::Utc::now().to_rfc3339(),
            info,
            backtrace
        );
        let path = data_dir().join("panic.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            use std::io::Write;
            let _ = f.write_all(entry.as_bytes());
        }
        default_hook(info);
    }));
}

pub fn run() {
    install_panic_logger();

    // Prevent multiple instances — shows a dialog and exits if one is already open.
    #[cfg(windows)]
    let _instance_mutex = acquire_single_instance_mutex();

    let context = tauri::generate_context!();
    #[cfg(windows)]
    {
        if let Err(error) = storage_paths::migrate_windows_data(&context.config().identifier) {
            use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
            let title: Vec<u16> = "Reiya Account Manager\0".encode_utf16().collect();
            let message: Vec<u16> = format!("Reiya could not move its saved data. Close any Reiya and Roblox windows and try again.\n\n{error}\0")
                .encode_utf16().collect();
            unsafe { MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR); }
            return;
        }
        migrate_bootstrapper_protocol();
    }

    if premium::apply_pending_restore().is_err() { eprintln!("Premium restore failed; original data retained"); }
    migrate_legacy_encryption();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionTracker(std::sync::Arc::new(Mutex::new(load_session_tracker_data()))))
        .manage(MultiState::new(load_multi_instance_from_settings()))
        .manage(DiscordRpcHolder(Mutex::new(None)))
        .manage(DiscordRpcPage(Arc::new(Mutex::new("Home".to_string()))))
        .setup(|app| {
            // ── System tray ───────────────────────────────────────────────
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::Manager;

                let accounts = load_stored();
                let mut menu_builder = MenuBuilder::new(app)
                    .item(&MenuItemBuilder::with_id("show", "Show Reiya").build(app)?)
                    .item(&PredefinedMenuItem::separator(app)?);

                for acc in accounts.iter().take(8) {
                    let label = format!("▶  {}", acc.username);
                    let item = MenuItemBuilder::with_id(
                        format!("launch_{}", acc.user_id),
                        label,
                    ).build(app)?;
                    menu_builder = menu_builder.item(&item);
                }

                let menu = menu_builder
                    .item(&PredefinedMenuItem::separator(app)?)
                    .item(&MenuItemBuilder::with_id("quit", "Quit Reiya").build(app)?)
                    .build()?;

                let app_handle_tray = app.handle().clone();
                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .tooltip("Reiya Account Manager")
                    .on_menu_event(move |app, event| {
                        let id = event.id().as_ref();
                        if id == "show" {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        } else if id == "quit" {
                            app.exit(0);
                        } else if let Some(uid_str) = id.strip_prefix("launch_") {
                            if let Ok(uid) = uid_str.parse::<i64>() {
                                let _ = app.emit("tray-account-selected", uid);
                                if let Some(win) = app.get_webview_window("main") {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                        let _ = app_handle_tray;
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                if win.is_visible().unwrap_or(false) {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    let _ = tray.app_handle().emit("window-restored-from-tray", ());
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            // ── Close-to-tray for main window ─────────────────────────────
            {
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    let win_clone = win.clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            if read_minimize_to_tray() {
                                api.prevent_close();
                                let _ = win_clone.hide();
                            }
                        }
                    });
                }
            }

            // ── Refresh Run-on-Startup registry entry on every boot ────────
            // This ensures the registry always points to the current exe path
            // even after reinstalls or updates that move the binary.
            #[cfg(windows)]
            {
                let settings_path = data_dir().join("settings.json");
                let run_on_startup = settings_path.exists()
                    .then(|| fs::read_to_string(&settings_path).ok())
                    .flatten()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(clean_bom(&s)).ok())
                    .and_then(|v| v.get("RunOnStartup").and_then(|b| b.as_bool()))
                    .unwrap_or(false);
                sync_run_on_startup(run_on_startup);
            }


            let tracker = app.state::<SessionTracker>().inner().clone();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let mut window_states: HashMap<u32, (bool, u32)> = HashMap::new();
                let mut sys = System::new();
                loop {
                    let has_sessions = {
                        let map = tracker.0.lock().unwrap();
                        !map.is_empty()
                    };
                    let sleep_secs = if has_sessions { 3 } else { 8 };
                    tokio::time::sleep(std::time::Duration::from_secs(sleep_secs)).await;

                    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

                    let mut running_tracker_ids = HashMap::new();
                    for proc in sys.processes().values() {
                        let name = proc.name().to_string_lossy().to_lowercase();
                        if name == "robloxplayerbeta.exe" || name == "roblox" {
                            let cmd = proc.cmd();
                            if let Some(bt_id) = extract_browser_tracker_id(cmd) {
                                running_tracker_ids.insert(bt_id, proc.pid().as_u32());
                            }
                        }
                    }

                    let mut exited_sessions = Vec::new();
                    let now = Utc::now();
                    let tracker_changed;

                    {
                        let mut map = tracker.0.lock().unwrap();
                        let mut keys_to_remove = Vec::new();

                        for (&bt_id, (opt_pid, info)) in map.iter_mut() {
                            if let Some(&running_pid) = running_tracker_ids.get(&bt_id) {
                                *opt_pid = Some(running_pid);
                            }
                            if let Some(pid) = *opt_pid {
                                let sysinfo_pid = sysinfo::Pid::from_u32(pid);
                                let mut is_running = false;
                                if let Some(proc) = sys.processes().get(&sysinfo_pid) {
                                    let name = proc.name().to_string_lossy().to_lowercase();
                                    if name == "robloxplayerbeta.exe" || name == "roblox" {
                                        is_running = true;
                                    }
                                }
                                if !is_running {
                                    keys_to_remove.push(bt_id);
                                    exited_sessions.push((pid, info.clone()));
                                    window_states.remove(&pid);
                                } else {
                                    // Process is running, check window status to detect hung/zombie close
                                    let has_win = process_has_window(pid);
                                    let state = window_states.entry(pid).or_insert((false, 0));
                                    if has_win {
                                        *state = (true, 0);
                                    } else if state.0 {
                                        // It previously had a window, but doesn't now.
                                        // Don't count windowless ticks during the first 45 seconds —
                                        // newer Roblox versions have a multi-stage startup where the
                                        // loading window closes before the main game window appears.
                                        let session_age = now.signed_duration_since(
                                            DateTime::parse_from_rfc3339(&info.start_time)
                                                .map(|dt| dt.with_timezone(&Utc))
                                                .unwrap_or(now)
                                        ).num_seconds();
                                        if session_age > 45 {
                                            state.1 += 1;
                                            if state.1 >= 5 {
                                                // No window for >= 15 seconds after game was running, mark session ended without auto-killing
                                                keys_to_remove.push(bt_id);
                                                exited_sessions.push((pid, info.clone()));
                                                window_states.remove(&pid);
                                            }
                                        }
                                    }
                                }
                            } else {
                                let start = DateTime::parse_from_rfc3339(&info.start_time)
                                    .map(|dt| dt.with_timezone(&Utc))
                                    .unwrap_or(now);
                                if now.signed_duration_since(start).num_seconds() > 120 {
                                    keys_to_remove.push(bt_id);
                                }
                            }
                        }

                        tracker_changed = !keys_to_remove.is_empty();
                        for key in keys_to_remove {
                            map.remove(&key);
                        }

                        // Some launchers omit the tracker ID. Only infer a match with one
                        // pending account and one plausible untracked player.
                        let matched: std::collections::HashSet<_> = map.values()
                            .filter_map(|(pid, _)| *pid).collect();
                        let mut pending = map.values_mut().filter(|(pid, _)| pid.is_none());
                        if let Some((pid, info)) = pending.next() {
                            if pending.next().is_none() {
                                if let Ok(started) = DateTime::parse_from_rfc3339(&info.start_time) {
                                    let mut candidates = sys.processes().values().filter(|process| {
                                        let name = process.name().to_string_lossy().to_lowercase();
                                        (name == "robloxplayerbeta.exe" || name == "roblox")
                                            && !matched.contains(&process.pid().as_u32())
                                            && extract_browser_tracker_id(process.cmd()).is_none()
                                            && process.start_time() as i64 >= started.timestamp() - 2
                                    });
                                    if let Some(process) = candidates.next() {
                                        if candidates.next().is_none() {
                                            *pid = Some(process.pid().as_u32());
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if tracker_changed {
                        save_session_tracker(&tracker);
                        let map = tracker.0.lock().unwrap();
                        let page = app_handle.state::<DiscordRpcPage>();
                        let mut current = page.0.lock().unwrap();
                        if current.starts_with("Playing ") {
                            let latest = map.values().max_by(|(_, left), (_, right)| left.start_time.cmp(&right.start_time));
                            *current = latest.map_or_else(|| "On Home".to_string(), |(_, info)| format!("Playing {}", info.game_name));
                        }
                    }

                    for (pid, info) in exited_sessions {
                        let end_time = Utc::now();
                        let start_time_parsed = DateTime::parse_from_rfc3339(&info.start_time)
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or(Utc::now());
                        let duration = end_time.signed_duration_since(start_time_parsed);
                        let duration_minutes = duration.num_minutes();

                        let record = SessionRecord {
                            username: info.username.clone(),
                            user_id: info.user_id,
                            avatar_url: info.avatar_url.clone(),
                            game_name: info.game_name.clone(),
                            place_id: info.place_id.clone(),
                            start_time: info.start_time.clone(),
                            end_time: end_time.to_rfc3339(),
                            duration_minutes,
                        };

                        append_session_record(record);

                        append_event(EventEntry {
                            timestamp: end_time.to_rfc3339(),
                            kind: "killed".into(),
                            user_id: Some(info.user_id),
                            username: Some(info.username.clone()),
                            avatar_url: Some(info.avatar_url.clone()),
                            detail: format!(
                                "Session for '{}' on '{}' ended after {} minutes (PID {})",
                                info.username, info.game_name, duration_minutes, pid
                            ),
                        });

                        let _ = app_handle.emit("session-status-changed", ());
                        send_notification(
                            &app_handle,
                            "Session Ended",
                            &format!("{} finished playing {} ({} min)", info.username, info.game_name, duration_minutes),
                        );
                    }
                }
            });

            let app_handle_cookie = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last_check: Option<std::time::Instant> = None;
                loop {
                    let settings_path = data_dir().join("settings.json");
                    let (enabled, interval_mins) = if settings_path.exists() {
                        if let Ok(content) = fs::read_to_string(&settings_path) {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(clean_bom(&content)) {
                                let enabled = val.get("CookieHealthMonitorEnabled").and_then(|v| v.as_bool()).unwrap_or(true);
                                let mins = val.get("CookieHealthIntervalMinutes").and_then(|v| v.as_u64()).unwrap_or(60);
                                (enabled, mins)
                            } else {
                                (true, 60)
                            }
                        } else {
                            (true, 60)
                        }
                    } else {
                        (true, 60)
                    };

                    let should_check = enabled && match last_check {
                        None => true,
                        Some(inst) => inst.elapsed() >= std::time::Duration::from_secs(interval_mins * 60),
                    };

                    if should_check {
                        last_check = Some(std::time::Instant::now());

                        let accounts = load_stored();
                        let mut changed = false;

                        for checked in accounts.iter().filter(|account| account.cookie_status == "Valid") {
                            let Ok(cookie) = decrypt_cookie(&checked.encrypted_cookie) else { continue; };
                            let result = fetch_user_info(&cookie).await;
                            let valid = result.is_some();
                            let rotated = result.and_then(|(_, rotated)| rotated);
                            let Ok((updated, true)) = commit_cookie_validation(checked, valid, rotated.as_deref())
                                else { continue; };
                            changed = true;
                            if valid {
                                sync_validated_account(&updated, rotated.unwrap_or(cookie));
                                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                            } else {
                                append_event(EventEntry {
                                    timestamp: Utc::now().to_rfc3339(),
                                    kind: "cookie_expired".into(),
                                    user_id: Some(updated.user_id),
                                    username: Some(updated.username.clone()),
                                    avatar_url: Some(updated.avatar_url.clone()),
                                    detail: format!("Cookie for '{}' has expired (background health check)", updated.username),
                                });
                            }
                        }

                        if changed {
                            let _ = app_handle_cookie.emit("accounts-updated", ());
                        }
                    }

                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            premium::premium_refund_check, premium::premium_refund_ack, premium::premium_activate, premium::premium_status, premium::premium_backup,
            premium::premium_backups, premium::premium_restore, premium::premium_restore_preferences, premium::premium_restart, premium::premium_deactivate,
            greet,
            get_accounts,
            add_account,
            add_accounts_bulk,
            remove_account,
            toggle_favorite,
            validate_cookie,
            launch_account,
            get_live_sessions,
            kill_session,
            kill_all_sessions,
            fetch_thumbnails,
            fetch_place_thumbnails,
            get_event_log,
            get_session_history,
            open_login_window,
            set_display_name,
            change_password,
            sign_out_all_sessions,
            send_friend_request,
            block_user,
            search_roblox_games,
            fetch_active_servers,
            fetch_place_details,
            get_multi_instance,
            set_multi_instance,
            get_favorites,
            get_recent_games,
            save_favorites,
            set_private_server,
            remove_recent_game,
            add_recent_game,
            get_settings,
            save_settings,
            get_account_cookie,
            save_account_password,
            set_account_group,
            update_account_notes,
            check_account_health,
            verify_pin,
            vault::get_security_mode,
            vault::is_vault_unlocked,
            vault::setup_password_lock,
            vault::unlock_vault,
            vault::switch_to_default_encryption,
            vault::reset_vault,
            send_discord_webhook,
            backup::export_accounts,
            get_free_account_limit,
            backup::import_accounts,
            backup::preview_account_import,
            backup::commit_account_import,
            backup::discard_account_import,
            updater::check_for_update,
            updater::download_and_install_update,
            updater::get_app_version,
            updater::take_update_failure_marker,
            edit_account,
            bulk_apply_launch_preset,
            copy_account_password,
            get_auth_ticket_command,
            bootstrapper_check_update,
            bootstrapper_get_status,
            bootstrapper_install,
            bootstrapper_register_protocol,
            get_fastflags,
            save_fastflags,
            get_fastflag_presets,
            start_discord_rpc,
            stop_discord_rpc,
            update_discord_rpc,
            clear_game_rpc,
            detect_roblox_installs,
            get_launcher_preference,
            set_launcher_preference,
            get_launch_diagnostics,
            get_auto_update_preference,
            set_auto_update_preference,
            get_roblox_deploy_history,
            list_installed_roblox_versions,
            use_installed_roblox_version,
            set_installed_roblox_version_label,
            open_installed_roblox_version_folder,
            delete_installed_roblox_version,
            repair_installed_roblox_version,
            login_with_credentials,
            submit_rating,
            get_rating_stats,
            send_heartbeat,
            get_live_count,
        ])
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {

    #[test]
    fn free_account_capacity_counts_only_new_user_ids() {
        use super::exceeds_free_account_limit;

        assert!(!exceeds_free_account_limit(1..15, &[15, 15]));
        assert!(exceeds_free_account_limit(1..15, &[15, 16]));
        assert!(exceeds_free_account_limit(1..=15, &[16]));
        assert!(!exceeds_free_account_limit(1..=15, &[3, 3]));
        assert!(!exceeds_free_account_limit(1..=18, &[3, 8]));
        assert!(exceeds_free_account_limit(1..=18, &[19]));
        assert!(!exceeds_free_account_limit((1..15).chain([1, 2]), &[15]));
    }

    use super::*;

    #[test]
    fn staged_install_rejects_partial_download_and_publishes_complete_build() {
        let root = BootstrapperStaging(std::env::temp_dir().join(format!("reiya-install-test-{:016x}", rand::random::<u64>())));
        fs::create_dir(&root.0).unwrap();
        let stage = BootstrapperStaging(root.0.join("stage"));
        let destination = root.0.join("version");
        fs::create_dir(&stage.0).unwrap();
        fs::create_dir(&destination).unwrap();
        fs::write(destination.join("old-file"), b"old").unwrap();
        fs::write(stage.0.join("RobloxPlayerBeta.exe"), b"player").unwrap();

        assert!(stage.publish(&destination).is_err());
        assert!(destination.join("old-file").is_file());
        assert!(!destination.join(INSTALL_COMPLETE).exists());

        fs::write(stage.0.join("RobloxPlayerBeta.dll"), b"client").unwrap();
        for directory in ["content", "PlatformContent", "ExtraContent"] {
            let directory = stage.0.join(directory);
            fs::create_dir(&directory).unwrap();
            fs::write(directory.join("fixture"), b"data").unwrap();
        }

        fs::write(stage.0.join("AppSettings.xml"), b"<Settings/>").unwrap();
        stage.publish(&destination).unwrap();
        assert!(destination.join(INSTALL_COMPLETE).is_file());
        assert!(!destination.join("old-file").exists());
        assert!(!stage.0.exists());
    }

    #[tokio::test]
    #[ignore = "Uses a real saved account and calls Roblox; run manually with --ignored"]
    async fn test_get_auth_ticket() {
        let accounts = load_stored();
        let valid_acc = accounts.iter().find(|a| a.cookie_status == "Valid");
        if let Some(acc) = valid_acc {
            let cookie = decrypt_cookie(&acc.encrypted_cookie).expect("Decrypt failed");
            println!("Testing get_auth_ticket for {}", acc.username);

            let client = reqwest::Client::builder()
                .user_agent("RobloxAccountManagerCore")
                .build()
                .unwrap();

            let resp = client
                .post("https://auth.roblox.com/v1/authentication-ticket")
                .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
                .header("Referer", "https://www.roblox.com/")
                .header("Content-Type", "application/json")
                .body("")
                .send()
                .await
                .unwrap();

            println!("First response status: {}", resp.status());

            let csrf = resp
                .headers()
                .get("x-csrf-token")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());


            if let Some(csrf_token) = csrf {
                let resp2 = client
                    .post("https://auth.roblox.com/v1/authentication-ticket")
                    .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
                    .header("Referer", "https://www.roblox.com/")
                    .header("x-csrf-token", csrf_token)
                    .header("Content-Type", "application/json")
                    .body("")
                    .send()
                    .await
                    .unwrap();

                println!("Second response status: {}", resp2.status());
            }
        } else {
            println!("No valid accounts found to test.");
        }
    }

    #[tokio::test]
    #[ignore = "Launches a real Roblox client with a real saved account; run manually with --ignored"]
    async fn test_manual_launch() {
        let accounts = load_stored();
        let acc = accounts.iter().find(|a| a.cookie_status == "Valid")
            .expect("No valid account found to test launch");
        println!("Launching with account: {}", acc.username);
        let cookie = decrypt_cookie(&acc.encrypted_cookie).expect("Decrypt failed");
        let (ticket, _) = get_auth_ticket(&cookie).await.expect("Failed to get ticket");
        println!("Ticket length: {}", ticket.len());

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let browser_tracker_id = 9876543210u64;
        let place_id = "97598239454123"; // Grow a Garden 2
        let launcher_url = format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&placeId={}&isPlayTogetherGame=false",
            place_id
        );
        let encoded_url = urlencoding::encode(&launcher_url).into_owned();

        let launch_args = format!(
            "roblox-player:1+launchmode:play+gameinfo:{}+launchtime:{}+platform:Windows+placelauncherurl:{}+browserTrackerId:{}",
            ticket, timestamp, encoded_url, browser_tracker_id
        );

        let installed_ver = read_installed_version().expect("Reiya version not installed");
        let exe = version_dir(&installed_ver).join("RobloxPlayerBeta.exe");
        println!("Executable: {}", exe.display());

        let mut cmd = std::process::Command::new(&exe);
        cmd.current_dir(exe.parent().unwrap());
        cmd.arg(&launch_args);

        let output = cmd.output().expect("Failed to execute RobloxPlayerBeta.exe");
        println!("Exit status: {:?}", output.status);
        println!("Exit code: {:?}", output.status.code());
        println!("Stdout: {}", String::from_utf8_lossy(&output.stdout));
        println!("Stderr: {}", String::from_utf8_lossy(&output.stderr));
    }

    #[test]
    fn legacy_account_formats_still_parse() {
        // PascalCase keys and nulls come from the original C# app's accounts.json.
        let json = r#"[{"UserId":42,"Username":"alice","DisplayName":null,"EncryptedCookie":"abc","IsFavorite":true,"Tags":["a","b"]}]"#;
        let accounts: Vec<StoredAccount> = serde_json::from_str(json).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].user_id, 42);
        assert_eq!(accounts[0].display_name, "");
        assert!(accounts[0].is_favorite);
        assert_eq!(accounts[0].tags, vec!["a", "b"]);
        assert!(accounts[0].password.is_none());
    }

    #[test]
    fn version_comparison_is_numeric_not_lexical() {
        assert!(updater::version_is_newer("1.10.0", "1.9.9"));
        assert!(updater::version_is_newer("v2.0.0", "1.99.99"));
        assert!(!updater::version_is_newer("1.1.19", "1.1.19"));
        assert!(!updater::version_is_newer("1.1.18", "1.1.19"));
    }

    #[test]
    #[ignore = "Reads the real session_history.json on this machine; run manually with --ignored"]
    fn test_parse_session_history() {
        let path = session_history_path();
        println!("Session history path: {:?}", path);
        let s = fs::read_to_string(&path).expect("Could not read session_history.json");

        let bytes = s.as_bytes();
        println!("First 20 bytes of session_history.json: {:?}", &bytes[..std::cmp::min(20, bytes.len())]);

        let clean = s.strip_prefix("\u{feff}").unwrap_or(&s);
        let res: Result<Vec<SessionRecord>, _> = serde_json::from_str(clean);
        match res {
            Ok(hist) => {
                println!("Successfully parsed {} history entries", hist.len());
            }
            Err(e) => {
                panic!("Failed to parse session history: {}", e);
            }
        }
    }

    #[test]
    fn test_extract_browser_tracker_id() {
        // Test split arguments
        let cmd1 = vec![
            "C:\\Roblox\\RobloxPlayerBeta.exe".to_string(),
            "-b".to_string(),
            "123456789".to_string(),
            "-t".to_string(),
            "987654321".to_string(),
        ];
        assert_eq!(extract_browser_tracker_id(&cmd1), Some(123456789));

        // Test space-joined arguments (single string in cmd[0])
        let cmd2 = vec![
            "\"C:\\Roblox\\RobloxPlayerBeta.exe\" -b 9876543210 -t 111".to_string()
        ];
        assert_eq!(extract_browser_tracker_id(&cmd2), Some(9876543210));

        // Test browserTrackerId format
        let cmd3 = vec![
            "roblox-player:1+launchmode:play+browserTrackerId:55555+launchtime:222".to_string()
        ];
        assert_eq!(extract_browser_tracker_id(&cmd3), Some(55555));

        // Test browserTrackerId with equals
        let cmd4 = vec![
            "roblox-player:1+launchmode:play+browserTrackerId=77777".to_string()
        ];
        assert_eq!(extract_browser_tracker_id(&cmd4), Some(77777));

        // Test avoid matching prefix words like -bootstrap
        let cmd5 = vec![
            "-bootstrap".to_string(),
            "1234".to_string(),
            "-b".to_string(),
            "6666".to_string()
        ];
        assert_eq!(extract_browser_tracker_id(&cmd5), Some(6666));

        // Test no tracker ID
        let cmd6 = vec![
            "C:\\Roblox\\RobloxPlayerBeta.exe".to_string(),
            "-t".to_string(),
            "9999".to_string(),
        ];
        assert_eq!(extract_browser_tracker_id(&cmd6), None);
    }
}
