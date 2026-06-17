import type { AgentConfig, McpServerConfig, PlanArtifact, ProjectConfig, ProviderConfig, SessionConfig, TopologyConfig } from "../types";

const ctx128 = { streaming: true, toolUse: true, vision: true, maxContext: 128_000 };
const ctx200 = { streaming: true, toolUse: true, vision: true, maxContext: 200_000 };
const ctx200Text = { streaming: true, toolUse: true, vision: false, maxContext: 200_000 };
const ctx32 = { streaming: true, toolUse: true, vision: false, maxContext: 32_000 };
const ctxLocal = { streaming: true, toolUse: false, vision: false, maxContext: 16_000 };

export const providersSeed: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    auth: "bearer",
    stream: "sse",
    status: "not-configured",
    capabilities: ctx128,
    requestTemplate: undefined,
    responsePath: "$.content[0].text",
    streamChunkPath: "$.delta.text",
    models: [
      { id: "claude-opus-4-1", label: "Claude Opus 4.1", capabilities: ctx128 },
      { id: "claude-sonnet-4", label: "Claude Sonnet 4", capabilities: ctx128 },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
    stream: "sse",
    status: "not-configured",
    capabilities: ctx128,
    responsePath: "$.choices[0].message.content",
    streamChunkPath: "$.choices[0].delta.content",
    models: [
      { id: "gpt-4.1", label: "GPT-4.1", capabilities: ctx128 },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capabilities: ctx32 },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: "query",
    stream: "sse",
    status: "not-configured",
    capabilities: ctx128,
    responsePath: "$.candidates[0].content.parts[0].text",
    streamChunkPath: "$.candidates[0].content.parts[0].text",
    models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ctx128 }],
  },
  {
    id: "ollama",
    name: "Ollama · локально",
    kind: "ollama",
    baseUrl: "http://localhost:11434/api",
    auth: "none",
    stream: "jsonl",
    maskedKey: "ключ не нужен",
    status: "connected",
    capabilities: ctxLocal,
    models: [
      { id: "llama3.1", label: "Llama 3.1", capabilities: ctxLocal },
      { id: "qwen2.5-coder", label: "Qwen2.5 Coder", capabilities: ctxLocal },
    ],
  },
  {
    id: "RamTeamAi",
    name: "RamTeamAi",
    kind: "RamTeamAi",
    baseUrl: "https://api.neurogate.space/v1",
    auth: "bearer",
    stream: "sse",
    status: "not-configured",
    capabilities: ctx200,
    requestTemplate: '{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }',
    responsePath: "$.choices[0].message.content",
    streamChunkPath: "$.choices[0].delta.content",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek v4 Flash | Chat Completions | 0.2x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "mimo-v2.5", label: "MiMo v2.5 | Chat Completions | 0.2x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "qwen3.7-plus", label: "Qwen3.7 Plus | Anthropic | 0.8x", apiFormat: "anthropic", capabilities: ctx200Text },
      { id: "mimo-v2.5-pro", label: "MiMo v2.5 Pro | Chat Completions | 1x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "minimax-m3", label: "MiniMax M3 | Anthropic | 1x", apiFormat: "anthropic", capabilities: ctx200Text },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro | Chat Completions | 1x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "gpt-5.4-mini", label: "GPT-5.4-mini | Responses | 1.2x", apiFormat: "responses", capabilities: ctx200 },
      { id: "kimi-k2.6", label: "Kimi K2.6 | Chat Completions | 2.8x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "qwen3.7-max", label: "Qwen3.7 Max | Anthropic | 3.5x", apiFormat: "anthropic", capabilities: ctx200Text },
      { id: "gpt-5.4", label: "GPT-5.4 | Responses | 3.5x", apiFormat: "responses", capabilities: ctx200 },
      { id: "glm-5.1", label: "GLM-5.1 | Chat Completions | 3.7x", apiFormat: "chat-completions", capabilities: ctx200Text },
      { id: "gpt-5.5", label: "GPT-5.5 | Responses | 5x", apiFormat: "responses", capabilities: ctx200 },
    ],
  },
];

export const agentsSeed: AgentConfig[] = [
  {
    id: "architect",
    name: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440",
    role: "architect",
    providerId: "RamTeamAi",
    modelId: "gpt-5.4-mini",
    systemPrompt: "\u0422\u044b \u0432\u0435\u0434\u0443\u0449\u0438\u0439 \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440. \u041f\u0440\u043e\u0435\u043a\u0442\u0438\u0440\u0443\u0439 \u0441\u043b\u043e\u0438 \u0438 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u044b \u043c\u043e\u0434\u0443\u043b\u044c\u043d\u043e.",
    tokenBudget: 40_000,
    tools: ["files", "mcp", "project-builder"],
    status: "waiting",
  },
  {
    id: "critic",
    name: "\u041a\u0440\u0438\u0442\u0438\u043a",
    role: "critic",
    providerId: "RamTeamAi",
    modelId: "gpt-5.4-mini",
    systemPrompt: "\u0418\u0449\u0438 \u0440\u0438\u0441\u043a\u0438, \u0434\u044b\u0440\u044b \u0432 \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u0438, \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0438 \u043d\u0435\u0441\u043e\u0432\u043c\u0435\u0441\u0442\u0438\u043c\u044b\u0435 API.",
    tokenBudget: 24_000,
    tools: ["files"],
    status: "waiting",
  },
  {
    id: "researcher",
    name: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c",
    role: "researcher",
    providerId: "RamTeamAi",
    modelId: "gpt-5.4-mini",
    systemPrompt: "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0439 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0441\u0432\u0435\u0434\u0435\u043d\u0438\u044f \u0447\u0435\u0440\u0435\u0437 web-search \u0438 MCP, \u0444\u0438\u043a\u0441\u0438\u0440\u0443\u0439 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438.",
    tokenBudget: 30_000,
    tools: ["web-search", "mcp"],
    status: "waiting",
  },
];

export const projectsSeed: ProjectConfig[] = [
  {
    id: "project-default",
    title: "Новый проект",
    status: "draft",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

export const sessionSeed: SessionConfig = {
  id: "session-default",
  projectId: "project-default",
  title: "Новая сессия",
  mode: "planning",
  tokenBudget: 120_000,
  tokensUsed: 0,
  messages: [],
};

export const topologySeed: TopologyConfig = { kind: "debate", maxRounds: 6, arbiterAgentId: "architect" };

export const planArtifactSeed: PlanArtifact = {
  id: "artifact-RamTeamAi-plan",
  title: "Решение команды",
  stack: ["Tauri 2", "React + TypeScript", "Zustand", "Rust commands", "SQLite", "OS keychain"],
  steps: ["Собрать каркас Tauri + Vite + React и базовый Chat UI", "Добавить Universal Connector: OpenAI/Gemini/Ollama/custom mapping", "Включить Orchestrator: supervisor, debate, pipeline и общий context bus", "Подключить MCP Manager и web-search как инструмент", "Сделать Planning Mode с арбитром, лимитами и редактируемым артефактом", "Реализовать безопасный Project Builder с подтверждением"],
  projectTree: "RamTeamAi/\n├─ src/\n│  ├─ components/\n│  ├─ screens/\n│  ├─ providers/\n│  ├─ orchestrator/\n│  ├─ mcp/\n│  └─ projectBuilder/\n├─ src-tauri/\n│  └─ src/core/\n├─ design/\n└─ PLAN.md",
  status: "draft",
  edited: true,
};

export const mcpServersSeed: McpServerConfig[] = [
  { id: "web-search", name: "Web search MCP", transport: "http", commandOrUrl: "http://localhost:3000/mcp", enabled: false, tools: [], status: "not-configured" },
  { id: "filesystem", name: "Filesystem sandbox", transport: "stdio", commandOrUrl: "npx -y @modelcontextprotocol/server-filesystem .", enabled: false, tools: [], status: "not-configured" },
];
