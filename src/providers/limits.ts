import type { ProviderConfig, ProviderMonitoringConfig } from "../types";

export interface ProviderLimitWindowConfig {
  id: "short" | "long";
  label: string;
  durationMs: number;
  tokenLimit: number;
  requestLimit: number;
}

export interface ProviderLimitSnapshotWindow extends ProviderLimitWindowConfig {
  startedAt: string;
  resetsAt: string;
  tokensUsed: number;
  requestsUsed: number;
  tokenRemaining: number;
  requestRemaining: number;
  usedPercent: number;
  remainingPercent: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_LIMITS: ProviderLimitWindowConfig[] = [
  { id: "short", label: "4ч", durationMs: 4 * HOUR_MS, tokenLimit: 600_000, requestLimit: 120 },
  { id: "long", label: "7д", durationMs: 7 * DAY_MS, tokenLimit: 3_000_000, requestLimit: 900 },
];

const PROVIDER_LIMITS: Partial<Record<ProviderConfig["kind"], ProviderLimitWindowConfig[]>> = {
  anthropic: [
    { id: "short", label: "1м", durationMs: MINUTE_MS, tokenLimit: 80_000, requestLimit: 50 },
    { id: "long", label: "1д", durationMs: DAY_MS, tokenLimit: 1_500_000, requestLimit: 1_500 },
  ],
  openai: [
    { id: "short", label: "1м", durationMs: MINUTE_MS, tokenLimit: 120_000, requestLimit: 60 },
    { id: "long", label: "1д", durationMs: DAY_MS, tokenLimit: 2_000_000, requestLimit: 2_000 },
  ],
  gemini: [
    { id: "short", label: "1м", durationMs: MINUTE_MS, tokenLimit: 100_000, requestLimit: 60 },
    { id: "long", label: "1д", durationMs: DAY_MS, tokenLimit: 1_800_000, requestLimit: 1_500 },
  ],
  RamTeamAi: [
    { id: "short", label: "4ч", durationMs: 4 * HOUR_MS, tokenLimit: 700_000, requestLimit: 160 },
    { id: "long", label: "7д", durationMs: 7 * DAY_MS, tokenLimit: 4_000_000, requestLimit: 1_100 },
  ],
};

export function providerHasApiAccess(provider: ProviderConfig): boolean {
  return provider.auth === "none" || provider.status !== "not-configured" || Boolean(provider.keyRef || provider.maskedKey);
}

export function providerWorks(provider: ProviderConfig): boolean {
  const health = provider.monitoring?.healthStatus;
  return provider.auth === "none" || health === "ok" || (provider.status === "connected" && health !== "down" && health !== "auth-error" && health !== "rate-limited");
}

export function providerAccessLabel(provider: ProviderConfig): string {
  if (provider.auth === "none") return "локально";
  if (!providerHasApiAccess(provider)) return "нет ключа";
  if (providerWorks(provider)) return "работает";
  return "ключ есть";
}

export function getProviderLimitWindows(provider: ProviderConfig): ProviderLimitWindowConfig[] {
  if (provider.auth === "none") return [];
  return PROVIDER_LIMITS[provider.kind] ?? DEFAULT_LIMITS;
}

function validDateOrNow(iso: string | undefined, now: number): number {
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : now;
}

function rollWindowStart(startedAt: string | undefined, durationMs: number, now: number): string {
  const startedMs = validDateOrNow(startedAt, now);
  if (now - startedMs >= durationMs || startedMs > now) return new Date(now).toISOString();
  return new Date(startedMs).toISOString();
}

function windowUsage(
  provider: ProviderConfig,
  window: ProviderLimitWindowConfig,
  now: number,
): Pick<ProviderLimitSnapshotWindow, "startedAt" | "resetsAt" | "tokensUsed" | "requestsUsed" | "tokenRemaining" | "requestRemaining" | "usedPercent" | "remainingPercent"> {
  const monitoring = provider.monitoring;
  const isShort = window.id === "short";
  const storedId = isShort ? monitoring?.quotaShortWindowId : monitoring?.quotaLongWindowId;
  const storedStartedAt = storedId === window.id
    ? isShort ? monitoring?.quotaShortStartedAt : monitoring?.quotaLongStartedAt
    : undefined;
  const startedAt = rollWindowStart(storedStartedAt, window.durationMs, now);
  const justReset = startedAt !== storedStartedAt;
  const tokensUsed = justReset ? 0 : Math.max(0, isShort ? monitoring?.quotaShortTokensUsed ?? 0 : monitoring?.quotaLongTokensUsed ?? 0);
  const requestsUsed = justReset ? 0 : Math.max(0, isShort ? monitoring?.quotaShortRequestCount ?? 0 : monitoring?.quotaLongRequestCount ?? 0);
  const tokenRemaining = Math.max(0, window.tokenLimit - tokensUsed);
  const requestRemaining = Math.max(0, window.requestLimit - requestsUsed);
  const usedRatio = Math.max(tokensUsed / window.tokenLimit, requestsUsed / window.requestLimit);
  const usedPercent = Math.min(100, Math.round(usedRatio * 100));

  return {
    startedAt,
    resetsAt: new Date(Date.parse(startedAt) + window.durationMs).toISOString(),
    tokensUsed,
    requestsUsed,
    tokenRemaining,
    requestRemaining,
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
  };
}

export function getProviderLimitSnapshot(provider: ProviderConfig, now = Date.now()): ProviderLimitSnapshotWindow[] {
  return getProviderLimitWindows(provider).map((window) => ({
    ...window,
    ...windowUsage(provider, window, now),
  }));
}

export function applyProviderQuotaUsage(
  provider: ProviderConfig,
  monitoring: ProviderMonitoringConfig,
  patch: { tokens?: number; countRequest?: boolean },
  now = Date.now(),
): ProviderMonitoringConfig {
  const windows = getProviderLimitWindows(provider);
  if (!windows.length) return monitoring;

  const tokens = Math.max(0, patch.tokens ?? 0);
  const requestDelta = patch.countRequest === false ? 0 : 1;
  const next: ProviderMonitoringConfig = { ...monitoring };

  for (const window of windows) {
    const isShort = window.id === "short";
    const usage = windowUsage({ ...provider, monitoring }, window, now);
    const tokensUsed = usage.tokensUsed + tokens;
    const requestsUsed = usage.requestsUsed + requestDelta;

    if (isShort) {
      next.quotaShortWindowId = window.id;
      next.quotaShortStartedAt = usage.startedAt;
      next.quotaShortTokensUsed = tokensUsed;
      next.quotaShortRequestCount = requestsUsed;
    } else {
      next.quotaLongWindowId = window.id;
      next.quotaLongStartedAt = usage.startedAt;
      next.quotaLongTokensUsed = tokensUsed;
      next.quotaLongRequestCount = requestsUsed;
    }
  }

  return next;
}

export function formatLimitAmount(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0+$/, "") + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0+$/, "") + "K";
  return String(Math.round(value));
}

