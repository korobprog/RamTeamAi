import { describe, expect, it } from "vitest";
import { applyProviderQuotaUsage, getProviderLimitSnapshot, providerAccessLabel, providerHasApiAccess } from "../limits";
import type { ProviderConfig, ProviderMonitoringConfig } from "../../types";

const now = Date.parse("2026-06-19T12:00:00.000Z");

function provider(overrides: Partial<ProviderConfig> = {}, monitoring?: Partial<ProviderMonitoringConfig>): ProviderConfig {
  return {
    id: "RamTeamAi",
    name: "Neurogate",
    kind: "RamTeamAi",
    baseUrl: "https://api.example.test/v1",
    auth: "bearer",
    stream: "sse",
    models: [],
    status: "connected",
    capabilities: { streaming: true, toolUse: true, vision: false, maxContext: 200_000 },
    monitoring: {
      enabled: true,
      refreshIntervalMin: 10,
      updatedAt: new Date(now).toISOString(),
      requestCount: 0,
      errorCount: 0,
      tokensUsed: 0,
      healthStatus: "ok",
      ...monitoring,
    },
    ...overrides,
  };
}

describe("provider limits", () => {
  it("tracks short and long quota windows independently", () => {
    const base = provider();
    const monitoring = applyProviderQuotaUsage(base, base.monitoring!, { tokens: 70_000, countRequest: true }, now);
    const snapshots = getProviderLimitSnapshot({ ...base, monitoring }, now);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].label).toBe("4ч");
    expect(snapshots[0].tokensUsed).toBe(70_000);
    expect(snapshots[0].requestsUsed).toBe(1);
    expect(snapshots[1].label).toBe("7д");
    expect(snapshots[1].tokensUsed).toBe(70_000);
  });

  it("resets an expired short window without clearing the long window", () => {
    const startedAt = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    const base = provider({}, {
      quotaShortWindowId: "short",
      quotaShortStartedAt: startedAt,
      quotaShortTokensUsed: 10_000,
      quotaShortRequestCount: 4,
      quotaLongWindowId: "long",
      quotaLongStartedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      quotaLongTokensUsed: 50_000,
      quotaLongRequestCount: 9,
    });

    const monitoring = applyProviderQuotaUsage(base, base.monitoring!, { tokens: 1_000, countRequest: true }, now);

    expect(monitoring.quotaShortTokensUsed).toBe(1_000);
    expect(monitoring.quotaShortRequestCount).toBe(1);
    expect(monitoring.quotaLongTokensUsed).toBe(51_000);
    expect(monitoring.quotaLongRequestCount).toBe(10);
  });

  it("labels providers with and without usable keys", () => {
    expect(providerHasApiAccess(provider({ status: "not-configured" }))).toBe(false);
    expect(providerAccessLabel(provider({ status: "warning", maskedKey: "sk-•••" }, { healthStatus: "degraded" }))).toBe("ключ есть");
    expect(providerAccessLabel(provider())).toBe("работает");
    expect(providerAccessLabel(provider({ kind: "ollama", auth: "none", status: "warning" }))).toBe("локально");
  });
});

