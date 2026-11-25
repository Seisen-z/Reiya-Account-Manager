use super::*;
use std::time::{Duration, Instant};

struct AccessToken {
    value: String,
    expires_at: Instant,
}

#[derive(Deserialize)]
struct AuthSession {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

static ACCESS_TOKEN: tokio::sync::Mutex<Option<AccessToken>> = tokio::sync::Mutex::const_new(None);

async fn auth_request(
    client: &reqwest::Client,
    grant: &str,
    body: serde_json::Value,
) -> Result<reqwest::Response, String> {
    client.post(format!("{}/auth/v1/{}", supabase_url(), grant))
        .header("apikey", supabase_anon())
        .json(&body)
        .send()
        .await
        .map_err(|_| "Could not reach the installation sign-in service.".to_string())
}

async fn sign_up(client: &reqwest::Client) -> Result<reqwest::Response, String> {
    auth_request(client, "signup", serde_json::json!({ "data": {} })).await
}

async fn installation_token(client: &reqwest::Client) -> Result<String, String> {
    let mut cache = ACCESS_TOKEN.lock().await;
    if let Some(token) = cache.as_ref() {
        if token.expires_at > Instant::now() {
            return Ok(token.value.clone());
        }
    }

    let path = data_dir().join("telemetry-session.dpapi");
    let response = match fs::read(&path) {
        Ok(protected) => {
            let refresh_token = String::from_utf8(browser_extractor::dpapi_decrypt_bytes(&protected)?)
                .map_err(|_| "The saved installation session is unreadable.")?;
            let response = auth_request(
                client,
                "token?grant_type=refresh_token",
                serde_json::json!({ "refresh_token": refresh_token }),
            ).await?;
            if response.status().is_success() {
                response
            } else {
                let error: serde_json::Value = response.json().await.unwrap_or_default();
                match error.get("code").or_else(|| error.get("error_code")).and_then(|code| code.as_str()) {
                    Some("refresh_token_not_found" | "refresh_token_already_used" | "session_not_found" | "session_expired") => {
                        sign_up(client).await?
                    }
                    _ => return Err("Could not refresh the installation session.".into()),
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => sign_up(client).await?,
        Err(_) => return Err("Could not read the installation session.".into()),
    };

    let session: AuthSession = response.error_for_status()
        .map_err(|_| "Installation sign-in is unavailable.")?
        .json().await.map_err(|_| "Invalid response from the installation sign-in service.")?;
    if session.access_token.is_empty() || session.refresh_token.is_empty() || session.expires_in == 0 {
        return Err("Invalid installation session.".into());
    }

    let protected = premium::protect(session.refresh_token.as_bytes())?;
    atomic_write(&path, protected).map_err(|_| "Could not save the installation session.")?;
    let refresh_margin = (session.expires_in / 10).min(60);
    let expires_at = Instant::now().checked_add(Duration::from_secs(session.expires_in - refresh_margin))
        .ok_or("Invalid installation session expiry.")?;
    let token = session.access_token;
    *cache = Some(AccessToken { value: token.clone(), expires_at });
    Ok(token)
}

pub(super) async fn post(
    endpoint: &str,
    body: Option<serde_json::Value>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Could not initialize the ratings and presence connection.")?;

    for _ in 0..2 {
        let token = installation_token(&client).await?;
        let request = client.post(format!("{}/functions/v1/{}", supabase_url(), endpoint))
            .header("apikey", supabase_anon())
            .bearer_auth(&token);
        let request = match body.as_ref() {
            Some(body) => request.json(body),
            None => request,
        };
        let response = request.send().await.map_err(|_| "Could not reach the ratings and presence service.")?;
        if response.status().is_success() {
            return Ok(());
        }
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Err("The ratings and presence service could not save the request.".into());
        }
        let mut cache = ACCESS_TOKEN.lock().await;
        if cache.as_ref().is_some_and(|cached| cached.value == token) {
            *cache = None;
        }
    }
    Err("The ratings and presence service declined the installation sign-in.".into())
}
