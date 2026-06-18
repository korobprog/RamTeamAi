import type {
  AgentConfig,
  AgentRunCheckpoint,
  AgentRunMode,
  ProviderConfig,
  ProviderHealthStatus,
} from "../types";

export const DEFAULT_AGENT_LEASE_TIMEOUT_SEC = 90;
export const DEFAULT_PROVIDER_HEALTH_INTERVAL_SEC = 60;
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
export const CIRCUIT_BREAKER_COOLDOWN_MS = 2 * 60 * 1000;

export interface HealthPatch {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  now?: number;
}

export function classifyProviderHealth(input: { ok: boolean; error?: string; statusCode?: number }): ProviderHealthStatus {
  if (input.ok) return "ok";
  const text = (input.error ?? "").toLowerCase();
  const statusCode = input.statusCode;
  if (statusCode === 401 || statusCode === 403 || /auth|unauthorized|forbidden|api key|ключ/.test(text)) return "auth-error";
  if (statusCode === 429 || /rate.?limit|too many requests|quota|429/.test(text)) return "rate-limited";
  if (/timeout|network|failed to fetch|did not respond|error sending request|request failed|dns|connection|connect|econnrefused|abort/.test(text)) return "down";
  return "degraded";
}

export function isCircuitOpen(provider: ProviderConfig, now = Date.now()): boolean {
  const until = provider.monitoring?.circuitOpenUntil;
  return Boolean(until && Date.parse(until) > now);
}

export function providerCanReceiveTraffic(provider: ProviderConfig, now = Date.now()): boolean {
  if (provider.status !== "connected") return false;
  if (isCircuitOpen(provider, now)) return false;
  const health = provider.monitoring?.healthStatus;
  return health === undefined || health === "unknown" || health === "ok";
}

export function applyProviderHealth(provider: ProviderConfig, patch: HealthPatch): ProviderConfig {
  const now = patch.now ?? Date.now();
  const updatedAt = new Date(now).toISOString();
  const previous = provider.monitoring;
  const previousFailures = previous?.consecutiveFailures ?? 0;
  const healthStatus = classifyProviderHealth({ ok: patch.ok, error: patch.error });
  const consecutiveFailures = patch.ok ? 0 : previousFailures + 1;
  const circuitOpenUntil = !patch.ok && consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD
    ? new Date(now + CIRCUIT_BREAKER_COOLDOWN_MS).toISOString()
    : patch.ok
      ? undefined
      : previous?.circuitOpenUntil;

  return {
    ...provider,
    status: provider.status === "not-configured" ? provider.status : patch.ok ? "connected" : "warning",
    latencyMs: patch.latencyMs ?? provider.latencyMs,
    monitoring: {
      enabled: previous?.enabled ?? true,
      refreshIntervalMin: previous?.refreshIntervalMin ?? (provider.kind === "ollama" ? 1 : 10),
      updatedAt,
      requestCount: previous?.requestCount ?? 0,
      errorCount: previous?.errorCount ?? 0,
      tokensUsed: previous?.tokensUsed ?? 0,
      healthStatus,
      consecutiveFailures,
      circuitOpenUntil,
      lastOkAt: patch.ok ? updatedAt : previous?.lastOkAt,
      lastError: patch.ok ? undefined : patch.error,
    },
  };
}

export function createAgentCheckpoint(input: {
  runId: string;
  agent: AgentConfig;
  mode: AgentRunMode;
  step: string;
  leaseTimeoutSec?: number;
  now?: number;
}): AgentRunCheckpoint {
  const now = input.now ?? Date.now();
  const leaseTimeoutSec = input.leaseTimeoutSec ?? DEFAULT_AGENT_LEASE_TIMEOUT_SEC;
  const iso = new Date(now).toISOString();
  return {
    id: `${input.runId}:${input.agent.id}:${now}`,
    runId: input.runId,
    agentId: input.agent.id,
    mode: input.mode,
    leaseOwner: input.agent.id,
    leaseExpiresAt: new Date(now + leaseTimeoutSec * 1000).toISOString(),
    heartbeatAt: iso,
    status: "active",
    step: input.step,
    providerId: input.agent.providerId,
    modelId: input.agent.modelId,
    attempts: 1,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function heartbeatCheckpoint(checkpoint: AgentRunCheckpoint, leaseTimeoutSec = DEFAULT_AGENT_LEASE_TIMEOUT_SEC, now = Date.now()): AgentRunCheckpoint {
  const iso = new Date(now).toISOString();
  return {
    ...checkpoint,
    heartbeatAt: iso,
    leaseExpiresAt: new Date(now + leaseTimeoutSec * 1000).toISOString(),
    updatedAt: iso,
  };
}

export function checkpointIsStale(checkpoint: AgentRunCheckpoint, now = Date.now()): boolean {
  return Date.parse(checkpoint.leaseExpiresAt) <= now;
}

export function recoverCheckpoint(
  checkpoint: AgentRunCheckpoint,
  replacementAgent: AgentConfig,
  leaseTimeoutSec = DEFAULT_AGENT_LEASE_TIMEOUT_SEC,
  now = Date.now(),
): AgentRunCheckpoint {
  const iso = new Date(now).toISOString();
  return {
    ...checkpoint,
    replacementAgentId: replacementAgent.id,
    leaseOwner: replacementAgent.id,
    leaseExpiresAt: new Date(now + leaseTimeoutSec * 1000).toISOString(),
    heartbeatAt: iso,
    status: "recovered",
    providerId: replacementAgent.providerId,
    modelId: replacementAgent.modelId,
    attempts: checkpoint.attempts + 1,
    recoveredAt: iso,
    updatedAt: iso,
  };
}

export function failCheckpoint(checkpoint: AgentRunCheckpoint, error: string, now = Date.now()): AgentRunCheckpoint {
  return {
    ...checkpoint,
    status: "failed",
    error,
    failureReason: error,
    updatedAt: new Date(now).toISOString(),
  };
}

export function partialCheckpoint(checkpoint: AgentRunCheckpoint, reason: string, now = Date.now()): AgentRunCheckpoint {
  return {
    ...checkpoint,
    status: "partial",
    error: reason,
    failureReason: reason,
    updatedAt: new Date(now).toISOString(),
  };
}

export function selectRecoveryAgent(input: {
  failedAgent: AgentConfig;
  agents: AgentConfig[];
  providers: ProviderConfig[];
  excludedAgentIds?: Iterable<string>;
  now?: number;
}): AgentConfig | undefined {
  const providerById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const excluded = new Set(input.excludedAgentIds ?? []);
  excluded.add(input.failedAgent.id);
  const canRun = (agent: AgentConfig) => {
    const provider = providerById.get(agent.providerId);
    return !excluded.has(agent.id) && provider ? providerCanReceiveTraffic(provider, input.now) : false;
  };
  const sameRole = input.agents.find((agent) => agent.role === input.failedAgent.role && canRun(agent));
  if (sameRole) return sameRole;
  const coder = input.agents.find((agent) => agent.role === "coder" && canRun(agent));
  if (coder) return coder;
  return input.agents.find((agent) => canRun(agent));
}
