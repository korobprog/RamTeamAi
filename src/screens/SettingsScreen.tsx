import { useEffect, useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { describeMcpHealth, listAvailableTools } from "../mcp/manager";
import { useAppStore } from "../store/appStore";
import type { ScreenId, ThemePreference } from "../types";

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

type DonationMethod = {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  displayValue?: string;
};

const donationMethods: DonationMethod[] = [
  {
    id: "alfa-card",
    title: "Карта Альфа-Банк",
    subtitle: "На развитие программы и облачный хостинг",
    value: "2200153696450346",
    displayValue: "2200 1536 9645 0346",
  },
  {
    id: "usdt-trc20",
    title: "USDT TRC20",
    subtitle: "TRON",
    value: "TEpXDuC7CmzpHmip9ppqHMreT4Z1R6Tp4D",
  },
  {
    id: "usdt-ton",
    title: "USDT TON",
    subtitle: "The Open Network",
    value: "UQB_wLx_GKd1Kkvgv4o-mRqngu2_S7bWFRQXNzEVRELFc2AV",
  },
  {
    id: "usdt-bsc",
    title: "USDT BSC",
    subtitle: "BNB Smart Chain (BEP20)",
    value: "0x514691B807C30181a145BE2202431B28418A6Ba8",
  },
];

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

  const connectedProviders = providers.filter((provider) => provider.status === "connected").length;
  const activeMcpServers = mcpServers.filter((server) => server.enabled).length;
  const connectedMcpServers = mcpServers.filter((server) => server.enabled && server.status === "connected").length;
  const availableTools = listAvailableTools(mcpServers).filter((tool) => tool.enabled).length;
  const activeProjects = projects.filter((project) => !project.archivedAt).length;
  const activeSessions = sessions.filter((session) => !session.archivedAt).length;
  const activeProject = projects.find((project) => project.id === activeProjectId && !project.archivedAt);
  const linkedProjects = projects.filter((project) => project.github).length;
  const operatorProvider = providers.find((provider) => provider.id === appSettings.operatorAssistantProviderId) ?? providers[0];

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

  function linkRepo() {
    linkActiveProjectToGithub({ owner: repoOwner, repo: repoName, branch: repoBranch });
    setRepoOwner("");
    setRepoName("");
    setRepoBranch("main");
  }

  useEffect(() => {
    if (screen !== "settings") return;
    if (window.location.hash !== "#donations") return;
    const node = document.getElementById("donation-panel");
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [screen]);

  return (
    <div className="screen-stack settings-screen">
      <SectionTitle icon="settings" title="Настройки программы" subtitle="Быстрый центр управления: MCP, провайдеры, агенты, рабочая папка и поддержка развития." />

      <section className="settings-profile-card">
        <div className="settings-profile-avatar">
          {account.github?.avatarUrl ? <img src={account.github.avatarUrl} alt="" /> : <i className="ti ti-user" aria-hidden="true" />}
        </div>
        <div>
          <h3>{account.github ? account.github.name || account.github.login : "Профиль пользователя"}</h3>
          <p>{account.github ? "GitHub @" + account.github.login + ". Firebase хранит только настройки, без диалогов и секретных ключей." : "Подключите GitHub, чтобы привязывать проекты к репозиториям и синхронизировать настройки через Firebase."}</p>
        </div>
        <Chip tone={account.github ? "success" : "info"}>{account.github ? "GitHub" : "local"}</Chip>
      </section>

      <section className="settings-section account-sync-panel">
        <div className="settings-section-head">
          <div>
            <h3>GitHub и облачная синхронизация</h3>
            <p>Токен GitHub хранится только в системном keychain. В Firebase отправляются настройки, агенты, провайдеры без ключей и привязки проектов к repo.</p>
          </div>
          <Chip tone={account.sync.status === "ready" ? "success" : account.sync.status === "error" ? "warning" : "info"}>{account.sync.status}</Chip>
        </div>
        <div className="account-actions">
          <button className="primary" type="button" disabled={busy} onClick={() => void startGithubLogin()}>
            <i className="ti ti-brand-github" aria-hidden="true" /> {account.github ? "Переподключить GitHub" : "Войти через GitHub"}
          </button>
          <button type="button" disabled={busy || !account.firebaseUid} onClick={() => void syncSettingsToCloud()}>Сохранить настройки в Firebase</button>
          <button type="button" disabled={busy || !account.firebaseUid} onClick={() => void restoreSettingsFromCloud()}>Загрузить настройки</button>
          <button className="ghost" type="button" disabled={busy || !account.github} onClick={() => void disconnectAccount()}>Отключить</button>
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
            Lease online, ???
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
