use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OrchestratorError {
    #[error("no agents configured")]
    NoAgents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub role: String,
    pub provider_id: String,
    pub model_id: String,
    pub system_prompt: String,
    pub token_budget: u32,
    pub tools: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyConfig {
    pub kind: String,
    pub max_rounds: u32,
    pub arbiter_agent_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub author: String,
    pub agent_role: Option<String>,
    pub text: String,
    pub created_at: String,
    pub tokens: u32,
    pub tool: Option<String>,
}

pub async fn run_planning_round(agents: Vec<AgentConfig>, topology: TopologyConfig) -> Result<Vec<ChatMessage>, OrchestratorError> {
    if agents.is_empty() { return Err(OrchestratorError::NoAgents); }
    let now = time::OffsetDateTime::now_utc().format(&time::format_description::well_known::Rfc3339).unwrap_or_default();
    let take = if topology.kind == "pipeline" { agents.len() } else { agents.len().min(3) };
    Ok(agents.into_iter().take(take).enumerate().map(|(index, agent)| ChatMessage {
        id: format!("tauri-round-{index}-{}", agent.id),
        author: agent.id.clone(),
        agent_role: Some(agent.role.clone()),
        text: match agent.role.as_str() {
            "critic" => "Критик: добавляю лимиты раундов, бюджет токенов и проверку безопасности Build.".into(),
            "researcher" => "Исследователь: подключаю MCP/web инструменты как capability, доступный агентам.".into(),
            _ => format!("{}: фиксирую следующий шаг для топологии {}.", agent.name, topology.kind),
        },
        created_at: now.clone(),
        tokens: 700 + index as u32 * 120,
        tool: if agent.tools.iter().any(|tool| tool == "mcp") { Some("mcp".into()) } else { None },
    }).collect())
}
