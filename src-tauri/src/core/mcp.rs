use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command_or_url: String,
    pub enabled: bool,
    pub tools: Vec<String>,
}

pub fn default_mcp_servers() -> Vec<McpServerConfig> {
    vec![
        McpServerConfig {
            id: "web-search".into(),
            name: "Web search".into(),
            transport: "http".into(),
            command_or_url: "https://search.local/mcp".into(),
            enabled: true,
            tools: vec!["search".into(), "open".into(), "quote".into()],
        },
        McpServerConfig {
            id: "filesystem".into(),
            name: "Filesystem sandbox".into(),
            transport: "stdio".into(),
            command_or_url: "mcp-server-filesystem ./workspace".into(),
            enabled: true,
            tools: vec!["read_file".into(), "write_file".into(), "list_dir".into()],
        },
    ]
}
