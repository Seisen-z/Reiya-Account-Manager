use super::*;

// ── Cookie encryption (AES-256-GCM, machine-tied key or password-derived vault key) ──
pub(crate) static VAULT_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

pub(crate) fn security_path() -> PathBuf {
    data_dir().join("security.json")
}

#[derive(Serialize, Deserialize, Default)]
pub struct SecurityConfig {
    #[serde(default)]
    mode: String, // "default" | "password"
    #[serde(default)]
    salt: String, // base64, only set when mode == "password"
    #[serde(default)]
    verifier: String, // base64 ciphertext of a known marker, only set when mode == "password"
}

pub(crate) fn load_security_config() -> SecurityConfig {
    let cfg: SecurityConfig = fs::read_to_string(security_path())
        .ok()
        .and_then(|s| serde_json::from_str(clean_bom(&s)).ok())
        .unwrap_or_default();
    // Guard against a corrupted/partial config claiming password mode without
    // the salt/verifier needed to actually derive or check the key.
    if cfg.mode == "password" && (cfg.salt.is_empty() || cfg.verifier.is_empty()) {
        return SecurityConfig::default();
    }
    cfg
}

pub(crate) fn save_security_config(cfg: &SecurityConfig) {
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        let _ = atomic_write(&security_path(), s);
    }
}

pub(crate) const VAULT_VERIFIER_MARKER: &str = "reiya-vault-v1";

// Pre-1.1.20 default key: derived from the hostname only, so it protects nothing
// against anyone holding accounts.json. Kept solely to read and migrate old data.
pub(crate) fn legacy_machine_key() -> [u8; 32] {
    let machine = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "ReiyaDefaultHost".into());
    let mut hasher = Sha256::new();
    hasher.update(b"ReiyaAM_v1:");
    hasher.update(machine.as_bytes());
    hasher.finalize().into()
}

pub(crate) static DEFAULT_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

pub(crate) fn default_key_path() -> PathBuf {
    data_dir().join("default-key.dpapi")
}

// Default-mode key: 32 random bytes, protected by Windows DPAPI so only this
// Windows user on this machine can unwrap it.
pub(crate) fn default_machine_key() -> [u8; 32] {
    if let Some(k) = *DEFAULT_KEY.lock().unwrap() {
        return k;
    }
    let path = default_key_path();
    if let Ok(blob) = fs::read(&path) {
        return match browser_extractor::dpapi_decrypt_bytes(&blob) {
            Ok(plain) if plain.len() == 32 => {
                let mut k = [0u8; 32];
                k.copy_from_slice(&plain);
                *DEFAULT_KEY.lock().unwrap() = Some(k);
                k
            }
            // Never overwrite an existing key file we cannot read.
            _ => legacy_machine_key(),
        };
    }
    let mut k = [0u8; 32];
    OsRng.fill_bytes(&mut k);
    if let Ok(blob) = premium::protect(&k) {
        if atomic_write(&path, blob).is_ok() {
            *DEFAULT_KEY.lock().unwrap() = Some(k);
            return k;
        }
    }
    legacy_machine_key()
}

// Re-encrypts anything still under the legacy hostname key. Idempotent and
// best-effort: entries it cannot read are left untouched.
pub(crate) fn migrate_legacy_encryption() {
    if load_security_config().mode == "password" {
        return;
    }
    let new_key = default_machine_key();
    let legacy = legacy_machine_key();
    if new_key == legacy {
        return;
    }
    let mut accounts = load_stored();
    let mut changed = false;
    for acc in accounts.iter_mut() {
        if decrypt_with_key(&acc.encrypted_cookie, &new_key).is_err() {
            if let Ok(plain) = decrypt_with_key(&acc.encrypted_cookie, &legacy) {
                acc.encrypted_cookie = encrypt_with_key(&plain, &new_key);
                changed = true;
            }
        }
        if let Some(pw) = &acc.password {
            if decrypt_with_key(pw, &new_key).is_err() {
                if let Ok(plain) = decrypt_with_key(pw, &legacy) {
                    acc.password = Some(encrypt_with_key(&plain, &new_key));
                    changed = true;
                }
            }
        }
    }
    if changed {
        save_stored(&accounts);
    }
}

pub(crate) fn derive_key_from_password(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut out = [0u8; 32];
    argon2::Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| format!("Key derivation failed: {}", e))?;
    Ok(out)
}

// Returns the cached vault key when unlocked in password mode, otherwise the
// machine-tied default key.
pub(crate) fn derive_key() -> [u8; 32] {
    if let Some(k) = *VAULT_KEY.lock().unwrap() {
        return k;
    }
    default_machine_key()
}

pub(crate) fn encrypt_with_key(plaintext: &str, key: &[u8; 32]) -> String {
    let cipher = Aes256Gcm::new_from_slice(key).unwrap();
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).unwrap();
    let mut out = nonce_bytes.to_vec();
    out.extend(ciphertext);
    B64.encode(out)
}

pub(crate) fn decrypt_with_key(encoded: &str, key: &[u8; 32]) -> Result<String, String> {
    let data = B64.decode(encoded).map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("Invalid ciphertext".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&data[..12]);
    let plaintext = cipher.decrypt(nonce, &data[12..]).map_err(|_| "Decryption failed".to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

pub(crate) fn encrypt_cookie(plaintext: &str) -> String {
    encrypt_with_key(plaintext, &derive_key())
}

pub(crate) fn decrypt_cookie(encoded: &str) -> Result<String, String> {
    let key = derive_key();
    if let Ok(s) = decrypt_with_key(encoded, &key) {
        return Ok(s);
    }
    if let Ok(s) = decrypt_with_key(encoded, &legacy_machine_key()) {
        return Ok(s);
    }

    // Fallback to Windows DPAPI decryption (for C# compatibility)
    let data = B64.decode(encoded).map_err(|e| e.to_string())?;
    match browser_extractor::dpapi_decrypt_bytes(&data) {
        Ok(plain_bytes) => {
            String::from_utf8(plain_bytes).map_err(|e| format!("DPAPI utf8 error: {}", e))
        }
        Err(e) => Err(format!("Decryption failed: {}", e))
    }
}

// Re-encrypts every stored account's cookie (and saved password, if any) from
// `old_key` to `new_key`. Used when switching security modes.
// All-or-nothing: every account is decrypted first, and nothing is written if any
// of them fails, so a switch can never leave accounts under two different keys.
pub(crate) fn reencrypt_all_accounts(old_key: &[u8; 32], new_key: &[u8; 32]) -> Result<(), String> {
    let accounts = load_stored();
    let legacy = legacy_machine_key();
    let read = |encoded: &str| -> Option<String> {
        decrypt_with_key(encoded, old_key)
            .or_else(|_| decrypt_with_key(encoded, &legacy))
            .ok()
            .or_else(|| {
                let data = B64.decode(encoded).ok()?;
                String::from_utf8(browser_extractor::dpapi_decrypt_bytes(&data).ok()?).ok()
            })
    };

    let mut rekeyed = accounts.clone();
    for acc in rekeyed.iter_mut() {
        let plain = read(&acc.encrypted_cookie).ok_or_else(|| {
            format!("Could not decrypt the saved cookie for @{}. Nothing was changed.", acc.username)
        })?;
        acc.encrypted_cookie = encrypt_with_key(&plain, new_key);
        if let Some(pw) = &acc.password {
            // Passwords saved by very old versions were stored unencrypted.
            let plain_pw = read(pw).unwrap_or_else(|| pw.clone());
            acc.password = Some(encrypt_with_key(&plain_pw, new_key));
        }
    }

    if let Ok(s) = fs::read(accounts_path()) {
        let _ = fs::write(data_dir().join("accounts.json.pre-rekey.bak"), s);
    }
    save_stored(&rekeyed);
    Ok(())
}

#[tauri::command]
pub fn get_security_mode() -> String {
    let cfg = load_security_config();
    if cfg.mode == "password" { "password".into() } else { "default".into() }
}

#[tauri::command]
pub fn is_vault_unlocked() -> bool {
    let cfg = load_security_config();
    cfg.mode != "password" || VAULT_KEY.lock().unwrap().is_some()
}

#[tauri::command]
pub fn setup_password_lock(password: String) -> Result<(), String> {
    let pwd = password.trim();
    if pwd.chars().count() < 8 {
        return Err("Password must be at least 8 characters.".into());
    }

    let old_key = derive_key();

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let new_key = derive_key_from_password(pwd, &salt)?;

    reencrypt_all_accounts(&old_key, &new_key)?;

    let verifier = encrypt_with_key(VAULT_VERIFIER_MARKER, &new_key);
    save_security_config(&SecurityConfig {
        mode: "password".into(),
        salt: B64.encode(salt),
        verifier,
    });

    *VAULT_KEY.lock().unwrap() = Some(new_key);
    Ok(())
}

// (consecutive failures, locked until)
pub(crate) static UNLOCK_THROTTLE: Mutex<(u32, Option<std::time::Instant>)> = Mutex::new((0, None));

pub(crate) fn check_unlock_throttle() -> Result<(), String> {
    let t = UNLOCK_THROTTLE.lock().unwrap();
    if let Some(until) = t.1 {
        let now = std::time::Instant::now();
        if until > now {
            return Err(format!("Too many attempts. Try again in {} seconds.", (until - now).as_secs() + 1));
        }
    }
    Ok(())
}

pub(crate) fn record_unlock_result(ok: bool) {
    let mut t = UNLOCK_THROTTLE.lock().unwrap();
    if ok {
        *t = (0, None);
        return;
    }
    t.0 += 1;
    if t.0 >= 3 {
        let secs = (2u64.pow((t.0 - 3).min(5))) * 5;
        t.1 = Some(std::time::Instant::now() + std::time::Duration::from_secs(secs));
    }
}

#[tauri::command]
pub fn unlock_vault(password: String) -> Result<bool, String> {
    let cfg = load_security_config();
    if cfg.mode != "password" {
        return Ok(true);
    }
    check_unlock_throttle()?;
    let salt = B64.decode(&cfg.salt).map_err(|e| e.to_string())?;
    let key = derive_key_from_password(password.trim(), &salt)?;
    match decrypt_with_key(&cfg.verifier, &key) {
        Ok(marker) if marker == VAULT_VERIFIER_MARKER => {
            record_unlock_result(true);
            *VAULT_KEY.lock().unwrap() = Some(key);
            Ok(true)
        }
        _ => {
            record_unlock_result(false);
            Ok(false)
        }
    }
}

#[tauri::command]
pub fn switch_to_default_encryption(current_password: String) -> Result<(), String> {
    let cfg = load_security_config();
    if cfg.mode != "password" {
        return Ok(());
    }
    check_unlock_throttle()?;
    let salt = B64.decode(&cfg.salt).map_err(|e| e.to_string())?;
    let old_key = derive_key_from_password(current_password.trim(), &salt)?;
    match decrypt_with_key(&cfg.verifier, &old_key) {
        Ok(marker) if marker == VAULT_VERIFIER_MARKER => record_unlock_result(true),
        _ => {
            record_unlock_result(false);
            return Err("Incorrect password.".into());
        }
    }

    let new_key = default_machine_key();
    reencrypt_all_accounts(&old_key, &new_key)?;

    save_security_config(&SecurityConfig { mode: "default".into(), salt: String::new(), verifier: String::new() });
    *VAULT_KEY.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn reset_vault() -> Result<(), String> {
    // "Forgot password" — only valid while the vault is locked, so a script running
    // inside an unlocked session can never wipe the account store with this command.
    if load_security_config().mode != "password" || VAULT_KEY.lock().unwrap().is_some() {
        return Err("The vault can only be reset from the lock screen.".into());
    }
    // Keep the unreadable store aside instead of deleting it.
    let aside = data_dir().join(format!("accounts.reset-{}.bak", Utc::now().timestamp()));
    let _ = fs::rename(accounts_path(), aside);
    save_security_config(&SecurityConfig { mode: "default".into(), salt: String::new(), verifier: String::new() });
    *VAULT_KEY.lock().unwrap() = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_round_trip_and_wrong_key_fails() {
        let key = [7u8; 32];
        let sealed = encrypt_with_key("cookie-value", &key);
        assert_eq!(decrypt_with_key(&sealed, &key).unwrap(), "cookie-value");
        assert!(decrypt_with_key(&sealed, &[8u8; 32]).is_err());
    }

    #[test]
    fn encryption_is_randomized_and_tamper_evident() {
        let key = [7u8; 32];
        let a = encrypt_with_key("same", &key);
        let b = encrypt_with_key("same", &key);
        assert_ne!(a, b, "a fresh nonce must be used for every encryption");

        let mut raw = B64.decode(&a).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 1;
        assert!(decrypt_with_key(&B64.encode(raw), &key).is_err());
        assert!(decrypt_with_key("AAAA", &key).is_err(), "truncated input is rejected, not a panic");
    }

    #[test]
    fn password_key_depends_on_password_and_salt() {
        let salt = [1u8; 16];
        let k1 = derive_key_from_password("correct horse", &salt).unwrap();
        assert_eq!(k1, derive_key_from_password("correct horse", &salt).unwrap());
        assert_ne!(k1, derive_key_from_password("correct horsf", &salt).unwrap());
        assert_ne!(k1, derive_key_from_password("correct horse", &[2u8; 16]).unwrap());
        assert!(derive_key_from_password("x", &[1u8; 3]).is_err(), "a too-short salt is an error, not a panic");
    }

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn migration_moves_legacy_accounts_to_the_dpapi_key_and_rekey_is_all_or_nothing() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!("reiya-migration-{:016x}", rand::random::<u64>()));
        fs::create_dir_all(&tmp).unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", &tmp);
        *DEFAULT_KEY.lock().unwrap() = None;

        let legacy = legacy_machine_key();
        let seeded = serde_json::json!([
            { "user_id": 1, "username": "a", "encrypted_cookie": encrypt_with_key("cookie-1", &legacy), "password": encrypt_with_key("pw-1", &legacy) },
            { "user_id": 2, "username": "b", "encrypted_cookie": encrypt_with_key("cookie-2", &legacy) }
        ]);
        fs::write(accounts_path(), seeded.to_string()).unwrap();

        migrate_legacy_encryption();
        let new_key = default_machine_key();
        assert_ne!(new_key, legacy, "a DPAPI-protected random key must replace the hostname key");
        let migrated = load_stored();
        assert_eq!(migrated.len(), 2);
        for acc in &migrated {
            assert!(decrypt_with_key(&acc.encrypted_cookie, &new_key).is_ok());
            assert!(decrypt_with_key(&acc.encrypted_cookie, &legacy).is_err());
        }
        assert_eq!(decrypt_cookie(&migrated[0].encrypted_cookie).unwrap(), "cookie-1");
        assert_eq!(decrypt_cookie(&migrated[1].encrypted_cookie).unwrap(), "cookie-2");
        assert_eq!(decrypt_password(migrated[0].password.as_ref().unwrap()), "pw-1");

        let after_first = fs::read_to_string(accounts_path()).unwrap();
        migrate_legacy_encryption();
        assert_eq!(fs::read_to_string(accounts_path()).unwrap(), after_first, "a second run must change nothing");

        // One unreadable account must abort the whole re-key and leave the file untouched.
        let mut broken = load_stored();
        broken[1].encrypted_cookie = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA".into();
        save_stored(&broken);
        let before = fs::read_to_string(accounts_path()).unwrap();
        assert!(reencrypt_all_accounts(&new_key, &[9u8; 32]).is_err());
        assert_eq!(fs::read_to_string(accounts_path()).unwrap(), before);

        *DEFAULT_KEY.lock().unwrap() = None;
        match old_appdata {
            Some(v) => std::env::set_var("APPDATA", v),
            None => std::env::remove_var("APPDATA"),
        }
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn unlock_throttle_locks_after_repeated_failures_and_clears_on_success() {
        *UNLOCK_THROTTLE.lock().unwrap() = (0, None);
        for _ in 0..2 {
            record_unlock_result(false);
            assert!(check_unlock_throttle().is_ok());
        }
        record_unlock_result(false);
        assert!(check_unlock_throttle().is_err());
        record_unlock_result(true);
        assert!(check_unlock_throttle().is_ok());
    }
}
