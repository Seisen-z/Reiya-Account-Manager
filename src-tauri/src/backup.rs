use super::*;

// ── Account Import / Export ───────────────────────────────────────────────────

pub(crate) const BACKUP_MIN_PASSWORD: usize = 8;

pub(crate) fn backup_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    derive_key_from_password(password, salt)
}

#[tauri::command]
pub async fn export_accounts(app: tauri::AppHandle, password: String) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    use aes_gcm::{Aes256Gcm, KeyInit, aead::{Aead, AeadCore, OsRng as AeadOsRng}};

    let pwd = password.trim();
    if pwd.chars().count() < BACKUP_MIN_PASSWORD {
        return Err(format!("Choose a backup password of at least {} characters.", BACKUP_MIN_PASSWORD));
    }

    // Secrets are decrypted here and re-protected by the backup password, so the
    // backup does not depend on this machine's key (and restores after a reinstall).
    let mut accounts = load_stored();
    for acc in accounts.iter_mut() {
        acc.encrypted_cookie = decrypt_cookie(&acc.encrypted_cookie)
            .map_err(|_| format!("Could not read the saved cookie for @{}; backup aborted.", acc.username))?;
        if let Some(p) = &acc.password {
            acc.password = Some(decrypt_password(p));
        }
    }
    let payload = serde_json::json!({ "plaintext_secrets": true, "accounts": accounts }).to_string();

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = backup_key(pwd, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let encrypted = cipher.encrypt(&nonce, payload.as_bytes()).map_err(|_| "Encryption failed".to_string())?;
    let mut bundle = nonce.to_vec();
    bundle.extend_from_slice(&encrypted);

    let export_json = serde_json::json!({
        "version": 3,
        "app": "reiya",
        "encrypted": true,
        "kdf": "argon2id",
        "salt": base64::engine::general_purpose::STANDARD.encode(salt),
        "data": base64::engine::general_purpose::STANDARD.encode(&bundle),
    });

    let file_path = app.dialog()
        .file()
        .add_filter("Reiya Backup", &["reiya"])
        .set_file_name("reiya-backup.reiya")
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            fs::write(&path_str, serde_json::to_string_pretty(&export_json).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            Ok(path_str)
        }
        None => Err("cancelled".into()),
    }
}

fn read_account_backup(app: tauri::AppHandle, password: &str) -> Result<Vec<StoredAccount>, String> {
    use tauri_plugin_dialog::DialogExt;
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead, Nonce};

    let file_path = app.dialog()
        .file()
        .add_filter("Reiya Backup", &["reiya"])
        .blocking_pick_file();

    let Some(path) = file_path else { return Err("cancelled".into()); };
    let path_str = path.to_string();

    let file_content = fs::read_to_string(&path_str).map_err(|e| e.to_string())?;
    let envelope: serde_json::Value = serde_json::from_str(&file_content)
        .map_err(|_| "Invalid backup file".to_string())?;

    let encoded = envelope["data"].as_str().ok_or("Invalid backup format")?;
    let version = envelope.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    // Backups from before this field existed were always password-protected.
    let is_encrypted = envelope.get("encrypted").and_then(|v| v.as_bool()).unwrap_or(true);

    let decoded = base64::engine::general_purpose::STANDARD.decode(encoded)
        .map_err(|_| "Invalid backup data".to_string())?;

    let plaintext = if is_encrypted {
        let pwd = password.trim();
        if pwd.is_empty() {
            return Err("This backup is password protected — enter the password.".into());
        }
        if decoded.len() < 12 { return Err("Corrupt backup".into()); }
        let (nonce_bytes, encrypted) = decoded.split_at(12);

        let key_bytes: [u8; 32] = if version >= 3 {
            let salt = base64::engine::general_purpose::STANDARD
                .decode(envelope["salt"].as_str().ok_or("Invalid backup format")?)
                .map_err(|_| "Invalid backup data".to_string())?;
            backup_key(pwd, &salt)?
        } else {
            // Legacy v1/v2 backups used an unsalted SHA-256 of the password.
            Sha256::digest(pwd.as_bytes()).into()
        };

        let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
        let decrypted = cipher.decrypt(Nonce::from_slice(nonce_bytes), encrypted)
            .map_err(|_| "Wrong password or corrupt file".to_string())?;
        String::from_utf8(decrypted).map_err(|_| "Invalid data in backup".to_string())?
    } else {
        String::from_utf8(decoded).map_err(|_| "Invalid data in backup".to_string())?
    };

    let parsed: serde_json::Value = serde_json::from_str(&plaintext)
        .map_err(|_| "Invalid accounts data".to_string())?;
    let (plaintext_secrets, imported) = if version >= 3 {
        let list = parsed["accounts"].as_array().cloned().ok_or("Invalid accounts data")?;
        (true, list)
    } else {
        (false, parsed.as_array().cloned().ok_or("Invalid accounts data")?)
    };

    Ok(imported.into_iter()
        .filter_map(|value| serde_json::from_value::<StoredAccount>(value).ok())
        .filter(|account| account.user_id > 0)
        .map(|mut account| {
            if plaintext_secrets {
                account.encrypted_cookie = encrypt_cookie(&account.encrypted_cookie);
                account.password = account.password.as_deref().filter(|value| !value.is_empty()).map(encrypt_cookie);
            } else {
                // Re-seal legacy secrets for this machine when readable.
                if let Ok(plain) = decrypt_cookie(&account.encrypted_cookie) {
                    account.encrypted_cookie = encrypt_cookie(&plain);
                }
                if let Some(password) = account.password.as_ref().filter(|value| !value.is_empty()) {
                    if let Ok(plain) = decrypt_cookie(password) {
                        account.password = Some(encrypt_cookie(&plain));
                    }
                }
            }
            account
        })
        .collect())
}

async fn merge_imported_accounts(imported: Vec<StoredAccount>) -> Result<usize, String> {
    let incoming: Vec<_> = imported.iter().map(|account| account.user_id).collect();
    let mut entitlement = None;
    with_account_capacity(&incoming, &mut entitlement, |mut existing| {
        let mut ids: std::collections::HashSet<_> = existing.iter().map(|account| account.user_id).collect();
        let previous = existing.len();
        existing.extend(imported.into_iter().filter(|account| ids.insert(account.user_id)));
        let added = existing.len() - previous;
        if added > 0 {
            write_stored_unlocked(&existing)?;
        }
        Ok(added)
    })
    .await
}

#[tauri::command]
pub async fn import_accounts(app: tauri::AppHandle, password: String) -> Result<usize, String> {
    merge_imported_accounts(read_account_backup(app, &password)?).await
}

#[derive(Serialize)]
pub struct ImportCandidate {
    user_id: i64,
    username: String,
}

#[derive(Serialize)]
pub struct AccountImportPreview {
    token: String,
    accounts: Vec<ImportCandidate>,
    duplicates: usize,
    saved_accounts: usize,
    free_limit: usize,
}

struct PendingImport {
    token: String,
    created: std::time::Instant,
    accounts: Vec<StoredAccount>,
}

static PENDING_IMPORT: Mutex<Option<PendingImport>> = Mutex::new(None);
const IMPORT_PREVIEW_LIFETIME: std::time::Duration = std::time::Duration::from_secs(900);

#[tauri::command]
pub async fn preview_account_import(app: tauri::AppHandle, password: String) -> Result<AccountImportPreview, String> {
    let mut imported = read_account_backup(app, &password)?;
    let (saved_accounts, duplicates) = {
        let _io = ACCOUNTS_IO.lock().unwrap_or_else(|error| error.into_inner());
        let existing = read_stored_for_write_unlocked()?;
        let mut ids: std::collections::HashSet<_> = existing.iter().map(|account| account.user_id).collect();
        let saved_accounts = ids.len();
        let previous = imported.len();
        imported.retain(|account| ids.insert(account.user_id));
        (saved_accounts, previous - imported.len())
    };
    let mut token = [0; 16];
    OsRng.fill_bytes(&mut token);
    let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(token);
    let accounts = imported.iter().map(|account| ImportCandidate {
        user_id: account.user_id,
        username: account.username.clone(),
    }).collect();

    let mut pending = PENDING_IMPORT.lock().unwrap_or_else(|error| error.into_inner());
    *pending = Some(PendingImport { token: token.clone(), created: std::time::Instant::now(), accounts: imported });
    Ok(AccountImportPreview { token, accounts, duplicates, saved_accounts, free_limit: FREE_ACCOUNT_LIMIT })
}

#[tauri::command]
pub async fn commit_account_import(token: String, user_ids: Vec<i64>) -> Result<usize, String> {
    let imported = {
        let mut pending = PENDING_IMPORT.lock().unwrap_or_else(|error| error.into_inner());
        if pending.as_ref().is_some_and(|preview| preview.created.elapsed() >= IMPORT_PREVIEW_LIFETIME) {
            *pending = None;
        }
        let preview = pending.as_ref().filter(|preview| preview.token == token)
            .ok_or("This backup preview expired. Choose the file again.")?;
        let selected: std::collections::HashSet<_> = user_ids.into_iter().collect();
        let imported: Vec<_> = preview.accounts.iter()
            .filter(|account| selected.contains(&account.user_id)).cloned().collect();
        if imported.is_empty() || imported.len() != selected.len() {
            return Err("Select accounts from the current backup preview.".into());
        }
        imported
    };
    let added = merge_imported_accounts(imported).await?;
    discard_account_import(token);
    Ok(added)
}

#[tauri::command]
pub fn discard_account_import(token: String) {
    let mut pending = PENDING_IMPORT.lock().unwrap_or_else(|error| error.into_inner());
    if pending.as_ref().is_some_and(|preview| preview.token == token) {
        *pending = None;
    }
}
