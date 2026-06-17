import { create } from "zustand";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";
import { agentsSeed, mcpServersSeed, planArtifactSeed, projectsSeed, providersSeed, sessionSeed, topologySeed } from "../data/seed";
import { safeInvoke } from "../lib/tauri";
import { callMcpTool as callMcpToolRequest, formatMcpToolsForPrompt, testMcpConnection } from "../mcp/manager";
import { synthesizePlan } from "../orchestrator";
import { completeWithProvider, maskSecret, rememberProviderSecret, testProviderConnection } from "../providers";
import type { CompletionResult, ProviderTestResult } from "../providers";
import { buildProject, planImplementationAssignments, renderImplementationPlan } from "../projectBuilder";
import { beginGithubDeviceFlow, disconnectGithub, isGithubConfigured, loadGithubProfile, pollGithubDeviceFlow } from "../integrations/github";
import { describeFirebaseAuthError, isFirebaseConfigured, loadCloudSettings, loadFirebaseUid, saveCloudSettings, signInFirebaseWithGithubToken, signOutFirebase } from "../integrations/firebase";
import type { AgentConfig, AgentRunMode, AppSettings, BuildResult, ChatMessage, CloudSettingsSnapshot, GithubTokenPollResult, McpServerConfig, McpServerTestResult, McpToolCallResult, PlanArtifact, ProjectConfig, ProjectGitLink, ProviderConfig, ProviderMonitoringConfig, ProviderQuotaWindow, ScreenId, SessionConfig, TopologyConfig, UserAccountState, WorkspaceInitResult } from "../types";
import { clearStoredWebWorkspaceFolder, initWorkspaceFiles, pickWorkspaceFolder, writeWorkspaceTextFile } from "../workspace";

const PROVIDERS_STORAGE_KEY = "RamTeamAi.providers.v2";
const LEGACY_PROVIDERS_STORAGE_KEY = "RamTeamAi.provider-overrides";
const AGENTS_STORAGE_KEY = "RamTeamAi.agents.v3";
const LEGACY_AGENTS_STORAGE_KEYS = ["RamTeamAi.agents.v1", "RamTeamAi.agents.v2"];
const WORKSPACE_STORAGE_KEY = "RamTeamAi.workspace.path.v1";
const MCP_STORAGE_KEY = "RamTeamAi.mcp.servers.v1";
const PROJECTS_STORAGE_KEY = "RamTeamAi.projects.v1";
const SESSIONS_STORAGE_KEY = "RamTeamAi.sessions.v1";
const ACTIVE_PROJECT_STORAGE_KEY = "RamTeamAi.active-project.v1";
const ACTIVE_SESSION_STORAGE_KEY = "RamTeamAi.active-session.v1";
const APP_SETTINGS_STORAGE_KEY = "RamTeamAi.app-settings.v1";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_APP_SETTINGS: AppSettings = {
  modelFallbackEnabled: true,
};

const IMPLEMENTATION_ROUND_PROMPT = [
  "Режим реализации: работаем по утверждённому PLAN.md в выбранной рабочей папке.",
  "Не обсуждайте задачу по кругу и не возвращайтесь к планированию, если нет реального блокера.",
  "Каждый агент действует как разработчик: выбирает 1-3 файла, пишет create/update/delete и возвращает применимый код.",
  "Чтобы приложение записало код, ставьте строку `Файл: path/to/file` прямо перед fenced code block и давайте полный контент файла или unified diff.",
  "Если файл уже должен быть создан — напишите его содержимое сейчас. Если нужен тест — укажите команду проверки.",
  "Запрещено отвечать только словами «нужно сделать». В конце ответа явно перечислите: изменяемые файлы, готовность, блокеры.",
].join("\n");

function quotaPresets(provider: ProviderConfig): Array<{ id: string; label: string; hours: number; limitTokens: number }> {
  if (provider.kind === "RamTeamAi") {
    return [
      { id: "burst", label: "5ч", hours: 5, limitTokens: 100_000_000 },
      { id: "week", label: "7д", hours: 24 * 7, limitTokens: 200_000_000 },
    ];
  }

  if (provider.kind === "ollama") {
    return [
      { id: "session", label: "сессия", hours: 8, limitTokens: 16_000_000 },
      { id: "day", label: "24ч", hours: 24, limitTokens: 64_000_000 },
    ];
  }

  const modelFactor = Math.max(1, provider.models.length);
  const context = Math.max(16_000, provider.capabilities.maxContext);
  return [
    { id: "hour", label: "1ч", hours: 1, limitTokens: context * modelFactor * 4 },
    { id: "day", label: "24ч", hours: 24, limitTokens: context * modelFactor * 32 },
  ];
}

function resetQuotaWindow(window: ProviderQuotaWindow, provider: ProviderConfig, now: number): ProviderQuotaWindow {
  const preset = quotaPresets(provider).find((item) => item.id === window.id);
  if (!preset || Date.parse(window.resetsAt) > now) return window;
  return {
    ...window,
    limitTokens: preset.limitTokens,
    usedTokens: 0,
    resetsAt: new Date(now + preset.hours * HOUR_MS).toISOString(),
  };
}

function ensureProviderMonitoring(provider: ProviderConfig, saved?: ProviderMonitoringConfig): ProviderMonitoringConfig {
  const now = Date.now();
  const savedWindows = saved?.windows ?? provider.monitoring?.windows ?? [];
  const windows = quotaPresets(provider).map<ProviderQuotaWindow>((preset) => {
    const existing = savedWindows.find((window) => window.id === preset.id);
    const normalized = existing
      ? { ...existing, label: preset.label, limitTokens: existing.limitTokens || preset.limitTokens }
      : {
        id: preset.id,
        label: preset.label,
        limitTokens: preset.limitTokens,
        usedTokens: 0,
        resetsAt: new Date(now + preset.hours * HOUR_MS).toISOString(),
      };
    return resetQuotaWindow(normalized, provider, now);
  });

  return {
    enabled: saved?.enabled ?? provider.monitoring?.enabled ?? true,
    refreshIntervalMin: saved?.refreshIntervalMin ?? provider.monitoring?.refreshIntervalMin ?? (provider.kind === "ollama" ? 1 : 10),
    updatedAt: saved?.updatedAt ?? provider.monitoring?.updatedAt ?? new Date(now).toISOString(),
    requestCount: saved?.requestCount ?? provider.monitoring?.requestCount ?? 0,
    errorCount: saved?.errorCount ?? provider.monitoring?.errorCount ?? 0,
    tokensUsed: saved?.tokensUsed ?? provider.monitoring?.tokensUsed ?? 0,
    windows,
  };
}

function withProviderMonitoring(provider: ProviderConfig, saved?: ProviderConfig): ProviderConfig {
  const merged = saved ? { ...provider, monitoring: ensureProviderMonitoring(provider, saved.monitoring) } : provider;
  return { ...merged, monitoring: ensureProviderMonitoring(merged, saved?.monitoring) };
}

function updateProviderMonitoring(provider: ProviderConfig, patch: { tokens?: number; latencyMs?: number; failed?: boolean } = {}): ProviderConfig {
  const monitoring = ensureProviderMonitoring(provider, provider.monitoring);
  const tokens = Math.max(0, patch.tokens ?? 0);
  const windows = monitoring.windows.map((window) => ({
    ...window,
    usedTokens: Math.min(window.limitTokens, Math.max(0, window.usedTokens) + tokens),
  }));

  return {
    ...provider,
    latencyMs: patch.latencyMs ?? provider.latencyMs,
    status: patch.failed ? "warning" : provider.status,
    monitoring: {
      ...monitoring,
      updatedAt: new Date().toISOString(),
      requestCount: monitoring.requestCount + (patch.tokens !== undefined || patch.failed !== undefined ? 1 : 0),
      errorCount: monitoring.errorCount + (patch.failed ? 1 : 0),
      tokensUsed: monitoring.tokensUsed + tokens,
      windows,
    },
  };
}

// The rebrand to RamTeamAi accidentally rewrote the live API host to a domain
// that does not resolve. Heal any baseUrl persisted with the broken host so the
// user's stored provider stops overriding the corrected seed value.
function healProviderBaseUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  return url.replace(/api\.ramteamai\.space/i, "api.neurogate.space");
}

function mergeBuiltInProvider(defaultProvider: ProviderConfig, savedProvider?: ProviderConfig): ProviderConfig {
  if (!savedProvider) return withProviderMonitoring(defaultProvider);
  const merged = {
    ...defaultProvider,
    baseUrl: healProviderBaseUrl(savedProvider.baseUrl, defaultProvider.baseUrl),
    auth: savedProvider.auth ?? defaultProvider.auth,
    stream: savedProvider.stream ?? defaultProvider.stream,
    keyRef: savedProvider.keyRef,
    maskedKey: savedProvider.maskedKey,
    status: savedProvider.status ?? defaultProvider.status,
    latencyMs: savedProvider.latencyMs,
  };
  return withProviderMonitoring(merged, savedProvider);
}

function loadProviders(defaultProviders: ProviderConfig[]): ProviderConfig[] {
  if (typeof window === "undefined") return defaultProviders.map((provider) => withProviderMonitoring(provider));
  try {
    const raw = window.localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (raw) {
      const savedProviders = JSON.parse(raw) as ProviderConfig[];
      const mergedProviders = defaultProviders.map((provider) => mergeBuiltInProvider(provider, savedProviders.find((item) => item.id === provider.id)));
      const customProviders = savedProviders
        .filter((provider) => !defaultProviders.some((item) => item.id === provider.id))
        .map((provider) => withProviderMonitoring(provider, provider));
      return [...mergedProviders, ...customProviders];
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_PROVIDERS_STORAGE_KEY);
    if (!legacyRaw) return defaultProviders.map((provider) => withProviderMonitoring(provider));
    const overrides = JSON.parse(legacyRaw) as Pick<ProviderConfig, "id" | "keyRef" | "maskedKey" | "status">[];
    return defaultProviders.map((provider) => {
      const override = overrides.find((item) => item.id === provider.id);
      return withProviderMonitoring(override ? { ...provider, keyRef: override.keyRef, maskedKey: override.maskedKey, status: override.status } : provider);
    });
  } catch {
    return defaultProviders.map((provider) => withProviderMonitoring(provider));
  }
}

function persistProviders(providers: ProviderConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
}

function loadAgents(defaultAgents: AgentConfig[]): AgentConfig[] {
  if (typeof window === "undefined") return defaultAgents;
  try {
    LEGACY_AGENTS_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    const raw = window.localStorage.getItem(AGENTS_STORAGE_KEY);
    if (!raw) return defaultAgents;
    const agents = JSON.parse(raw) as AgentConfig[];
    const hasBrokenEncoding = agents.some((agent) => agent.name.includes("?") || agent.systemPrompt.includes("?"));
    if (hasBrokenEncoding) {
      persistAgents(defaultAgents);
      return defaultAgents;
    }
    return agents;
  } catch {
    return defaultAgents;
  }
}

function persistAgents(agents: AgentConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
}

function mergeMcpServer(defaultServer: McpServerConfig, savedServer?: McpServerConfig): McpServerConfig {
  if (!savedServer) return defaultServer;
  return {
    ...defaultServer,
    ...savedServer,
    tools: savedServer.tools ?? defaultServer.tools,
    status: savedServer.status ?? defaultServer.status,
  };
}

function loadMcpServers(defaultServers: McpServerConfig[]): McpServerConfig[] {
  if (typeof window === "undefined") return defaultServers;
  try {
    const raw = window.localStorage.getItem(MCP_STORAGE_KEY);
    if (!raw) return defaultServers;
    const savedServers = JSON.parse(raw) as McpServerConfig[];
    const mergedDefaults = defaultServers.map((server) => mergeMcpServer(server, savedServers.find((item) => item.id === server.id)));
    const customServers = savedServers.filter((server) => !defaultServers.some((item) => item.id === server.id));
    return [...mergedDefaults, ...customServers];
  } catch {
    return defaultServers;
  }
}

function persistMcpServers(servers: McpServerConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
}

function loadWorkspacePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || undefined;
}

function persistWorkspacePath(path?: string): void {
  if (typeof window === "undefined") return;
  if (path) {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, path);
  } else {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
}

function persistProjects(projects: ProjectConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

function persistSessions(sessions: SessionConfig[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

function persistActiveIds(projectId: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  if (projectId) {
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  } else {
    window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
  }
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
  } else {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }
}

function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
  };
}

function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    return normalizeAppSettings(raw ? JSON.parse(raw) as Partial<AppSettings> : undefined);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

function persistAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function createCloudSettingsSnapshot(state: {
  providers: ProviderConfig[];
  agents: AgentConfig[];
  topology: TopologyConfig;
  appSettings: AppSettings;
  projects: ProjectConfig[];
  activeProjectId: string;
}): CloudSettingsSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    providers: state.providers.map(({ keyRef: _keyRef, maskedKey: _maskedKey, monitoring: _monitoring, latencyMs: _latencyMs, ...provider }) => ({
      ...provider,
      status: provider.auth === "none" ? provider.status : "not-configured",
    })),
    agents: state.agents,
    topology: state.topology,
    appSettings: state.appSettings,
    projects: state.projects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: project.archivedAt,
      github: project.github,
    })),
    activeProjectId: state.activeProjectId,
  };
}

function restoreCloudProviders(snapshot: CloudSettingsSnapshot): ProviderConfig[] {
  return snapshot.providers.map((provider) => withProviderMonitoring({
    ...provider,
    keyRef: undefined,
    maskedKey: undefined,
    status: provider.auth === "none" ? (provider.status ?? "not-configured") : "not-configured",
  }));
}

function readStoredId(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(key) || undefined;
}

function loadProjects(defaultProjects: ProjectConfig[]): ProjectConfig[] {
  if (typeof window === "undefined") return defaultProjects;
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return defaultProjects;
    const projects = JSON.parse(raw) as ProjectConfig[];
    return projects.length ? projects : defaultProjects;
  } catch {
    return defaultProjects;
  }
}

function extractWorkspaceFileBlocks(text: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const lines = text.split(/\r?\n/);
  let pendingPath: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pathMatch =
      line.match(/(?:^|\b)(?:файл|file|path|create|update|создать|обновить)\s*[:：-]\s*`?([^`\s]+)`?/i) ??
      line.match(/^\s*#{1,5}\s+`?((?:src|tests|docs|assets)\/[^`\s]+|[A-Za-z0-9._-]+\.(?:ts|tsx|js|jsx|json|css|md|py|rs|html))`?/i);
    if (pathMatch?.[1]) {
      pendingPath = pathMatch[1].trim();
      continue;
    }

    if (!pendingPath || !line.trimStart().startsWith("```")) continue;

    const content: string[] = [];
    index += 1;
    while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
      content.push(lines[index]);
      index += 1;
    }

    if (content.length) {
      files.push({ path: pendingPath, content: content.join("\n") + "\n" });
    }
    pendingPath = undefined;
  }

  return files;
}

interface CompletionCandidate {
  provider: ProviderConfig;
  modelId: string;
}

interface CompletionAttempt {
  providerId: string;
  providerName: string;
  modelId: string;
  modelLabel: string;
  ok: boolean;
  error?: string;
  latencyMs?: number;
  tokens?: number;
}

interface CompletionWithFallbackResult {
  result: CompletionResult;
  attempts: CompletionAttempt[];
}

class ModelFallbackError extends Error {
  constructor(message: string, readonly attempts: CompletionAttempt[]) {
    super(message);
    this.name = "ModelFallbackError";
  }
}

function modelLabel(provider: ProviderConfig, modelId: string): string {
  return provider.models.find((model) => model.id === modelId)?.label ?? modelId;
}

function candidateKey(candidate: CompletionCandidate): string {
  return candidate.provider.id + "::" + candidate.modelId;
}

function completionCandidates(agent: AgentConfig, providers: ProviderConfig[], fallbackEnabled: boolean): CompletionCandidate[] {
  const primaryProvider = providers.find((provider) => provider.id === agent.providerId);
  const candidates: CompletionCandidate[] = [];

  if (primaryProvider) {
    candidates.push({ provider: primaryProvider, modelId: agent.modelId });
  }

  if (!fallbackEnabled) return candidates;

  if (primaryProvider && primaryProvider.status !== "not-configured") {
    for (const model of primaryProvider.models) {
      if (model.id !== agent.modelId) candidates.push({ provider: primaryProvider, modelId: model.id });
    }
  }

  for (const provider of providers) {
    if (provider.id === primaryProvider?.id || provider.status === "not-configured") continue;
    for (const model of provider.models) candidates.push({ provider, modelId: model.id });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeAttemptError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 220);
}

async function completeWithModelFallback(
  providers: ProviderConfig[],
  agent: AgentConfig,
  messages: ChatMessage[],
  mode: AgentRunMode,
  fallbackEnabled: boolean,
): Promise<CompletionWithFallbackResult> {
  const candidates = completionCandidates(agent, providers, fallbackEnabled);
  if (!candidates.length) throw new Error("Провайдер агента не найден.");

  const attempts: CompletionAttempt[] = [];
  for (const candidate of candidates) {
    const attemptAgent: AgentConfig = {
      ...agent,
      providerId: candidate.provider.id,
      modelId: candidate.modelId,
    };

    try {
      const result = await completeWithProvider(candidate.provider, attemptAgent, messages, mode);
      attempts.push({
        providerId: candidate.provider.id,
        providerName: candidate.provider.name,
        modelId: candidate.modelId,
        modelLabel: modelLabel(candidate.provider, candidate.modelId),
        ok: true,
        latencyMs: result.latencyMs,
        tokens: result.tokens,
      });
      return { result, attempts };
    } catch (error) {
      attempts.push({
        providerId: candidate.provider.id,
        providerName: candidate.provider.name,
        modelId: candidate.modelId,
        modelLabel: modelLabel(candidate.provider, candidate.modelId),
        ok: false,
        error: summarizeAttemptError(error),
      });
    }
  }

  const details = attempts
    .slice(0, 6)
    .map((attempt) => `${attempt.providerName}/${attempt.modelLabel}: ${attempt.error ?? "нет текста ошибки"}`)
    .join("; ");
  throw new ModelFallbackError((fallbackEnabled ? "Все fallback-модели не ответили. " : "") + details, attempts);
}

function fallbackNotice(attempts: CompletionAttempt[]): string {
  if (attempts.length <= 1) return "";
  const failed = attempts.filter((attempt) => !attempt.ok);
  const success = attempts.find((attempt) => attempt.ok);
  if (!success) return "";
  const failedLabels = failed
    .slice(0, 3)
    .map((attempt) => `${attempt.providerName}/${attempt.modelLabel}`)
    .join(", ");
  return [
    `↪️ Автопереключение модели: ${failedLabels} → ${success.providerName}/${success.modelLabel}.`,
    failed[0]?.error ? `Причина: ${failed[0].error}` : "",
  ].filter(Boolean).join("\n");
}

function looksLikeEncodingDamage(text: string): boolean {
  const questionMarks = (text.match(/\?/g) ?? []).length;
  return /\?{3,}/.test(text) && questionMarks >= Math.max(6, Math.floor(text.length * 0.2));
}

function repairCorruptedMessage(message: ChatMessage): ChatMessage {
  if (!looksLikeEncodingDamage(message.text)) return message;

  const text = message.author === "system"
    ? "Сначала отправьте задачу или контекст проекта. Без этого агенты не запускаются: моделям нечего разбирать."
    : "Ответ был повреждён из-за кодировки. Запустите этот шаг заново после отправки понятной задачи или контекста проекта.";

  return {
    ...message,
    text,
    tokens: Math.max(16, Math.ceil(text.length / 4)),
  };
}

function normalizeSession(session: SessionConfig, fallbackProjectId: string): SessionConfig {
  const messages = Array.isArray(session.messages) ? session.messages.map(repairCorruptedMessage) : [];
  return {
    ...session,
    id: session.id || "session-" + Date.now(),
    projectId: session.projectId || fallbackProjectId,
    title: session.title === "RamTeamAi desktop MVP" ? "Новая сессия" : (session.title?.trim() || "Новая сессия"),
    mode: session.mode ?? "planning",
    tokenBudget: session.tokenBudget || 120_000,
    messages,
    tokensUsed: messages.reduce((sum, item) => sum + item.tokens, 0),
  };
}

function loadSessions(defaultSession: SessionConfig, projects: ProjectConfig[]): SessionConfig[] {
  const fallbackProjectId = projects[0]?.id ?? defaultSession.projectId;
  if (typeof window === "undefined") return [normalizeSession(defaultSession, fallbackProjectId)];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [normalizeSession(defaultSession, fallbackProjectId)];
    const sessions = (JSON.parse(raw) as SessionConfig[])
      .map((session) => normalizeSession(session, fallbackProjectId))
      .filter((session) => projects.some((project) => project.id === session.projectId));
    if (raw.includes("???")) persistSessions(sessions);
    return sessions.length ? sessions : [normalizeSession(defaultSession, fallbackProjectId)];
  } catch {
    return [normalizeSession(defaultSession, fallbackProjectId)];
  }
}

function resolveActiveProjectId(projects: ProjectConfig[], sessions: SessionConfig[]): string {
  const storedProjectId = readStoredId(ACTIVE_PROJECT_STORAGE_KEY);
  if (storedProjectId && projects.some((project) => project.id === storedProjectId && !project.archivedAt)) return storedProjectId;
  const storedSessionId = readStoredId(ACTIVE_SESSION_STORAGE_KEY);
  const storedSession = sessions.find((session) => session.id === storedSessionId && !session.archivedAt);
  const storedProject = storedSession ? projects.find((project) => project.id === storedSession.projectId && !project.archivedAt) : undefined;
  return storedProject?.id ?? projects.find((project) => !project.archivedAt)?.id ?? sessions.find((session) => !session.archivedAt)?.projectId ?? "project-default";
}

function resolveActiveSessionId(sessions: SessionConfig[], activeProjectId: string): string {
  const storedSessionId = readStoredId(ACTIVE_SESSION_STORAGE_KEY);
  const storedSession = sessions.find((session) => session.id === storedSessionId && session.projectId === activeProjectId && !session.archivedAt);
  return storedSession?.id ?? sessions.find((session) => session.projectId === activeProjectId && !session.archivedAt)?.id ?? sessions.find((session) => !session.archivedAt)?.id ?? "session-default";
}

function replaceSession(sessions: SessionConfig[], session: SessionConfig): SessionConfig[] {
  return sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...sessions];
}

function createProjectConfig(index: number): ProjectConfig {
  const now = new Date().toISOString();
  return {
    id: "project-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    title: index === 0 ? "Новый проект" : "Проект " + (index + 1),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function createSessionConfig(projectId: string, index: number): SessionConfig {
  return {
    id: "session-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    projectId,
    title: index === 0 ? "Новая сессия" : "Сессия " + (index + 1),
    mode: "planning",
    tokenBudget: 120_000,
    tokensUsed: 0,
    messages: [],
  };
}

function createProjectWithSession(projects: ProjectConfig[], sessions: SessionConfig[]): {
  project: ProjectConfig;
  session: SessionConfig;
  projects: ProjectConfig[];
  sessions: SessionConfig[];
} {
  const project = createProjectConfig(projects.length);
  const session = createSessionConfig(project.id, 0);
  return {
    project,
    session,
    projects: [project, ...projects],
    sessions: [session, ...sessions],
  };
}

function createPlaceholderSession(projectId = ""): SessionConfig {
  return {
    id: "session-placeholder",
    projectId,
    title: "Новая сессия",
    mode: "planning",
    tokenBudget: 120_000,
    tokensUsed: 0,
    messages: [],
  };
}

function findActiveSession(sessions: SessionConfig[], projectId: string): SessionConfig | undefined {
  return sessions.find((session) => session.projectId === projectId && !session.archivedAt);
}

function ensureActiveSelection(projects: ProjectConfig[], sessions: SessionConfig[], preferredProjectId?: string): {
  projects: ProjectConfig[];
  sessions: SessionConfig[];
  activeProjectId: string;
  activeSessionId: string;
  session: SessionConfig;
} {
  const preferredProject = preferredProjectId
    ? projects.find((project) => project.id === preferredProjectId && !project.archivedAt)
    : undefined;
  let project = preferredProject ?? projects.find((item) => !item.archivedAt);
  let nextProjects = projects;
  let nextSessions = sessions;

  if (!project) {
    return {
      projects: nextProjects,
      sessions: nextSessions,
      activeProjectId: "",
      activeSessionId: "",
      session: createPlaceholderSession(),
    };
  }

  let session = findActiveSession(nextSessions, project.id);
  if (!session) {
    session = createPlaceholderSession(project.id);
  }

  return {
    projects: nextProjects,
    sessions: nextSessions,
    activeProjectId: project.id,
    activeSessionId: session.id === "session-placeholder" ? "" : session.id,
    session,
  };
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/^\/?init$/i, "Инициализация проекта").split(/\r?\n/)[0]?.replace(/\s+/g, " ").trim();
  if (!normalized) return "Новая сессия";
  return normalized.length > 44 ? normalized.slice(0, 41).trimEnd() + "…" : normalized;
}

function isDefaultProjectTitle(title: string): boolean {
  return title === "Новый проект" || /^Проект \d+$/.test(title) || title === "RamTeamAi desktop MVP";
}

function isDefaultSessionTitle(title: string): boolean {
  return title === "Новая сессия" || /^Сессия \d+$/.test(title) || title === "RamTeamAi desktop MVP";
}

function withSystemMessage(session: SessionConfig, text: string): SessionConfig {
  const message: ChatMessage = {
    id: "system-" + Date.now(),
    author: "system",
    text,
    createdAt: new Date().toISOString(),
    tokens: Math.max(16, Math.ceil(text.length / 4)),
  };
  const messages = [...session.messages, message];
  return {
    ...session,
    messages,
    tokensUsed: messages.reduce((sum, item) => sum + item.tokens, 0),
  };
}

interface AppState {
  screen: ScreenId;
  account: UserAccountState;
  providers: ProviderConfig[];
  agents: AgentConfig[];
  appSettings: AppSettings;
  projects: ProjectConfig[];
  sessions: SessionConfig[];
  activeProjectId: string;
  activeSessionId: string;
  session: SessionConfig;
  topology: TopologyConfig;
  artifact: PlanArtifact;
  mcpServers: McpServerConfig[];
  workspacePath?: string;
  lastBuild?: BuildResult;
  lastWorkspaceInit?: WorkspaceInitResult;
  activeRunMode?: AgentRunMode;
  busy: boolean;
  setScreen: (screen: ScreenId) => void;
  hydrateAccount: () => Promise<void>;
  startGithubLogin: () => Promise<void>;
  disconnectAccount: () => Promise<void>;
  syncSettingsToCloud: () => Promise<void>;
  restoreSettingsFromCloud: () => Promise<void>;
  linkActiveProjectToGithub: (link: { owner: string; repo: string; branch?: string; visibility?: ProjectGitLink["visibility"] }) => void;
  unlinkProjectFromGithub: (projectId: string) => void;
  upsertProvider: (provider: ProviderConfig) => void;
  saveProviderSecret: (providerId: string, secret: string) => Promise<void>;
  hydrateProviderSecrets: () => Promise<void>;
  refreshProviderMonitoring: (providerId?: string) => void;
  testProvider: (providerId: string) => Promise<ProviderTestResult | undefined>;
  setAppSettings: (patch: Partial<AppSettings>) => void;
  updateAgent: (agent: AgentConfig) => void;
  upsertAgent: (agent: AgentConfig) => void;
  upsertMcpServer: (server: McpServerConfig) => void;
  removeMcpServer: (serverId: string) => void;
  testMcpServer: (serverId: string) => Promise<McpServerTestResult | undefined>;
  callMcpTool: (serverId: string, toolName: string, args: unknown) => Promise<McpToolCallResult | undefined>;
  setTopology: (patch: Partial<TopologyConfig>) => void;
  createProject: () => void;
  createSession: (projectId?: string) => void;
  startTeam: () => Promise<void>;
  selectProject: (projectId: string) => void;
  selectSession: (sessionId: string) => void;
  archiveProject: (projectId: string) => void;
  archiveSession: (sessionId: string) => void;
  restoreProject: (projectId: string) => void;
  restoreSession: (sessionId: string) => void;
  clearArchiveMemory: () => void;
  deleteArchive: () => void;
  setSessionMode: (mode: SessionConfig["mode"]) => void;
  runTeam: (prompt?: string, mode?: AgentRunMode) => Promise<void>;
  updateArtifact: (patch: Partial<PlanArtifact>) => void;
  selectWorkspaceFolder: () => Promise<string | undefined>;
  clearWorkspaceFolder: () => void;
  initWorkspace: (announce?: boolean) => Promise<WorkspaceInitResult | undefined>;
  requestBuild: (confirmed: boolean) => Promise<void>;
  implementProject: () => Promise<void>;
  startAgentImplementation: () => Promise<void>;
}

const initialProjects = loadProjects(projectsSeed);
const initialSessions = loadSessions(sessionSeed, initialProjects);
const initialActiveProjectId = resolveActiveProjectId(initialProjects, initialSessions);
const initialActiveSessionId = resolveActiveSessionId(initialSessions, initialActiveProjectId);
const initialSession = initialSessions.find((session) => session.id === initialActiveSessionId) ?? initialSessions[0] ?? normalizeSession(sessionSeed, initialActiveProjectId);

export const useAppStore = create<AppState>((set, get) => ({
  screen: "onboarding",
  account: {
    sync: {
      enabled: false,
      status: "disabled",
      message: "GitHub и Firebase не подключены.",
    },
  },
  providers: loadProviders(providersSeed),
  agents: loadAgents(agentsSeed),
  appSettings: loadAppSettings(),
  projects: initialProjects,
  sessions: initialSessions,
  activeProjectId: initialActiveProjectId,
  activeSessionId: initialActiveSessionId,
  session: initialSession,
  topology: topologySeed,
  artifact: planArtifactSeed,
  mcpServers: loadMcpServers(mcpServersSeed),
  workspacePath: loadWorkspacePath(),
  activeRunMode: undefined,
  busy: false,
  setScreen: (screen) => set({ screen }),
  hydrateAccount: async () => {
    const profile = await loadGithubProfile();
    const firebaseUid = await loadFirebaseUid();
    if (!profile && !firebaseUid) return;
    set((state) => ({
      account: {
        ...state.account,
        github: profile,
        firebaseUid,
        sync: {
          ...state.account.sync,
          enabled: Boolean(firebaseUid),
          status: firebaseUid ? "ready" : "disabled",
          message: firebaseUid
            ? "GitHub подключен, Firebase синхронизация готова."
            : isFirebaseConfigured()
              ? "GitHub подключен. Firebase будет привязан после следующего входа."
              : "GitHub подключен локально. Для облачной синхронизации добавьте Firebase config.",
        },
      },
    }));
  },
  startGithubLogin: async () => {
    if (!isGithubConfigured()) {
      set((state) => ({
        account: {
          ...state.account,
          sync: { ...state.account.sync, status: "error", message: "Не задан VITE_GITHUB_CLIENT_ID." },
        },
      }));
      return;
    }

    set((state) => ({
      busy: true,
      account: {
        ...state.account,
        sync: { ...state.account.sync, status: "syncing", message: "Открываем GitHub Device Flow..." },
      },
    }));

    try {
      const device = await beginGithubDeviceFlow();
      const verificationUrl = device.verificationUriComplete ?? device.verificationUri;
      try {
        await openExternal(verificationUrl);
      } catch {
        window.open(verificationUrl, "_blank", "noopener,noreferrer");
      }
      set((state) => ({
        account: {
          ...state.account,
          sync: {
            ...state.account.sync,
            status: "syncing",
            message: "Открой GitHub и введи код: " + device.userCode,
          },
        },
      }));

      const startedAt = Date.now();
      let intervalSec = Math.max(1, device.interval);
      let pollResult: GithubTokenPollResult | undefined;
      while (Date.now() - startedAt < device.expiresIn * 1000) {
        await new Promise((resolve) => window.setTimeout(resolve, intervalSec * 1000));
        pollResult = await pollGithubDeviceFlow(device.deviceCode);
        if (pollResult.status === "authorized" && pollResult.accessToken) break;
        if (pollResult.status === "slow_down") intervalSec += 5;
        if (!["authorization_pending", "slow_down"].includes(pollResult.status)) {
          throw new Error(pollResult.errorDescription ?? pollResult.error ?? pollResult.status);
        }
      }

      if (!pollResult?.accessToken) {
        throw new Error("Время авторизации GitHub истекло.");
      }

      let firebaseUid: string | undefined;
      let firebaseError: string | undefined;
      if (isFirebaseConfigured()) {
        try {
          firebaseUid = await signInFirebaseWithGithubToken(pollResult.accessToken);
        } catch (error) {
          firebaseError = describeFirebaseAuthError(error);
        }
      }

      const profile = await loadGithubProfile();

      set((state) => ({
        busy: false,
        account: {
          ...state.account,
          github: profile,
          firebaseUid,
          sync: {
            enabled: Boolean(firebaseUid),
            status: firebaseUid ? "ready" : firebaseError ? "error" : "disabled",
            message: firebaseUid
              ? "GitHub подключен, Firebase синхронизация готова."
              : firebaseError
                ? "GitHub подключен локально, но Firebase не принял вход: " + firebaseError
                : "GitHub подключен локально. Firebase config не задан.",
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        busy: false,
        account: {
          ...state.account,
          sync: {
            ...state.account.sync,
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        },
      }));
    }
  },
  disconnectAccount: async () => {
    await disconnectGithub();
    await signOutFirebase();
    set({
      account: {
        sync: {
          enabled: false,
          status: "disabled",
          message: "Аккаунт отключен. Локальные настройки остались на устройстве.",
        },
      },
    });
  },
  syncSettingsToCloud: async () => {
    const { account } = get();
    if (!account.firebaseUid) {
      set((state) => ({
        account: {
          ...state.account,
          sync: { ...state.account.sync, status: "error", message: "Сначала войдите через GitHub и Firebase." },
        },
      }));
      return;
    }

    set((state) => ({
      busy: true,
      account: { ...state.account, sync: { ...state.account.sync, status: "syncing", message: "Сохраняем настройки в Firebase..." } },
    }));
    try {
      const state = get();
      const snapshot = createCloudSettingsSnapshot(state);
      await saveCloudSettings(account.firebaseUid, snapshot);
      set((state) => ({
        busy: false,
        account: {
          ...state.account,
          sync: {
            enabled: true,
            status: "ready",
            lastSyncAt: snapshot.updatedAt,
            message: "Настройки синхронизированы. Диалоги и ключи не отправлялись.",
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        busy: false,
        account: {
          ...state.account,
          sync: { ...state.account.sync, status: "error", message: error instanceof Error ? error.message : String(error) },
        },
      }));
    }
  },
  restoreSettingsFromCloud: async () => {
    const { account } = get();
    if (!account.firebaseUid) {
      set((state) => ({
        account: {
          ...state.account,
          sync: { ...state.account.sync, status: "error", message: "Сначала войдите через GitHub и Firebase." },
        },
      }));
      return;
    }

    set((state) => ({
      busy: true,
      account: { ...state.account, sync: { ...state.account.sync, status: "syncing", message: "Загружаем настройки из Firebase..." } },
    }));
    try {
      const snapshot = await loadCloudSettings(account.firebaseUid);
      if (!snapshot) throw new Error("В облаке пока нет сохраненных настроек.");
      const projects = snapshot.projects.map((project) => ({ ...project }));
      const providers = restoreCloudProviders(snapshot);
      const appSettings = normalizeAppSettings(snapshot.appSettings);
      persistProviders(providers);
      persistAgents(snapshot.agents);
      persistAppSettings(appSettings);
      persistProjects(projects);
      const selection = ensureActiveSelection(projects, get().sessions, snapshot.activeProjectId);
      persistActiveIds(selection.activeProjectId, selection.activeSessionId);
      set((state) => ({
        busy: false,
        providers,
        agents: snapshot.agents,
        topology: snapshot.topology,
        appSettings,
        projects: selection.projects,
        activeProjectId: selection.activeProjectId,
        activeSessionId: selection.activeSessionId,
        session: selection.session,
        account: {
          ...state.account,
          sync: {
            enabled: true,
            status: "ready",
            lastSyncAt: snapshot.updatedAt,
            message: "Настройки восстановлены. Ключи нужно добавить на этом устройстве заново.",
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        busy: false,
        account: {
          ...state.account,
          sync: { ...state.account.sync, status: "error", message: error instanceof Error ? error.message : String(error) },
        },
      }));
    }
  },
  linkActiveProjectToGithub: (link) => set((state) => {
    const owner = link.owner.trim();
    const repo = link.repo.trim();
    if (!owner || !repo || !state.activeProjectId) return {};
    const now = new Date().toISOString();
    const github: ProjectGitLink = {
      owner,
      repo,
      branch: link.branch?.trim() || "main",
      visibility: link.visibility,
      remoteUrl: "https://github.com/" + owner + "/" + repo + ".git",
      linkedAt: now,
    };
    const projects = state.projects.map((project) => project.id === state.activeProjectId
      ? { ...project, github, updatedAt: now }
      : project);
    persistProjects(projects);
    return { projects };
  }),
  unlinkProjectFromGithub: (projectId) => set((state) => {
    const projects = state.projects.map((project) => project.id === projectId
      ? { ...project, github: undefined, updatedAt: new Date().toISOString() }
      : project);
    persistProjects(projects);
    return { projects };
  }),
  upsertProvider: (provider) => set((state) => {
    const normalized = withProviderMonitoring(provider, provider);
    const providers = state.providers.some((item) => item.id === provider.id)
      ? state.providers.map((item) => (item.id === provider.id ? normalized : item))
      : [...state.providers, normalized];
    persistProviders(providers);
    return { providers };
  }),
  saveProviderSecret: async (providerId, secret) => {
    const trimmedSecret = secret.trim();
    if (!trimmedSecret) return;
    rememberProviderSecret(providerId, trimmedSecret);

    set({ busy: true });
    const keyRef = await safeInvoke<string>(
      "save_provider_secret",
      { providerId, secret: trimmedSecret },
      () => "keychain://RamTeamAi/" + providerId,
    );
    set((state) => {
      const providers = state.providers.map((item) => (item.id === providerId
        ? updateProviderMonitoring({ ...item, keyRef, maskedKey: maskSecret(trimmedSecret), status: "connected" as const })
        : item));
      persistProviders(providers);
      return { busy: false, providers };
    });
  },
  hydrateProviderSecrets: async () => {
    const providers = get().providers;
    const hydrated = await Promise.all(providers.map(async (provider) => {
      if (provider.auth === "none" || provider.status === "connected") return withProviderMonitoring(provider, provider);
      const exists = await safeInvoke<boolean>("has_provider_secret", { providerId: provider.id }, () => false);
      return exists
        ? updateProviderMonitoring({
          ...provider,
          keyRef: provider.keyRef ?? "keychain://RamTeamAi/" + provider.id,
          maskedKey: provider.maskedKey ?? "????",
          status: "connected" as const,
        })
        : withProviderMonitoring(provider, provider);
    }));
    persistProviders(hydrated);
    set({ providers: hydrated });
  },
  refreshProviderMonitoring: (providerId) => set((state) => {
    const providers = state.providers.map((provider) => {
      if (providerId && provider.id !== providerId) return provider;
      const jitter = provider.latencyMs
        ? Math.max(1, Math.round(provider.latencyMs * (0.92 + ((Date.now() + provider.id.length) % 17) / 100)))
        : provider.latencyMs;
      return updateProviderMonitoring(provider, { latencyMs: jitter });
    });
    persistProviders(providers);
    return { providers };
  }),
  testProvider: async (providerId) => {
    const provider = get().providers.find((item) => item.id === providerId);
    if (!provider) return;
    set({ busy: true });
    const result = await testProviderConnection(provider);
    set((state) => {
      const nextStatus: ProviderConfig["status"] = result.ok ? "connected" : "warning";
      const providers = state.providers.map((item) => item.id === providerId
        ? updateProviderMonitoring({ ...item, status: nextStatus }, { tokens: 0, latencyMs: result.latencyMs, failed: !result.ok })
        : item);
      persistProviders(providers);
      return { busy: false, providers };
    });
    return result;
  },
  setAppSettings: (patch) => set((state) => {
    const appSettings = normalizeAppSettings({ ...state.appSettings, ...patch });
    persistAppSettings(appSettings);
    return { appSettings };
  }),
  updateAgent: (agent) => set((state) => {
    const agents = state.agents.map((item) => (item.id === agent.id ? agent : item));
    persistAgents(agents);
    return { agents };
  }),
  upsertAgent: (agent) => set((state) => {
    const agents = state.agents.some((item) => item.id === agent.id)
      ? state.agents.map((item) => (item.id === agent.id ? agent : item))
      : [...state.agents, agent];
    persistAgents(agents);
    return { agents };
  }),
  upsertMcpServer: (server) => set((state) => {
    const normalized: McpServerConfig = {
      ...server,
      id: server.id.trim() || "mcp-" + Date.now(),
      name: server.name.trim() || "MCP server",
      commandOrUrl: server.commandOrUrl.trim(),
      tools: server.tools ?? [],
      status: server.status ?? (server.commandOrUrl.trim() ? "not-configured" : "warning"),
    };
    const mcpServers = state.mcpServers.some((item) => item.id === normalized.id)
      ? state.mcpServers.map((item) => (item.id === normalized.id ? normalized : item))
      : [...state.mcpServers, normalized];
    persistMcpServers(mcpServers);
    return { mcpServers };
  }),
  removeMcpServer: (serverId) => set((state) => {
    const mcpServers = state.mcpServers.filter((server) => server.id !== serverId);
    persistMcpServers(mcpServers);
    return { mcpServers };
  }),
  testMcpServer: async (serverId) => {
    const server = get().mcpServers.find((item) => item.id === serverId);
    if (!server) return undefined;
    set({ busy: true });
    let result: McpServerTestResult;
    try {
      result = await testMcpConnection(server);
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: 0,
        tools: [],
      };
    }
    set((state) => {
      const mcpServers = state.mcpServers.map((item) => item.id === serverId
        ? {
          ...item,
          enabled: result.ok ? true : item.enabled,
          status: result.ok ? "connected" as const : "warning" as const,
          latencyMs: result.latencyMs,
          lastError: result.ok ? undefined : result.message,
          tools: result.ok ? result.tools.map((tool) => tool.name) : item.tools,
        }
        : item);
      persistMcpServers(mcpServers);
      return { busy: false, mcpServers };
    });
    return result;
  },
  callMcpTool: async (serverId, toolName, args) => {
    const server = get().mcpServers.find((item) => item.id === serverId);
    if (!server) return undefined;
    set({ busy: true });
    try {
      const result = await callMcpToolRequest(server, toolName, args);
      set({ busy: false });
      return result;
    } catch (error) {
      set({ busy: false });
      throw error;
    }
  },
  setTopology: (patch) => set((state) => ({ topology: { ...state.topology, ...patch } })),
  createProject: () => set((state) => {
    const { project, session, projects, sessions } = createProjectWithSession(state.projects, state.sessions);
    persistProjects(projects);
    persistSessions(sessions);
    persistActiveIds(project.id, session.id);
    return {
      projects,
      sessions,
      activeProjectId: project.id,
      activeSessionId: session.id,
      session,
      screen: "chat",
    };
  }),
  startTeam: async () => {
    if (get().busy) return;
    const { project, session, projects, sessions } = createProjectWithSession(get().projects, get().sessions);
    const guardedSession = withSystemMessage(
      session,
      "Сначала опишите задачу в поле ввода. Команда не начнёт разбор без контекста, чтобы модели понимали, над чем работать.",
    );
    const guardedSessions = replaceSession(sessions, guardedSession);
    persistProjects(projects);
    persistSessions(guardedSessions);
    persistActiveIds(project.id, guardedSession.id);
    set({
      projects,
      sessions: guardedSessions,
      activeProjectId: project.id,
      activeSessionId: guardedSession.id,
      session: guardedSession,
      screen: "chat",
    });
  },
  createSession: (projectId) => set((state) => {
    const targetProjectId = projectId ?? state.activeProjectId;
    const targetProject = state.projects.find((project) => project.id === targetProjectId && !project.archivedAt);
    if (!targetProject) return {};
    const projectSessions = state.sessions.filter((session) => session.projectId === targetProjectId);
    const session = createSessionConfig(targetProjectId, projectSessions.length);
    const sessions = [session, ...state.sessions];
    persistSessions(sessions);
    persistActiveIds(targetProjectId, session.id);
    return {
      sessions,
      activeProjectId: targetProjectId,
      activeSessionId: session.id,
      session,
      screen: "chat",
    };
  }),
  selectProject: (projectId) => set((state) => {
    const project = state.projects.find((item) => item.id === projectId && !item.archivedAt);
    if (!project) return {};
    const existingSession = findActiveSession(state.sessions, projectId);
    const session = existingSession ?? createPlaceholderSession(projectId);
    const sessions = state.sessions;
    persistSessions(sessions);
    persistActiveIds(projectId, existingSession?.id ?? "");
    return {
      sessions,
      activeProjectId: projectId,
      activeSessionId: existingSession?.id ?? "",
      session,
    };
  }),
  selectSession: (sessionId) => set((state) => {
    const session = state.sessions.find((item) => item.id === sessionId && !item.archivedAt);
    if (!session) return {};
    const project = state.projects.find((item) => item.id === session.projectId && !item.archivedAt);
    if (!project) return {};
    persistActiveIds(session.projectId, session.id);
    return {
      activeProjectId: session.projectId,
      activeSessionId: session.id,
      session,
    };
  }),
  archiveProject: (projectId) => set((state) => {
    const targetProject = state.projects.find((project) => project.id === projectId && !project.archivedAt);
    if (!targetProject) return {};
    const archivedAt = new Date().toISOString();
    const projects = state.projects.map((project) => project.id === projectId ? { ...project, archivedAt, updatedAt: archivedAt } : project);
    const sessions = state.sessions.map((session) => session.projectId === projectId && !session.archivedAt ? { ...session, archivedAt } : session);

    if (projectId !== state.activeProjectId) {
      persistProjects(projects);
      persistSessions(sessions);
      return { projects, sessions };
    }

    const selection = ensureActiveSelection(projects, sessions);
    persistProjects(selection.projects);
    persistSessions(selection.sessions);
    persistActiveIds(selection.activeProjectId, selection.activeSessionId);
    return selection;
  }),
  archiveSession: (sessionId) => set((state) => {
    const targetSession = state.sessions.find((session) => session.id === sessionId && !session.archivedAt);
    if (!targetSession) return {};
    const archivedAt = new Date().toISOString();
    const sessions = state.sessions.map((session) => session.id === sessionId ? { ...session, archivedAt } : session);

    if (sessionId !== state.activeSessionId) {
      persistSessions(sessions);
      return { sessions };
    }

    const selection = ensureActiveSelection(state.projects, sessions, targetSession.projectId);
    persistProjects(selection.projects);
    persistSessions(selection.sessions);
    persistActiveIds(selection.activeProjectId, selection.activeSessionId);
    return selection;
  }),
  restoreProject: (projectId) => set((state) => {
    const targetProject = state.projects.find((project) => project.id === projectId && project.archivedAt);
    if (!targetProject) return {};
    const updatedAt = new Date().toISOString();
    const projects = state.projects.map((project) => project.id === projectId ? { ...project, archivedAt: undefined, updatedAt } : project);
    const sessions = state.sessions.map((session) => session.projectId === projectId ? { ...session, archivedAt: undefined } : session);
    const selection = ensureActiveSelection(projects, sessions, projectId);
    persistProjects(selection.projects);
    persistSessions(selection.sessions);
    persistActiveIds(selection.activeProjectId, selection.activeSessionId);
    return selection;
  }),
  restoreSession: (sessionId) => set((state) => {
    const targetSession = state.sessions.find((session) => session.id === sessionId && session.archivedAt);
    if (!targetSession) return {};
    const updatedAt = new Date().toISOString();
    const projects = state.projects.map((project) => project.id === targetSession.projectId ? { ...project, archivedAt: undefined, updatedAt } : project);
    const sessions = state.sessions.map((session) => session.id === sessionId ? { ...session, archivedAt: undefined } : session);
    const restoredSession = sessions.find((session) => session.id === sessionId) ?? targetSession;
    persistProjects(projects);
    persistSessions(sessions);
    persistActiveIds(restoredSession.projectId, restoredSession.id);
    return {
      projects,
      sessions,
      activeProjectId: restoredSession.projectId,
      activeSessionId: restoredSession.id,
      session: restoredSession,
    };
  }),
  clearArchiveMemory: () => set((state) => {
    const archivedProjectIds = new Set(state.projects.filter((project) => project.archivedAt).map((project) => project.id));
    const sessions = state.sessions.map((session) => {
      if (!session.archivedAt && !archivedProjectIds.has(session.projectId)) return session;
      return { ...session, messages: [], tokensUsed: 0 };
    });
    const activeSession = sessions.find((session) => session.id === state.activeSessionId) ?? state.session;
    persistSessions(sessions);
    return { sessions, session: activeSession };
  }),
  deleteArchive: () => set((state) => {
    const archivedProjectIds = new Set(state.projects.filter((project) => project.archivedAt).map((project) => project.id));
    const projects = state.projects.filter((project) => !project.archivedAt);
    const sessions = state.sessions.filter((session) => !session.archivedAt && !archivedProjectIds.has(session.projectId));
    const selection = ensureActiveSelection(projects, sessions);
    persistProjects(selection.projects);
    persistSessions(selection.sessions);
    persistActiveIds(selection.activeProjectId, selection.activeSessionId);
    return selection;
  }),
  setSessionMode: (mode) => set((state) => {
    if (!state.activeSessionId) return {};
    const session = { ...state.session, mode };
    const sessions = replaceSession(state.sessions, session);
    persistSessions(sessions);
    return { session, sessions };
  }),
  runTeam: async (prompt = "", mode = "planning") => {
    let { agents, providers, topology, session, sessions, projects, activeProjectId, mcpServers, appSettings } = get();
    if (!activeProjectId || !get().activeSessionId) return;
    const trimmedPrompt = prompt.trim();
    let implementationRootPath: string | undefined;
    const hasUserContext = session.messages.some((message) => message.author === "user" && message.text.trim());
    if (!trimmedPrompt && !hasUserContext) {
      const warning = "Сначала отправьте задачу или контекст проекта. Без этого агенты не запускаются: моделям нечего разбирать.";
      if (!session.messages.some((message) => message.author === "system" && message.text.includes("Сначала отправьте задачу"))) {
        const guardedSession = withSystemMessage(session, warning);
        const guardedSessions = replaceSession(sessions, guardedSession);
        persistSessions(guardedSessions);
        set({ screen: "chat", session: guardedSession, sessions: guardedSessions });
      } else {
        set({ screen: "chat" });
      }
      return;
    }

    if (mode === "implementation") {
      let workspacePath = get().workspacePath;
      if (!workspacePath) {
        workspacePath = await pickWorkspaceFolder();
        if (!workspacePath) return;
        persistWorkspacePath(workspacePath);
        set({ workspacePath });
      }

      const artifact = get().artifact;
      const assignments = planImplementationAssignments(artifact, get().agents);
      const result = await buildProject(artifact, true, workspacePath);
      implementationRootPath = result.rootPath;
      const implementationPlan = renderImplementationPlan(artifact, assignments);
      await writeWorkspaceTextFile(result.rootPath, "IMPLEMENTATION.md", implementationPlan, { overwrite: true });
      await writeWorkspaceTextFile(result.rootPath, "docs/agent-tasks.md", implementationPlan, { overwrite: true });
      set({ lastBuild: result, workspacePath: result.rootPath });

      agents = get().agents;
      providers = get().providers;
      topology = get().topology;
      session = get().session;
      sessions = get().sessions;
      projects = get().projects;
      activeProjectId = get().activeProjectId;
      mcpServers = get().mcpServers;
      appSettings = get().appSettings;
    }

    const now = new Date().toISOString();
    const derivedTitle = trimmedPrompt ? titleFromPrompt(trimmedPrompt) : session.title;
    const userMessage: ChatMessage | undefined = trimmedPrompt
      ? {
        id: "user-" + Date.now(),
        author: "user",
        text: trimmedPrompt,
        createdAt: new Date().toISOString(),
        tokens: Math.max(24, Math.ceil(trimmedPrompt.length / 4)),
      }
      : undefined;
    const baseMessages = userMessage ? [...session.messages, userMessage] : session.messages;

    const nextMode = trimmedPrompt ? session.mode : "planning";
    const baseSession: SessionConfig = {
      ...session,
      title: trimmedPrompt && isDefaultSessionTitle(session.title) ? derivedTitle : session.title,
      mode: nextMode,
      messages: baseMessages,
      tokensUsed: baseMessages.reduce((sum, message) => sum + message.tokens, 0),
    };
    const nextSessions = replaceSession(sessions, baseSession);
    const nextProjects = projects.map((project) => project.id === activeProjectId
      ? {
        ...project,
        title: trimmedPrompt && isDefaultProjectTitle(project.title) ? derivedTitle : project.title,
        status: trimmedPrompt ? "active" as const : project.status,
        updatedAt: now,
      }
      : project);

    const activeAgents = topology.kind === "pipeline" ? agents : agents.slice(0, Math.min(agents.length, 3));
    persistProjects(nextProjects);
    persistSessions(nextSessions);

    set({
      busy: true,
      activeRunMode: mode,
      screen: "chat",
      projects: nextProjects,
      sessions: nextSessions,
      agents: agents.map((agent) => ({
        ...agent,
        status: activeAgents.some((item) => item.id === agent.id) ? "typing" : "waiting",
      })),
      session: baseSession,
    });

    const messages: ChatMessage[] = [];
    for (const agent of activeAgents) {
      set((state) => ({
        agents: state.agents.map((item) => item.id === agent.id
          ? { ...item, status: item.tools.includes("mcp") ? "mcp" : "typing" }
          : item),
      }));

      const context = [...baseMessages, ...messages];
      let text: string;
      let tokens = 0;
      let latencyMs: number | undefined;
      let attempts: CompletionAttempt[] = [];
      try {
        const agentWithMcpContext = agent.tools.includes("mcp")
          ? { ...agent, systemPrompt: agent.systemPrompt + "\n\n" + formatMcpToolsForPrompt(mcpServers) }
          : agent;
        const completion = await completeWithModelFallback(providers, agentWithMcpContext, context, mode, appSettings.modelFallbackEnabled);
        attempts = completion.attempts;
        const notice = fallbackNotice(attempts);
        text = notice ? notice + "\n\n" + completion.result.text : completion.result.text;
        tokens = Math.max(completion.result.tokens, Math.ceil(text.length / 4));
        latencyMs = completion.result.latencyMs;
        if (mode === "implementation" && implementationRootPath) {
          const fileBlocks = extractWorkspaceFileBlocks(text);
          const writtenFiles: string[] = [];
          for (const file of fileBlocks.slice(0, 8)) {
            try {
              const writeResult = await writeWorkspaceTextFile(implementationRootPath, file.path, file.content, { overwrite: true });
              writtenFiles.push(writeResult.path);
            } catch {
              // Keep the agent response visible even if one proposed file path cannot be written safely.
            }
          }
          if (writtenFiles.length) {
            text += "\n\n✅ Записано в рабочую папку: " + writtenFiles.join(", ");
            tokens = Math.max(tokens, Math.ceil(text.length / 4));
          }
        }
      } catch (error) {
        if (error instanceof ModelFallbackError) {
          attempts = error.attempts;
        } else if (error instanceof Error && !attempts.length) {
          attempts = completionCandidates(agent, providers, appSettings.modelFallbackEnabled).slice(0, 1).map((candidate) => ({
            providerId: candidate.provider.id,
            providerName: candidate.provider.name,
            modelId: candidate.modelId,
            modelLabel: modelLabel(candidate.provider, candidate.modelId),
            ok: false,
            error: summarizeAttemptError(error),
          }));
        }
        text = "\u041e\u0448\u0438\u0431\u043a\u0430 API: " + (error instanceof Error ? error.message : String(error));
        tokens = Math.max(24, Math.ceil(text.length / 4));
      }

      if (attempts.length) {
        set((state) => {
          const providers = state.providers.map((provider) => {
            const providerAttempts = attempts.filter((attempt) => attempt.providerId === provider.id);
            if (!providerAttempts.length) return provider;
            return providerAttempts.reduce((current, attempt) => updateProviderMonitoring(current, {
              tokens: attempt.ok ? attempt.tokens ?? 0 : 0,
              latencyMs: attempt.latencyMs,
              failed: !attempt.ok,
            }), provider);
          });
          persistProviders(providers);
          return { providers };
        });
      }

      messages.push({
        id: "agent-" + Date.now() + "-" + agent.id,
        author: agent.id,
        agentRole: agent.role,
        text,
        createdAt: new Date().toISOString(),
        tokens,
        tool: agent.tools.includes("mcp") ? "mcp" : undefined,
      });
    }

    set((state) => {
      const nextMessages = [...baseMessages, ...messages];
      const session: SessionConfig = {
        ...state.session,
        mode: nextMode,
        messages: nextMessages,
        tokensUsed: nextMessages.reduce((sum, message) => sum + message.tokens, 0),
      };
      const sessions = replaceSession(state.sessions, session);
      persistSessions(sessions);
      return {
        busy: false,
        activeRunMode: undefined,
        agents: state.agents.map((agent) => ({ ...agent, status: "done" })),
        session,
        sessions,
        artifact: mode === "planning" ? synthesizePlan(nextMessages, state.artifact) : state.artifact,
      };
    });
  },
  updateArtifact: (patch) => set((state) => ({ artifact: { ...state.artifact, ...patch, edited: true } })),
  selectWorkspaceFolder: async () => {
    const selected = await pickWorkspaceFolder(get().workspacePath);
    if (!selected) return undefined;
    persistWorkspacePath(selected);
    set({ workspacePath: selected });
    return selected;
  },
  clearWorkspaceFolder: () => {
    void clearStoredWebWorkspaceFolder();
    persistWorkspacePath(undefined);
    set({ workspacePath: undefined, lastWorkspaceInit: undefined });
  },
  initWorkspace: async (announce = false) => {
    let rootPath = get().workspacePath;
    if (!rootPath) {
      rootPath = await pickWorkspaceFolder();
      if (!rootPath) return undefined;
      persistWorkspacePath(rootPath);
      set({ workspacePath: rootPath });
    }

    set({ busy: true });
    try {
      const result = await initWorkspaceFiles(rootPath);
      set((state) => {
        const session = announce ? withSystemMessage(state.session, result.message + "\n" + result.rootPath) : state.session;
        const sessions = replaceSession(state.sessions, session);
        if (announce) persistSessions(sessions);
        return {
          busy: false,
          workspacePath: result.rootPath,
          lastWorkspaceInit: result,
          session,
          sessions,
        };
      });
      persistWorkspacePath(result.rootPath);
      return result;
    } catch (error) {
      set({ busy: false });
      throw error;
    }
  },
  requestBuild: async (confirmed) => {
    const { artifact, workspacePath } = get();
    set({ busy: true });
    const result = await buildProject(artifact, confirmed, workspacePath);
    set((state) => {
      const projects = confirmed
        ? state.projects.map((project) => project.id === state.activeProjectId
          ? { ...project, status: "scaffolded" as const, updatedAt: new Date().toISOString() }
          : project)
        : state.projects;
      if (confirmed) persistProjects(projects);
      return {
        busy: false,
        lastBuild: result,
        projects,
        artifact: confirmed ? { ...state.artifact, status: "scaffolded" } : state.artifact,
      };
    });
  },
  implementProject: async () => {
    const { artifact, activeSessionId, agents } = get();
    let { workspacePath } = get();
    if (!workspacePath) {
      workspacePath = await pickWorkspaceFolder();
      if (workspacePath) {
        persistWorkspacePath(workspacePath);
        set({ workspacePath });
      }
    }

    set({ busy: true });
    const result = await buildProject(artifact, true, workspacePath);
    const folderNote = result.rootPath ? "\nПапка: " + result.rootPath : "";
    const assignments = planImplementationAssignments(artifact, agents);
    const assignmentText = assignments.length
      ? "\n\nСледующий этап — задачи для агентов:\n" + assignments
        .map((item) => `- ${item.owner} (${item.role}): ${item.summary} → ${item.deliverables.join(", ")}`)
        .join("\n")
      : "";
    set((state) => {
      const projects = state.projects.map((project) => project.id === state.activeProjectId
        ? { ...project, status: "scaffolded" as const, updatedAt: new Date().toISOString() }
        : project);
      persistProjects(projects);

      const intro = "🧱 Каркас проекта подготовлен. Шагов в плане: " + state.artifact.steps.length + "." + folderNote + assignmentText;
      const session = activeSessionId ? withSystemMessage(state.session, intro) : state.session;
      const sessions = activeSessionId ? replaceSession(state.sessions, session) : state.sessions;
      if (activeSessionId) persistSessions(sessions);

      return {
        busy: false,
        lastBuild: result,
        projects,
        session,
        sessions,
        artifact: { ...state.artifact, status: "scaffolded" as const },
      };
    });
  },
  startAgentImplementation: async () => {
    if (get().busy || !get().activeSessionId) return;

    let { workspacePath } = get();
    if (!workspacePath) {
      workspacePath = await pickWorkspaceFolder();
      if (!workspacePath) return;
      persistWorkspacePath(workspacePath);
      set({ workspacePath });
    }

    const { artifact, agents } = get();
    const assignments = planImplementationAssignments(artifact, agents);
    const implementationPlan = renderImplementationPlan(artifact, assignments);

    set({ busy: true, activeRunMode: "implementation" });
    try {
      const result = await buildProject(artifact, true, workspacePath);
      await writeWorkspaceTextFile(result.rootPath, "IMPLEMENTATION.md", implementationPlan, { overwrite: true });
      await writeWorkspaceTextFile(result.rootPath, "docs/agent-tasks.md", implementationPlan, { overwrite: true });

      const savedNote = [
        "🚀 Запущен этап реализации агентами. Каркас и Markdown-планы записаны в рабочую папку.",
        "Рабочая папка: " + result.rootPath,
        "Файлы плана: PLAN.md, IMPLEMENTATION.md, docs/agent-tasks.md",
      ].join("\n");

      set((state) => {
        const session = withSystemMessage(state.session, savedNote);
        const sessions = replaceSession(state.sessions, session);
        const now = new Date().toISOString();
        const projects = state.projects.map((project) => project.id === state.activeProjectId
          ? { ...project, status: "active" as const, updatedAt: now }
          : project);
        persistSessions(sessions);
        persistProjects(projects);
        return {
          busy: false,
          activeRunMode: undefined,
          screen: "chat",
          lastBuild: result,
          projects,
          session,
          sessions,
          artifact: { ...state.artifact, status: "scaffolded" as const },
        };
      });

      await get().runTeam(IMPLEMENTATION_ROUND_PROMPT, "implementation");
    } catch (error) {
      set((state) => {
        const text = "Ошибка запуска реализации: " + (error instanceof Error ? error.message : String(error));
        const session = withSystemMessage(state.session, text);
        const sessions = replaceSession(state.sessions, session);
        persistSessions(sessions);
        return { busy: false, activeRunMode: undefined, session, sessions };
      });
    }
  },
}));
