use serde::{Deserialize, Serialize};
use std::time::Instant;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("base URL must start with http:// or https://")]
    InvalidBaseUrl,
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityFlags { pub streaming: bool, pub tool_use: bool, pub vision: bool, pub max_context: u32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig { pub id: String, pub label: String, pub capabilities: CapabilityFlags }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub auth: String,
    pub stream: String,
    pub key_ref: Option<String>,
    pub masked_key: Option<String>,
    pub models: Vec<ModelConfig>,
    pub status: String,
    pub request_template: Option<String>,
    pub response_path: Option<String>,
    pub stream_chunk_path: Option<String>,
    pub capabilities: CapabilityFlags,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult { pub ok: bool, pub latency_ms: u64, pub message: String }

pub fn default_providers() -> Vec<ProviderConfig> {
    let ctx = CapabilityFlags { streaming: true, tool_use: true, vision: true, max_context: 128_000 };
    let ctx200 = CapabilityFlags { streaming: true, tool_use: true, vision: true, max_context: 200_000 };
    let ctx200_text = CapabilityFlags { streaming: true, tool_use: true, vision: false, max_context: 200_000 };
    vec![
        ProviderConfig {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            kind: "anthropic".into(),
            base_url: "https://api.anthropic.com/v1".into(),
            auth: "bearer".into(),
            stream: "sse".into(),
            key_ref: Some("keychain://Neurogate/anthropic".into()),
            masked_key: Some("sk-ant-•••4f2a".into()),
            models: vec![ModelConfig { id: "claude-sonnet-4".into(), label: "Claude Sonnet 4".into(), capabilities: ctx.clone() }],
            status: "connected".into(),
            request_template: None,
            response_path: Some("$.content[0].text".into()),
            stream_chunk_path: Some("$.delta.text".into()),
            capabilities: ctx,
            latency_ms: None,
        },
        ProviderConfig {
            id: "neurogate".into(),
            name: "Neurogate".into(),
            kind: "neurogate".into(),
            base_url: "https://api.neurogate.space/v1".into(),
            auth: "bearer".into(),
            stream: "sse".into(),
            key_ref: Some("keychain://Neurogate/neurogate".into()),
            masked_key: Some("ng-•••xxxx".into()),
            models: vec![
                ModelConfig { id: "deepseek-v4-flash".into(), label: "DeepSeek v4 Flash · 0.2x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "mimo-v2.5".into(), label: "MiMo v2.5 · 0.2x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "qwen3.7-plus".into(), label: "Qwen3.7 Plus · 0.8x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "mimo-v2.5-pro".into(), label: "MiMo v2.5 Pro · 1x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "minimax-m3".into(), label: "MiniMax M3 · 1x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "deepseek-v4-pro".into(), label: "DeepSeek V4 Pro · 1x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.4-mini".into(), label: "GPT-5.4-mini · 1.2x".into(), capabilities: ctx200.clone() },
                ModelConfig { id: "kimi-k2.6".into(), label: "Kimi K2.6 · 2.8x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "qwen3.7-max".into(), label: "Qwen3.7 Max · 3.5x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.4".into(), label: "GPT-5.4 · 3.5x".into(), capabilities: ctx200.clone() },
                ModelConfig { id: "glm-5.1".into(), label: "GLM-5.1 · 3.7x".into(), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.5".into(), label: "GPT-5.5 · 5x".into(), capabilities: ctx200.clone() },
            ],
            status: "warning".into(),
            request_template: Some(r#"{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }"#.into()),
            response_path: Some("$.choices[0].message.content".into()),
            stream_chunk_path: Some("$.choices[0].delta.content".into()),
            capabilities: ctx200,
            latency_ms: None,
        },
    ]
}

pub async fn test_provider(provider: &ProviderConfig) -> Result<ProviderTestResult, ProviderError> {
    if !provider.base_url.starts_with("http://") && !provider.base_url.starts_with("https://") { return Err(ProviderError::InvalidBaseUrl); }
    let started = Instant::now();
    let client = reqwest::Client::new();
    let response = client.head(&provider.base_url).send().await;
    let latency_ms = started.elapsed().as_millis() as u64;
    Ok(ProviderTestResult { ok: response.as_ref().map(|item| item.status().is_success() || item.status().is_client_error()).unwrap_or(false), latency_ms, message: response.map(|_| "Соединение проверено".into()).unwrap_or_else(|_| "Endpoint не ответил, проверь URL или сеть".into()) })
}
