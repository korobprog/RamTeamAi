use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

#[derive(Debug, Error)]
enum McpError {
    #[error("MCP transport must be stdio or http")]
    InvalidTransport,
    #[error("MCP command or URL is missing")]
    MissingEndpoint,
    #[error("failed to parse command: {0}")]
    InvalidCommand(String),
    #[error("MCP stream error: {0}")]
    Io(#[from] std::io::Error),
    #[error("MCP JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("MCP request timed out")]
    Timeout,
    #[error("MCP HTTP error: {0}")]
    Http(String),
    #[error("MCP protocol error: {0}")]
    Protocol(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command_or_url: String,
    pub enabled: bool,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub latency_ms: Option<u64>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerTestResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: u64,
    #[serde(default)]
    pub tools: Vec<McpToolInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallResult {
    pub ok: bool,
    pub content: String,
    pub raw: Value,
    pub latency_ms: u64,
}

fn default_schema() -> Value {
    json!({"type":"object","additionalProperties":true})
}

pub fn default_mcp_servers() -> Vec<McpServerConfig> {
    vec![
        McpServerConfig {
            id: "web-search".into(),
            name: "Web search MCP".into(),
            transport: "http".into(),
            command_or_url: "http://localhost:3000/mcp".into(),
            enabled: false,
            tools: Vec::new(),
            status: Some("not-configured".into()),
            latency_ms: None,
            last_error: None,
        },
        McpServerConfig {
            id: "filesystem".into(),
            name: "Filesystem sandbox".into(),
            transport: "stdio".into(),
            command_or_url: "npx -y @modelcontextprotocol/server-filesystem .".into(),
            enabled: false,
            tools: Vec::new(),
            status: Some("not-configured".into()),
            latency_ms: None,
            last_error: None,
        },
    ]
}

pub async fn test_mcp_server_connection(server: &McpServerConfig) -> McpServerTestResult {
    let started = Instant::now();
    match inspect_server(server).await {
        Ok(tools) => {
            let latency_ms = started.elapsed().as_millis() as u64;
            let message = if tools.is_empty() {
                "Connected; server returned no tools".to_string()
            } else {
                format!("Connected; {} tools available", tools.len())
            };
            McpServerTestResult { ok: true, message, latency_ms, tools }
        }
        Err(error) => McpServerTestResult {
            ok: false,
            message: error.to_string(),
            latency_ms: started.elapsed().as_millis() as u64,
            tools: Vec::new(),
        },
    }
}

pub async fn execute_mcp_tool(server: &McpServerConfig, tool_name: &str, arguments: Value) -> McpToolCallResult {
    let started = Instant::now();
    match call_server_tool(server, tool_name, arguments).await {
        Ok(raw) => {
            let content = extract_tool_content(&raw).unwrap_or_else(|| serde_json::to_string_pretty(&raw).unwrap_or_else(|_| raw.to_string()));
            McpToolCallResult { ok: true, content, raw, latency_ms: started.elapsed().as_millis() as u64 }
        }
        Err(error) => {
            let raw = json!({ "error": error.to_string() });
            McpToolCallResult { ok: false, content: error.to_string(), raw, latency_ms: started.elapsed().as_millis() as u64 }
        }
    }
}

async fn inspect_server(server: &McpServerConfig) -> Result<Vec<McpToolInfo>, McpError> {
    match server.transport.as_str() {
        "stdio" => inspect_stdio_server(server).await,
        "http" => inspect_http_server(server).await,
        _ => Err(McpError::InvalidTransport),
    }
}

async fn call_server_tool(server: &McpServerConfig, tool_name: &str, arguments: Value) -> Result<Value, McpError> {
    match server.transport.as_str() {
        "stdio" => call_stdio_tool(server, tool_name, arguments).await,
        "http" => call_http_tool(server, tool_name, arguments).await,
        _ => Err(McpError::InvalidTransport),
    }
}

fn parse_command(command: &str) -> Result<(String, Vec<String>), McpError> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut chars = command.trim().chars().peekable();
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;

    while let Some(ch) = chars.next() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            '\\' if !in_single => escaped = true,
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            c if c.is_whitespace() && !in_single && !in_double => {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
                while matches!(chars.peek(), Some(next) if next.is_whitespace()) {
                    chars.next();
                }
            }
            other => current.push(other),
        }
    }

    if escaped || in_single || in_double {
        return Err(McpError::InvalidCommand("unterminated quoted command".into()));
    }

    if !current.is_empty() {
        parts.push(current);
    }

    let Some(program) = parts.first().cloned() else {
        return Err(McpError::MissingEndpoint);
    };
    Ok((program, parts.into_iter().skip(1).collect()))
}

fn build_initialize_params() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "clientInfo": {
            "name": "RamTeamAi",
            "version": env!("CARGO_PKG_VERSION"),
        },
        "capabilities": {
            "tools": {}
        }
    })
}

fn build_tools_list_params() -> Value {
    json!({})
}

fn build_tool_call_params(tool_name: &str, arguments: Value) -> Value {
    json!({
        "name": tool_name,
        "arguments": arguments
    })
}

async fn send_stdio_message(stdin: &mut tokio::process::ChildStdin, message: &Value) -> Result<(), McpError> {
    let payload = serde_json::to_vec(message)?;
    let header = format!("Content-Length: {}\r\n\r\n", payload.len());
    stdin.write_all(header.as_bytes()).await?;
    stdin.write_all(&payload).await?;
    stdin.flush().await?;
    Ok(())
}

async fn read_stdio_message(stdout: &mut BufReader<tokio::process::ChildStdout>) -> Result<Value, McpError> {
    let mut content_length = None;
    loop {
        let mut line = String::new();
        let bytes = stdout.read_line(&mut line).await?;
        if bytes == 0 {
            return Err(McpError::Protocol("MCP process closed its output".into()));
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }

        if let Some(rest) = trimmed.strip_prefix("Content-Length:") {
            content_length = Some(rest.trim().parse::<usize>().map_err(|error| McpError::Protocol(error.to_string()))?);
        }
    }

    let Some(content_length) = content_length else {
        return Err(McpError::Protocol("missing Content-Length header".into()));
    };

    let mut payload = vec![0_u8; content_length];
    stdout.read_exact(&mut payload).await?;
    let value: Value = serde_json::from_slice(&payload)?;
    Ok(value)
}

async fn read_stdio_response(stdout: &mut BufReader<tokio::process::ChildStdout>, expected_id: u64) -> Result<Value, McpError> {
    let result = timeout(Duration::from_secs(15), async {
        loop {
            let message = read_stdio_message(stdout).await?;
            if let Some(id) = message.get("id").and_then(Value::as_u64) {
                if id == expected_id {
                    if let Some(error) = message.get("error") {
                        return Err(McpError::Protocol(format!("JSON-RPC error: {error}")));
                    }
                    return Ok(message);
                }
            }
        }
    })
    .await
    .map_err(|_| McpError::Timeout)?;

    result
}

async fn start_stdio_server(server: &McpServerConfig) -> Result<(Child, BufReader<tokio::process::ChildStdout>, tokio::process::ChildStdin), McpError> {
    let (program, args) = parse_command(&server.command_or_url)?;
    let mut command = Command::new(program);
    command.args(args);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let mut child = command.spawn()?;
    let stdin = child.stdin.take().ok_or_else(|| McpError::Protocol("failed to open stdin".into()))?;
    let stdout = child.stdout.take().ok_or_else(|| McpError::Protocol("failed to open stdout".into()))?;
    Ok((child, BufReader::new(stdout), stdin))
}

async fn inspect_stdio_server(server: &McpServerConfig) -> Result<Vec<McpToolInfo>, McpError> {
    let (mut child, mut stdout, mut stdin) = start_stdio_server(server).await?;
    let result = async {
        send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "id": 1_u64,
            "method": "initialize",
            "params": build_initialize_params(),
        }))
        .await?;
        let _ = read_stdio_response(&mut stdout, 1).await?;
        let _ = send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }))
        .await;

        send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "id": 2_u64,
            "method": "tools/list",
            "params": build_tools_list_params(),
        }))
        .await?;
        let message = read_stdio_response(&mut stdout, 2).await?;
        parse_tools_from_message(&message)
    }
    .await;

    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

async fn call_stdio_tool(server: &McpServerConfig, tool_name: &str, arguments: Value) -> Result<Value, McpError> {
    let (mut child, mut stdout, mut stdin) = start_stdio_server(server).await?;
    let result = async {
        send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "id": 1_u64,
            "method": "initialize",
            "params": build_initialize_params(),
        }))
        .await?;
        let _ = read_stdio_response(&mut stdout, 1).await?;
        let _ = send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }))
        .await;

        send_stdio_message(&mut stdin, &json!({
            "jsonrpc": "2.0",
            "id": 2_u64,
            "method": "tools/call",
            "params": build_tool_call_params(tool_name, arguments),
        }))
        .await?;
        let message = read_stdio_response(&mut stdout, 2).await?;
        extract_result_value(message)
    }
    .await;

    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

fn header_value_as_string(value: &reqwest::header::HeaderValue) -> Option<String> {
    value.to_str().ok().map(str::to_owned)
}

async fn send_http_rpc(url: &str, session_id: Option<&str>, message: &Value) -> Result<(Value, Option<String>), McpError> {
    let client = reqwest::Client::new();
    let mut request = client
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json, text/event-stream")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(message);

    if let Some(session_id) = session_id {
        request = request.header("mcp-session-id", session_id);
    }

    let response = request.send().await.map_err(|error| McpError::Http(error.to_string()))?;
    let status = response.status();
    let headers = response.headers().clone();
    let body = response.text().await.map_err(|error| McpError::Http(error.to_string()))?;

    if !status.is_success() {
        return Err(McpError::Http(format!("{status}: {}", body.chars().take(500).collect::<String>())));
    }

    let content_type = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(header_value_as_string)
        .unwrap_or_default();
    let session_id = headers
        .get("mcp-session-id")
        .or_else(|| headers.get("Mcp-Session-Id"))
        .or_else(|| headers.get("x-mcp-session-id"))
        .and_then(header_value_as_string);
    let value = if content_type.contains("text/event-stream") {
        parse_sse_payload(&body)?
    } else {
        serde_json::from_str::<Value>(&body)?
    };
    Ok((value, session_id))
}

async fn send_http_notification(url: &str, session_id: Option<&str>, message: &Value) -> Result<(), McpError> {
    let client = reqwest::Client::new();
    let mut request = client
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json, text/event-stream")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(message);

    if let Some(session_id) = session_id {
        request = request.header("mcp-session-id", session_id);
    }

    let response = request.send().await.map_err(|error| McpError::Http(error.to_string()))?;
    if !response.status().is_success() {
        return Err(McpError::Http(format!("{}", response.status())));
    }
    Ok(())
}

fn parse_sse_payload(body: &str) -> Result<Value, McpError> {
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data:") {
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            if let Ok(value) = serde_json::from_str::<Value>(data) {
                return Ok(value);
            }
        }
    }
    Err(McpError::Protocol("unable to parse SSE payload".into()))
}

async fn inspect_http_server(server: &McpServerConfig) -> Result<Vec<McpToolInfo>, McpError> {
    let endpoint = server.command_or_url.trim();
    if endpoint.is_empty() {
        return Err(McpError::MissingEndpoint);
    }

    let init_request = json!({
        "jsonrpc": "2.0",
        "id": 1_u64,
        "method": "initialize",
        "params": build_initialize_params(),
    });
    let (init_response, session_id) = send_http_rpc(endpoint, None, &init_request).await?;
    let _ = extract_result_value(init_response)?;
    let _ = send_http_notification(endpoint, session_id.as_deref(), &json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    }))
    .await;

    let list_request = json!({
        "jsonrpc": "2.0",
        "id": 2_u64,
        "method": "tools/list",
        "params": build_tools_list_params(),
    });
    let (list_response, _) = send_http_rpc(endpoint, session_id.as_deref(), &list_request).await?;
    parse_tools_from_message(&list_response)
}

async fn call_http_tool(server: &McpServerConfig, tool_name: &str, arguments: Value) -> Result<Value, McpError> {
    let endpoint = server.command_or_url.trim();
    if endpoint.is_empty() {
        return Err(McpError::MissingEndpoint);
    }

    let init_request = json!({
        "jsonrpc": "2.0",
        "id": 1_u64,
        "method": "initialize",
        "params": build_initialize_params(),
    });
    let (init_response, session_id) = send_http_rpc(endpoint, None, &init_request).await?;
    let _ = extract_result_value(init_response)?;
    let _ = send_http_notification(endpoint, session_id.as_deref(), &json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    }))
    .await;

    let call_request = json!({
        "jsonrpc": "2.0",
        "id": 2_u64,
        "method": "tools/call",
        "params": build_tool_call_params(tool_name, arguments),
    });
    let (call_response, _) = send_http_rpc(endpoint, session_id.as_deref(), &call_request).await?;
    extract_result_value(call_response)
}

fn parse_tools_from_message(message: &Value) -> Result<Vec<McpToolInfo>, McpError> {
    let tools = message
        .pointer("/result/tools")
        .or_else(|| message.get("tools"))
        .and_then(Value::as_array)
        .ok_or_else(|| McpError::Protocol("tools/list response did not contain a tools array".into()))?;

    Ok(tools
        .iter()
        .filter_map(|tool| {
            let name = tool.get("name").and_then(Value::as_str)?.to_string();
            let description = tool.get("description").and_then(Value::as_str).map(str::to_owned);
            let input_schema = tool
                .get("inputSchema")
                .or_else(|| tool.get("input_schema"))
                .cloned()
                .unwrap_or_else(default_schema);
            Some(McpToolInfo { name, description, input_schema })
        })
        .collect())
}

fn extract_result_value(message: Value) -> Result<Value, McpError> {
    if let Some(error) = message.get("error") {
        let text = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        return Err(McpError::Protocol(text.to_string()));
    }
    if let Some(result) = message.get("result") {
        return Ok(result.clone());
    }
    Ok(message)
}

fn extract_tool_content(value: &Value) -> Option<String> {
    if let Some(text) = value.get("content").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(blocks) = value.get("content").and_then(Value::as_array) {
        let text = blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("");
        if !text.is_empty() {
            return Some(text);
        }
    }
    value
        .get("structuredContent")
        .map(|structured| structured.to_string())
        .or_else(|| value.get("message").and_then(Value::as_str).map(str::to_owned))
}
