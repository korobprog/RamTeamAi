export type ScreenId =
  | "onboarding"
  | "providers"
  | "custom-api"
  | "mcp"
  | "agent-builder"
  | "topology"
  | "chat"
  | "build"
  | "settings";

export type ProviderKind = "anthropic" | "openai" | "gemini" | "ollama" | "RamTeamAi" | "custom";
export type ModelApiFormat = "chat-completions" | "anthropic" | "responses";
export type AuthKind = "bearer" | "header" | "query" | "none";
export type StreamKind = "sse" | "jsonl" | "websocket" | "none";
export type AgentRole = "architect" | "critic" | "researcher" | "arbiter" | "coder" | "security" | "product" | "tester";
export type AgentStatus = "typing" | "waiting" | "mcp" | "done";
export type AgentRunMode = "planning" | "implementation";
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
  monitoring?: ProviderMonitoringConfig;
}

export interface ModelConfig {
  id: string;
  label: string;
  apiFormat?: ModelApiFormat;
  capabilities: CapabilityFlags;
}

export interface ProviderMonitoringConfig {
  enabled: boolean;
  refreshIntervalMin: number;
  updatedAt: string;
  requestCount: number;
  errorCount: number;
  tokensUsed: number;
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

export type MessageActionKind = "write" | "error" | "search" | "plan" | "build" | "fallback" | "idle";

// A compact, human-readable summary of what an agent actually did in a turn —
// rendered as a chip in the chat, similar to tool-use cards in the Claude app.
export interface MessageAction {
  kind: MessageActionKind;
  label: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  author: "user" | string;
  agentRole?: AgentRole;
  text: string;
  createdAt: string;
  tokens: number;
  tool?: ToolKind;
  actions?: MessageAction[];
}

export interface ProjectConfig {
  id: string;
  title: string;
  status: "draft" | "active" | "scaffolded" | "built";
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  github?: ProjectGitLink;
}

export interface ProjectGitLink {
  owner: string;
  repo: string;
  branch: string;
  remoteUrl: string;
  visibility?: "public" | "private";
  linkedAt: string;
  lastSyncAt?: string;
}

export interface SessionConfig {
  id: string;
  projectId: string;
  title: string;
  mode: "planning" | "chat";
  tokenBudget: number;
  tokensUsed: number;
  messages: ChatMessage[];
  archivedAt?: string;
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
  status: "draft" | "approved" | "scaffolded" | "built";
  edited: boolean;
}

export interface ImplementationAssignment {
  role: AgentRole;
  owner: string;
  summary: string;
  deliverables: string[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  commandOrUrl: string;
  enabled: boolean;
  tools: string[];
  status?: "connected" | "warning" | "not-configured";
  latencyMs?: number;
  lastError?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface McpServerTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  tools: McpToolInfo[];
}

export interface McpToolCallResult {
  ok: boolean;
  content: string;
  raw: unknown;
  latencyMs: number;
}

export interface BuildResult {
  phase: "scaffold" | "implementation";
  rootPath: string;
  files: string[];
  skipped: boolean;
  message: string;
}

export interface WorkspaceInitResult {
  rootPath: string;
  files: string[];
  createdFiles: string[];
  existingFiles: string[];
  message: string;
}

export interface GithubDeviceFlowResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export interface GithubTokenPollResult {
  status: string;
  accessToken?: string;
  tokenType?: string;
  scope?: string;
  error?: string;
  errorDescription?: string;
  interval?: number;
}

export interface GithubUserProfile {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  htmlUrl?: string | null;
}

export interface CloudSyncSettings {
  enabled: boolean;
  lastSyncAt?: string;
  status: "disabled" | "ready" | "syncing" | "error";
  message?: string;
}

export type ThemePreference = "system" | "light" | "dark";

export interface AppSettings {
  modelFallbackEnabled: boolean;
  // Auto mode chains planning → scaffold → implementation rounds without manual
  // confirmation until the team stops producing new files or hits the round cap.
  autoMode: boolean;
  autoMaxRounds: number;
  // "system" follows the OS; "light"/"dark" force the palette.
  theme: ThemePreference;
}

export interface UserAccountState {
  github?: GithubUserProfile;
  firebaseUid?: string;
  sync: CloudSyncSettings;
}

export interface CloudSettingsSnapshot {
  version: 1;
  updatedAt: string;
  providers: Array<Omit<ProviderConfig, "keyRef" | "maskedKey" | "monitoring" | "latencyMs" | "status"> & { status?: ProviderConfig["status"] }>;
  agents: AgentConfig[];
  topology: TopologyConfig;
  appSettings?: AppSettings;
  projects: Array<Pick<ProjectConfig, "id" | "title" | "status" | "createdAt" | "updatedAt" | "archivedAt" | "github">>;
  activeProjectId: string;
}
