use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};

use super::vault::{delete_secret, get_secret, has_secret, save_secret};

const GITHUB_TOKEN_KEY: &str = "github.oauth";
const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL: &str = "https://api.github.com/user";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct GithubDeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubTokenPollResult {
    pub status: String,
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub interval: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct GithubUserProfile {
    pub id: u64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub html_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubAccessTokenResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

pub async fn begin_device_flow(client_id: &str, scope: &str) -> Result<GithubDeviceCodeResponse, String> {
    if client_id.trim().is_empty() {
        return Err("GitHub client id is missing. Set VITE_GITHUB_CLIENT_ID.".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "RamTeamAi")
        .form(&[
            ("client_id", client_id.trim()),
            ("scope", scope.trim()),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub device flow failed: {}", response.status()));
    }

    response
        .json::<GithubDeviceCodeResponse>()
        .await
        .map_err(|error| error.to_string())
}

pub async fn poll_device_flow(client_id: &str, device_code: &str) -> Result<GithubTokenPollResult, String> {
    if client_id.trim().is_empty() {
        return Err("GitHub client id is missing. Set VITE_GITHUB_CLIENT_ID.".to_string());
    }
    if device_code.trim().is_empty() {
        return Err("GitHub device code is missing.".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .post(GITHUB_ACCESS_TOKEN_URL)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "RamTeamAi")
        .form(&[
            ("client_id", client_id.trim()),
            ("device_code", device_code.trim()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub token polling failed: {}", response.status()));
    }

    let body = response
        .json::<GithubAccessTokenResponse>()
        .await
        .map_err(|error| error.to_string())?;

    if let Some(access_token) = body.access_token.as_deref() {
        save_secret(GITHUB_TOKEN_KEY, access_token).map_err(|error| error.to_string())?;
        return Ok(GithubTokenPollResult {
            status: "authorized".to_string(),
            access_token: body.access_token,
            token_type: body.token_type,
            scope: body.scope,
            error: None,
            error_description: None,
            interval: body.interval,
        });
    }

    let error = body.error.unwrap_or_else(|| "unknown_error".to_string());
    Ok(GithubTokenPollResult {
        status: error.clone(),
        access_token: None,
        token_type: body.token_type,
        scope: body.scope,
        error: Some(error),
        error_description: body.error_description,
        interval: body.interval,
    })
}

pub async fn load_profile() -> Result<Option<GithubUserProfile>, String> {
    if !has_secret(GITHUB_TOKEN_KEY) {
        return Ok(None);
    }

    let token = get_secret(GITHUB_TOKEN_KEY).map_err(|error| error.to_string())?;
    let client = reqwest::Client::new();
    let response = client
        .get(GITHUB_USER_URL)
        .bearer_auth(token)
        .header(ACCEPT, "application/vnd.github+json")
        .header(USER_AGENT, "RamTeamAi")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().as_u16() == 401 {
        let _ = delete_secret(GITHUB_TOKEN_KEY);
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(format!("GitHub profile request failed: {}", response.status()));
    }

    response
        .json::<GithubUserProfile>()
        .await
        .map(Some)
        .map_err(|error| error.to_string())
}

pub fn disconnect() -> Result<(), String> {
    if has_secret(GITHUB_TOKEN_KEY) {
        delete_secret(GITHUB_TOKEN_KEY).map_err(|error| error.to_string())?;
    }
    Ok(())
}
