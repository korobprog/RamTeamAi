import { create } from "zustand";
import { openUrl as openExternal } from "@tauri-apps/plugin-opener";
import { agentsSeed, mcpServersSeed, planArtifactSeed, projectsSeed, providersSeed, sessionSeed, topologySeed } from "../data/seed";
import { safeInvoke } from "../lib/tauri";
import { callMcpTool as callMcpToolRequest, formatMcpToolsForPrompt, testMcpConnection } from "../mcp/manager";
import { applyTheme } from "../lib/theme";
import { synthesizePlan } from "../orchestrator";
import { artifactStatusAfterImplementationRound, buildAutoImplementationSummary, decideAutoRound, nextStalledRounds, projectStatusAfterImplementationRound, type AutoStopReason } from "../orchestrator/autoLoop";
import { extractWorkspaceFileBlocks } from "../orchestrator/fileBlocks";
import {
  DEFAULT_AGENT_LEASE_TIMEOUT_SEC,
  DEFAULT_PROVIDER_HEALTH_INTERVAL_SEC,
  applyProviderHealth,
  checkpointIsStale,
  createAgentCheckpoint,
  failCheckpoint,
  heartbeatCheckpoint,
  partialCheckpoint,
  providerCanReceiveTraffic,
  recoverCheckpoint,
  selectRecoveryAgent,
} from "../orchestrator/healthSupervisor";
import { selectRunAgents } from "../orchestrator/agentSelection";
import { buildChecklist, checklistComplete, checklistMatchesSteps, checklistProgress, heuristicChecklist, mergeChecklist, parseChecklistVerdict, pendingImplementationSteps, renderVerificationPrompt, type ChecklistItem } from "../orchestrator/checklist";
import { completeWithProvider, maskSecret, rememberProviderSecret, testProviderConnection } from "../providers";
import type { CompletionResult, ProviderTestResult } from "../providers";
import { applyProviderQuotaUsage } from "../providers/limits";
import { buildProject, planImplementationAssignments, renderImplementationPlan, SCAFFOLD_APP_STUB_MARKER, validateProjectCompleteness } from "../projectBuilder";
import { beginGithubDeviceFlow, disconnectGithub, isGithubConfigured, loadGithubProfile, pollGithubDeviceFlow } from "../integrations/github";
import { describeFirebaseAuthError, isFirebaseConfigured, loadCloudSettings, loadFirebaseUid, saveCloudSettings, signInFirebaseWithGithubToken, signOutFirebase } from "../integrations/firebase";
import type { AgentConfig, AgentDialogMessage, AgentRunCheckpoint, AgentRunMode, AppSettings, BuildResult, ChatMessage, CloudSettingsSnapshot, GithubTokenPollResult, ImplementationAssignment, LiveFileActivity, McpServerConfig, McpServerTestResult, McpToolCallResult, MessageAction, PlanArtifact, ProjectConfig, ProjectGitLink, ProviderConfig, ProviderMonitoringConfig, ProjectReadinessStatus, QueuedAgentQuestion, SavedImplementationChecklistItem, ScreenId, SessionConfig, TopologyConfig, UserAccountState, WorkspaceInitResult } from "../types";
import { clearStoredWebWorkspaceFolder, initWorkspaceFiles, listWorkspaceFiles, pickWorkspaceFolder, readWorkspaceTextFile, writeWorkspaceTextFile } from "../workspace";

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
const PROJECT_WORK_TIMERS_STORAGE_KEY = "RamTeamAi.project-work-timers.v1";

const LEGACY_MCP_DEFAULT_ENDPOINTS: Record<string, Array<Pick<McpServerConfig, "transport" | "commandOrUrl">>> = {
  "web-search": [{ transport: "http", commandOrUrl: "http://localhost:3000/mcp" }],
  filesystem: [{ transport: "stdio", commandOrUrl: "npx -y @modelcontextprotocol/server-filesystem ." }],
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  modelFallbackEnabled: true,
  healthSupervisorEnabled: true,
  providerHealthIntervalSec: DEFAULT_PROVIDER_HEALTH_INTERVAL_SEC,
  agentLeaseTimeoutSec: DEFAULT_AGENT_LEASE_TIMEOUT_SEC,
  autoMode: false,
  autoMaxRounds: 12,
  operatorAssistantEnabled: true,
  operatorDefaultAgentId: "architect",
  operatorAssistantProviderId: "RamTeamAi",
  operatorAssistantModelId: "deepseek-v4-flash",
  theme: "system",
};

const IMPLEMENTATION_ROUND_PROMPT = [
  "Режим реализации по утверждённому PLAN.md в рабочей папке.",
  "Не возвращайтесь к обсуждению и планированию. Возьмите конкретные файлы из плана и напишите их ПОЛНЫЙ код прямо сейчас.",
  "Агенты сами ведут рабочий чеклист: откройте/обновите docs/agent-tasks.md, добавьте свои пункты, пометьте взятую задачу как «В работе: @имя», а закрытые пункты как [x]. Главный агент может добавлять/переназначать задания в этом же файле.",
  "Каждый файл оформляйте отдельной строкой `Файл: путь/к/файлу`, а сразу под ней fenced code block с полным содержимым файла — только так приложение запишет код на диск.",
  "Если файл уже существует (его содержимое приведено в снимке рабочей папки ниже) — это РЕДАКТИРОВАНИЕ: верните полный обновлённый текст файла целиком, сохранив неизменные части и дописав/исправив нужное. Не выдумывайте содержимое заново и не присылайте обрезанный файл или один diff.",
  "Если в проекте ещё нет автотестов, создайте тесты под выбранный стек и обновите package/test-команды и зависимости; тестовые файлы тоже возвращайте блоками `Файл:` + код.",
  "Тестовый этап не ручной: QA-агент создаёт в docs/agent-tasks.md раздел «Тестовый 3-step сценарий», пишет/обновляет автотесты и возвращает ошибки разработчикам как чеклист правок.",
  "Не описывайте файлы словами и не откладывайте «на следующую итерацию». Ответ без блоков `Файл:` + код не принимается.",
].join("\n");

// Split the plan steps across the round's agents so each one owns a distinct
// slice instead of all agents rewriting the same files and overwriting each
// other within a single round.
function partitionStepsAcrossAgents(steps: string[], agents: AgentConfig[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>(agents.map((agent) => [agent.id, []]));
  if (!agents.length) return buckets;
  const tester = agents.find((agent) => agent.role === "tester");
  const coder = agents.find((agent) => agent.role === "coder") ?? agents[0];
  steps.forEach((step, index) => {
    const agent = tester && isQaImplementationStep(step)
      ? tester
      : coder ?? agents[index % agents.length];
    buckets.get(agent.id)?.push(step);
  });
  return buckets;
}

function isQaImplementationStep(step: string): boolean {
  return /auto[-\s]?tests?|tests?|testing|vitest|jest|playwright|pytest|unit|integration|e2e|spec|browser|devtools|qa|тест|провер/i.test(step);
}

// Per-agent directive that pins each agent to its own area and tells it not to
// rewrite files another agent already produced earlier in the same round.
function buildAgentRoundDirective(
  agent: AgentConfig,
  ownedSteps: string[],
  assignment: ImplementationAssignment | undefined,
  alreadyWritten: string[],
): string {
  const lines = [
    `Координация раунда реализации. Твоя роль: ${agent.role}, но сейчас результатом считаются только реальные изменения файлов.`,
  ];
  if (ownedSteps.length) {
    lines.push("Твои незакрытые шаги в этом раунде (не бери чужие): " + ownedSteps.map((step) => `«${step}»`).join("; ") + ".");
  } else if (agent.role === "tester") {
    lines.push("Tester fallback: even when the plan has no explicit QA step, create or update an app-specific test checklist in `docs/agent-tasks.md`, add missing automated tests/test commands, and return the file as a `File:` block with full content.");
  } else if (assignment?.deliverables.length) {
    lines.push("Если явных незакрытых шагов для тебя нет, не пиши обзор: выбери ближайший недоделанный исходный файл из снимка и верни полный блок `Файл: путь` + код.");
  } else {
    lines.push("Нет отдельной зоны — помоги дописать ближайший недоделанный исходный файл и верни полный блок `Файл: путь` + код.");
  }
  lines.push("Обязательно верни обновлённый `docs/agent-tasks.md` как файл-блок: создай/актуализируй свой чеклист, отметь взятую задачу и зафиксируй, что уже закрыто.");
  if (agent.role === "tester" || ownedSteps.some(isQaImplementationStep)) {
    lines.push("Твоя зона QA: создай раздел `Тестовый 3-step сценарий` в `docs/agent-tasks.md`, добавь/обнови автотесты под стек и верни ошибки как чеклист правок, а не как ручную просьбу к пользователю.");
    lines.push("QA checklist is adaptive, not fixed: match it to the app type (landing, CRUD, e-commerce, auth, desktop/Tauri, API), and add domain smoke/e2e/unit checks plus test data when needed.");
  }
  lines.push("Сохраняй пользовательский текст в UTF-8: если видишь mojibake вроде `Рџ`, `РЎ`, `вЂ`, `В«`, исправь файл, такие тексты не считаются готовыми.");
  if (assignment?.summary) lines.push("Контекст роли: " + assignment.summary);
  if (alreadyWritten.length) {
    lines.push(
      "В этом раунде другие агенты уже записали файлы: " + alreadyWritten.join(", ") + ".",
      "Не переписывай их заново — возьми другие файлы из своей зоны. Трогай уже записанный файл только если в нём конкретная ошибка, и тогда верни его полный исправленный текст.",
    );
  }
  return lines.join("\n");
}

// Safety ceiling for autonomous implementation rounds. User settings can lower
// the limit, but cannot exceed this cap and burn tokens forever if a model is
// permanently stuck.
const AUTO_IMPLEMENTATION_HARD_CAP = 12;

// Budget for the workspace snapshot injected into implementation context. Keeps
// edits grounded in real file content without blowing up the model context.
const WORKSPACE_SNAPSHOT_CHAR_BUDGET = 24_000;
const WORKSPACE_SNAPSHOT_FILE_CHAR_LIMIT = 6_000;
// Scaffold/meta files duplicate the plan already in context, so we skip them in
// the snapshot to spend the budget on real source files.
const WORKSPACE_SNAPSHOT_SKIP = new Set(["IMPLEMENTATION.md", "docs/agent-tasks.md", "docs/plan.md"]);

// Read existing workspace files so implementation agents edit real content
// instead of regenerating files blindly. Returns undefined when nothing is on
// disk yet (first build) so we don't inject an empty section.
// Product-defining files that the scaffold creates as placeholders. While any of
// them still holds the scaffold stub the project is not actually built, even if
// every required file technically exists on disk.
const SCAFFOLD_STUB_CANDIDATES = ["src/App.tsx"];

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").trim();
}

// Detect required files that exist but were never implemented past the generated
// scaffold stub, so completeness does not report an empty skeleton as "built".
async function detectScaffoldStubFiles(rootPath: string, files: string[]): Promise<string[]> {
  const present = new Set(files.map(normalizeWorkspacePath));
  const stubs: string[] = [];
  for (const path of SCAFFOLD_STUB_CANDIDATES) {
    if (!present.has(path)) continue;
    try {
      const file = await readWorkspaceTextFile(rootPath, path);
      if (file.exists && file.content.includes(SCAFFOLD_APP_STUB_MARKER)) stubs.push(path);
    } catch {
      // Unreadable file: leave it out rather than blocking completion on an I/O error.
    }
  }
  return stubs;
}

async function buildWorkspaceSnapshot(rootPath: string): Promise<string | undefined> {
  let paths: string[];
  try {
    paths = await listWorkspaceFiles(rootPath);
  } catch {
    return undefined;
  }

  const candidates = paths.filter((path) => !WORKSPACE_SNAPSHOT_SKIP.has(path));
  if (!candidates.length) return undefined;

  const sections: string[] = [];
  let used = 0;
  let truncated = false;

  for (const path of candidates) {
    if (used >= WORKSPACE_SNAPSHOT_CHAR_BUDGET) {
      truncated = true;
      break;
    }
    let file;
    try {
      file = await readWorkspaceTextFile(rootPath, path);
    } catch {
      continue;
    }
    if (!file.exists) continue;

    const clipped = file.content.length > WORKSPACE_SNAPSHOT_FILE_CHAR_LIMIT
      ? file.content.slice(0, WORKSPACE_SNAPSHOT_FILE_CHAR_LIMIT) + "\n… (файл обрезан в снимке, верните его полностью)"
      : file.content;
    const section = `Файл: ${path}\n\`\`\`\n${clipped}\n\`\`\``;
    used += section.length;
    sections.push(section);
  }

  if (!sections.length) return undefined;

  return [
    "## Снимок текущей рабочей папки",
    "Ниже — файлы, которые уже есть на диске. Чтобы изменить любой из них, верните блок `Файл: путь` + ПОЛНЫЙ обновлённый код этого файла.",
    truncated ? "(Показаны не все файлы — снимок ограничен по объёму.)" : "",
    "",
    sections.join("\n\n"),
  ].filter(Boolean).join("\n");
}

async function buildChecklistEvidenceContents(rootPath: string, files: string[]): Promise<Record<string, string>> {
  const interesting = files
    .map(normalizeWorkspacePath)
    .filter((path) =>
      path === "package.json" ||
      path === "components.json" ||
      path === "tsconfig.json" ||
      path === "index.html" ||
      path === "README.md" ||
      /^vite\.config\.[cm]?[jt]s$/.test(path) ||
      /^tailwind\.config\.[cm]?[jt]s$/.test(path) ||
      /^postcss\.config\.[cm]?[jt]s$/.test(path) ||
      /^src\/.+\.(tsx?|jsx?|css|html)$/.test(path) ||
      /^docs\/.+\.md$/.test(path) ||
      /^(?:tests|test|__tests__)\/.+\.(tsx?|jsx?|py|rs|go)$/.test(path),
    )
    .slice(0, 60);
  const contents: Record<string, string> = {};
  for (const path of interesting) {
    try {
      const file = await readWorkspaceTextFile(rootPath, path);
      if (file.exists) contents[path] = file.content.slice(0, 20_000);
    } catch {
      // Evidence is best-effort: missing reads should not abort the run.
    }
  }
  return contents;
}

function ensureProviderMonitoring(provider: ProviderConfig, saved?: ProviderMonitoringConfig): ProviderMonitoringConfig {
  const now = Date.now();
  return {
    enabled: saved?.enabled ?? provider.monitoring?.enabled ?? true,
    refreshIntervalMin: saved?.refreshIntervalMin ?? provider.monitoring?.refreshIntervalMin ?? (provider.kind === "ollama" ? 1 : 10),
    updatedAt: saved?.updatedAt ?? provider.monitoring?.updatedAt ?? new Date(now).toISOString(),
    requestCount: saved?.requestCount ?? provider.monitoring?.requestCount ?? 0,
    errorCount: saved?.errorCount ?? provider.monitoring?.errorCount ?? 0,
    tokensUsed: saved?.tokensUsed ?? provider.monitoring?.tokensUsed ?? 0,
    quotaShortWindowId: saved?.quotaShortWindowId ?? provider.monitoring?.quotaShortWindowId,
    quotaShortStartedAt: saved?.quotaShortStartedAt ?? provider.monitoring?.quotaShortStartedAt ?? new Date(now).toISOString(),
    quotaShortRequestCount: saved?.quotaShortRequestCount ?? provider.monitoring?.quotaShortRequestCount ?? 0,
    quotaShortTokensUsed: saved?.quotaShortTokensUsed ?? provider.monitoring?.quotaShortTokensUsed ?? 0,
    quotaLongWindowId: saved?.quotaLongWindowId ?? provider.monitoring?.quotaLongWindowId,
    quotaLongStartedAt: saved?.quotaLongStartedAt ?? provider.monitoring?.quotaLongStartedAt ?? new Date(now).toISOString(),
    quotaLongRequestCount: saved?.quotaLongRequestCount ?? provider.monitoring?.quotaLongRequestCount ?? 0,
    quotaLongTokensUsed: saved?.quotaLongTokensUsed ?? provider.monitoring?.quotaLongTokensUsed ?? 0,
    healthStatus: saved?.healthStatus ?? provider.monitoring?.healthStatus ?? (provider.status === "connected" ? "ok" : "unknown"),
    consecutiveFailures: saved?.consecutiveFailures ?? provider.monitoring?.consecutiveFailures ?? 0,
    circuitOpenUntil: saved?.circuitOpenUntil ?? provider.monitoring?.circuitOpenUntil,
    lastOkAt: saved?.lastOkAt ?? provider.monitoring?.lastOkAt,
    lastError: saved?.lastError ?? provider.monitoring?.lastError,
  };
}

function withProviderMonitoring(provider: ProviderConfig, saved?: ProviderConfig): ProviderConfig {
  const merged = saved ? { ...provider, monitoring: ensureProviderMonitoring(provider, saved.monitoring) } : provider;
  return { ...merged, monitoring: ensureProviderMonitoring(merged, saved?.monitoring) };
}

function updateProviderMonitoring(provider: ProviderConfig, patch: { tokens?: number; latencyMs?: number; failed?: boolean; error?: string } = {}): ProviderConfig {
  const monitoring = ensureProviderMonitoring(provider, provider.monitoring);
  const tokens = Math.max(0, patch.tokens ?? 0);
  const healthPatched = patch.failed !== undefined
    ? applyProviderHealth(provider, { ok: !patch.failed, latencyMs: patch.latencyMs, error: patch.error })
    : provider;
  const nextMonitoring = ensureProviderMonitoring(healthPatched, healthPatched.monitoring);
  const countedRequest = patch.tokens !== undefined || patch.failed !== undefined;
  const usageMonitoring = applyProviderQuotaUsage(healthPatched, {
    ...nextMonitoring,
    requestCount: monitoring.requestCount + (countedRequest ? 1 : 0),
    errorCount: monitoring.errorCount + (patch.failed ? 1 : 0),
    tokensUsed: monitoring.tokensUsed + tokens,
  }, { tokens, countRequest: countedRequest });

  return {
    ...healthPatched,
    latencyMs: patch.latencyMs ?? provider.latencyMs,
    status: patch.failed ? "warning" : healthPatched.status,
    monitoring: {
      ...usageMonitoring,
      updatedAt: new Date().toISOString(),
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
  const savedStatus = defaultProvider.id === "ollama"
    && savedProvider.status === "connected"
    && !savedProvider.monitoring?.lastOkAt
    && savedProvider.latencyMs == null
    ? defaultProvider.status
    : savedProvider.status;
  const merged = {
    ...defaultProvider,
    baseUrl: healProviderBaseUrl(savedProvider.baseUrl, defaultProvider.baseUrl),
    auth: savedProvider.auth ?? defaultProvider.auth,
    stream: savedProvider.stream ?? defaultProvider.stream,
    keyRef: savedProvider.keyRef,
    maskedKey: savedProvider.maskedKey,
    status: savedStatus ?? defaultProvider.status,
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

// Older saved teams (created before the builder role existed) contain only
// planning agents. Without an engineer the implementation round never produces
// file blocks, so we inject the seed coder when none is present.
function ensureBuilderAgent(agents: AgentConfig[], defaultAgents: AgentConfig[]): AgentConfig[] {
  if (agents.some((agent) => agent.role === "coder")) return agents;
  const coder = defaultAgents.find((agent) => agent.role === "coder");
  return coder ? [...agents, coder] : agents;
}

function ensureCoreAgents(agents: AgentConfig[], defaultAgents: AgentConfig[]): AgentConfig[] {
  let next = ensureBuilderAgent(agents, defaultAgents);
  if (!next.some((agent) => agent.role === "tester")) {
    const tester = defaultAgents.find((agent) => agent.role === "tester");
    if (tester) next = [...next, tester];
  }
  return next;
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
    const withCoreAgents = ensureCoreAgents(agents, defaultAgents);
    if (withCoreAgents.length !== agents.length) persistAgents(withCoreAgents);
    return withCoreAgents;
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
  const legacyEndpoints = LEGACY_MCP_DEFAULT_ENDPOINTS[defaultServer.id] ?? [];
  const savedUsesLegacyDefault = legacyEndpoints.some((endpoint) => (
    endpoint.transport === savedServer.transport
    && endpoint.commandOrUrl === savedServer.commandOrUrl
    && savedServer.status !== "connected"
    && (savedServer.tools?.length ?? 0) === 0
  ));
  if (savedUsesLegacyDefault) {
    return { ...defaultServer, enabled: savedServer.enabled };
  }
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
  const legacyDefaultAutoMaxRounds = 4;
  const legacyDefaultLeaseTimeoutSec = 90;
  const rawAutoMaxRounds = Number(settings?.autoMaxRounds);
  const rawLeaseTimeoutSec = Number(settings?.agentLeaseTimeoutSec);
  const autoMaxRounds = !Number.isFinite(rawAutoMaxRounds) || rawAutoMaxRounds <= 0 || rawAutoMaxRounds === legacyDefaultAutoMaxRounds
    ? DEFAULT_APP_SETTINGS.autoMaxRounds
    : Math.min(AUTO_IMPLEMENTATION_HARD_CAP, Math.max(1, rawAutoMaxRounds));
  const agentLeaseTimeoutSec = !Number.isFinite(rawLeaseTimeoutSec) || rawLeaseTimeoutSec <= 0 || rawLeaseTimeoutSec === legacyDefaultLeaseTimeoutSec
    ? DEFAULT_APP_SETTINGS.agentLeaseTimeoutSec
    : Math.max(15, rawLeaseTimeoutSec);
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    autoMaxRounds,
    agentLeaseTimeoutSec,
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

function loadProjectWorkTimers(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROJECT_WORK_TIMERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]));
  } catch {
    return {};
  }
}

function persistProjectWorkTimers(timers: Record<string, number>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROJECT_WORK_TIMERS_STORAGE_KEY, JSON.stringify(timers));
}

const PLAN_STATUSES = new Set<PlanArtifact["status"]>(["draft", "approved", "scaffolded", "built"]);

function clonePlanArtifact(artifact: PlanArtifact): PlanArtifact {
  return {
    ...artifact,
    stack: [...artifact.stack],
    steps: [...artifact.steps],
  };
}

function createEmptyPlanArtifact(sessionId = "empty"): PlanArtifact {
  return {
    ...clonePlanArtifact(planArtifactSeed),
    id: "artifact-" + sessionId,
    stack: [],
    steps: [],
    projectTree: "",
    status: "draft",
    edited: false,
  };
}

function normalizePlanArtifact(artifact: PlanArtifact | undefined, sessionId = "empty"): PlanArtifact {
  if (!artifact) return createEmptyPlanArtifact(sessionId);
  const status = PLAN_STATUSES.has(artifact.status) ? artifact.status : "draft";
  return {
    id: artifact.id || "artifact-" + sessionId,
    title: artifact.title?.trim() || planArtifactSeed.title,
    stack: Array.isArray(artifact.stack) ? artifact.stack.map(String).filter(Boolean) : [],
    steps: Array.isArray(artifact.steps) ? artifact.steps.map(String).filter(Boolean) : [],
    projectTree: artifact.projectTree ?? "",
    status,
    edited: Boolean(artifact.edited),
  };
}

function savedChecklistItems(items: ChecklistItem[] = []): SavedImplementationChecklistItem[] {
  return items.map((item, index) => ({
    id: item.id || "step-" + index,
    index: Number.isFinite(item.index) ? item.index : index,
    step: item.step,
    done: Boolean(item.done),
    source: item.source,
    note: item.note,
  }));
}

function normalizeChecklistItems(items?: SavedImplementationChecklistItem[] | ChecklistItem[]): ChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item?.step === "string" && item.step.trim())
    .map((item, index) => ({
      id: "id" in item && typeof item.id === "string" && item.id.trim() ? item.id : "step-" + index,
      index: Number.isFinite(item.index) ? item.index : index,
      step: item.step,
      done: Boolean(item.done),
      source: item.source === "verifier" || item.source === "heuristic" ? item.source : "pending",
      note: item.note,
    }));
}

function progressFromSession(session: SessionConfig, project?: ProjectConfig): {
  artifact: PlanArtifact;
  implementationChecklist: ChecklistItem[];
  lastRunFilesWritten?: number;
  lastBuild?: BuildResult;
} {
  let artifact = normalizePlanArtifact(session.artifact, session.id);
  if (!session.artifact) {
    const synthesized = synthesizePlan(session.messages ?? [], createEmptyPlanArtifact(session.id));
    if (synthesized.steps.length || synthesized.stack.length || synthesized.projectTree.trim()) {
      artifact = synthesized;
    }
  }
  if (project?.status === "built" && artifact.steps.length) artifact = { ...artifact, status: "built" };
  if (project?.status === "scaffolded" && artifact.status === "draft" && artifact.steps.length) artifact = { ...artifact, status: "scaffolded" };
  return {
    artifact,
    implementationChecklist: normalizeChecklistItems(session.implementationChecklist),
    lastRunFilesWritten: Number.isFinite(session.lastRunFilesWritten) ? session.lastRunFilesWritten : undefined,
    lastBuild: session.lastBuild,
  };
}

function withSessionProgress(
  session: SessionConfig,
  artifact: PlanArtifact,
  checklist: ChecklistItem[],
  lastRunFilesWritten?: number,
  lastBuild?: BuildResult,
): SessionConfig {
  return {
    ...session,
    artifact: clonePlanArtifact(artifact),
    implementationChecklist: savedChecklistItems(checklist),
    lastRunFilesWritten,
    lastBuild,
  };
}

function pushLiveFileActivity(items: LiveFileActivity[], next: LiveFileActivity, limit = 12): LiveFileActivity[] {
  const withoutDuplicate = items.filter((item) => !(item.path === next.path && item.agentId === next.agentId));
  return [next, ...withoutDuplicate].slice(0, limit);
}

function resolveMainAgent(agents: AgentConfig[], settings: AppSettings): AgentConfig | undefined {
  return agents.find((agent) => agent.id === settings.operatorDefaultAgentId)
    ?? agents.find((agent) => agent.role === "architect")
    ?? agents[0];
}

function isProjectQuestionMode(state: { projects: ProjectConfig[]; activeProjectId: string; artifact: PlanArtifact }): boolean {
  return state.artifact.status === "built"
    || state.projects.find((project) => project.id === state.activeProjectId)?.status === "built";
}

function createOperatorPrompt(
  text: string,
  targetAgent?: AgentConfig,
  settings?: AppSettings,
  options: { projectQuestionMode?: boolean } = {},
): string {
  const clean = text.trim();
  if (!targetAgent) return clean;
  if (options.projectQuestionMode) {
    return [
      "Проект уже завершён и находится в режиме вопросов по готовому результату.",
      `Отвечает только главный агент: «${targetAgent.name}» (${targetAgent.role}). Не подключай команду и не инициируй новые раунды планирования или реализации.`,
      "Не пиши и не изменяй файлы, не проси вернуть блоки `Файл:` и не запускай генерацию кода. Отвечай текстом по существу, опираясь на историю проекта; если нужен новый код, предложи пользователю явно запустить отдельную доработку.",
      clean,
    ].join("\n\n");
  }
  if (!settings?.operatorAssistantEnabled) {
    return `Вопрос оператора адресован агенту «${targetAgent.name}» (${targetAgent.role}). Ответь именно на него.\n\n${clean}`;
  }
  return [
    "Запрос оператора передан через проджект-менеджера очереди.",
    `Адресат: «${targetAgent.name}» (${targetAgent.role}).`,
    "Сначала кратко уточни, как понял просьбу, затем дай полезный ответ или внеси изменение в рамках своей роли.",
    clean,
  ].join("\n\n");
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

class AgentLeaseTimeoutError extends Error {
  constructor(readonly agentName: string, readonly timeoutSec: number) {
    super(`Agent ${agentName} heartbeat expired after ${timeoutSec}s`);
    this.name = "AgentLeaseTimeoutError";
  }
}

class AgentEmptyOutputError extends Error {
  constructor(readonly agentName: string) {
    super(`Agent ${agentName} returned no writable file blocks`);
    this.name = "AgentEmptyOutputError";
  }
}

function isRecoverableAgentFailure(error: unknown): boolean {
  return error instanceof AgentLeaseTimeoutError || error instanceof ModelFallbackError || error instanceof AgentEmptyOutputError;
}

function withAgentLease<T>(promise: Promise<T>, agent: AgentConfig, timeoutSec: number): Promise<T> {
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentLeaseTimeoutError(agent.name, timeoutSec)), timeoutSec * 1000);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

  if (primaryProvider && providerCanReceiveTraffic(primaryProvider)) {
    candidates.push({ provider: primaryProvider, modelId: agent.modelId });
  }

  if (!fallbackEnabled) return candidates;

  if (primaryProvider && providerCanReceiveTraffic(primaryProvider)) {
    for (const model of primaryProvider.models) {
      if (model.id !== agent.modelId) candidates.push({ provider: primaryProvider, modelId: model.id });
    }
  }

  for (const provider of providers) {
    if (provider.id === primaryProvider?.id || !providerCanReceiveTraffic(provider)) continue;
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
  if (!candidates.length) {
    throw new Error("\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0433\u043e \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u0430 \u0441 \u0437\u0435\u043b\u0451\u043d\u044b\u043c \u0441\u0442\u0430\u0442\u0443\u0441\u043e\u043c \u0434\u043b\u044f \u0430\u0433\u0435\u043d\u0442\u0430. \u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440 \u043d\u0430 \u044d\u043a\u0440\u0430\u043d\u0435 \u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b \u0438\u043b\u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u043e\u0433\u043e \u0430\u0433\u0435\u043d\u0442\u0430.");
  }

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
    .map((attempt) => `${attempt.providerName}/${attempt.modelLabel}: ${attempt.error ?? "\u043d\u0435\u0442 \u0442\u0435\u043a\u0441\u0442\u0430 \u043e\u0448\u0438\u0431\u043a\u0438"}`)
    .join("; ");
  throw new ModelFallbackError((fallbackEnabled ? "\u0412\u0441\u0435 fallback-\u043c\u043e\u0434\u0435\u043b\u0438 \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0438. " : "") + details, attempts);
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
    `\u21aa\ufe0f \u0410\u0432\u0442\u043e\u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043c\u043e\u0434\u0435\u043b\u0438: ${failedLabels} \u2192 ${success.providerName}/${success.modelLabel}.`,
    failed[0]?.error ? `\u041f\u0440\u0438\u0447\u0438\u043d\u0430: ${failed[0].error}` : "",
  ].filter(Boolean).join("\n");
}

function looksLikeEncodingDamage(text: string): boolean {
  const questionMarks = (text.match(/\?/g) ?? []).length;
  return /\?{3,}/.test(text) && questionMarks >= Math.max(6, Math.floor(text.length * 0.2));
}

function repairCorruptedMessage(message: ChatMessage): ChatMessage {
  if (!looksLikeEncodingDamage(message.text)) return message;

  const text = message.author === "system"
    ? "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0438\u043b\u0438 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u0440\u043e\u0435\u043a\u0442\u0430. \u0411\u0435\u0437 \u044d\u0442\u043e\u0433\u043e \u0430\u0433\u0435\u043d\u0442\u0430\u043c \u043d\u0435\u0447\u0435\u0433\u043e \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0442\u044c."
    : "\u041e\u0442\u0432\u0435\u0442 \u0431\u044b\u043b \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0451\u043d \u0438\u0437-\u0437\u0430 \u043a\u043e\u0434\u0438\u0440\u043e\u0432\u043a\u0438. \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u044d\u0442\u043e\u0442 \u0448\u0430\u0433 \u0437\u0430\u043d\u043e\u0432\u043e \u043f\u043e\u0441\u043b\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0438 \u043f\u043e\u043d\u044f\u0442\u043d\u043e\u0439 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043b\u0438 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u0430.";

  return {
    ...message,
    text,
    tokens: Math.max(16, Math.ceil(text.length / 4)),
  };
}

function normalizeProjectTitle(title: string | undefined, index: number): string {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || trimmed === "RamTeamAi desktop MVP" || looksLikeEncodingDamage(trimmed)) {
    return index === 0 ? "\u041d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442" : "\u041f\u0440\u043e\u0435\u043a\u0442 " + (index + 1);
  }
  if (/^(?:\u0420\u045f|\u0420\u0421|\u0420\u040e)/.test(trimmed)) {
    const number = trimmed.match(/(\d+)/)?.[1];
    return number ? "\u041f\u0440\u043e\u0435\u043a\u0442 " + number : (index === 0 ? "\u041d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442" : "\u041f\u0440\u043e\u0435\u043a\u0442 " + (index + 1));
  }
  return trimmed;
}

function normalizeSessionTitle(title: string | undefined, index = 0): string {
  const trimmed = title?.trim() ?? "";
  if (!trimmed || trimmed === "RamTeamAi desktop MVP" || looksLikeEncodingDamage(trimmed)) {
    return index === 0 ? "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f" : "\u0421\u0435\u0441\u0441\u0438\u044f " + (index + 1);
  }
  if (/^(?:\u0420\u040e|\u0420\u045c|\u0421\u0453)/.test(trimmed)) {
    const number = trimmed.match(/(\d+)/)?.[1];
    return number ? "\u0421\u0435\u0441\u0441\u0438\u044f " + number : (index === 0 ? "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f" : "\u0421\u0435\u0441\u0441\u0438\u044f " + (index + 1));
  }
  return trimmed;
}

function normalizeSession(session: SessionConfig, fallbackProjectId: string, index = 0): SessionConfig {
  const messages = Array.isArray(session.messages) ? session.messages.map(repairCorruptedMessage) : [];
  const id = session.id || "session-" + Date.now();
  const artifact = session.artifact ? normalizePlanArtifact(session.artifact, id) : undefined;
  const implementationChecklist = normalizeChecklistItems(session.implementationChecklist);
  return {
    ...session,
    id,
    projectId: session.projectId || fallbackProjectId,
    title: normalizeSessionTitle(session.title, index),
    mode: session.mode ?? "planning",
    tokenBudget: session.tokenBudget || 120_000,
    messages,
    tokensUsed: messages.reduce((sum, item) => sum + item.tokens, 0),
    artifact,
    implementationChecklist: savedChecklistItems(implementationChecklist),
    lastRunFilesWritten: Number.isFinite(session.lastRunFilesWritten) ? session.lastRunFilesWritten : undefined,
    lastBuild: session.lastBuild,
  };
}
function loadSessions(defaultSession: SessionConfig, projects: ProjectConfig[]): SessionConfig[] {
  const fallbackProjectId = projects[0]?.id ?? defaultSession.projectId;
  if (typeof window === "undefined") return [normalizeSession(defaultSession, fallbackProjectId)];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [normalizeSession(defaultSession, fallbackProjectId)];
    const sessions = (JSON.parse(raw) as SessionConfig[])
      .map((session, index) => normalizeSession(session, fallbackProjectId, index))
      .filter((session) => projects.some((project) => project.id === session.projectId));
    if (raw.includes("???") || raw.includes("\u0420")) persistSessions(sessions);
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

function createProjectConfig(index: number, title?: string, status: ProjectConfig["status"] = "draft"): ProjectConfig {
  const now = new Date().toISOString();
  return {
    id: "project-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    title: title?.trim() || (index === 0 ? "\u041d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442" : "\u041f\u0440\u043e\u0435\u043a\u0442 " + (index + 1)),
    status,
    createdAt: now,
    updatedAt: now,
  };
}

function createSessionConfig(projectId: string, index: number): SessionConfig {
  const id = "session-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  return {
    id,
    projectId,
    title: index === 0 ? "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f" : "\u0421\u0435\u0441\u0441\u0438\u044f " + (index + 1),
    mode: "planning",
    tokenBudget: 120_000,
    tokensUsed: 0,
    messages: [],
    artifact: createEmptyPlanArtifact(id),
    implementationChecklist: [],
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
    title: "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f",
    mode: "planning",
    tokenBudget: 120_000,
    tokensUsed: 0,
    messages: [],
    artifact: createEmptyPlanArtifact("session-placeholder"),
    implementationChecklist: [],
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

function selectionWithProgress(selection: ReturnType<typeof ensureActiveSelection>) {
  const project = selection.projects.find((item) => item.id === selection.activeProjectId);
  return {
    ...selection,
    ...progressFromSession(selection.session, project),
  };
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/^\/?init$/i, "\u0418\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u0430").split(/\r?\n/)[0]?.replace(/\s+/g, " ").trim();
  if (!normalized) return "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f";
  return normalized.length > 44 ? normalized.slice(0, 41).trimEnd() + "\u2026" : normalized;
}

function isDefaultProjectTitle(title: string): boolean {
  return title === "\u041d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442" || /^\u041f\u0440\u043e\u0435\u043a\u0442 \d+$/.test(title) || looksLikeEncodingDamage(title) || title === "RamTeamAi desktop MVP";
}

function isDefaultSessionTitle(title: string): boolean {
  return title === "\u041d\u043e\u0432\u0430\u044f \u0441\u0435\u0441\u0441\u0438\u044f" || /^\u0421\u0435\u0441\u0441\u0438\u044f \d+$/.test(title) || looksLikeEncodingDamage(title) || title === "RamTeamAi desktop MVP";
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

function withAgentPromptMessage(session: SessionConfig, text: string, agentRole: ChatMessage["agentRole"] = "architect"): SessionConfig {
  const message: ChatMessage = {
    id: "agent-init-" + Date.now(),
    author: "agent",
    agentRole,
    text,
    createdAt: new Date().toISOString(),
    tokens: Math.max(16, Math.ceil(text.length / 4)),
    actions: [{ kind: "plan", label: "Вопрос пользователю", detail: "Агенты ждут задачу для уже существующего проекта." }],
  };
  const messages = [...session.messages, message];
  return {
    ...session,
    messages,
    tokensUsed: messages.reduce((sum, item) => sum + item.tokens, 0),
  };
}

function workspaceTitleFromPath(rootPath: string, fallbackIndex: number): string {
  const webLabel = rootPath.trim().replace(/^web:\/\//i, "");
  const parts = webLabel.split(/[\\/]/).map((part) => part.trim()).filter(Boolean);
  const title = parts.at(-1)?.replace(/[:]+$/, "").trim();
  return title || "Существующий проект " + (fallbackIndex + 1);
}

function formatFilePreview(files: string[]): string {
  if (!files.length) return "Файлы проекта пока не найдены или папка пуста.";
  const preview = files.slice(0, 8).join(", ");
  return "Обнаружено файлов: " + files.length + ". Первые: " + preview + (files.length > 8 ? "…" : ".");
}

function existingWorkspaceIntro(result: WorkspaceInitResult, discoveredFiles: string[]): string {
  const created = result.createdFiles.length;
  const existing = result.existingFiles.length;
  return [
    "📂 Открыт существующий проект: " + result.rootPath,
    result.message,
    "Инициализация безопасная: создано " + created + ", уже было " + existing + ". Существующие MEMORY.md и PLAN.md не перезаписываются.",
    formatFilePreview(discoveredFiles),
    "Это не проект с нуля: дальше агенты будут сначала читать текущий код, уточнять цель и только потом предлагать правки.",
    "В будущем здесь появится «Верстак»: встроенный браузер + чат + DevTools, где вы показываете агентам место правки, а они видят страницу и инструменты разработчика.",
  ].join("\n");
}

function existingWorkspaceQuestion(rootPath: string): string {
  return [
    "Я инициализировал папку как существующий проект: " + rootPath,
    "Что вы хотите сделать с ним дальше?",
    "Можно попросить: провести аудит, найти точку входа, исправить баг, добавить функцию, описать архитектуру, подготовить план миграции или собрать будущий режим «Верстак» с браузером, чатом и DevTools.",
  ].join("\n");
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
  lastRunFilesWritten?: number;
  implementationChecklist: ChecklistItem[];
  liveFileActivity: LiveFileActivity[];
  queuedAgentQuestions: QueuedAgentQuestion[];
  agentDialogMessages: AgentDialogMessage[];
  agentDialogOpen: boolean;
  agentDialogBusy: boolean;
  agentDialogAgentId?: string;
  projectWorkTimers: Record<string, number>;
  agentRunCheckpoints: AgentRunCheckpoint[];
  activeWorkStartedAt?: string;
  autoRunning: boolean;
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
  runTeam: (prompt?: string, mode?: AgentRunMode, targetAgentId?: string) => Promise<void>;
  runAuto: (prompt?: string) => Promise<void>;
  enqueueAgentQuestion: (text: string, targetAgentId?: string) => Promise<void>;
  clearQueuedAgentQuestion: (questionId: string) => void;
  runAgentDialogQuestion: (text: string, targetAgentId?: string, echoUser?: boolean) => Promise<void>;
  setAgentDialogOpen: (open: boolean) => void;
  clearAgentDialog: () => void;
  updateArtifact: (patch: Partial<PlanArtifact>) => void;
  selectWorkspaceFolder: () => Promise<string | undefined>;
  openExistingWorkspaceProject: () => Promise<WorkspaceInitResult | undefined>;
  clearWorkspaceFolder: () => void;
  initWorkspace: (announce?: boolean) => Promise<WorkspaceInitResult | undefined>;
  requestBuild: (confirmed: boolean) => Promise<void>;
  implementProject: () => Promise<void>;
  startAgentImplementation: () => Promise<void>;
  continueAutoImplementation: () => Promise<void>;
  verifyImplementationChecklist: () => Promise<ChecklistItem[]>;
}

const initialProjects = loadProjects(projectsSeed);
const initialSessions = loadSessions(sessionSeed, initialProjects);
const initialActiveProjectId = resolveActiveProjectId(initialProjects, initialSessions);
const initialActiveSessionId = resolveActiveSessionId(initialSessions, initialActiveProjectId);
const initialSession = initialSessions.find((session) => session.id === initialActiveSessionId) ?? initialSessions[0] ?? normalizeSession(sessionSeed, initialActiveProjectId);
const initialProject = initialProjects.find((project) => project.id === initialSession.projectId);
const initialProgress = progressFromSession(initialSession, initialProject);

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
  artifact: initialProgress.artifact,
  mcpServers: loadMcpServers(mcpServersSeed),
  workspacePath: loadWorkspacePath(),
  activeRunMode: undefined,
  lastRunFilesWritten: initialProgress.lastRunFilesWritten,
  implementationChecklist: initialProgress.implementationChecklist,
  lastBuild: initialProgress.lastBuild,
  liveFileActivity: [],
  queuedAgentQuestions: [],
  agentDialogMessages: [],
  agentDialogOpen: false,
  agentDialogBusy: false,
  agentDialogAgentId: undefined,
  projectWorkTimers: loadProjectWorkTimers(),
  agentRunCheckpoints: [],
  activeWorkStartedAt: undefined,
  autoRunning: false,
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
      applyTheme(appSettings.theme);
      persistProviders(providers);
      persistAgents(snapshot.agents);
      persistAppSettings(appSettings);
      persistProjects(projects);
      const selection = ensureActiveSelection(projects, get().sessions, snapshot.activeProjectId);
      const progress = selectionWithProgress(selection);
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
        artifact: progress.artifact,
        implementationChecklist: progress.implementationChecklist,
        lastRunFilesWritten: progress.lastRunFilesWritten,
        lastBuild: progress.lastBuild,
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
          maskedKey: provider.maskedKey ?? "\u043a\u043b\u044e\u0447 \u043d\u0430\u0439\u0434\u0435\u043d",
          status: "connected" as const,
        })
        : withProviderMonitoring(provider, provider);
    }));
    persistProviders(hydrated);
    set({ providers: hydrated });
  },
  refreshProviderMonitoring: (providerId) => {
    const candidates = get().providers.filter((provider) => (!providerId || provider.id === providerId) && provider.status !== "not-configured");
    set((state) => {
      const providers = state.providers.map((provider) => {
        if (providerId && provider.id !== providerId) return provider;
        return { ...provider, monitoring: { ...ensureProviderMonitoring(provider, provider.monitoring), updatedAt: new Date().toISOString() } };
      });
      persistProviders(providers);
      return { providers };
    });

    if (!get().appSettings.healthSupervisorEnabled) return;
    void Promise.all(candidates.map(async (provider) => {
      try {
        const result = await testProviderConnection(provider);
        set((state) => {
          const providers = state.providers.map((item) => item.id === provider.id
            ? updateProviderMonitoring(item, { tokens: 0, latencyMs: result.latencyMs, failed: !result.ok, error: result.ok ? undefined : result.message })
            : item);
          persistProviders(providers);
          return { providers };
        });
      } catch (error) {
        set((state) => {
          const providers = state.providers.map((item) => item.id === provider.id
            ? updateProviderMonitoring(item, { tokens: 0, failed: true, error: summarizeAttemptError(error) })
            : item);
          persistProviders(providers);
          return { providers };
        });
      }
    }));
  },
  testProvider: async (providerId) => {
    const provider = get().providers.find((item) => item.id === providerId);
    if (!provider) return;
    set({ busy: true });
    const result = await testProviderConnection(provider);
    set((state) => {
      const nextStatus: ProviderConfig["status"] = result.ok ? "connected" : "warning";
      const providers = state.providers.map((item) => item.id === providerId
        ? updateProviderMonitoring({ ...item, status: nextStatus }, { tokens: 0, latencyMs: result.latencyMs, failed: !result.ok, error: result.ok ? undefined : result.message })
        : item);
      persistProviders(providers);
      return { busy: false, providers };
    });
    return result;
  },
  setAppSettings: (patch) => set((state) => {
    const appSettings = normalizeAppSettings({ ...state.appSettings, ...patch });
    persistAppSettings(appSettings);
    if (appSettings.theme !== state.appSettings.theme) applyTheme(appSettings.theme);
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
      artifact: progressFromSession(session, project).artifact,
      implementationChecklist: [],
      lastBuild: undefined,
      lastRunFilesWritten: undefined,
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
      artifact: progressFromSession(guardedSession, project).artifact,
      implementationChecklist: [],
      lastBuild: undefined,
      lastRunFilesWritten: undefined,
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
      artifact: progressFromSession(session, targetProject).artifact,
      implementationChecklist: [],
      lastBuild: undefined,
      lastRunFilesWritten: undefined,
      screen: "chat",
    };
  }),
  selectProject: (projectId) => set((state) => {
    const project = state.projects.find((item) => item.id === projectId && !item.archivedAt);
    if (!project) return {};
    const existingSession = findActiveSession(state.sessions, projectId);
    const session = existingSession ?? createPlaceholderSession(projectId);
    const sessions = state.sessions;
    const progress = progressFromSession(session, project);
    persistSessions(sessions);
    persistActiveIds(projectId, existingSession?.id ?? "");
    return {
      sessions,
      activeProjectId: projectId,
      activeSessionId: existingSession?.id ?? "",
      session,
      ...progress,
    };
  }),
  selectSession: (sessionId) => set((state) => {
    const session = state.sessions.find((item) => item.id === sessionId && !item.archivedAt);
    if (!session) return {};
    const project = state.projects.find((item) => item.id === session.projectId && !item.archivedAt);
    if (!project) return {};
    const progress = progressFromSession(session, project);
    persistActiveIds(session.projectId, session.id);
    return {
      activeProjectId: session.projectId,
      activeSessionId: session.id,
      session,
      ...progress,
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
    return selectionWithProgress(selection);
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
    return selectionWithProgress(selection);
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
    return selectionWithProgress(selection);
  }),
  restoreSession: (sessionId) => set((state) => {
    const targetSession = state.sessions.find((session) => session.id === sessionId && session.archivedAt);
    if (!targetSession) return {};
    const updatedAt = new Date().toISOString();
    const projects = state.projects.map((project) => project.id === targetSession.projectId ? { ...project, archivedAt: undefined, updatedAt } : project);
    const sessions = state.sessions.map((session) => session.id === sessionId ? { ...session, archivedAt: undefined } : session);
    const restoredSession = sessions.find((session) => session.id === sessionId) ?? targetSession;
    const project = projects.find((item) => item.id === restoredSession.projectId);
    const progress = progressFromSession(restoredSession, project);
    persistProjects(projects);
    persistSessions(sessions);
    persistActiveIds(restoredSession.projectId, restoredSession.id);
    return {
      projects,
      sessions,
      activeProjectId: restoredSession.projectId,
      activeSessionId: restoredSession.id,
      session: restoredSession,
      ...progress,
    };
  }),
  clearArchiveMemory: () => set((state) => {
    const archivedProjectIds = new Set(state.projects.filter((project) => project.archivedAt).map((project) => project.id));
    const sessions = state.sessions.map((session) => {
      if (!session.archivedAt && !archivedProjectIds.has(session.projectId)) return session;
      return { ...session, messages: [], tokensUsed: 0 };
    });
    const activeSession = sessions.find((session) => session.id === state.activeSessionId) ?? state.session;
    const activeProject = state.projects.find((project) => project.id === activeSession.projectId);
    const progress = progressFromSession(activeSession, activeProject);
    persistSessions(sessions);
    return { sessions, session: activeSession, ...progress };
  }),
  deleteArchive: () => set((state) => {
    const archivedProjectIds = new Set(state.projects.filter((project) => project.archivedAt).map((project) => project.id));
    const projects = state.projects.filter((project) => !project.archivedAt);
    const sessions = state.sessions.filter((session) => !session.archivedAt && !archivedProjectIds.has(session.projectId));
    const selection = ensureActiveSelection(projects, sessions);
    persistProjects(selection.projects);
    persistSessions(selection.sessions);
    persistActiveIds(selection.activeProjectId, selection.activeSessionId);
    return selectionWithProgress(selection);
  }),
  setSessionMode: (mode) => set((state) => {
    if (!state.activeSessionId) return {};
    const session = withSessionProgress(
      { ...state.session, mode },
      state.artifact,
      state.implementationChecklist,
      state.lastRunFilesWritten,
      state.lastBuild,
    );
    const sessions = replaceSession(state.sessions, session);
    persistSessions(sessions);
    return { session, sessions };
  }),
  runTeam: async (prompt = "", mode = "planning", targetAgentId) => {
    let { agents, providers, topology, session, sessions, projects, activeProjectId, mcpServers, appSettings } = get();
    if (!activeProjectId || !get().activeSessionId) return;
    const trimmedPrompt = prompt.trim();
    const runStartedAt = new Date().toISOString();
    const runId = "run-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    let implementationRootPath: string | undefined;
    let workspaceSnapshot: string | undefined;
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
      const scaffoldActivity: LiveFileActivity[] = [
        ...result.files.slice(0, 8).map((path) => ({
          id: "file-" + Date.now() + "-" + path,
          agentName: "Project Builder",
          path,
          action: "create" as const,
          status: "written" as const,
          updatedAt: new Date().toISOString(),
        })),
        {
          id: "file-" + Date.now() + "-IMPLEMENTATION.md",
          agentName: "Project Builder",
          path: "IMPLEMENTATION.md",
          action: "plan" as const,
          status: "written" as const,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "file-" + Date.now() + "-docs/agent-tasks.md",
          agentName: "Project Builder",
          path: "docs/agent-tasks.md",
          action: "plan" as const,
          status: "written" as const,
          updatedAt: new Date().toISOString(),
        },
      ];
      set({ lastBuild: result, workspacePath: result.rootPath, liveFileActivity: scaffoldActivity });

      // Snapshot what is already on disk so agents edit real files instead of
      // regenerating them blindly (the root cause of "can create but not edit").
      workspaceSnapshot = await buildWorkspaceSnapshot(result.rootPath);

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
    const addressedAgent = targetAgentId ? agents.find((agent) => agent.id === targetAgentId) : undefined;
    const promptForModel = addressedAgent ? createOperatorPrompt(trimmedPrompt, addressedAgent, appSettings) : trimmedPrompt;
    const visiblePrompt = addressedAgent ? `@${addressedAgent.name}: ${trimmedPrompt}` : trimmedPrompt;
    const derivedTitle = trimmedPrompt ? titleFromPrompt(trimmedPrompt) : session.title;
    const targetAgent = addressedAgent;
    const checklistForRound = mode === "implementation"
      ? checklistMatchesSteps(get().artifact.steps, get().implementationChecklist)
        ? get().implementationChecklist
        : buildChecklist(get().artifact.steps)
      : [];
    const stepsForRound = mode === "implementation"
      ? pendingImplementationSteps(get().artifact.steps, checklistForRound)
      : [];
    const hasTesterAgent = agents.some((agent) => agent.role === "tester");
    const needsQaAgent = hasTesterAgent || stepsForRound.some(isQaImplementationStep);
    const implementationAgentLimit = Math.max(needsQaAgent ? 2 : 1, Math.min(3, stepsForRound.length || 1));
    const activeAgents = selectRunAgents(agents, {
      mode,
      topologyKind: topology.kind,
      targetAgent,
      implementationLimit: implementationAgentLimit,
      planningLimit: 3,
    });

    const userMessage: ChatMessage | undefined = trimmedPrompt
      ? {
        id: "user-" + Date.now(),
        author: "user",
        text: visiblePrompt,
        createdAt: new Date().toISOString(),
        tokens: Math.max(24, Math.ceil(visiblePrompt.length / 4)),
      }
      : undefined;
    const modelUserMessage = userMessage ? { ...userMessage, text: promptForModel, tokens: Math.max(24, Math.ceil(promptForModel.length / 4)) } : undefined;
    const modelBaseMessages = modelUserMessage ? [...session.messages, modelUserMessage] : session.messages;

    // Once implementation starts the session leaves planning, otherwise the
    // "К чему пришли" planning summary keeps re-rendering and looks like a reset.
    const nextMode: SessionConfig["mode"] = mode === "implementation"
      ? "chat"
      : trimmedPrompt ? session.mode : "planning";
    const initialBaseMessages = userMessage ? [...session.messages, userMessage] : session.messages;
    const implementationIntroMessages: ChatMessage[] = mode === "implementation"
      ? activeAgents.map((agent, index) => {
        const assignment = planImplementationAssignments(get().artifact, agents).find((item) => item.owner === agent.name || item.role === agent.role);
        const text = [
          `Беру в работу: ${assignment?.summary ?? "следующий шаг реализации."}`,
          assignment?.deliverables.length ? "Результаты: " + assignment.deliverables.join(", ") : undefined,
          implementationRootPath ? "Рабочая папка: " + implementationRootPath : undefined,
        ].filter(Boolean).join("\n");
        return {
          id: "agent-intro-" + runId + "-" + agent.id + "-" + index,
          author: agent.id,
          agentRole: agent.role,
          text,
          createdAt: new Date().toISOString(),
          tokens: Math.max(24, Math.ceil(text.length / 4)),
          actions: [{ kind: "plan", label: "Взял задачу" }],
        };
      })
      : [];
    const baseMessages = implementationIntroMessages.length ? [...initialBaseMessages, ...implementationIntroMessages] : initialBaseMessages;
    const baseSessionRaw: SessionConfig = {
      ...session,
      title: trimmedPrompt && isDefaultSessionTitle(session.title) ? derivedTitle : session.title,
      mode: nextMode,
      messages: baseMessages,
      tokensUsed: baseMessages.reduce((sum, message) => sum + message.tokens, 0),
    };
    const baseSession = withSessionProgress(
      baseSessionRaw,
      get().artifact,
      mode === "implementation" ? checklistForRound : get().implementationChecklist,
      get().lastRunFilesWritten,
      get().lastBuild,
    );
    const nextSessions = replaceSession(sessions, baseSession);
    const nextProjects = projects.map((project) => project.id === activeProjectId
      ? {
        ...project,
        title: trimmedPrompt && isDefaultProjectTitle(project.title) ? derivedTitle : project.title,
        status: trimmedPrompt ? "active" as const : project.status,
        updatedAt: now,
      }
      : project);

    persistProjects(nextProjects);
    persistSessions(nextSessions);

    set({
      busy: true,
      activeRunMode: mode,
      activeWorkStartedAt: get().activeWorkStartedAt ?? runStartedAt,
      liveFileActivity: mode === "planning" ? [] : get().liveFileActivity,
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
    let totalFilesWritten = 0;
    const firedAgentIds = new Set<string>();
    // Distribute plan steps and track files written so each agent works its own
    // slice instead of colliding on the same files within the round.
    const roundAssignments = mode === "implementation" ? planImplementationAssignments(get().artifact, activeAgents) : [];
    const stepBuckets = mode === "implementation" ? partitionStepsAcrossAgents(stepsForRound, activeAgents) : new Map<string, string[]>();
    const writtenThisRound = new Set<string>();
    for (const agent of activeAgents) {
      set((state) => ({
        agents: state.agents.map((item) => item.id === agent.id
          ? { ...item, status: item.tools.includes("mcp") ? "mcp" : "typing" }
          : item),
      }));

      const snapshotMessage: ChatMessage[] = workspaceSnapshot
        ? [{
          id: "workspace-snapshot-" + agent.id,
          author: "user",
          text: workspaceSnapshot,
          createdAt: new Date().toISOString(),
          tokens: Math.ceil(workspaceSnapshot.length / 4),
        }]
        : [];
      const directiveMessage: ChatMessage[] = mode === "implementation"
        ? [{
          id: "impl-directive-" + runId + "-" + agent.id,
          author: "system",
          text: buildAgentRoundDirective(
            agent,
            stepBuckets.get(agent.id) ?? [],
            roundAssignments.find((item) => item.id === agent.id) ?? roundAssignments.find((item) => item.role === agent.role),
            [...writtenThisRound],
          ),
          createdAt: new Date().toISOString(),
          tokens: 80,
        }]
        : [];
      const context = [...modelBaseMessages, ...snapshotMessage, ...messages, ...directiveMessage];
      let text = "";
      let tokens = 0;
      let latencyMs: number | undefined;
      let attempts: CompletionAttempt[] = [];
      const actions: MessageAction[] = [];
      let checkpoint = createAgentCheckpoint({
        runId,
        agent,
        mode,
        step: `${mode}:${agent.id}`,
        leaseTimeoutSec: appSettings.agentLeaseTimeoutSec,
      });
      set((state) => ({
        agentRunCheckpoints: [...state.agentRunCheckpoints.filter((item) => item.runId !== runId || item.agentId !== agent.id), checkpoint].slice(-12),
      }));
      try {
        const agentWithMcpContext = agent.tools.includes("mcp")
          ? { ...agent, systemPrompt: agent.systemPrompt + "\n\n" + formatMcpToolsForPrompt(mcpServers) }
          : agent;
        const completion = await withAgentLease(
          completeWithModelFallback(providers, agentWithMcpContext, context, mode, appSettings.modelFallbackEnabled),
          agent,
          appSettings.healthSupervisorEnabled ? appSettings.agentLeaseTimeoutSec : 0,
        );
        checkpoint = heartbeatCheckpoint(checkpoint, appSettings.agentLeaseTimeoutSec);
        set((state) => ({
          agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? { ...checkpoint, status: "idle", updatedAt: new Date().toISOString() } : item),
        }));
        attempts = completion.attempts;
        const notice = fallbackNotice(attempts);
        if (notice) {
          actions.push({ kind: "fallback", label: "\u0421\u043c\u0435\u043d\u0430 \u043c\u043e\u0434\u0435\u043b\u0438", detail: notice });
        }
        text = notice ? notice + "\n\n" + completion.result.text : completion.result.text;
        tokens = Math.max(completion.result.tokens, Math.ceil(text.length / 4));
        latencyMs = completion.result.latencyMs;
        if (agent.tools.includes("mcp")) {
          actions.push({ kind: "search", label: "\u0417\u0430\u043f\u0440\u043e\u0441 \u0447\u0435\u0440\u0435\u0437 MCP" });
        }
        if (mode === "implementation" && implementationRootPath) {
          const fileBlocks = extractWorkspaceFileBlocks(text);
          const writtenFiles: string[] = [];
          const failedFiles: string[] = [];
          for (const file of fileBlocks.slice(0, 8)) {
            const activity: LiveFileActivity = {
              id: "file-" + Date.now() + "-" + agent.id + "-" + file.path,
              agentId: agent.id,
              agentName: agent.name,
              path: file.path,
              action: "edit",
              status: "pending",
              updatedAt: new Date().toISOString(),
            };
            set((state) => ({ liveFileActivity: pushLiveFileActivity(state.liveFileActivity, activity) }));
          }
          for (const file of fileBlocks.slice(0, 8)) {
            try {
              const writeResult = await writeWorkspaceTextFile(implementationRootPath, file.path, file.content, { overwrite: true });
              writtenFiles.push(writeResult.path);
              actions.push({ kind: "write", label: writeResult.path });
              set((state) => ({
                liveFileActivity: pushLiveFileActivity(state.liveFileActivity, {
                  id: "file-" + Date.now() + "-" + agent.id + "-" + writeResult.path,
                  agentId: agent.id,
                  agentName: agent.name,
                  path: writeResult.path,
                  action: writeResult.created ? "create" : "edit",
                  status: "written",
                  updatedAt: new Date().toISOString(),
                }),
              }));
            } catch (error) {
              // Surface the failure so a real folder/permission problem is visible instead of looking like silence.
              const reason = summarizeAttemptError(error);
              failedFiles.push(file.path + " — " + reason);
              actions.push({ kind: "error", label: file.path, detail: reason });
              set((state) => ({
                liveFileActivity: pushLiveFileActivity(state.liveFileActivity, {
                  id: "file-" + Date.now() + "-" + agent.id + "-" + file.path,
                  agentId: agent.id,
                  agentName: agent.name,
                  path: file.path,
                  action: "error",
                  status: "failed",
                  updatedAt: new Date().toISOString(),
                }),
              }));
            }
          }
          totalFilesWritten += writtenFiles.length;
          writtenFiles.forEach((path) => writtenThisRound.add(path));
          if (writtenFiles.length) {
            text += "\n\n✅ Записано в рабочую папку: " + writtenFiles.join(", ");
          }
          if (failedFiles.length) {
            text += "\n\n⚠️ Не удалось записать файлы: " + failedFiles.join("; ");
          }
          if (!fileBlocks.length) {
            actions.push({ kind: "idle", label: "Код не записан", detail: "Ответ без блока «Файл: путь» + код" });
            text += "\n\n⚠️ В ответе нет ни одного блока «Файл: путь» + код, поэтому на диск ничего не записано. Папка доступна для записи (план уже записан в неё), проблема в том, что агент описал план вместо кода. Нажмите «Запустить агентов реализации» ещё раз — промпт усилен, чтобы агент вернул сам код.";
            throw new AgentEmptyOutputError(agent.name);
          }
          tokens = Math.max(tokens, Math.ceil(text.length / 4));
        } else if (mode === "planning") {
          actions.push({ kind: "plan", label: "\u0412\u043e\u043f\u0440\u043e\u0441 \u043a \u0433\u043b\u0430\u0432\u043d\u043e\u043c\u0443" });
        }
      } catch (error) {
        const staleCheckpoint = checkpointIsStale(checkpoint) || error instanceof AgentLeaseTimeoutError;
        const recoverableFailure = staleCheckpoint || isRecoverableAgentFailure(error);
        firedAgentIds.add(agent.id);
        const replacementAgent = appSettings.healthSupervisorEnabled && recoverableFailure
          ? selectRecoveryAgent({ failedAgent: agent, agents: get().agents, providers: get().providers, excludedAgentIds: firedAgentIds })
          : undefined;
        if (replacementAgent) {
          const failureReason = summarizeAttemptError(error);
          checkpoint = {
            ...recoverCheckpoint(checkpoint, replacementAgent, appSettings.agentLeaseTimeoutSec),
            failureReason,
            handoffContext: context.map((message) => `${message.author}: ${message.text}`).join("\n").slice(-4_000),
            replacementHistory: [
              ...(checkpoint.replacementHistory ?? []),
              {
                previousAgentId: agent.id,
                replacementAgentId: replacementAgent.id,
                reason: failureReason,
                step: checkpoint.step,
                status: "recovered" as const,
                attempts: checkpoint.attempts + 1,
                createdAt: new Date().toISOString(),
              },
            ],
          };
          firedAgentIds.add(replacementAgent.id);
          set((state) => ({
            agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? checkpoint : item),
            agents: state.agents.map((item) => item.id === agent.id
              ? { ...item, status: "fired" }
              : item.id === replacementAgent.id
                ? { ...item, status: "hired" }
                : item),
          }));
          try {
            const recoveryPrompt: ChatMessage = {
              id: "supervisor-recovery-" + Date.now() + "-" + replacementAgent.id,
              author: "system",
              text: [
                "Supervisor recovery checkpoint.",
                `Previous agent ${agent.name} stopped at ${checkpoint.step}: ${summarizeAttemptError(error)}.`,
                "Continue the same task from the latest context. If this is implementation mode, return full file blocks so the workspace can be written.",
              ].join("\n"),
              createdAt: new Date().toISOString(),
              tokens: 80,
            };
            const replacementWithMcpContext = replacementAgent.tools.includes("mcp")
              ? { ...replacementAgent, systemPrompt: replacementAgent.systemPrompt + "\n\n" + formatMcpToolsForPrompt(mcpServers) }
              : replacementAgent;
            const completion = await withAgentLease(
              completeWithModelFallback(get().providers, replacementWithMcpContext, [...context, recoveryPrompt], mode, appSettings.modelFallbackEnabled),
              replacementAgent,
              appSettings.agentLeaseTimeoutSec,
            );
            attempts = completion.attempts;
            const notice = fallbackNotice(attempts);
            const recoveryNotice = `🛟 Supervisor: ${agent.name} не ответил, задачу подхватил ${replacementAgent.name}.`;
            actions.push({ kind: "fallback", label: "Агент заменён", detail: recoveryNotice });
            if (notice) actions.push({ kind: "fallback", label: "\u0421\u043c\u0435\u043d\u0430 \u043c\u043e\u0434\u0435\u043b\u0438", detail: notice });
            text = [recoveryNotice, notice, completion.result.text].filter(Boolean).join("\n\n");
            tokens = Math.max(completion.result.tokens, Math.ceil(text.length / 4));
            latencyMs = completion.result.latencyMs;

            if (mode === "implementation" && implementationRootPath) {
              const fileBlocks = extractWorkspaceFileBlocks(text);
              const writtenFiles: string[] = [];
              const failedFiles: string[] = [];
              for (const file of fileBlocks.slice(0, 8)) {
                set((state) => ({ liveFileActivity: pushLiveFileActivity(state.liveFileActivity, {
                  id: "file-" + Date.now() + "-" + replacementAgent.id + "-" + file.path,
                  agentId: replacementAgent.id,
                  agentName: replacementAgent.name,
                  path: file.path,
                  action: "edit",
                  status: "pending",
                  updatedAt: new Date().toISOString(),
                }) }));
                try {
                  const writeResult = await writeWorkspaceTextFile(implementationRootPath, file.path, file.content, { overwrite: true });
                  writtenFiles.push(writeResult.path);
                  actions.push({ kind: "write", label: writeResult.path });
                  set((state) => ({ liveFileActivity: pushLiveFileActivity(state.liveFileActivity, {
                    id: "file-" + Date.now() + "-" + replacementAgent.id + "-" + writeResult.path,
                    agentId: replacementAgent.id,
                    agentName: replacementAgent.name,
                    path: writeResult.path,
                    action: writeResult.created ? "create" : "edit",
                    status: "written",
                    updatedAt: new Date().toISOString(),
                  }) }));
                } catch (writeError) {
                  const reason = summarizeAttemptError(writeError);
                  failedFiles.push(file.path + " — " + reason);
                  actions.push({ kind: "error", label: file.path, detail: reason });
                }
              }
              if (!fileBlocks.length) {
                throw new AgentEmptyOutputError(replacementAgent.name);
              }
              totalFilesWritten += writtenFiles.length;
              writtenFiles.forEach((path) => writtenThisRound.add(path));
              if (writtenFiles.length) text += "\n\n✅ Записано резервным агентом: " + writtenFiles.join(", ");
              if (failedFiles.length) text += "\n\n⚠️ Не удалось записать файлы: " + failedFiles.join("; ");
            } else if (mode === "planning") {
              actions.push({ kind: "plan", label: "План продолжен резервным агентом" });
            }
            set((state) => ({
              agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? { ...heartbeatCheckpoint(checkpoint, appSettings.agentLeaseTimeoutSec), status: "idle" } : item),
              agents: state.agents.map((item) => item.id === replacementAgent.id ? { ...item, status: "done" } : item),
            }));
          } catch (recoveryError) {
            checkpoint = failCheckpoint(checkpoint, summarizeAttemptError(recoveryError));
            set((state) => ({
              agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? checkpoint : item),
              agents: state.agents.map((item) => item.id === replacementAgent.id ? { ...item, status: "fired" } : item),
            }));
            error = recoveryError;
          }
        } else if (recoverableFailure && appSettings.healthSupervisorEnabled) {
          checkpoint = partialCheckpoint(checkpoint, "No healthy replacement agent is available: " + summarizeAttemptError(error));
          set((state) => ({
            agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? checkpoint : item),
            agents: state.agents.map((item) => item.id === agent.id ? { ...item, status: "fired" } : item),
          }));
        }
        if (tokens > 0) {
          // Recovery succeeded; skip normal error rendering.
        } else {
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
        actions.length = 0;
        actions.push({ kind: "error", label: "\u041e\u0448\u0438\u0431\u043a\u0430 API", detail: summarizeAttemptError(error) });
        checkpoint = failCheckpoint(checkpoint, summarizeAttemptError(error));
        set((state) => ({ agentRunCheckpoints: state.agentRunCheckpoints.map((item) => item.id === checkpoint.id ? checkpoint : item) }));
        }
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
              error: attempt.error,
            }), provider);
          });
          persistProviders(providers);
          return { providers };
        });
      }

      const completedMessage: ChatMessage = {
        id: "agent-" + Date.now() + "-" + agent.id,
        author: agent.id,
        agentRole: agent.role,
        text,
        createdAt: new Date().toISOString(),
        tokens,
        tool: agent.tools.includes("mcp") ? "mcp" : undefined,
        actions: actions.length ? actions : undefined,
      };
      messages.push(completedMessage);

      set((state) => {
        const partialMessages = [...baseMessages, ...messages];
        const partialSessionRaw: SessionConfig = {
          ...state.session,
          mode: nextMode,
          messages: partialMessages,
          tokensUsed: partialMessages.reduce((sum, message) => sum + message.tokens, 0),
        };
        const partialSession = withSessionProgress(
          partialSessionRaw,
          state.artifact,
          state.implementationChecklist,
          state.lastRunFilesWritten,
          state.lastBuild,
        );
        const partialSessions = replaceSession(state.sessions, partialSession);
        persistSessions(partialSessions);
        return {
          agents: state.agents.map((item) => item.id === agent.id ? { ...item, status: "done" } : item),
          session: partialSession,
          sessions: partialSessions,
        };
      });
    }

    let finalReadiness: ReturnType<typeof validateProjectCompleteness> | undefined;
    if (mode === "implementation" && implementationRootPath) {
      const workspaceFiles = await listWorkspaceFiles(implementationRootPath).catch(() => []);
      const stubFiles = await detectScaffoldStubFiles(implementationRootPath, workspaceFiles);
      finalReadiness = validateProjectCompleteness(get().artifact, workspaceFiles, undefined, stubFiles);
    }
    set((state) => {
      const nextMessages = [...baseMessages, ...messages];
      const finishedAt = Date.now();
      const startedAt = state.activeWorkStartedAt ? Date.parse(state.activeWorkStartedAt) : Date.parse(runStartedAt);
      const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, finishedAt - startedAt) : 0;
      const projectWorkTimers = {
        ...state.projectWorkTimers,
        [activeProjectId]: (state.projectWorkTimers[activeProjectId] ?? 0) + elapsedMs,
      };
      const sessionRaw: SessionConfig = {
        ...state.session,
        mode: nextMode,
        messages: nextMessages,
        tokensUsed: nextMessages.reduce((sum, message) => sum + message.tokens, 0),
      };
      const plannedArtifact = mode === "planning" ? synthesizePlan(nextMessages, state.artifact) : undefined;
      const readinessStatus = finalReadiness?.status;
      const finalArtifact = plannedArtifact
        ? plannedArtifact
        : mode === "implementation"
          ? { ...state.artifact, status: artifactStatusAfterImplementationRound(readinessStatus) }
          : state.artifact;
      const finalLastRunFilesWritten = mode === "planning" ? undefined : mode === "implementation" ? totalFilesWritten : state.lastRunFilesWritten;
      const finalChecklist = mode === "planning" ? [] : state.implementationChecklist;
      const finalLastBuild = finalReadiness && state.lastBuild ? { ...state.lastBuild, readiness: finalReadiness } : state.lastBuild;
      const session = withSessionProgress(sessionRaw, finalArtifact, finalChecklist, finalLastRunFilesWritten, finalLastBuild);
      const sessions = replaceSession(state.sessions, session);
      const projects = mode === "implementation"
        ? state.projects.map((project) => project.id === activeProjectId ? { ...project, status: projectStatusAfterImplementationRound(readinessStatus), updatedAt: new Date().toISOString() } : project)
        : state.projects;
      persistSessions(sessions);
      if (mode === "implementation") persistProjects(projects);
      persistProjectWorkTimers(projectWorkTimers);
      return {
        busy: false,
        activeRunMode: undefined,
        activeWorkStartedAt: undefined,
        projectWorkTimers,
        lastRunFilesWritten: finalLastRunFilesWritten,
        implementationChecklist: finalChecklist,
        lastBuild: finalLastBuild,
        agents: state.agents.map((agent) => ({ ...agent, status: "done" })),
        projects,
        session,
        sessions,
        artifact: finalArtifact,
      };
    });
    const nextQueuedQuestion = get().queuedAgentQuestions[0];
    if (nextQueuedQuestion && !get().autoRunning) {
      set((state) => ({ queuedAgentQuestions: state.queuedAgentQuestions.filter((item) => item.id !== nextQueuedQuestion.id) }));
      await get().runAgentDialogQuestion(nextQueuedQuestion.text, nextQueuedQuestion.targetAgentId, false);
    }
  },
  runAuto: async (prompt = "") => {
    if (get().busy || get().autoRunning) return;

    // 1. Planning round — adds the user task and synthesizes the plan artifact.
    await get().runTeam(prompt.trim(), "planning");

    // Respect the toggle: without auto mode this behaves like a normal send.
    if (!get().appSettings.autoMode) return;
    // Need a concrete plan before the team can implement anything.
    if (!get().artifact.steps.length) return;

    // Seed the checklist from the plan so the UI shows pending items immediately.
    const initialChecklist = buildChecklist(get().artifact.steps);
    set((state) => {
      const session = withSessionProgress(state.session, state.artifact, initialChecklist, state.lastRunFilesWritten, state.lastBuild);
      const sessions = replaceSession(state.sessions, session);
      persistSessions(sessions);
      return { implementationChecklist: initialChecklist, session, sessions };
    });

    set({ autoRunning: true });
    try {
      // 2. Scaffold the project and run the first implementation round. This may
      // bail early if the user cancels the required workspace-folder picker.
      await get().startAgentImplementation();
      if (!get().appSettings.autoMode) return;

      // 3. Verify and continue implementation rounds automatically until the
      // checklist is complete, stalled, or the configured cap is reached.
      await get().continueAutoImplementation();
    } finally {
      set({ autoRunning: false });
      const nextQueuedQuestion = get().queuedAgentQuestions[0];
      if (nextQueuedQuestion && !get().busy) {
        set((state) => ({ queuedAgentQuestions: state.queuedAgentQuestions.filter((item) => item.id !== nextQueuedQuestion.id) }));
        await get().runAgentDialogQuestion(nextQueuedQuestion.text, nextQueuedQuestion.targetAgentId, false);
      }
    }
  },
  continueAutoImplementation: async () => {
    const ownsAutoRunning = !get().autoRunning;
    if (ownsAutoRunning) set({ autoRunning: true });

    try {
      const requestedRounds = get().appSettings.autoMaxRounds || DEFAULT_APP_SETTINGS.autoMaxRounds;
      const cap = Math.max(1, Math.min(requestedRounds, AUTO_IMPLEMENTATION_HARD_CAP));
      const initialChecklist = checklistMatchesSteps(get().artifact.steps, get().implementationChecklist)
        ? get().implementationChecklist
        : buildChecklist(get().artifact.steps);
      if (!checklistMatchesSteps(get().artifact.steps, get().implementationChecklist)) {
        set((state) => {
          const session = withSessionProgress(state.session, state.artifact, initialChecklist, state.lastRunFilesWritten, state.lastBuild);
          const sessions = replaceSession(state.sessions, session);
          persistSessions(sessions);
          return { implementationChecklist: initialChecklist, session, sessions };
        });
      }

      let checklist = await get().verifyImplementationChecklist();
      let stalledRounds = nextStalledRounds(initialChecklist, checklist, get().lastRunFilesWritten, 0);
      let stopReason: AutoStopReason | undefined;
      for (let round = 1; round < cap; round += 1) {
        const decision = decideAutoRound({
          checklist,
          round,
          cap,
          stalledRounds,
          autoMode: true,
          busy: get().busy,
        });
        if (decision.action === "stop") {
          stopReason = decision.reason;
          break;
        }
        const previousChecklist = checklist;
        await get().runTeam(IMPLEMENTATION_ROUND_PROMPT, "implementation");
        checklist = await get().verifyImplementationChecklist();
        stalledRounds = nextStalledRounds(previousChecklist, checklist, get().lastRunFilesWritten, stalledRounds);
      }
      stopReason ??= checklistComplete(checklist) ? "complete" : "limit";

      const complete = checklistComplete(checklist);
      const summary = buildAutoImplementationSummary(checklist, stopReason, cap);
      set((state) => {
        const artifact = complete ? { ...state.artifact, status: "built" as const } : state.artifact;
        const session = withSessionProgress(
          withSystemMessage(state.session, summary),
          artifact,
          checklist,
          state.lastRunFilesWritten,
          state.lastBuild,
        );
        const sessions = replaceSession(state.sessions, session);
        persistSessions(sessions);
        const projects = complete
          ? state.projects.map((project) => project.id === state.activeProjectId ? { ...project, status: "built" as const, updatedAt: new Date().toISOString() } : project)
          : state.projects;
        if (complete) persistProjects(projects);
        return {
          session,
          sessions,
          projects,
          implementationChecklist: checklist,
          artifact,
        };
      });
    } finally {
      if (ownsAutoRunning) {
        set({ autoRunning: false });
        const nextQueuedQuestion = get().queuedAgentQuestions[0];
        if (nextQueuedQuestion && !get().busy) {
          set((state) => ({ queuedAgentQuestions: state.queuedAgentQuestions.filter((item) => item.id !== nextQueuedQuestion.id) }));
          await get().runAgentDialogQuestion(nextQueuedQuestion.text, nextQueuedQuestion.targetAgentId, false);
        }
      }
    }
  },
  runAgentDialogQuestion: async (text, targetAgentId, echoUser = true) => {
    const trimmed = text.trim();
    if (!trimmed || get().busy || get().autoRunning || get().agentDialogBusy) return;

    const { agents, providers, session, mcpServers, appSettings, projects, activeProjectId, artifact } = get();
    const projectQuestionMode = isProjectQuestionMode({ projects, activeProjectId, artifact });
    const mainAgent = resolveMainAgent(agents, appSettings);
    const requestedTargetAgent = projectQuestionMode
      ? mainAgent
      : agents.find((agent) => agent.id === (targetAgentId || appSettings.operatorDefaultAgentId));
    const targetAgent = requestedTargetAgent ?? mainAgent ?? agents[0];
    if (!targetAgent) return;

    const now = new Date().toISOString();
    const visiblePrompt = `@${targetAgent.name}: ${trimmed}`;
    const promptForModel = createOperatorPrompt(trimmed, targetAgent, appSettings, { projectQuestionMode });
    const userMessage: AgentDialogMessage = {
      id: "agent-dialog-user-" + Date.now(),
      author: "user",
      agentId: targetAgent.id,
      text: visiblePrompt,
      createdAt: now,
      tokens: Math.max(24, Math.ceil(visiblePrompt.length / 4)),
    };
    const modelUserMessage: ChatMessage = {
      id: userMessage.id,
      author: "user",
      text: promptForModel,
      createdAt: now,
      tokens: Math.max(24, Math.ceil(promptForModel.length / 4)),
    };

    set((state) => ({
      agentDialogOpen: true,
      agentDialogBusy: true,
      agentDialogAgentId: targetAgent.id,
      agentDialogMessages: echoUser ? [...state.agentDialogMessages, userMessage] : state.agentDialogMessages,
      agents: state.agents.map((agent) => ({
        ...agent,
        status: agent.id === targetAgent.id ? (agent.tools.includes("mcp") ? "mcp" : "typing") : agent.status,
      })),
    }));

    let answerText: string;
    let tokens = 0;
    let attempts: CompletionAttempt[] = [];
    const actions: MessageAction[] = [];
    try {
      const agentWithMcpContext = targetAgent.tools.includes("mcp")
        ? { ...targetAgent, systemPrompt: targetAgent.systemPrompt + "\n\n" + formatMcpToolsForPrompt(mcpServers) }
        : targetAgent;
      const completion = await completeWithModelFallback(
        providers,
        agentWithMcpContext,
        [...session.messages, modelUserMessage],
        "planning",
        appSettings.modelFallbackEnabled,
      );
      attempts = completion.attempts;
      const notice = fallbackNotice(attempts);
      if (notice) actions.push({ kind: "fallback", label: "Смена модели", detail: notice });
      if (targetAgent.tools.includes("mcp")) actions.push({ kind: "search", label: "\u0417\u0430\u043f\u0440\u043e\u0441 \u0447\u0435\u0440\u0435\u0437 MCP" });
      actions.push({ kind: "plan", label: "Вопрос к главному" });
      answerText = notice ? notice + "\n\n" + completion.result.text : completion.result.text;
      tokens = Math.max(completion.result.tokens, Math.ceil(answerText.length / 4));
    } catch (error) {
      if (error instanceof ModelFallbackError) {
        attempts = error.attempts;
      } else if (error instanceof Error && !attempts.length) {
        attempts = completionCandidates(targetAgent, providers, appSettings.modelFallbackEnabled).slice(0, 1).map((candidate) => ({
          providerId: candidate.provider.id,
          providerName: candidate.provider.name,
          modelId: candidate.modelId,
          modelLabel: modelLabel(candidate.provider, candidate.modelId),
          ok: false,
          error: summarizeAttemptError(error),
        }));
      }
      answerText = "\u041e\u0448\u0438\u0431\u043a\u0430 API: " + (error instanceof Error ? error.message : String(error));
      tokens = Math.max(24, Math.ceil(answerText.length / 4));
      actions.push({ kind: "error", label: "\u041e\u0448\u0438\u0431\u043a\u0430 API", detail: summarizeAttemptError(error) });
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
            error: attempt.error,
          }), provider);
        });
        persistProviders(providers);
        return { providers };
      });
    }

    const answer: AgentDialogMessage = {
      id: "agent-dialog-answer-" + Date.now() + "-" + targetAgent.id,
      author: "agent",
      agentId: targetAgent.id,
      agentRole: targetAgent.role,
      text: answerText,
      createdAt: new Date().toISOString(),
      tokens,
      tool: targetAgent.tools.includes("mcp") ? "mcp" : undefined,
      actions: actions.length ? actions : undefined,
    };

    set((state) => ({
      agentDialogBusy: false,
      agentDialogMessages: [...state.agentDialogMessages, answer],
      agents: state.agents.map((agent) => agent.id === targetAgent.id ? { ...agent, status: "done" } : agent),
    }));

    const nextQueuedQuestion = get().queuedAgentQuestions[0];
    if (nextQueuedQuestion && !get().busy && !get().autoRunning) {
      set((state) => ({ queuedAgentQuestions: state.queuedAgentQuestions.filter((item) => item.id !== nextQueuedQuestion.id) }));
      await get().runAgentDialogQuestion(nextQueuedQuestion.text, nextQueuedQuestion.targetAgentId, false);
    }
  },
  enqueueAgentQuestion: async (text, targetAgentId) => {
    const trimmed = text.trim();
    if (!trimmed || !get().activeSessionId) return;
    const state = get();
    const projectQuestionMode = isProjectQuestionMode({
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      artifact: state.artifact,
    });
    const mainAgent = resolveMainAgent(state.agents, state.appSettings);
    const targetId = projectQuestionMode ? mainAgent?.id : targetAgentId || state.appSettings.operatorDefaultAgentId;
    const targetAgent = state.agents.find((agent) => agent.id === targetId);
    if (get().busy || get().autoRunning || get().agentDialogBusy) {
      const question: QueuedAgentQuestion = {
        id: "queued-" + Date.now(),
        text: trimmed,
        mode: get().activeRunMode ?? "planning",
        targetAgentId: targetId,
        createdAt: new Date().toISOString(),
      };
      const visiblePrompt = targetAgent ? `@${targetAgent.name}: ${trimmed}` : trimmed;
      const dialogMessage: AgentDialogMessage = {
        id: "agent-dialog-user-" + Date.now(),
        author: "user",
        agentId: targetId,
        text: visiblePrompt,
        createdAt: question.createdAt,
        tokens: Math.max(24, Math.ceil(visiblePrompt.length / 4)),
      };
      set((state) => ({
        agentDialogOpen: true,
        agentDialogAgentId: targetId,
        queuedAgentQuestions: [...state.queuedAgentQuestions, question],
        agentDialogMessages: [...state.agentDialogMessages, dialogMessage],
      }));
      return;
    }
    await get().runAgentDialogQuestion(trimmed, targetId);
  },
  clearQueuedAgentQuestion: (questionId) => set((state) => ({
    queuedAgentQuestions: state.queuedAgentQuestions.filter((question) => question.id !== questionId),
  })),
  setAgentDialogOpen: (open) => set({ agentDialogOpen: open }),
  clearAgentDialog: () => set({ agentDialogMessages: [], agentDialogOpen: false, agentDialogAgentId: undefined }),
  updateArtifact: (patch) => set((state) => {
    const stepsChanged = patch.steps !== undefined;
    const planChanged = stepsChanged || patch.stack !== undefined;
    const artifact: PlanArtifact = {
      ...state.artifact,
      ...patch,
      status: patch.status ?? (planChanged ? "draft" : state.artifact.status),
      edited: true,
    };
    const implementationChecklist = stepsChanged ? buildChecklist(artifact.steps) : state.implementationChecklist;
    const lastRunFilesWritten = planChanged ? undefined : state.lastRunFilesWritten;
    const session = state.activeSessionId
      ? withSessionProgress(state.session, artifact, implementationChecklist, lastRunFilesWritten, state.lastBuild)
      : state.session;
    const sessions = state.activeSessionId ? replaceSession(state.sessions, session) : state.sessions;
    if (state.activeSessionId) persistSessions(sessions);
    return {
      artifact,
      implementationChecklist,
      lastRunFilesWritten,
      session,
      sessions,
    };
  }),
  selectWorkspaceFolder: async () => {
    const selected = await pickWorkspaceFolder(get().workspacePath);
    if (!selected) return undefined;
    persistWorkspacePath(selected);
    set({ workspacePath: selected });
    return selected;
  },
  openExistingWorkspaceProject: async () => {
    if (get().busy) return undefined;

    const selected = await pickWorkspaceFolder(get().workspacePath);
    if (!selected) return undefined;

    persistWorkspacePath(selected);
    set({ workspacePath: selected, busy: true });

    try {
      const result = await initWorkspaceFiles(selected);
      const discoveredFiles = await listWorkspaceFiles(result.rootPath).catch(() => result.files);
      set((state) => {
        const project = createProjectConfig(
          state.projects.length,
          workspaceTitleFromPath(result.rootPath, state.projects.length),
          "active",
        );
        const baseSession = createSessionConfig(project.id, 0);
        const session = withAgentPromptMessage(
          withSystemMessage(baseSession, existingWorkspaceIntro(result, discoveredFiles)),
          existingWorkspaceQuestion(result.rootPath),
        );
        const projects = [project, ...state.projects];
        const sessions = [session, ...state.sessions];
        persistProjects(projects);
        persistSessions(sessions);
        persistActiveIds(project.id, session.id);
        return {
          busy: false,
          workspacePath: result.rootPath,
          lastWorkspaceInit: result,
          projects,
          sessions,
          activeProjectId: project.id,
          activeSessionId: session.id,
          session,
          artifact: progressFromSession(session, project).artifact,
          implementationChecklist: [],
          lastBuild: undefined,
          lastRunFilesWritten: undefined,
          screen: "chat",
        };
      });
      persistWorkspacePath(result.rootPath);
      return result;
    } catch (error) {
      set({ busy: false });
      throw error;
    }
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
      const nextArtifact = confirmed ? { ...state.artifact, status: "scaffolded" as const } : state.artifact;
      const session = state.activeSessionId
        ? withSessionProgress(state.session, nextArtifact, state.implementationChecklist, state.lastRunFilesWritten, result)
        : state.session;
      const sessions = state.activeSessionId ? replaceSession(state.sessions, session) : state.sessions;
      if (confirmed) persistProjects(projects);
      if (state.activeSessionId) persistSessions(sessions);
      return {
        busy: false,
        lastBuild: result,
        projects,
        artifact: nextArtifact,
        session,
        sessions,
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
      const nextArtifact = { ...state.artifact, status: "scaffolded" as const };
      const session = activeSessionId
        ? withSessionProgress(withSystemMessage(state.session, intro), nextArtifact, state.implementationChecklist, state.lastRunFilesWritten, result)
        : state.session;
      const sessions = activeSessionId ? replaceSession(state.sessions, session) : state.sessions;
      if (activeSessionId) persistSessions(sessions);

      return {
        busy: false,
        lastBuild: result,
        projects,
        session,
        sessions,
        artifact: nextArtifact,
      };
    });
  },
  startAgentImplementation: async () => {
    if (get().busy || !get().activeSessionId) return;
    if (!checklistMatchesSteps(get().artifact.steps, get().implementationChecklist)) {
      set((state) => {
        const implementationChecklist = buildChecklist(state.artifact.steps);
        const session = withSessionProgress(state.session, state.artifact, implementationChecklist, state.lastRunFilesWritten, state.lastBuild);
        const sessions = replaceSession(state.sessions, session);
        persistSessions(sessions);
        return { implementationChecklist, session, sessions };
      });
    }

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

    const runStartedAt = new Date().toISOString();
    set({ busy: true, activeRunMode: "implementation", activeWorkStartedAt: get().activeWorkStartedAt ?? runStartedAt });
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
        const finishedAt = Date.now();
        const startedAt = state.activeWorkStartedAt ? Date.parse(state.activeWorkStartedAt) : Date.parse(runStartedAt);
        const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, finishedAt - startedAt) : 0;
        const projectWorkTimers = {
          ...state.projectWorkTimers,
          [state.activeProjectId]: (state.projectWorkTimers[state.activeProjectId] ?? 0) + elapsedMs,
        };
        const nextArtifact = { ...state.artifact, status: "scaffolded" as const };
        const session = withSessionProgress(
          withSystemMessage(state.session, savedNote),
          nextArtifact,
          state.implementationChecklist,
          state.lastRunFilesWritten,
          result,
        );
        const sessions = replaceSession(state.sessions, session);
        const now = new Date().toISOString();
        const projects = state.projects.map((project) => project.id === state.activeProjectId
          ? { ...project, status: "active" as const, updatedAt: now }
          : project);
        persistSessions(sessions);
        persistProjects(projects);
        persistProjectWorkTimers(projectWorkTimers);
        return {
          busy: false,
          activeRunMode: undefined,
          activeWorkStartedAt: undefined,
          screen: "chat",
          lastBuild: result,
          liveFileActivity: [
            ...result.files.slice(0, 8).map((path) => ({
              id: "file-" + Date.now() + "-" + path,
              agentName: "Project Builder",
              path,
              action: "create" as const,
              status: "written" as const,
              updatedAt: new Date().toISOString(),
            })),
            {
              id: "file-" + Date.now() + "-IMPLEMENTATION.md",
              agentName: "Project Builder",
              path: "IMPLEMENTATION.md",
              action: "plan" as const,
              status: "written" as const,
              updatedAt: new Date().toISOString(),
            },
            {
              id: "file-" + Date.now() + "-docs/agent-tasks.md",
              agentName: "Project Builder",
              path: "docs/agent-tasks.md",
              action: "plan" as const,
              status: "written" as const,
              updatedAt: new Date().toISOString(),
            },
          ],
          projectWorkTimers,
          projects,
          session,
          sessions,
          artifact: nextArtifact,
        };
      });

      await get().runTeam(IMPLEMENTATION_ROUND_PROMPT, "implementation");
      if (!get().autoRunning) {
        await get().continueAutoImplementation();
        return;
      }
    } catch (error) {
      set((state) => {
        const text = "Ошибка запуска реализации: " + (error instanceof Error ? error.message : String(error));
        const session = withSessionProgress(
          withSystemMessage(state.session, text),
          state.artifact,
          state.implementationChecklist,
          state.lastRunFilesWritten,
          state.lastBuild,
        );
        const sessions = replaceSession(state.sessions, session);
        persistSessions(sessions);
        return { busy: false, activeRunMode: undefined, activeWorkStartedAt: undefined, session, sessions };
      });
    }
  },
  verifyImplementationChecklist: async () => {
    const { artifact, agents, providers, appSettings, workspacePath } = get();
    const steps = artifact.steps;
    if (!steps.length) {
      set((state) => {
        const session = withSessionProgress(state.session, state.artifact, [], state.lastRunFilesWritten, state.lastBuild);
        const sessions = replaceSession(state.sessions, session);
        persistSessions(sessions);
        return { implementationChecklist: [], session, sessions };
      });
      return [];
    }

    const files = workspacePath ? await listWorkspaceFiles(workspacePath).catch(() => []) : [];
    // Deterministic baseline: always terminates the loop once the project is
    // genuinely built, even if the verifier model is unavailable.
    let readyStatus: ProjectReadinessStatus = "unknown";
    let evidenceContents: Record<string, string> = {};
    if (workspacePath && files.length) {
      try {
        const stubFiles = await detectScaffoldStubFiles(workspacePath, files);
        readyStatus = validateProjectCompleteness(artifact, files, undefined, stubFiles).status;
        evidenceContents = await buildChecklistEvidenceContents(workspacePath, files);
      } catch {
        readyStatus = "unknown";
      }
    }
    const fallback = heuristicChecklist(steps, files, readyStatus, evidenceContents);

    // Prefer a non-coding reviewer to judge acceptance; fall back to any agent.
    const verifier = agents.find((agent) => agent.role === "arbiter")
      ?? agents.find((agent) => agent.role === "tester")
      ?? agents.find((agent) => agent.role === "critic")
      ?? agents.find((agent) => agent.role !== "coder")
      ?? agents[0];

    let merged = fallback;
    if (verifier && workspacePath) {
      try {
        const snapshot = await buildWorkspaceSnapshot(workspacePath);
        const prompt = renderVerificationPrompt(steps);
        const now = new Date().toISOString();
        const context: ChatMessage[] = [
          ...(snapshot ? [{ id: "verify-snapshot-" + Date.now(), author: "user" as const, text: snapshot, createdAt: now, tokens: Math.ceil(snapshot.length / 4) }] : []),
          { id: "verify-plan-" + Date.now(), author: "user" as const, text: prompt, createdAt: now, tokens: Math.ceil(prompt.length / 4) },
        ];
        // Analysis pass, not file writing → planning mode so the provider does
        // not inject "return file blocks" instructions.
        const completion = await completeWithModelFallback(providers, verifier, context, "planning", appSettings.modelFallbackEnabled);
        const verdicts = parseChecklistVerdict(completion.result.text, steps);
        merged = mergeChecklist(steps, verdicts, fallback);
      } catch {
        // Verifier failed → keep the deterministic baseline. Never abort the run.
        merged = fallback;
      }
    }

    set((state) => {
      const session = withSessionProgress(state.session, state.artifact, merged, state.lastRunFilesWritten, state.lastBuild);
      const sessions = replaceSession(state.sessions, session);
      persistSessions(sessions);
      return { implementationChecklist: merged, session, sessions };
    });
    return merged;
  },
}));
