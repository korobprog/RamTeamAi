pub mod core;

use core::mcp::{
    default_mcp_servers, execute_mcp_tool, test_mcp_server_connection, McpServerConfig,
    McpServerTestResult, McpToolCallResult,
};
use core::github::{
    begin_device_flow, disconnect as disconnect_github, load_profile as load_github_profile,
    poll_device_flow, GithubDeviceCodeResponse, GithubTokenPollResult, GithubUserProfile,
};
use core::orchestrator::{run_planning_round, AgentConfig, ChatMessage, TopologyConfig};
use core::project_builder::{build_project as write_project_files, init_workspace as init_workspace_files, list_workspace_files as list_workspace_files_inner, read_workspace_file as read_workspace_text_file, write_workspace_file as write_workspace_text_file, BuildResult, PlanArtifact, WorkspaceInitResult, WorkspaceReadResult, WorkspaceWriteResult};
use core::provider::{complete_chat, default_providers, test_provider, CompletionResult, ProviderConfig, ProviderTestResult};
use core::storage::Storage;
use core::vault::{delete_secret, get_secret, has_secret, save_secret};
use tauri::{Manager, State};

struct AppState {
    storage: Storage,
}

#[tauri::command]
fn list_providers() -> Vec<ProviderConfig> {
    default_providers()
}

#[tauri::command]
async fn test_provider_connection(provider: ProviderConfig) -> Result<ProviderTestResult, String> {
    test_provider(&provider).await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn complete_chat_with_provider(
    provider: ProviderConfig,
    agent: AgentConfig,
    messages: Vec<ChatMessage>,
) -> Result<CompletionResult, String> {
    let api_key = if provider.auth == "none" {
        None
    } else {
        Some(get_secret(&provider.id).map_err(|_| "API key is missing. Add the provider key first.".to_string())?)
    };
    complete_chat(&provider, &agent, &messages, api_key)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provider_secret(provider_id: String, secret: String) -> Result<String, String> {
    save_secret(&provider_id, &secret).map_err(|error| error.to_string())?;
    Ok(format!("keychain://RamTeamAi/{provider_id}"))
}

#[tauri::command]
fn has_provider_secret(provider_id: String) -> bool {
    has_secret(&provider_id)
}

#[tauri::command]
fn delete_provider_secret(provider_id: String) -> Result<(), String> {
    delete_secret(&provider_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_mcp_servers() -> Vec<McpServerConfig> {
    default_mcp_servers()
}

#[tauri::command]
async fn test_mcp_server(server: McpServerConfig) -> McpServerTestResult {
    test_mcp_server_connection(&server).await
}

#[tauri::command]
async fn call_mcp_tool(
    server: McpServerConfig,
    tool_name: String,
    arguments: serde_json::Value,
) -> McpToolCallResult {
    execute_mcp_tool(&server, &tool_name, arguments).await
}

#[tauri::command]
async fn run_agents(agents: Vec<AgentConfig>, topology: TopologyConfig) -> Result<Vec<ChatMessage>, String> {
    run_planning_round(agents, topology).await.map_err(|error| error.to_string())
}

#[tauri::command]
fn build_project(
    artifact: PlanArtifact,
    confirmed: bool,
    workspace_path: Option<String>,
    app: tauri::AppHandle,
) -> Result<BuildResult, String> {
    let base = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("RamTeamAi Projects");
    let workspace_path = workspace_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(std::path::PathBuf::from);
    write_project_files(&artifact, confirmed, &base, workspace_path.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn init_workspace(root_path: String) -> Result<WorkspaceInitResult, String> {
    init_workspace_files(std::path::Path::new(root_path.trim())).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_workspace_file(
    root_path: String,
    relative_path: String,
    content: String,
    overwrite: bool,
) -> Result<WorkspaceWriteResult, String> {
    write_workspace_text_file(
        std::path::Path::new(root_path.trim()),
        relative_path.trim(),
        &content,
        overwrite,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_workspace_file(root_path: String, relative_path: String) -> Result<WorkspaceReadResult, String> {
    read_workspace_text_file(
        std::path::Path::new(root_path.trim()),
        relative_path.trim(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_workspace_files(root_path: String) -> Result<Vec<String>, String> {
    list_workspace_files_inner(std::path::Path::new(root_path.trim())).map_err(|error| error.to_string())
}

#[tauri::command]
fn append_history(state: State<'_, AppState>, session_id: String, message: ChatMessage) -> Result<(), String> {
    state.storage.append_message(&session_id, &message).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_history(state: State<'_, AppState>, session_id: String) -> Result<Vec<ChatMessage>, String> {
    state.storage.load_messages(&session_id).map_err(|error| error.to_string())
}

#[tauri::command]
async fn github_begin_device_flow(client_id: String, scope: String) -> Result<GithubDeviceCodeResponse, String> {
    begin_device_flow(&client_id, &scope).await
}

#[tauri::command]
async fn github_poll_device_flow(client_id: String, device_code: String) -> Result<GithubTokenPollResult, String> {
    poll_device_flow(&client_id, &device_code).await
}

#[tauri::command]
async fn github_load_profile() -> Result<Option<GithubUserProfile>, String> {
    load_github_profile().await
}

#[tauri::command]
fn github_disconnect() -> Result<(), String> {
    disconnect_github()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let storage = Storage::open(app_dir.join("RamTeamAi.sqlite3"))?;
            storage.migrate()?;
            app.manage(AppState { storage });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_providers,
            test_provider_connection,
            complete_chat_with_provider,
            save_provider_secret,
            has_provider_secret,
            delete_provider_secret,
            list_mcp_servers,
            test_mcp_server,
            call_mcp_tool,
            run_agents,
            build_project,
            init_workspace,
            write_workspace_file,
            read_workspace_file,
            list_workspace_files,
            append_history,
            load_history,
            github_begin_device_flow,
            github_poll_device_flow,
            github_load_profile,
            github_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RamTeamAi");
}
