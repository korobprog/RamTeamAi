import { useEffect, useMemo, useState } from "react";
import { Chip } from "./FRamTeamAie";
import type { ProviderConfig, ProviderQuotaWindow } from "../types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatTokenAmount(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2).replace(/\.0$/, "") + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 1 : 2).replace(/\.0$/, "") + "K";
  return String(Math.round(value));
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "сейчас";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.max(0, Math.floor((ms % HOUR_MS) / MINUTE_MS));
  if (days > 0) return days + "д " + hours + "ч";
  if (hours > 0) return hours + "ч " + minutes + "м";
  return minutes + "м";
}

function formatAge(iso: string | undefined, now: number): string {
  if (!iso) return "нет данных";
  const ageMs = now - Date.parse(iso);
  if (!Number.isFinite(ageMs) || ageMs < MINUTE_MS) return "только что";
  if (ageMs < HOUR_MS) return Math.floor(ageMs / MINUTE_MS) + "м назад";
  if (ageMs < DAY_MS) return Math.floor(ageMs / HOUR_MS) + "ч назад";
  return Math.floor(ageMs / DAY_MS) + "д назад";
}

function quotaState(window: ProviderQuotaWindow): { remaining: number; percent: number; tone: "ok" | "warning" | "danger" } {
  const limit = Math.max(1, window.limitTokens);
  const remaining = Math.max(0, limit - Math.max(0, window.usedTokens));
  const percent = Math.max(0, Math.min(100, (remaining / limit) * 100));
  return {
    remaining,
    percent,
    tone: percent < 15 ? "danger" : percent < 35 ? "warning" : "ok",
  };
}

function statusText(provider: ProviderConfig): string {
  if (provider.status === "connected") return "онлайн";
  if (provider.status === "warning") return "проверить";
  return "нет ключа";
}

function ProviderQuotaRow({ window, now }: { window: ProviderQuotaWindow; now: number }) {
  const state = quotaState(window);
  return (
    <div className={"provider-quota-row " + state.tone}>
      <div className="provider-quota-line">
        <span>{window.label}</span>
        <span>остаток <strong>{formatTokenAmount(state.remaining)}</strong></span>
        <span>{formatDuration(Date.parse(window.resetsAt) - now)}</span>
      </div>
      <div className="provider-quota-track" aria-label={"Остаток " + window.label}>
        <i style={{ width: state.percent + "%" }} />
      </div>
    </div>
  );
}

function ProviderMonitorCard({ provider, now, onRefresh }: { provider: ProviderConfig; now: number; onRefresh: (providerId: string) => void }) {
  const monitoring = provider.monitoring;
  const errorRate = monitoring?.requestCount ? Math.round((monitoring.errorCount / monitoring.requestCount) * 100) : 0;
  const windows = monitoring?.windows ?? [];

  return (
    <article className={"provider-monitor-card " + provider.status}>
      <div className="provider-monitor-head">
        <div>
          <div className="provider-monitor-title">
            <strong>{provider.name}</strong>
            <Chip tone={provider.status === "connected" ? "success" : provider.status === "warning" ? "warning" : "default"}>{statusText(provider)}</Chip>
          </div>
          <small>обн. {formatAge(monitoring?.updatedAt, now)} · {monitoring?.refreshIntervalMin ?? 10}м</small>
        </div>
        <button className="ghost provider-monitor-refresh" type="button" onClick={() => onRefresh(provider.id)} aria-label={"Обновить мониторинг " + provider.name}>
          <i className="ti ti-refresh" aria-hidden="true" />
        </button>
      </div>

      <div className="provider-monitor-metrics">
        <span><i className="ti ti-activity" aria-hidden="true" /> {provider.latencyMs ? provider.latencyMs + " ms" : "ping —"}</span>
        <span><i className="ti ti-exchange" aria-hidden="true" /> {monitoring?.requestCount ?? 0} req</span>
        <span><i className="ti ti-alert-triangle" aria-hidden="true" /> {errorRate}% err</span>
      </div>

      <div className="provider-quota-list">
        {windows.length
          ? windows.map((window) => <ProviderQuotaRow key={window.id} window={window} now={now} />)
          : <small>Лимиты мониторинга ещё не заданы.</small>}
      </div>
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
    const connected = providers.filter((provider) => provider.status === "connected").length;
    const models = providers.reduce((sum, provider) => sum + provider.models.length, 0);
    const latencies = providers.map((provider) => provider.latencyMs).filter((latency): latency is number => typeof latency === "number" && latency > 0);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length) : undefined;
    const requests = providers.reduce((sum, provider) => sum + (provider.monitoring?.requestCount ?? 0), 0);
    return { connected, models, avgLatency, requests };
  }, [providers]);

  return (
    <section className="provider-monitor-panel" aria-label="Мониторинг провайдеров">
      <div className="provider-monitor-toolbar">
        <div>
          <h3>Мониторинг провайдеров</h3>
          <p>Локальные окна лимитов, задержка и ошибки по каждому API.</p>
        </div>
        <button className="ghost" type="button" onClick={() => onRefresh()}>
          <i className="ti ti-refresh" aria-hidden="true" /> обновить все
        </button>
      </div>

      <div className="provider-monitor-summary">
        <div><span>онлайн</span><strong>{summary.connected}/{providers.length}</strong></div>
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
