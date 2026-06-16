pub mod core;

use core::mcp::{default_mcp_servers, McpServerConfig};
use core::orchestrator::{run_planning_round, AgentConfig, ChatMessage, TopologyConfig};
use core::project_builder::{build_project as write_project_files, BuildResult, PlanArtifact};
use core::provider::{default_providers, test_provider, ProviderConfig, ProviderTestResult};
use core::storage::Storage;
use core::vault::{delete_secret, save_secret};
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
fn save_provider_secret(provider_id: String, secret: String) -> Result<String, String> {
    save_secret(&provider_id, &secret).map_err(|error| error.to_string())?;
    Ok(format!("keychain://Neurogate/{provider_id}"))
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
async fn run_agents(agents: Vec<AgentConfig>, topology: TopologyConfig) -> Result<Vec<ChatMessage>, String> {
    run_planning_round(agents, topology).await.map_err(|error| error.to_string())
}

#[tauri::command]
fn build_project(artifact: PlanArtifact, confirmed: bool, app: tauri::AppHandle) -> Result<BuildResult, String> {
    let base = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join("Neurogate Projects");
    write_project_files(&artifact, confirmed, &base).map_err(|error| error.to_string())
}

#[tauri::command]
fn append_history(state: State<'_, AppState>, session_id: String, message: ChatMessage) -> Result<(), String> {
    state.storage.append_message(&session_id, &message).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_history(state: State<'_, AppState>, session_id: String) -> Result<Vec<ChatMessage>, String> {
    state.storage.load_messages(&session_id).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let storage = Storage::open(app_dir.join("Neurogate.sqlite3"))?;
            storage.migrate()?;
            app.manage(AppState { storage });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_providers,
            test_provider_connection,
            save_provider_secret,
            delete_provider_secret,
            list_mcp_servers,
            run_agents,
            build_project,
            append_history,
            load_history
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Neurogate");
}
