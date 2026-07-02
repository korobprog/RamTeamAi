export type ScreenId =
  | "onboarding"
  | "providers"
  | "custom-api"
  | "mcp"
  | "agent-builder"
  | "topology"
  | "chat"
  | "build"
  | "workbench"
  | "settings";

export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticCategory = "runtime" | "ai" | "provider" | "mcp" | "workspace" | "sync" | "build";

export interface DiagnosticEntry {
  id: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  message: string;
  source?: string;
  details?: string;
  stack?: string;
  context?: Record<string, string>;
  agentId?: string;
  providerId?: string;
  sessionId?: string;
  projectId?: string;
  count: number;
}

export type ProviderKind = "anthropic" | "openai" | "gemini" | "ollama" | "RamTeamAi" | "custom";
export type ModelApiFormat = "chat-completions" | "anthropic" | "responses";
export type AuthKind = "bearer" | "header" | "query" | "none";
export type StreamKind = "sse" | "jsonl" | "websocket" | "none";
export type AgentRole = "architect" | "critic" | "researcher" | "arbiter" | "coder" | "security" | "product" | "tester";
export type AgentStatus = "typing" | "waiting" | "mcp" | "done" | "recovering" | "fired" | "hired";
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
  quotaShortWindowId?: string;
  quotaShortStartedAt?: string;
  quotaShortRequestCount?: number;
  quotaShortTokensUsed?: number;
  quotaLongWindowId?: string;
  quotaLongStartedAt?: string;
  quotaLongRequestCount?: number;
  quotaLongTokensUsed?: number;
  healthStatus?: ProviderHealthStatus;
  consecutiveFailures?: number;
  circuitOpenUntil?: string;
  lastOkAt?: string;
  lastError?: string;
}

export type ProviderHealthStatus = "unknown" | "ok" | "degraded" | "down" | "rate-limited" | "auth-error";

export type AgentLeaseStatus = "idle" | "active" | "stale" | "recovered" | "failed" | "fired" | "partial";

export interface AgentHealth {
  agentId: string;
  failures: number;
  lastSeen?: string;
  currentTask?: string;
  status: "ok" | "slow" | "fired";
}

export interface AgentReplacementEvent {
  previousAgentId: string;
  replacementAgentId?: string;
  reason: string;
  step: string;
  status: "recovered" | "partial" | "failed";
  attempts: number;
  taskPath?: string;
  createdAt: string;
}

export interface AgentRunCheckpoint {
  id: string;
  runId: string;
  agentId: string;
  replacementAgentId?: string;
  mode: AgentRunMode;
  leaseOwner: string;
  leaseExpiresAt: string;
  heartbeatAt: string;
  status: AgentLeaseStatus;
  step: string;
  providerId: string;
  modelId: string;
  attempts: number;
  recoveredAt?: string;
  failureReason?: string;
  handoffContext?: string;
  replacementHistory?: AgentReplacementEvent[];
  error?: string;
  createdAt: string;
  updatedAt: string;
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

export interface LiveFileActivity {
  id: string;
  agentId?: string;
  agentName: string;
  path: string;
  action: "create" | "edit" | "plan" | "error";
  status: "pending" | "written" | "failed";
  updatedAt: string;
}

export interface QueuedAgentQuestion {
  id: string;
  text: string;
  mode: AgentRunMode;
  targetAgentId?: string;
  createdAt: string;
}

export interface AgentDialogMessage {
  id: string;
  author: "user" | "agent" | "system";
  agentId?: string;
  agentRole?: AgentRole;
  text: string;
  createdAt: string;
  tokens: number;
  tool?: ToolKind;
  actions?: MessageAction[];
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
  artifact?: PlanArtifact;
  implementationChecklist?: SavedImplementationChecklistItem[];
  lastRunFilesWritten?: number;
  lastBuild?: BuildResult;
  archivedAt?: string;
}

export type SavedChecklistSource = "verifier" | "heuristic" | "pending";

export interface SavedImplementationChecklistItem {
  id: string;
  index: number;
  step: string;
  done: boolean;
  source: SavedChecklistSource;
  note?: string;
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
  id: string;
  role: AgentRole;
  owner: string;
  summary: string;
  deliverables: string[];
}

export type ProjectReadinessStatus = "unknown" | "scaffold-ok" | "build-ok" | "partial" | "failed";
export type ProjectCompletenessContractId = "generic" | "tauri-react" | "frontend";

export interface ProjectCompletenessReport {
  contract: ProjectCompletenessContractId;
  status: ProjectReadinessStatus;
  requiredFiles: string[];
  presentFiles: string[];
  missingFiles: string[];
  // Required files that exist but still hold the generated scaffold stub.
  stubFiles?: string[];
  warnings: string[];
  message: string;
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
  readiness?: ProjectCompletenessReport;
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

export type ThemePreference = "system" | "light" | "dark" | "vibe";

export interface AppSettings {
  modelFallbackEnabled: boolean;
  healthSupervisorEnabled: boolean;
  providerHealthIntervalSec: number;
  agentLeaseTimeoutSec: number;
  // Auto mode chains planning → scaffold → implementation rounds without manual
  // confirmation until the team stops producing new files or hits the round cap.
  autoMode: boolean;
  autoMaxRounds: number;
  operatorAssistantEnabled: boolean;
  operatorDefaultAgentId?: string;
  operatorAssistantProviderId?: string;
  operatorAssistantModelId?: string;
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
