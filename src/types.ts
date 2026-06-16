export type ScreenId =
  | "onboarding"
  | "providers"
  | "custom-api"
  | "agent-builder"
  | "topology"
  | "chat"
  | "build";

export type ProviderKind = "anthropic" | "openai" | "gemini" | "ollama" | "neurogate" | "custom";
export type AuthKind = "bearer" | "header" | "query" | "none";
export type StreamKind = "sse" | "jsonl" | "websocket" | "none";
export type AgentRole = "architect" | "critic" | "researcher" | "arbiter";
export type AgentStatus = "typing" | "waiting" | "mcp" | "done";
export type TopologyKind = "supervisor" | "debate" | "pipeline";
export type ToolKind = "web-search" | "files" | "mcp" | "project-builder";

export interface CapabilityFlags {
  streaming: boolean;
  toolUse: boolean;
  vision: boolean;
  maxContext: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  auth: AuthKind;
  stream: StreamKind;
  keyRef?: string;
  maskedKey?: string;
  models: ModelConfig[];
  status: "connected" | "warning" | "not-configured";
  requestTemplate?: string;
  responsePath?: string;
  streamChunkPath?: string;
  capabilities: CapabilityFlags;
  latencyMs?: number;
}

export interface ModelConfig {
  id: string;
  label: string;
  capabilities: CapabilityFlags;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  tokenBudget: number;
  tools: ToolKind[];
  status: AgentStatus;
}

export interface ChatMessage {
  id: string;
  author: "user" | string;
  agentRole?: AgentRole;
  text: string;
  createdAt: string;
  tokens: number;
  tool?: ToolKind;
}

export interface SessionConfig {
  id: string;
  title: string;
  mode: "planning" | "chat";
  tokenBudget: number;
  tokensUsed: number;
  messages: ChatMessage[];
}

export interface TopologyConfig {
  kind: TopologyKind;
  maxRounds: number;
  arbiterAgentId: string;
}

export interface PlanArtifact {
  id: string;
  title: string;
  stack: string[];
  steps: string[];
  projectTree: string;
  status: "draft" | "approved" | "built";
  edited: boolean;
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  commandOrUrl: string;
  enabled: boolean;
  tools: string[];
}

export interface BuildResult {
  rootPath: string;
  files: string[];
  skipped: boolean;
  message: string;
}
