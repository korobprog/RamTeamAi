import { describe, expect, it } from "vitest";
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  applyProviderHealth,
  classifyProviderHealth,
  checkpointIsStale,
  createAgentCheckpoint,
  partialCheckpoint,
  providerCanReceiveTraffic,
  recoverCheckpoint,
  selectRecoveryAgent,
} from "../healthSupervisor";
import type { AgentConfig, ProviderConfig } from "../../types";

const provider: ProviderConfig = {
  id: "p1",
  name: "Provider 1",
  kind: "custom",
  baseUrl: "https://example.test/v1",
  auth: "none",
  stream: "none",
  models: [{ id: "m1", label: "M1", capabilities: { streaming: false, toolUse: false, vision: false, maxContext: 1_000 } }],
  status: "connected",
  capabilities: { streaming: false, toolUse: false, vision: false, maxContext: 1_000 },
};

const agent = (id: string, providerId = "p1", role: AgentConfig["role"] = "coder"): AgentConfig => ({
  id,
  name: id,
  role,
  providerId,
  modelId: "m1",
  systemPrompt: "",
  tokenBudget: 1_000,
  tools: [],
  status: "waiting",
});

describe("healthSupervisor", () => {
  it("opens circuit breaker after consecutive provider failures", () => {
    let current = provider;
    for (let i = 0; i < CIRCUIT_BREAKER_FAILURE_THRESHOLD; i += 1) {
      current = applyProviderHealth(current, { ok: false, error: "timeout", now: 1_000 + i });
    }

    expect(current.monitoring?.healthStatus).toBe("down");
    expect(current.monitoring?.consecutiveFailures).toBe(CIRCUIT_BREAKER_FAILURE_THRESHOLD);
    expect(current.monitoring?.circuitOpenUntil).toBeTruthy();
    expect(providerCanReceiveTraffic(current, 2_000)).toBe(false);
  });

  it("closes circuit and marks OK on successful check", () => {
    const failed = applyProviderHealth(provider, { ok: false, error: "429 rate limit", now: 1_000 });
    const recovered = applyProviderHealth(failed, { ok: true, latencyMs: 42, now: 2_000 });

    expect(recovered.monitoring?.healthStatus).toBe("ok");
    expect(recovered.monitoring?.consecutiveFailures).toBe(0);
    expect(recovered.monitoring?.lastOkAt).toBe(new Date(2_000).toISOString());
    expect(providerCanReceiveTraffic(recovered, 2_500)).toBe(true);
  });

  it("allows traffic only to connected green providers", () => {
    expect(providerCanReceiveTraffic(provider)).toBe(true);
    expect(providerCanReceiveTraffic({ ...provider, status: "warning" })).toBe(false);
    expect(providerCanReceiveTraffic({ ...provider, status: "not-configured" })).toBe(false);
  });

  it("classifies local connection failures as down", () => {
    expect(classifyProviderHealth({ ok: false, error: "request failed: error sending request for url (http://localhost:11434/api/chat)" })).toBe("down");
  });

  it("recovers stale checkpoint with replacement agent", () => {
    const checkpoint = createAgentCheckpoint({ runId: "r1", agent: agent("a1"), mode: "implementation", step: "write", leaseTimeoutSec: 1, now: 1_000 });
    expect(checkpointIsStale(checkpoint, 2_500)).toBe(true);

    const replacement = agent("a2");
    const recovered = recoverCheckpoint(checkpoint, replacement, 30, 3_000);

    expect(recovered.status).toBe("recovered");
    expect(recovered.leaseOwner).toBe("a2");
    expect(recovered.replacementAgentId).toBe("a2");
    expect(recovered.attempts).toBe(2);
  });

  it("selects same-role healthy recovery agent first", () => {
    const backupProvider = { ...provider, id: "p2" };
    const selected = selectRecoveryAgent({
      failedAgent: agent("failed", "p1", "coder"),
      agents: [agent("failed", "p1", "coder"), agent("critic", "p2", "critic"), agent("coder2", "p2", "coder")],
      providers: [provider, backupProvider],
    });

    expect(selected?.id).toBe("coder2");
  });

  it("skips agents that already failed in the same recovery chain", () => {
    const backupProvider = { ...provider, id: "p2" };
    const selected = selectRecoveryAgent({
      failedAgent: agent("failed", "p1", "coder"),
      agents: [
        agent("failed", "p1", "coder"),
        agent("coder2", "p2", "coder"),
        agent("coder3", "p2", "coder"),
      ],
      providers: [provider, backupProvider],
      excludedAgentIds: ["failed", "coder2"],
    });

    expect(selected?.id).toBe("coder3");
  });

  it("falls back to partial checkpoint when replacements are exhausted", () => {
    const checkpoint = createAgentCheckpoint({ runId: "r1", agent: agent("a1"), mode: "implementation", step: "write", now: 1_000 });
    const partial = partialCheckpoint(checkpoint, "no healthy replacement", 2_000);

    expect(partial.status).toBe("partial");
    expect(partial.failureReason).toBe("no healthy replacement");
    expect(partial.updatedAt).toBe(new Date(2_000).toISOString());
  });
});
