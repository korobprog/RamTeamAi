use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("base URL must start with http:// or https://")]
    InvalidBaseUrl,
    #[error("API key is missing. Add the provider key first.")]
    MissingApiKey,
    #[error("provider returned {status}: {body}")]
    BadStatus { status: u16, body: String },
    #[error("response text not found")]
    MissingResponseText,
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityFlags {
    pub streaming: bool,
    pub tool_use: bool,
    pub vision: bool,
    pub max_context: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub id: String,
    pub label: String,
    pub api_format: Option<String>,
    pub capabilities: CapabilityFlags,
}

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
pub struct ProviderTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub text: String,
    pub latency_ms: u64,
    pub tokens: u32,
}

pub fn default_providers() -> Vec<ProviderConfig> {
    let ctx = CapabilityFlags { streaming: true, tool_use: true, vision: true, max_context: 128_000 };
    let ctx200 = CapabilityFlags { streaming: true, tool_use: true, vision: true, max_context: 200_000 };
    let ctx200_text = CapabilityFlags { streaming: true, tool_use: true, vision: false, max_context: 200_000 };
    let ctx_local = CapabilityFlags { streaming: true, tool_use: false, vision: false, max_context: 16_000 };

    vec![
        ProviderConfig {
            id: "openai".into(),
            name: "OpenAI".into(),
            kind: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            auth: "bearer".into(),
            stream: "sse".into(),
            status: "not-configured".into(),
            key_ref: None,
            masked_key: None,
            capabilities: ctx.clone(),
            request_template: None,
            response_path: Some("$.choices[0].message.content".into()),
            stream_chunk_path: Some("$.choices[0].delta.content".into()),
            latency_ms: None,
            models: vec![
                ModelConfig { id: "gpt-4.1".into(), label: "GPT-4.1".into(), api_format: None, capabilities: ctx.clone() },
                ModelConfig { id: "gpt-4.1-mini".into(), label: "GPT-4.1 mini".into(), api_format: None, capabilities: ctx.clone() },
            ],
        },
        ProviderConfig {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            kind: "anthropic".into(),
            base_url: "https://api.anthropic.com/v1".into(),
            auth: "bearer".into(),
            stream: "sse".into(),
            status: "not-configured".into(),
            key_ref: None,
            masked_key: None,
            capabilities: ctx.clone(),
            request_template: None,
            response_path: Some("$.content[0].text".into()),
            stream_chunk_path: Some("$.delta.text".into()),
            latency_ms: None,
            models: vec![
                ModelConfig { id: "claude-opus-4-1".into(), label: "Claude Opus 4.1".into(), api_format: None, capabilities: ctx.clone() },
                ModelConfig { id: "claude-sonnet-4".into(), label: "Claude Sonnet 4".into(), api_format: None, capabilities: ctx.clone() },
            ],
        },
        ProviderConfig {
            id: "gemini".into(),
            name: "Google Gemini".into(),
            kind: "gemini".into(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".into(),
            auth: "query".into(),
            stream: "sse".into(),
            status: "not-configured".into(),
            key_ref: None,
            masked_key: None,
            capabilities: ctx.clone(),
            request_template: None,
            response_path: Some("$.candidates[0].content.parts[0].text".into()),
            stream_chunk_path: Some("$.candidates[0].content.parts[0].text".into()),
            latency_ms: None,
            models: vec![ModelConfig { id: "gemini-2.5-pro".into(), label: "Gemini 2.5 Pro".into(), api_format: None, capabilities: ctx.clone() }],
        },
        ProviderConfig {
            id: "ollama".into(),
            name: "Ollama local".into(),
            kind: "ollama".into(),
            base_url: "http://localhost:11434/api".into(),
            auth: "none".into(),
            stream: "jsonl".into(),
            status: "warning".into(),
            key_ref: None,
            masked_key: Some("no key needed".into()),
            capabilities: ctx_local.clone(),
            request_template: None,
            response_path: Some("$.message.content".into()),
            stream_chunk_path: None,
            latency_ms: None,
            models: vec![
                ModelConfig { id: "llama3.1".into(), label: "Llama 3.1".into(), api_format: None, capabilities: ctx_local.clone() },
                ModelConfig { id: "qwen2.5-coder".into(), label: "Qwen2.5 Coder".into(), api_format: None, capabilities: ctx_local.clone() },
            ],
        },
        ProviderConfig {
            id: "RamTeamAi".into(),
            name: "Vibemod".into(),
            kind: "RamTeamAi".into(),
            base_url: "https://r-api.vibemod.pro/v1".into(),
            auth: "bearer".into(),
            stream: "sse".into(),
            status: "not-configured".into(),
            key_ref: None,
            masked_key: None,
            capabilities: ctx200.clone(),
            request_template: Some(r#"{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }"#.into()),
            response_path: Some("$.choices[0].message.content".into()),
            stream_chunk_path: Some("$.choices[0].delta.content".into()),
            latency_ms: None,
            models: vec![
                ModelConfig { id: "deepseek-v4-flash".into(), label: "DeepSeek v4 Flash | Chat Completions | 0.2x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "mimo-v2.5".into(), label: "MiMo v2.5 | Chat Completions | 0.2x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "qwen3.7-plus".into(), label: "Qwen3.7 Plus | Anthropic | 0.8x".into(), api_format: Some("anthropic".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "mimo-v2.5-pro".into(), label: "MiMo v2.5 Pro | Chat Completions | 1x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "minimax-m3".into(), label: "MiniMax M3 | Anthropic | 1x".into(), api_format: Some("anthropic".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "deepseek-v4-pro".into(), label: "DeepSeek V4 Pro | Chat Completions | 1x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.4-mini".into(), label: "GPT-5.4-mini | Responses | 1.2x".into(), api_format: Some("responses".into()), capabilities: ctx200.clone() },
                ModelConfig { id: "kimi-k2.6".into(), label: "Kimi K2.6 | Chat Completions | 2.8x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "qwen3.7-max".into(), label: "Qwen3.7 Max | Anthropic | 3.5x".into(), api_format: Some("anthropic".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.4".into(), label: "GPT-5.4 | Responses | 3.5x".into(), api_format: Some("responses".into()), capabilities: ctx200.clone() },
                ModelConfig { id: "glm-5.1".into(), label: "GLM-5.1 | Chat Completions | 3.7x".into(), api_format: Some("chat-completions".into()), capabilities: ctx200_text.clone() },
                ModelConfig { id: "gpt-5.5".into(), label: "GPT-5.5 | Responses | 5x".into(), api_format: Some("responses".into()), capabilities: ctx200.clone() },
            ],
        },
    ]
}

pub async fn test_provider(provider: &ProviderConfig) -> Result<ProviderTestResult, ProviderError> {
    if !provider.base_url.starts_with("http://") && !provider.base_url.starts_with("https://") {
        return Err(ProviderError::InvalidBaseUrl);
    }
    let started = Instant::now();
    let response = reqwest::Client::new().head(provider.base_url.trim_end_matches('/')).send().await;
    let latency_ms = started.elapsed().as_millis() as u64;
    let ok = response.as_ref().map(|item| item.status().is_success() || item.status().is_client_error()).unwrap_or(false);
    let message = if ok { "Connection checked" } else { "Endpoint did not respond. Check URL or network" };
    Ok(ProviderTestResult { ok, latency_ms, message: message.into() })
}

fn api_format(provider: &ProviderConfig, model: &str) -> String {
    match provider.kind.as_str() {
        "anthropic" | "gemini" | "ollama" => provider.kind.clone(),
        _ => provider
            .models
            .iter()
            .find(|item| item.id == model)
            .and_then(|item| item.api_format.as_deref())
            .unwrap_or("chat-completions")
            .to_owned(),
    }
}

fn endpoint(provider: &ProviderConfig, model: &str, api_key: Option<&str>) -> String {
    let base = provider.base_url.trim_end_matches('/');
    let format = api_format(provider, model);
    match format.as_str() {
        "anthropic" => format!("{base}/messages"),
        "ollama" => format!("{base}/chat"),
        "gemini" => format!("{base}/models/{model}:generateContent?key={}", api_key.unwrap_or_default()),
        "responses" => format!("{base}/responses"),
        _ => format!("{base}/chat/completions"),
    }
}

fn ram_team_ai_requires_stream(provider: &ProviderConfig, format: &str) -> bool {
    provider.kind == "RamTeamAi" && matches!(format, "anthropic" | "responses")
}

fn normalized_messages(system_prompt: &str, messages: &[crate::core::orchestrator::ChatMessage]) -> Vec<Value> {
    let mut result = vec![json!({ "role": "system", "content": system_prompt })];
    result.extend(messages.iter().map(|message| {
        json!({
            "role": if message.author == "user" { "user" } else { "assistant" },
            "content": message.text
        })
    }));
    result
}

fn conversation_messages(messages: &[crate::core::orchestrator::ChatMessage]) -> Vec<Value> {
    let mut result = messages.iter().map(|message| {
        json!({
            "role": if message.author == "user" { "user" } else { "assistant" },
            "content": message.text
        })
    }).collect::<Vec<_>>();

    if result.is_empty() {
        result.push(json!({ "role": "user", "content": "Continue." }));
    }

    result
}

fn completion_body(
    provider: &ProviderConfig,
    agent: &crate::core::orchestrator::AgentConfig,
    messages: &[crate::core::orchestrator::ChatMessage],
) -> Value {
    let format = api_format(provider, &agent.model_id);
    let stream = ram_team_ai_requires_stream(provider, &format);
    match format.as_str() {
        "anthropic" => json!({
            "model": agent.model_id,
            "max_tokens": agent.token_budget.min(4096),
            "system": agent.system_prompt,
            "stream": stream,
            "messages": conversation_messages(messages)
        }),
        "gemini" => json!({
            "systemInstruction": { "parts": [{ "text": agent.system_prompt }] },
            "contents": messages.iter().map(|message| json!({
                "role": if message.author == "user" { "user" } else { "model" },
                "parts": [{ "text": message.text }]
            })).collect::<Vec<_>>()
        }),
        "ollama" => json!({
            "model": agent.model_id,
            "stream": false,
            "messages": normalized_messages(&agent.system_prompt, messages)
        }),
        "responses" => json!({
            "model": agent.model_id,
            "instructions": agent.system_prompt,
            "input": conversation_messages(messages),
            "max_output_tokens": agent.token_budget.min(4096),
            "store": false,
            "stream": stream
        }),
        _ => json!({
            "model": agent.model_id,
            "stream": false,
            "messages": normalized_messages(&agent.system_prompt, messages)
        }),
    }
}

fn collect_text_blocks(blocks: &[Value]) -> Option<String> {
    let text = blocks
        .iter()
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");

    if text.is_empty() { None } else { Some(text) }
}

fn extract_responses_text(value: &Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(Value::as_str) {
        return Some(text.to_owned());
    }

    let mut parts = Vec::new();
    for item in value.get("output")?.as_array()? {
        if let Some(content) = item.get("content").and_then(Value::as_array) {
            parts.extend(content.iter().filter_map(|block| block.get("text").and_then(Value::as_str)));
        }
    }

    let text = parts.join("");
    if text.is_empty() { None } else { Some(text) }
}

fn extract_text(provider: &ProviderConfig, model: &str, value: &Value) -> Option<String> {
    let format = api_format(provider, model);
    match format.as_str() {
        "anthropic" => value.get("content").and_then(Value::as_array).and_then(|blocks| collect_text_blocks(blocks))
            .or_else(|| value.pointer("/content/0/text").and_then(Value::as_str).map(str::to_owned)),
        "ollama" => value.pointer("/message/content").and_then(Value::as_str).map(str::to_owned),
        "gemini" => value.pointer("/candidates/0/content/parts/0/text").and_then(Value::as_str).map(str::to_owned),
        "responses" => extract_responses_text(value),
        _ => value.pointer("/choices/0/message/content").and_then(Value::as_str).map(str::to_owned)
            .or_else(|| value.pointer("/choices/0/text").and_then(Value::as_str).map(str::to_owned)),
    }
}

fn extract_sse_event_text(provider: &ProviderConfig, model: &str, value: &Value) -> Option<String> {
    value.get("delta").and_then(Value::as_str).map(str::to_owned)
        .or_else(|| value.pointer("/delta/text").and_then(Value::as_str).map(str::to_owned))
        .or_else(|| value.pointer("/choices/0/delta/content").and_then(Value::as_str).map(str::to_owned))
        .or_else(|| value.pointer("/choices/0/message/content").and_then(Value::as_str).map(str::to_owned))
        .or_else(|| value.get("response").and_then(|response| extract_text(provider, model, response)))
        .or_else(|| value.get("message").and_then(|message| extract_text(provider, model, message)))
        .or_else(|| extract_text(provider, model, value))
}

fn extract_sse_text(provider: &ProviderConfig, model: &str, raw: &str) -> Option<String> {
    let mut text = String::new();
    let mut fallback = None;

    for line in raw.lines() {
        let trimmed = line.trim();
        let Some(data) = trimmed.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        if let Some(chunk) = extract_sse_event_text(provider, model, &value) {
            if matches!(
                value.get("type").and_then(Value::as_str),
                Some("response.completed" | "message_start" | "message_delta" | "message_stop")
            ) {
                if fallback.is_none() && !chunk.is_empty() {
                    fallback = Some(chunk);
                }
            } else {
                text.push_str(&chunk);
            }
        }
    }

    if !text.is_empty() { Some(text) } else { fallback }
}

pub async fn complete_chat(
    provider: &ProviderConfig,
    agent: &crate::core::orchestrator::AgentConfig,
    messages: &[crate::core::orchestrator::ChatMessage],
    api_key: Option<String>,
) -> Result<CompletionResult, ProviderError> {
    if !provider.base_url.starts_with("http://") && !provider.base_url.starts_with("https://") {
        return Err(ProviderError::InvalidBaseUrl);
    }
    if provider.auth != "none" && api_key.as_deref().unwrap_or_default().trim().is_empty() {
        return Err(ProviderError::MissingApiKey);
    }

    let started = Instant::now();
    let client = reqwest::Client::new();
    let format = api_format(provider, &agent.model_id);
    let mut request = client.post(endpoint(provider, &agent.model_id, api_key.as_deref())).json(&completion_body(provider, agent, messages));
    if ram_team_ai_requires_stream(provider, &format) {
        request = request.header("accept", "text/event-stream");
    }

    if let Some(secret) = api_key.as_deref() {
        if format == "anthropic" {
            request = request.header("x-api-key", secret).header("anthropic-version", "2023-06-01");
            if provider.kind == "RamTeamAi" {
                request = request.bearer_auth(secret);
            }
        } else if provider.auth == "bearer" || provider.auth == "header" {
            request = request.bearer_auth(secret);
        }
    }

    let response = request.send().await?;
    let status = response.status();
    let raw = response.text().await?;
    if !status.is_success() {
        return Err(ProviderError::BadStatus { status: status.as_u16(), body: raw.chars().take(600).collect() });
    }

    let text = if ram_team_ai_requires_stream(provider, &format) || raw.lines().any(|line| line.trim_start().starts_with("data:")) {
        extract_sse_text(provider, &agent.model_id, &raw).ok_or(ProviderError::MissingResponseText)?
    } else {
        let value: Value = serde_json::from_str(&raw)?;
        extract_text(provider, &agent.model_id, &value).ok_or(ProviderError::MissingResponseText)?
    };
    let latency_ms = started.elapsed().as_millis() as u64;
    let tokens = (text.chars().count() as u32 / 4).max(1);
    Ok(CompletionResult { text, latency_ms, tokens })
}
