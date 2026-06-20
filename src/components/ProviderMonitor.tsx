import { useEffect, useMemo, useState } from "react";
import { Chip } from "./FRamTeamAie";
import type { ProviderConfig } from "../types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatTokenAmount(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0$/, "") + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0$/, "") + "K";
  return String(Math.round(value));
}

function formatAge(iso: string | undefined, now: number): string {
  if (!iso) return "нет данных";
  const ageMs = now - Date.parse(iso);
  if (!Number.isFinite(ageMs) || ageMs < MINUTE_MS) return "только что";
  if (ageMs < HOUR_MS) return Math.floor(ageMs / MINUTE_MS) + "м назад";
  if (ageMs < DAY_MS) return Math.floor(ageMs / HOUR_MS) + "ч назад";
  return Math.floor(ageMs / DAY_MS) + "д назад";
}

function statusText(provider: ProviderConfig): string {
  const health = provider.monitoring?.healthStatus;
  if (health === "ok") return "OK";
  if (health === "degraded") return "DEGRADED";
  if (health === "down") return "DOWN";
  if (health === "rate-limited") return "RATE LIMITED";
  if (health === "auth-error") return "AUTH ERROR";
  if (provider.status === "connected") return "online";
  if (provider.status === "warning") return "warning";
  return "no key";
}

function healthTone(provider: ProviderConfig): "default" | "success" | "warning" {
  const health = provider.monitoring?.healthStatus;
  if (health === "ok") return "success";
  if (health === "degraded" || health === "down" || health === "rate-limited" || health === "auth-error") return "warning";
  return provider.status === "connected" ? "success" : provider.status === "warning" ? "warning" : "default";
}


function ProviderMonitorCard({ provider, now, onRefresh }: { provider: ProviderConfig; now: number; onRefresh: (providerId: string) => void }) {
  const monitoring = provider.monitoring;
  const requestCount = monitoring?.requestCount ?? 0;
  const errorRate = requestCount ? Math.round((monitoring!.errorCount / requestCount) * 100) : 0;
  const tokensUsed = monitoring?.tokensUsed ?? 0;
  const hasActivity = requestCount > 0 || tokensUsed > 0;
  const circuitOpen = Boolean(monitoring?.circuitOpenUntil && Date.parse(monitoring.circuitOpenUntil) > now);

  return (
    <article className={"provider-monitor-card " + provider.status}>
      <div className="provider-monitor-head">
        <div>
          <div className="provider-monitor-title">
            <strong>{provider.name}</strong>
            <Chip tone={healthTone(provider)}>{statusText(provider)}</Chip>
          </div>
          <small>обн. {formatAge(monitoring?.updatedAt, now)} · обновление {monitoring?.refreshIntervalMin ?? 10}м</small>
        </div>
        <button className="ghost provider-monitor-refresh" type="button" onClick={() => onRefresh(provider.id)} aria-label={"Обновить мониторинг " + provider.name}>
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
      </div>

      <div className="provider-monitor-metrics">
        <span><i className="ti ti-activity" aria-hidden="true" /> {provider.latencyMs ? provider.latencyMs + " ms" : "ping —"}</span>
        <span><i className="ti ti-exchange" aria-hidden="true" /> {requestCount} req</span>
        <span><i className="ti ti-alert-triangle" aria-hidden="true" /> {errorRate}% err</span>
        <span><i className="ti ti-coin" aria-hidden="true" /> {formatTokenAmount(tokensUsed)} ток.</span>
        {monitoring?.consecutiveFailures ? <span><i className="ti ti-plug-x" aria-hidden="true" /> fail {monitoring.consecutiveFailures}</span> : null}
      </div>

      {circuitOpen ? <small className="provider-monitor-empty">Circuit breaker open until {monitoring?.circuitOpenUntil}.</small> : null}
      {monitoring?.lastError ? <small className="provider-monitor-empty">Последняя ошибка: {monitoring.lastError}</small> : null}

      {!hasActivity ? (
        <small className="provider-monitor-empty">Пока нет запросов — метрики появятся после реального обращения к API.</small>
      ) : null}
    </article>
  );
}

export function ProviderMonitor({ providers, onRefresh }: { providers: ProviderConfig[]; onRefresh: (providerId?: string) => void }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const summary = useMemo(() => {
    const connected = providers.filter((provider) => provider.monitoring?.healthStatus === "ok" || provider.status === "connected").length;
    const ok = providers.filter((provider) => provider.monitoring?.healthStatus === "ok").length;
    const models = providers.reduce((sum, provider) => sum + provider.models.length, 0);
    const latencies = providers.map((provider) => provider.latencyMs).filter((latency): latency is number => typeof latency === "number" && latency > 0);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length) : undefined;
    const requests = providers.reduce((sum, provider) => sum + (provider.monitoring?.requestCount ?? 0), 0);
    return { connected, ok, models, avgLatency, requests };
  }, [providers]);

  return (
    <section className="provider-monitor-panel" aria-label="Мониторинг провайдеров">
      <div className="provider-monitor-toolbar">
        <div>
          <h3>Мониторинг провайдеров</h3>
          <p>Реальная телеметрия по каждому API: запросы, токены, задержка и ошибки.</p>
        </div>
        <button className="ghost" type="button" onClick={() => onRefresh()}>
          <i className="ti ti-refresh" aria-hidden="true" /> обновить все
        </button>
      </div>

      <div className="provider-monitor-summary">
        <div><span>OK / online</span><strong>{summary.ok || summary.connected}/{providers.length}</strong></div>
        <div><span>моделей</span><strong>{summary.models}</strong></div>
        <div><span>средний ping</span><strong>{summary.avgLatency ? summary.avgLatency + " ms" : "—"}</strong></div>
        <div><span>запросов</span><strong>{summary.requests}</strong></div>
      </div>

      <div className="provider-monitor-grid">
        {providers.map((provider) => (
          <ProviderMonitorCard key={provider.id} provider={provider} now={now} onRefresh={onRefresh} />
        ))}
      </div>
    </section>
  );
}
