use super::*;

// ── In-app updater ────────────────────────────────────────────────────────────

pub(crate) const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
#[allow(dead_code)]
pub(crate) const GITHUB_RELEASES_API: &str = "https://api.github.com/repos/Seisen-z/Key-System/releases/latest";

#[derive(serde::Serialize, Clone)]
pub struct UpdateInfo {
    has_update:   bool,
    version:      String,
    download_url: String,
    notes:        String,
    current:      String,
}

#[allow(dead_code)]
pub(crate) fn version_is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> (u64, u64, u64) {
        let p: Vec<&str> = v.trim_start_matches('v').split('.').collect();
        let n = |i: usize| p.get(i).and_then(|s| s.parse().ok()).unwrap_or(0);
        (n(0), n(1), n(2))
    };
    parse(latest) > parse(current)
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    #[cfg(debug_assertions)]
    {
        Ok(UpdateInfo { has_update: false, version: String::new(), download_url: String::new(), notes: String::new(), current: APP_VERSION.to_string() })
    }

    #[cfg(not(debug_assertions))]
    {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("ReiyaAccountManager")
            .build()
            .map_err(|e| e.to_string())?;

        let resp = client
            .get(GITHUB_RELEASES_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        let tag_name = json["tag_name"].as_str().unwrap_or("");
        let latest_ver = tag_name.trim_start_matches('v').to_string();

        let download_url = json["assets"]
            .as_array()
            .and_then(|arr| arr.iter().find(|a| {
                a["name"].as_str().map(|n| n.ends_with(".exe")).unwrap_or(false)
            }))
            .and_then(|a| a["browser_download_url"].as_str())
            .unwrap_or("")
            .to_string();

        let download_url = if validate_update_url(&download_url, ".exe").is_ok() { download_url } else { String::new() };
        let notes      = json["body"].as_str().unwrap_or("").to_string();
        let has_update = !latest_ver.is_empty() && !download_url.is_empty() && version_is_newer(&latest_ver, APP_VERSION);

        Ok(UpdateInfo { has_update, version: latest_ver, download_url, notes, current: APP_VERSION.to_string() })
    }
}

// Public half of the release signing key. The private half lives only in the
// UPDATE_SIGNING_KEY GitHub secret; every release signs the SHA-256 of its installer.
pub(crate) const UPDATE_PUBLIC_KEY: [u8; 32] = [
    0x4e, 0x75, 0x16, 0xd0, 0xb1, 0x75, 0xb9, 0x46, 0x41, 0xed, 0x0f, 0x13, 0x07, 0xbd, 0xac, 0x3f,
    0x77, 0xf3, 0x61, 0x4b, 0x53, 0x33, 0x70, 0x16, 0xf4, 0x9d, 0x97, 0x53, 0xb1, 0x29, 0xa7, 0xdd,
];
pub(crate) const UPDATE_SIGNING_CONTEXT: &[u8] = b"reiya-update-v1:";
pub(crate) const UPDATE_PATH_PREFIX: &str = "/Seisen-z/Key-System/releases/download/";
pub(crate) const MAX_UPDATE_BYTES: u64 = 400 * 1024 * 1024;

pub(crate) fn validate_update_url(raw: &str, suffix: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(raw).map_err(|_| "Invalid update URL".to_string())?;
    let ok = u.scheme() == "https"
        && u.host_str() == Some("github.com")
        && u.port().is_none()
        && u.username().is_empty()
        && u.password().is_none()
        && u.query().is_none()
        && u.fragment().is_none()
        && u.path().starts_with(UPDATE_PATH_PREFIX)
        && !u.path().contains("..")
        && u.path().ends_with(suffix);
    if ok { Ok(u) } else { Err("Update URL is not an official Reiya release.".to_string()) }
}

pub(crate) fn update_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .https_only(true)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let host = attempt.url().host_str().unwrap_or("").to_string();
            let allowed = attempt.url().scheme() == "https"
                && (host == "github.com" || host.ends_with(".githubusercontent.com"));
            if allowed && attempt.previous().len() < 5 { attempt.follow() } else { attempt.error("blocked update redirect") }
        }))
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) fn verify_update_signature(digest: &[u8], signature_b64: &str) -> Result<(), String> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let sig_bytes = B64.decode(signature_b64.trim()).map_err(|_| "Update signature is malformed.".to_string())?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|_| "Update signature is malformed.".to_string())?;
    let key = VerifyingKey::from_bytes(&UPDATE_PUBLIC_KEY).map_err(|_| "Built-in update key is invalid.".to_string())?;
    let mut message = UPDATE_SIGNING_CONTEXT.to_vec();
    message.extend_from_slice(digest);
    key.verify(&message, &sig).map_err(|_| "Update signature check failed. The installer was not run.".to_string())
}

#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let installer_url = validate_update_url(&url, ".exe")?;
    let sig_url = validate_update_url(&format!("{}.sig", installer_url.as_str()), ".sig")?;
    let client = update_http_client()?;

    // Fetch the signature first so an unsigned release is rejected before any download.
    let sig_resp = client.get(sig_url).send().await.map_err(|e| e.to_string())?;
    if !sig_resp.status().is_success() {
        return Err("This release is not signed, so it was not installed.".to_string());
    }
    let sig_text = sig_resp.text().await.map_err(|e| e.to_string())?;
    if sig_text.len() > 1024 {
        return Err("Update signature is malformed.".to_string());
    }

    // Private, per-attempt folder under the user's own data dir (not the shared temp dir).
    let updates_root = data_dir().join("updates");
    let _ = fs::remove_dir_all(&updates_root);
    let work_dir = updates_root.join(format!("{:016x}", rand::random::<u64>()));
    fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    let tmp_path = work_dir.join("ReiyaAccountManager-update.exe");
    let cleanup = |dir: &Path| { let _ = fs::remove_dir_all(dir); };

    let resp = client.get(installer_url).send().await.map_err(|e| { cleanup(&work_dir); e.to_string() })?;
    if !resp.status().is_success() {
        cleanup(&work_dir);
        return Err(format!("Update download failed (HTTP {}).", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    if total > MAX_UPDATE_BYTES {
        cleanup(&work_dir);
        return Err("Update file is unexpectedly large.".to_string());
    }
    let mut downloaded: u64 = 0;
    let mut hasher = Sha256::new();
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&tmp_path).await.map_err(|e| e.to_string())?;

    // Phase 1 — Download (0 → 85%)
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| { cleanup(&work_dir); e.to_string() })?;
        downloaded += chunk.len() as u64;
        if downloaded > MAX_UPDATE_BYTES {
            drop(file);
            cleanup(&work_dir);
            return Err("Update file is unexpectedly large.".to_string());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| { cleanup(&work_dir); e.to_string() })?;
        let percent = (downloaded * 85).checked_div(total).unwrap_or(0) as u32;
        app.emit("update-progress", serde_json::json!({
            "downloaded": downloaded,
            "total":      total,
            "percent":    percent,
            "phase":      "downloading",
        })).ok();
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // Verify before anything is executed.
    let digest = hasher.finalize();
    if let Err(e) = verify_update_signature(&digest, &sig_text) {
        cleanup(&work_dir);
        return Err(e);
    }

    // Phase 2 — Installing (85 → 99%, animated)
    for p in 85u32..=99 {
        app.emit("update-progress", serde_json::json!({
            "downloaded": total,
            "total":      total,
            "percent":    p,
            "phase":      "installing",
        })).ok();
        tokio::time::sleep(tokio::time::Duration::from_millis(60)).await;
    }

    // Get current exe so the helper can relaunch it after install
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let failed_marker = data_dir().join("update_failed.txt");

    // Detached helper: wait for this process to exit, run the verified installer
    // silently, record a failure marker if it did not succeed, then relaunch.
    let script = format!(
        "@echo off\r\ntimeout /t 3 /nobreak >nul\r\nstart /wait \"\" \"{tmp}\" /S\r\nif errorlevel 1 (\r\n  echo Installer exited with code %errorlevel%>\"{marker}\"\r\n) else (\r\n  del \"{marker}\" >nul 2>&1\r\n)\r\nstart \"\" \"{exe}\"\r\ndel \"%~0\"\r\n",
        tmp = tmp_path.display(),
        marker = failed_marker.display(),
        exe = current_exe.display(),
    );
    let script_path = work_dir.join("reiya_updater.bat");
    std::fs::write(&script_path, &script).map_err(|e| e.to_string())?;

    // Phase 3 — Done (100%)
    app.emit("update-progress", serde_json::json!({
        "downloaded": total,
        "total":      total,
        "percent":    100,
        "phase":      "done",
    })).ok();

    tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;

    // Spawn helper hidden, then exit so installer can replace our binary
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", &script_path.to_string_lossy()])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to start updater helper: {}", e))?;
    }

    std::process::exit(0);
}

#[tauri::command]
pub fn get_app_version() -> String { APP_VERSION.to_string() }

/// Checks whether the previous update attempt's silent install failed
/// (see `download_and_install_update`'s helper script). Returns the
/// installer's error detail and clears the marker so it's only reported once.
#[tauri::command]
pub fn take_update_failure_marker() -> Option<String> {
    let marker = data_dir().join("update_failed.txt");
    let detail = fs::read_to_string(&marker).ok().map(|s| s.trim().to_string());
    if detail.is_some() {
        let _ = fs::remove_file(&marker);
    }
    detail
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_signature_matches_signing_script() {
        // Signature produced by scripts/sign-update.cjs over the bytes "reiya-test-installer".
        let sig = "G9LXFedIj9xjT52WtmA/JRimjYPuedpKqeP+qslqYb+ztbrnwLjGckzG7kq+7ZeY69nKh22PtUE5PYvF3VlIAA==";
        let digest = Sha256::digest(b"reiya-test-installer");
        assert!(verify_update_signature(&digest, sig).is_ok());
        let tampered = Sha256::digest(b"reiya-test-installer!");
        assert!(verify_update_signature(&tampered, sig).is_err());
    }

    #[test]
    fn update_urls_are_restricted_to_official_releases() {
        let ok = "https://github.com/Seisen-z/Key-System/releases/download/v1.2.0/ReiyaAccountManager-1.2.0-setup.exe";
        assert!(validate_update_url(ok, ".exe").is_ok());
        for bad in [
            "http://github.com/Seisen-z/Key-System/releases/download/v1/a.exe",
            "https://evil.example/Seisen-z/Key-System/releases/download/v1/a.exe",
            "https://github.com/Other/Repo/releases/download/v1/a.exe",
            "https://github.com/Seisen-z/Key-System/releases/download/v1/../../a.exe",
            "https://github.com/Seisen-z/Key-System/releases/download/v1/a.exe?x=1",
            "https://user@github.com/Seisen-z/Key-System/releases/download/v1/a.exe",
            "https://github.com/Seisen-z/Key-System/releases/download/v1/a.zip",
        ] {
            assert!(validate_update_url(bad, ".exe").is_err(), "{bad}");
        }
    }
}
