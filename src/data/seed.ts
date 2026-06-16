import type { AgentConfig, McpServerConfig, PlanArtifact, ProviderConfig, SessionConfig, TopologyConfig } from "../types";

const ctx128 = { streaming: true, toolUse: true, vision: true, maxContext: 128_000 };
const ctx200 = { streaming: true, toolUse: true, vision: true, maxContext: 200_000 };
const ctx200Text = { streaming: true, toolUse: true, vision: false, maxContext: 200_000 };
const ctx32 = { streaming: true, toolUse: true, vision: false, maxContext: 32_000 };
const ctxLocal = { streaming: true, toolUse: false, vision: false, maxContext: 16_000 };

export const providersSeed: ProviderConfig[] = [
  { id: "anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", auth: "bearer", stream: "sse", keyRef: "keychain://Neurogate/anthropic", maskedKey: "sk-ant-•••4f2a", status: "connected", capabilities: ctx128, latencyMs: 284, models: [{ id: "claude-opus-4-1", label: "Claude Opus 4.1", capabilities: ctx128 }, { id: "claude-sonnet-4", label: "Claude Sonnet 4", capabilities: ctx128 }] },
  { id: "openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", auth: "bearer", stream: "sse", keyRef: "keychain://Neurogate/openai", maskedKey: "sk-•••a91c", status: "connected", capabilities: ctx128, latencyMs: 310, models: [{ id: "gpt-4.1", label: "GPT-4.1", capabilities: ctx128 }, { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capabilities: ctx32 }] },
  { id: "gemini", name: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", auth: "query", stream: "sse", keyRef: "keychain://Neurogate/gemini", maskedKey: "AIza•••k0x", status: "warning", capabilities: ctx128, models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ctx128 }] },
  { id: "ollama", name: "Ollama · локально", kind: "ollama", baseUrl: "http://localhost:11434/api", auth: "none", stream: "jsonl", maskedKey: "localhost:11434", status: "connected", capabilities: ctxLocal, latencyMs: 41, models: [{ id: "llama3.1", label: "Llama 3.1", capabilities: ctxLocal }, { id: "qwen2.5-coder", label: "Qwen2.5 Coder", capabilities: ctxLocal }] },
  {
    id: "neurogate",
    name: "Neurogate",
    kind: "neurogate",
    baseUrl: "https://api.neurogate.space/v1",
    auth: "bearer",
    stream: "sse",
    keyRef: "keychain://Neurogate/neurogate",
    maskedKey: "ng-•••xxxx",
    status: "warning",
    capabilities: ctx200,
    requestTemplate: '{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }',
    responsePath: "$.choices[0].message.content",
    streamChunkPath: "$.choices[0].delta.content",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek v4 Flash · 0.2x", capabilities: ctx200Text },
      { id: "mimo-v2.5", label: "MiMo v2.5 · 0.2x", capabilities: ctx200Text },
      { id: "qwen3.7-plus", label: "Qwen3.7 Plus · 0.8x", capabilities: ctx200Text },
      { id: "mimo-v2.5-pro", label: "MiMo v2.5 Pro · 1x", capabilities: ctx200Text },
      { id: "minimax-m3", label: "MiniMax M3 · 1x", capabilities: ctx200Text },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro · 1x", capabilities: ctx200Text },
      { id: "gpt-5.4-mini", label: "GPT-5.4-mini · 1.2x", capabilities: ctx200 },
      { id: "kimi-k2.6", label: "Kimi K2.6 · 2.8x", capabilities: ctx200Text },
      { id: "qwen3.7-max", label: "Qwen3.7 Max · 3.5x", capabilities: ctx200Text },
      { id: "gpt-5.4", label: "GPT-5.4 · 3.5x", capabilities: ctx200 },
      { id: "glm-5.1", label: "GLM-5.1 · 3.7x", capabilities: ctx200Text },
      { id: "gpt-5.5", label: "GPT-5.5 · 5x", capabilities: ctx200 },
    ],
  },
  { id: "custom-gateway", name: "My LLM Gateway · custom", kind: "custom", baseUrl: "https://api.myhost.ai/v1", auth: "bearer", stream: "sse", keyRef: "keychain://Neurogate/custom-gateway", maskedKey: "gw-•••7c1", status: "warning", capabilities: ctx32, requestTemplate: '{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }', responsePath: "$.choices[0].message.content", streamChunkPath: "$.choices[0].delta.content", models: [{ id: "gateway-default", label: "Gateway default", capabilities: ctx32 }] },
];

export const agentsSeed: AgentConfig[] = [
  { id: "architect", name: "Архитектор", role: "architect", providerId: "anthropic", modelId: "claude-opus-4-1", systemPrompt: "Ты ведущий архитектор. Проектируй слои и интерфейсы модульно.", tokenBudget: 40_000, tools: ["files", "mcp", "project-builder"], status: "typing" },
  { id: "critic", name: "Критик", role: "critic", providerId: "openai", modelId: "gpt-4.1", systemPrompt: "Ищи риски, дыры в безопасности, стоимость и несовместимые API.", tokenBudget: 24_000, tools: ["files"], status: "waiting" },
  { id: "researcher", name: "Исследователь", role: "researcher", providerId: "gemini", modelId: "gemini-2.5-pro", systemPrompt: "Проверяй актуальные сведения через web-search и MCP, фиксируй источники.", tokenBudget: 30_000, tools: ["web-search", "mcp"], status: "mcp" },
];

export const sessionSeed: SessionConfig = {
  id: "session-Neurogate-mvp",
  title: "Neurogate desktop MVP",
  mode: "planning",
  tokenBudget: 120_000,
  tokensUsed: 12_400,
  messages: [
    { id: "m1", author: "architect", agentRole: "architect", text: "Слой адаптеров провайдеров получает единый интерфейс, а кастомные API настраиваются через шаблон тела и JSONPath.", createdAt: new Date().toISOString(), tokens: 1240 },
    { id: "m2", author: "critic", agentRole: "critic", text: "Tool-use и стриминг различаются по провайдерам — нормализуем события в общий поток AgentEvent.", createdAt: new Date().toISOString(), tokens: 980 },
    { id: "m3", author: "researcher", agentRole: "researcher", tool: "mcp", text: "MCP Manager держит реестр stdio/http серверов и выдаёт инструменты любому агенту через capability-флаги.", createdAt: new Date().toISOString(), tokens: 860 },
  ],
};

export const topologySeed: TopologyConfig = { kind: "debate", maxRounds: 6, arbiterAgentId: "architect" };

export const planArtifactSeed: PlanArtifact = {
  id: "artifact-Neurogate-plan",
  title: "Решение команды",
  stack: ["Tauri 2", "React + TypeScript", "Zustand", "Rust commands", "SQLite", "OS keychain"],
  steps: ["Собрать каркас Tauri + Vite + React и базовый Chat UI", "Добавить Universal Connector: OpenAI/Gemini/Ollama/custom mapping", "Включить Orchestrator: supervisor, debate, pipeline и общий context bus", "Подключить MCP Manager и web-search как инструмент", "Сделать Planning Mode с арбитром, лимитами и редактируемым артефактом", "Реализовать безопасный Project Builder с подтверждением"],
  projectTree: "Neurogate/\n├─ src/\n│  ├─ components/\n│  ├─ screens/\n│  ├─ providers/\n│  ├─ orchestrator/\n│  ├─ mcp/\n│  └─ projectBuilder/\n├─ src-tauri/\n│  └─ src/core/\n├─ design/\n└─ PLAN.md",
  status: "draft",
  edited: true,
};

export const mcpServersSeed: McpServerConfig[] = [
  { id: "web-search", name: "Web search", transport: "http", commandOrUrl: "https://search.local/mcp", enabled: true, tools: ["search", "open", "quote"] },
  { id: "filesystem", name: "Filesystem sandbox", transport: "stdio", commandOrUrl: "mcp-server-filesystem ./workspace", enabled: true, tools: ["read_file", "write_file", "list_dir"] },
];
