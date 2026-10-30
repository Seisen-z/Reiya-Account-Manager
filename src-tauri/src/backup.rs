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

#[tauri::command]
pub async fn import_accounts(app: tauri::AppHandle, password: String) -> Result<usize, String> {
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

    let mut existing = load_stored();
    let existing_ids: std::collections::HashSet<i64> = existing.iter().map(|a| a.user_id).collect();

    let mut added = 0usize;
    for value in imported {
        let Ok(mut acc) = serde_json::from_value::<StoredAccount>(value) else { continue };
        if acc.user_id <= 0 || existing_ids.contains(&acc.user_id) { continue; }
        if plaintext_secrets {
            acc.encrypted_cookie = encrypt_cookie(&acc.encrypted_cookie);
            acc.password = acc.password.as_deref().filter(|p| !p.is_empty()).map(encrypt_cookie);
        } else {
            // Legacy backups hold secrets sealed with the exporting machine's key. Re-seal
            // them for this machine when they can be read; otherwise keep them unchanged.
            if let Ok(plain) = decrypt_cookie(&acc.encrypted_cookie) {
                acc.encrypted_cookie = encrypt_cookie(&plain);
            }
            if let Some(p) = acc.password.clone().filter(|p| !p.is_empty()) {
                if let Ok(plain) = decrypt_cookie(&p) {
                    acc.password = Some(encrypt_cookie(&plain));
                }
            }
        }
        existing.push(acc);
        added += 1;
    }

    if added > 0 {
        save_stored(&existing);
    }
    Ok(added)
}
