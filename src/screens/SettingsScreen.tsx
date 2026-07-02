import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { GithubAvatar } from "../components/GithubAvatar";
import {
  buildDiagnosticIssueUrl,
  buildDiagnosticReport,
  diagnosticCategoryFilters,
  diagnosticCategoryLabel,
  diagnosticLabel,
  diagnosticSeverityFilters,
  diagnosticSeverityLabel,
  formatDiagnosticTimestamp,
  type DiagnosticCategoryFilter,
  type DiagnosticSeverityFilter,
} from "../diagnostics/reporting";
import { exportTextFile } from "../lib/fileExport";
import { describeMcpHealth, listAvailableTools } from "../mcp/manager";
import { useAppStore } from "../store/appStore";
import { APP_GITHUB_URL, APP_VERSION } from "../config/appMeta";
import { donationMethods, type DonationMethod } from "../config/donationWallets";
import type { DiagnosticEntry, ScreenId, ThemePreference } from "../types";

const themeOptions: Array<{ id: ThemePreference; label: string; icon: string; hint: string }> = [
  { id: "system", label: "Системная", icon: "device-desktop", hint: "как в ОС" },
  { id: "light", label: "Светлая", icon: "sun", hint: "всегда светлая" },
  { id: "dark", label: "Тёмная", icon: "moon", hint: "всегда тёмная" },
  { id: "vibe", label: "Vibe", icon: "flame", hint: "тёмная с янтарём" },
];

type SettingsCard = {
  id: string;
  icon: string;
  title: string;
  text: string;
  meta: string;
  screen: ScreenId;
  tone?: "default" | "info" | "success" | "warning";
};

const diagnosticTone: Record<DiagnosticEntry["severity"], "info" | "warning" | "success"> = {
  info: "info",
  warning: "warning",
  error: "warning",
};

function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the textarea fallback for WebViews/browser previews.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.select();

  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}


export function SettingsScreen() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [diagnosticCategoryFilter, setDiagnosticCategoryFilter] = useState<DiagnosticCategoryFilter>("all");
  const [diagnosticSeverityFilter, setDiagnosticSeverityFilter] = useState<DiagnosticSeverityFilter>("all");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const setScreen = useAppStore((state) => state.setScreen);
  const screen = useAppStore((state) => state.screen);
  const account = useAppStore((state) => state.account);
  const startGithubLogin = useAppStore((state) => state.startGithubLogin);
  const disconnectAccount = useAppStore((state) => state.disconnectAccount);
  const syncSettingsToCloud = useAppStore((state) => state.syncSettingsToCloud);
  const restoreSettingsFromCloud = useAppStore((state) => state.restoreSettingsFromCloud);
  const linkActiveProjectToGithub = useAppStore((state) => state.linkActiveProjectToGithub);
  const unlinkProjectFromGithub = useAppStore((state) => state.unlinkProjectFromGithub);
  const providers = useAppStore((state) => state.providers);
  const agents = useAppStore((state) => state.agents);
  const appSettings = useAppStore((state) => state.appSettings);
  const setAppSettings = useAppStore((state) => state.setAppSettings);
  const mcpServers = useAppStore((state) => state.mcpServers);
  const topology = useAppStore((state) => state.topology);
  const workspacePath = useAppStore((state) => state.workspacePath);
  const projects = useAppStore((state) => state.projects);
  const sessions = useAppStore((state) => state.sessions);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const busy = useAppStore((state) => state.busy);
  const diagnostics = useAppStore((state) => state.diagnostics);
  const clearDiagnostics = useAppStore((state) => state.clearDiagnostics);
  const removeDiagnostic = useAppStore((state) => state.removeDiagnostic);

  const connectedProviders = providers.filter((provider) => provider.status === "connected").length;
  const activeMcpServers = mcpServers.filter((server) => server.enabled).length;
  const connectedMcpServers = mcpServers.filter((server) => server.enabled && server.status === "connected").length;
  const availableTools = listAvailableTools(mcpServers).filter((tool) => tool.enabled).length;
  const activeProjects = projects.filter((project) => !project.archivedAt).length;
  const activeSessions = sessions.filter((session) => !session.archivedAt).length;
  const activeProject = projects.find((project) => project.id === activeProjectId && !project.archivedAt);
  const linkedProjects = projects.filter((project) => project.github).length;
  const operatorProvider = providers.find((provider) => provider.id === appSettings.operatorAssistantProviderId) ?? providers[0];
  const accountStatusLabel = account.github
    ? account.firebaseUid
      ? "GitHub + Firebase"
      : "GitHub connected"
    : account.sync.status;
  const accountStatusTone = account.github ? "success" : account.sync.status === "error" ? "warning" : "info";
  const cloudSyncUnavailable = Boolean(account.github && !account.firebaseUid);
  const errorDiagnosticsCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const aiDiagnosticsCount = diagnostics.filter((entry) => entry.category === "ai").length;
  const runtimeDiagnosticsCount = diagnostics.filter((entry) => entry.category === "runtime").length;
  const filteredDiagnostics = diagnostics.filter((entry) => (
    (diagnosticCategoryFilter === "all" || entry.category === diagnosticCategoryFilter)
    && (diagnosticSeverityFilter === "all" || entry.severity === diagnosticSeverityFilter)
  ));
  const hasDiagnosticFilters = diagnosticCategoryFilter !== "all" || diagnosticSeverityFilter !== "all";


  const settingsCards: SettingsCard[] = [
    {
      id: "mcp",
      icon: "plug-connected",
      title: "MCP и инструменты",
      text: describeMcpHealth(mcpServers),
      meta: `${activeMcpServers} ${pluralRu(activeMcpServers, "сервер", "сервера", "серверов")} · ${connectedMcpServers} подключено · ${availableTools} tools`,
      screen: "mcp",
      tone: connectedMcpServers > 0 ? "success" : activeMcpServers > 0 ? "warning" : "default",
    },
    {
      id: "providers",
      icon: "cloud-code",
      title: "AI-провайдеры",
      text: "Ключи, базовые URL, стриминг, JSONPath ответа и мониторинг квот.",
      meta: `${connectedProviders}/${providers.length} активно`,
      screen: "providers",
      tone: connectedProviders > 0 ? "success" : "warning",
    },
    {
      id: "custom-api",
      icon: "api-app",
      title: "Кастомный API",
      text: "Мастер для собственного OpenAI-compatible или другого LLM gateway.",
      meta: "шаблон запроса · авторизация · capability-флаги",
      screen: "custom-api",
      tone: "info",
    },
    {
      id: "agents",
      icon: "users-group",
      title: "Команда агентов",
      text: "Роли, модели, системные промпты, бюджет токенов и доступные tools.",
      meta: `${agents.length} ${pluralRu(agents.length, "агент", "агента", "агентов")}`,
      screen: "agent-builder",
      tone: "info",
    },
    {
      id: "topology",
      icon: "sitemap",
      title: "Топология команды",
      text: "Supervisor, debate или pipeline, лимит раундов и агент-арбитр.",
      meta: `${topology.kind} · ${topology.maxRounds} раундов`,
      screen: "topology",
    },
    {
      id: "workspace",
      icon: "folder-cog",
      title: "Рабочая папка и Build",
      text: "Папка проекта, init-файлы, дерево результата и запись плана на диск.",
      meta: workspacePath ? workspacePath : "папка пока не выбрана",
      screen: "build",
      tone: workspacePath ? "success" : "warning",
    },
    {
      id: "projects",
      icon: "messages",
      title: "Проекты и сессии",
      text: "Создание проектов, вкладки сессий, архив и режимы Planning / Chat.",
      meta: `${activeProjects} ${pluralRu(activeProjects, "проект", "проекта", "проектов")} · ${activeSessions} ${pluralRu(activeSessions, "сессия", "сессии", "сессий")}`,
      screen: "chat",
    },
  ];

  async function copyDonationValue(method: DonationMethod) {
    setCopyErrorId(null);
    try {
      await writeClipboardText(method.value);
      setCopiedId(method.id);
      window.setTimeout(() => setCopiedId((current) => current === method.id ? null : current), 1800);
    } catch {
      setCopyErrorId(method.id);
      window.setTimeout(() => setCopyErrorId((current) => current === method.id ? null : current), 2200);
    }
  }

  async function openProjectRepository() {
    try {
      await openUrl(APP_GITHUB_URL);
    } catch {
      window.open(APP_GITHUB_URL, "_blank", "noopener,noreferrer");
    }
  }

  function linkRepo() {
    linkActiveProjectToGithub({ owner: repoOwner, repo: repoName, branch: repoBranch });
    setRepoOwner("");
    setRepoName("");
    setRepoBranch("main");
  }

  function markActionSuccess(actionId: string) {
    setCopiedId(actionId);
    setCopyErrorId(null);
    window.setTimeout(() => setCopiedId((current) => current === actionId ? null : current), 1800);
  }

  function markActionError(actionId: string) {
    setCopyErrorId(actionId);
    window.setTimeout(() => setCopyErrorId((current) => current === actionId ? null : current), 2200);
  }

  async function copyDiagnosticReport(entries: DiagnosticEntry[] = filteredDiagnostics) {
    try {
      await writeClipboardText(buildDiagnosticReport(entries, "text"));
      markActionSuccess("diagnostics-report");
    } catch {
      markActionError("diagnostics-report");
    }
  }

  async function exportDiagnostics(extension: "txt" | "md") {
    const actionId = `diagnostics-export-${extension}`;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const content = buildDiagnosticReport(filteredDiagnostics, extension === "md" ? "markdown" : "text");
      const fileName = `RamTeamAi-diagnostics-${timestamp}`;
      const savedPath = await exportTextFile(fileName, content, extension);
      if (!savedPath) return;
      markActionSuccess(actionId);
    } catch {
      markActionError(actionId);
    }
  }

  async function createDiagnosticIssueReport() {
    const actionId = "diagnostics-issue";
    const issueUrl = buildDiagnosticIssueUrl(filteredDiagnostics);

    try {
      await writeClipboardText(buildDiagnosticReport(filteredDiagnostics, "markdown"));
    } catch {
      // The GitHub issue still includes a preview, so opening it remains useful.
    }

    try {
      await openUrl(issueUrl);
      markActionSuccess(actionId);
    } catch {
      const issueWindow = window.open(issueUrl, "_blank", "noopener,noreferrer");
      if (issueWindow) {
        markActionSuccess(actionId);
        return;
      }
      markActionError(actionId);
    }
  }

  useEffect(() => {
    if (screen !== "settings") return;
    const hashTargets: Record<string, string> = {
      "#donations": "donation-panel",
      "#diagnostics": "diagnostics-panel",
    };
    const targetId = hashTargets[window.location.hash];
    if (!targetId) return;
    const node = document.getElementById(targetId);
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [screen, diagnostics.length]);

  return (
    <div className="screen-stack settings-screen">
      <SectionTitle icon="settings" title="Настройки программы" subtitle="Быстрый центр управления: MCP, провайдеры, агенты, рабочая папка и поддержка развития." />

      <section className="settings-profile-card">
        <GithubAvatar profile={account.github} className="settings-profile-avatar" />
        <div>
          <h3>{account.github ? account.github.name || account.github.login : "Профиль пользователя"}</h3>
          <p>{account.github ? "GitHub @" + account.github.login + ". Firebase хранит только настройки, без диалогов и секретных ключей." : "Подключите GitHub, чтобы привязывать проекты к репозиториям и синхронизировать настройки через Firebase."}</p>
        </div>
        <div className="app-meta-stack">
          <Chip tone={account.github ? "success" : "info"}>{account.github ? "GitHub" : "local"}</Chip>
          <Chip tone="info">v{APP_VERSION}</Chip>
        </div>
      </section>

      <section className="settings-section account-sync-panel">
        <div className="settings-section-head">
          <div>
            <h3>GitHub и облачная синхронизация</h3>
            <p>Токен GitHub хранится только в системном keychain. В Firebase отправляются настройки, агенты, провайдеры без ключей и привязки проектов к repo.</p>
          </div>
          <Chip tone={accountStatusTone}>{accountStatusLabel}</Chip>
        </div>
        <div className="account-actions">
          <button className="primary" type="button" disabled={busy} onClick={() => void startGithubLogin()}>
            <i className="ti ti-brand-github" aria-hidden="true" /> {account.github ? "Переподключить GitHub" : "Войти через GitHub"}
          </button>
          <button type="button" title={cloudSyncUnavailable ? "Firebase sync is not configured in this build." : undefined} disabled={busy || !account.firebaseUid} onClick={() => void syncSettingsToCloud()}>Сохранить настройки в Firebase</button>
          <button type="button" title={cloudSyncUnavailable ? "Firebase sync is not configured in this build." : undefined} disabled={busy || !account.firebaseUid} onClick={() => void restoreSettingsFromCloud()}>Загрузить настройки</button>
          <button className="ghost" type="button" disabled={busy || !account.github} onClick={() => void disconnectAccount()}>Отключить</button>
          <button className="ghost" type="button" onClick={() => void openProjectRepository()}><i className="ti ti-brand-github" aria-hidden="true" /> GitHub RamTeamAi</button>
        </div>
        <p className="sync-message">{account.sync.message ?? "Готово"}{account.sync.lastSyncAt ? " · " + new Date(account.sync.lastSyncAt).toLocaleString("ru-RU") : ""}</p>
      </section>

      <section className="settings-section github-project-panel">
        <div className="settings-section-head">
          <div>
            <h3>Привязка проекта к GitHub repo</h3>
            <p>Сейчас сохраняем связь проекта с репозиторием. Следующий шаг — commit/push/pull и история версий из UI.</p>
          </div>
          <Chip tone={linkedProjects > 0 ? "success" : "default"}>{linkedProjects} repo</Chip>
        </div>
        <div className="repo-link-card">
          <div>
            <b>{activeProject ? activeProject.title : "Нет активного проекта"}</b>
            <small>{activeProject?.github ? `${activeProject.github.owner}/${activeProject.github.repo} · ${activeProject.github.branch}` : "Репозиторий пока не привязан"}</small>
          </div>
          {activeProject?.github ? (
            <button type="button" onClick={() => unlinkProjectFromGithub(activeProject.id)}>Отвязать</button>
          ) : null}
        </div>
        <div className="form-grid compact">
          <label>
            Owner
            <input value={repoOwner} placeholder={account.github?.login ?? "owner"} onChange={(event) => setRepoOwner(event.target.value)} />
          </label>
          <label>
            Repo
            <input value={repoName} placeholder="my-project" onChange={(event) => setRepoName(event.target.value)} />
          </label>
          <label>
            Branch
            <input value={repoBranch} placeholder="main" onChange={(event) => setRepoBranch(event.target.value)} />
          </label>
          <button className="primary" type="button" disabled={!activeProject || !repoOwner.trim() || !repoName.trim()} onClick={linkRepo}>Привязать repo</button>
        </div>
      </section>

      <section className="settings-section reliability-panel">
        <div className="settings-section-head">
          <div>
            <h3>Надёжность моделей</h3>
            <p>Если выбранная модель вернула ошибку, приложение автоматически попробует другие модели этого провайдера, а затем подключённые провайдеры.</p>
          </div>
          <Chip tone={appSettings.modelFallbackEnabled ? "success" : "default"}>{appSettings.modelFallbackEnabled ? "fallback включён" : "fallback выключен"}</Chip>
        </div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={appSettings.modelFallbackEnabled}
            onChange={(event) => setAppSettings({ modelFallbackEnabled: event.target.checked })}
          />
          <span>
            <b>Автоподбор другой модели при ошибке API</b>
            <small>Включено по умолчанию. В ответе агента будет видно, с какой модели на какую произошло переключение.</small>
          </span>
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={appSettings.healthSupervisorEnabled}
            onChange={(event) => setAppSettings({ healthSupervisorEnabled: event.target.checked })}
          />
          <span>
            <b>Online health supervisor</b>
            <small>Tracks OK/DOWN/RATE_LIMITED/AUTH_ERROR, opens circuit breaker, and starts a replacement agent when heartbeat lease expires.</small>
          </span>
        </label>
        <div className="form-grid compact operator-settings">
          <label>
            Health-check, sec
            <input
              type="number"
              min={15}
              max={600}
              value={appSettings.providerHealthIntervalSec}
              onChange={(event) => setAppSettings({ providerHealthIntervalSec: Math.max(15, Number(event.target.value) || 60) })}
            />
          </label>
          <label>
            Lease online, sec
            <input
              type="number"
              min={15}
              max={900}
              value={appSettings.agentLeaseTimeoutSec}
              onChange={(event) => setAppSettings({ agentLeaseTimeoutSec: Math.max(15, Number(event.target.value) || 180) })}
            />
          </label>
        </div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={appSettings.autoMode}
            onChange={(event) => setAppSettings({ autoMode: event.target.checked })}
          />
          <span>
            <b>Авто-режим: дойти до результата без подтверждений</b>
            <small>Команда сама проходит планирование → каркас → раунды реализации и пишет файлы, пока чеклист не закрыт или не достигнут лимит. Тумблер «Авто» есть и в чате.</small>
          </span>
        </label>
        <div className="form-grid compact">
          <label>
            Максимум раундов реализации
            <input
              type="number"
              min={1}
              max={12}
              value={appSettings.autoMaxRounds}
              onChange={(event) => setAppSettings({ autoMaxRounds: Math.min(12, Math.max(1, Number(event.target.value) || 12)) })}
            />
          </label>
        </div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={appSettings.operatorAssistantEnabled}
            onChange={(event) => setAppSettings({ operatorAssistantEnabled: event.target.checked })}
          />
          <span>
            <b>Проджект-менеджер для вопросов во время работы</b>
            <small>Включено по умолчанию: дополнительные просьбы оператора попадают в очередь, адресуются выбранному агенту и получают PM-контекст.</small>
          </span>
        </label>
        <div className="form-grid compact operator-settings">
          <label>
            Главный агент по умолчанию
            <select
              value={appSettings.operatorDefaultAgentId ?? agents[0]?.id ?? ""}
              onChange={(event) => setAppSettings({ operatorDefaultAgentId: event.target.value })}
            >
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
          <label>
            Быстрый провайдер PM
            <select
              value={appSettings.operatorAssistantProviderId ?? providers[0]?.id ?? ""}
              onChange={(event) => {
                const provider = providers.find((item) => item.id === event.target.value);
                setAppSettings({ operatorAssistantProviderId: event.target.value, operatorAssistantModelId: provider?.models[0]?.id });
              }}
            >
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
          </label>
          <label>
            Быстрая модель PM
            <select
              value={appSettings.operatorAssistantModelId ?? operatorProvider?.models[0]?.id ?? ""}
              onChange={(event) => setAppSettings({ operatorAssistantModelId: event.target.value })}
            >
              {(operatorProvider?.models ?? []).map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="settings-section theme-panel">
        <div className="settings-section-head">
          <div>
            <h3>Тема оформления</h3>
            <p>Системная следует за настройками ОС. Светлую или тёмную можно зафиксировать вручную — выбор сохраняется. Быстрый переключатель есть в шапке.</p>
          </div>
          <Chip tone="info">{themeOptions.find((option) => option.id === appSettings.theme)?.label ?? "Системная"}</Chip>
        </div>
        <div className="theme-options">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={appSettings.theme === option.id ? "theme-option on" : "theme-option"}
              aria-pressed={appSettings.theme === option.id}
              onClick={() => setAppSettings({ theme: option.id })}
            >
              <i className={"ti ti-" + option.icon} aria-hidden="true" />
              <b>{option.label}</b>
              <small>{option.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div>
            <h3>Что можно настраивать сейчас</h3>
            <p>Карточки ведут в уже готовые разделы программы.</p>
          </div>
        </div>
        <div className="settings-grid">
          {settingsCards.map((card) => (
            <button className="settings-card" key={card.id} type="button" onClick={() => setScreen(card.screen)}>
              <span className="settings-card-icon"><i className={"ti ti-" + card.icon} aria-hidden="true" /></span>
              <span className="settings-card-body">
                <b>{card.title}</b>
                <small>{card.text}</small>
                <em>{card.meta}</em>
              </span>
              <Chip tone={card.tone ?? "default"}>Открыть</Chip>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section diagnostics-panel" id="diagnostics-panel">
        <div className="settings-section-head">
          <div>
            <h3>Diagnostics journal</h3>
            <p>AI logic errors, provider/MCP failures, workspace write problems, and runtime exceptions are collected here for quick debugging.</p>
          </div>
          <div className="chip-row">
            <Chip tone={diagnostics.length ? "warning" : "success"}>{diagnostics.length ? `${diagnostics.length} entries` : "empty"}</Chip>
            <Chip tone={errorDiagnosticsCount ? "warning" : "success"}>{errorDiagnosticsCount} critical</Chip>
            <Chip tone={aiDiagnosticsCount ? "warning" : "info"}>{aiDiagnosticsCount} AI</Chip>
            <Chip tone={runtimeDiagnosticsCount ? "warning" : "info"}>{runtimeDiagnosticsCount} runtime</Chip>
          </div>
        </div>
        <div className="diagnostics-filters">
          {diagnosticCategoryFilters.map((filter) => (
            <button
              key={filter}
              className={diagnosticCategoryFilter === filter ? "chip-button on" : "chip-button"}
              type="button"
              onClick={() => setDiagnosticCategoryFilter(filter)}
            >
              {diagnosticCategoryLabel[filter]}
            </button>
          ))}
        </div>
        <div className="diagnostics-filters">
          {diagnosticSeverityFilters.map((filter) => (
            <button
              key={filter}
              className={diagnosticSeverityFilter === filter ? "chip-button on" : "chip-button"}
              type="button"
              onClick={() => setDiagnosticSeverityFilter(filter)}
            >
              {diagnosticSeverityLabel[filter]}
            </button>
          ))}
        </div>
        <div className="diagnostics-summary">
          <span>
            Showing <b>{filteredDiagnostics.length}</b> of <b>{diagnostics.length}</b> entries
          </span>
          {hasDiagnosticFilters ? (
            <button
              className="chip-button"
              type="button"
              onClick={() => {
                setDiagnosticCategoryFilter("all");
                setDiagnosticSeverityFilter("all");
              }}
            >
              <i className="ti ti-filter-off" aria-hidden="true" /> Reset filters
            </button>
          ) : null}
        </div>
        <div className="diagnostics-actions">
          <button className="chip-button on" type="button" disabled={!filteredDiagnostics.length} onClick={() => void copyDiagnosticReport()}>
            <i className="ti ti-copy" aria-hidden="true" /> {copiedId === "diagnostics-report" ? "Report copied" : copyErrorId === "diagnostics-report" ? "Copy failed" : "Copy report"}
          </button>
          <button type="button" disabled={!filteredDiagnostics.length} onClick={() => void exportDiagnostics("txt")}>
            <i className="ti ti-file-text" aria-hidden="true" /> {copiedId === "diagnostics-export-txt" ? "TXT saved" : copyErrorId === "diagnostics-export-txt" ? "TXT failed" : "Export .txt"}
          </button>
          <button type="button" disabled={!filteredDiagnostics.length} onClick={() => void exportDiagnostics("md")}>
            <i className="ti ti-file-description" aria-hidden="true" /> {copiedId === "diagnostics-export-md" ? "MD saved" : copyErrorId === "diagnostics-export-md" ? "MD failed" : "Export .md"}
          </button>
          <button type="button" disabled={!filteredDiagnostics.length} onClick={() => void createDiagnosticIssueReport()}>
            <i className="ti ti-brand-github" aria-hidden="true" /> {copiedId === "diagnostics-issue" ? "Issue opened" : copyErrorId === "diagnostics-issue" ? "Open failed" : "Create issue/report"}
          </button>
          <button type="button" disabled={!diagnostics.length} onClick={() => clearDiagnostics()}>
            <i className="ti ti-trash" aria-hidden="true" /> Clear journal
          </button>
        </div>
        {filteredDiagnostics.length ? (
          <div className="diagnostics-list">
            {filteredDiagnostics.map((entry) => (
              <article className={"diagnostic-card severity-" + entry.severity} key={entry.id}>
                <div className="diagnostic-card-head">
                  <div>
                    <div className="diagnostic-title-row">
                      <Chip tone={diagnosticTone[entry.severity]}>{entry.severity.toUpperCase()}</Chip>
                      <Chip tone="info">{diagnosticLabel[entry.category]}</Chip>
                      {entry.count > 1 ? <Chip tone="warning">x{entry.count}</Chip> : null}
                    </div>
                    <h4>{entry.title}</h4>
                    <small>{formatDiagnosticTimestamp(entry.updatedAt)}{entry.source ? ` | ${entry.source}` : ""}</small>
                  </div>
                  <button className="mini-action ghosty" type="button" title="Remove entry" onClick={() => removeDiagnostic(entry.id)}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                </div>
                <p className="diagnostic-message">{entry.message}</p>
                {entry.context && Object.keys(entry.context).length ? (
                  <div className="diagnostic-context">
                    {Object.entries(entry.context).map(([key, value]) => (
                      <span key={key}><b>{key}:</b> {value}</span>
                    ))}
                  </div>
                ) : null}
                {entry.details ? <pre className="diagnostic-pre">{entry.details}</pre> : null}
                {entry.stack ? (
                  <details className="diagnostic-stack">
                    <summary>Stack trace</summary>
                    <pre className="diagnostic-pre">{entry.stack}</pre>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : diagnostics.length ? (
          <div className="diagnostics-empty">
            <b>No entries match the current filters.</b>
            <p>Reset the filters or choose another error type to inspect the saved journal.</p>
          </div>
        ) : (
          <div className="diagnostics-empty">
            <b>Journal is empty.</b>
            <p>When the app, agents, or integrations hit a problem, a diagnostic entry will appear here automatically.</p>
          </div>
        )}
      </section>

      <section className="settings-section donation-panel" id="donation-panel">
        <div className="settings-section-head">
          <div>
            <h3>Донат на развитие</h3>
            <p>Копим на облачный хостинг и развитие RamTeamAi. Нажми «Скопировать», чтобы быстро взять реквизиты.</p>
          </div>
          <span className="donation-badge"><i className="ti ti-heart-handshake" aria-hidden="true" /> спасибо</span>
        </div>
        <div className="donation-grid">
          {donationMethods.map((method) => (
            <article className="donation-card" key={method.id}>
              <div>
                <h4>{method.title}</h4>
                <p>{method.subtitle}</p>
              </div>
              <code>{method.displayValue ?? method.value}</code>
              <button className="chip-button on donation-copy" type="button" onClick={() => void copyDonationValue(method)}>
                <i className="ti ti-copy" aria-hidden="true" /> {copiedId === method.id ? "Скопировано" : copyErrorId === method.id ? "Не скопировалось" : "Скопировать"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
