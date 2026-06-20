import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Chip } from "../components/FRamTeamAie";
import { RoleBadge } from "../components/RoleBadge";
import { roleLabel } from "../lib/roles";
import { TeamThinking } from "../components/TeamThinking";
import { DebateSummary } from "../components/DebateSummary";
import { describeMcpHealth, listAvailableTools } from "../mcp/manager";
import { useAppStore } from "../store/appStore";
import { formatLimitAmount, getProviderLimitSnapshot, providerAccessLabel, providerHasApiAccess, providerWorks } from "../providers/limits";
import type { AgentDialogMessage, AgentRole, ChatMessage, MessageAction, MessageActionKind, ProviderConfig } from "../types";

const COLLAPSE_LIMIT = 360;
type LibraryView = "chat" | "projects" | "sessions" | "archive";
type ArchiveAction = "clear-memory" | "delete-archive";

const actionMeta: Record<MessageActionKind, { icon: string; verb: string }> = {
  write: { icon: "file-pencil", verb: "Записал файл" },
  error: { icon: "alert-triangle", verb: "Ошибка" },
  search: { icon: "world-search", verb: "Поиск" },
  plan: { icon: "list-check", verb: "План" },
  build: { icon: "package", verb: "Сборка" },
  fallback: { icon: "arrows-exchange", verb: "Смена модели" },
  idle: { icon: "alert-circle", verb: "Без кода" },
};

function ActionChips({ actions }: { actions: MessageAction[] }) {
  return (
    <div className="message-actions">
      {actions.map((action, index) => {
        const meta = actionMeta[action.kind];
        return (
          <span className={"message-action action-" + action.kind} key={index} title={action.detail ?? meta.verb}>
            <i className={"ti ti-" + meta.icon} aria-hidden="true" />
            {action.kind === "write" ? <code>{action.label}</code> : <span>{action.label}</span>}
          </span>
        );
      })}
    </div>
  );
}

function MessageItem({ message, author }: { message: ChatMessage | AgentDialogMessage; author: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.text.length > COLLAPSE_LIMIT;
  const shown = isLong && !expanded ? message.text.slice(0, COLLAPSE_LIMIT).trimEnd() + "…" : message.text;
  return (
    <article className={"message " + (message.agentRole ?? message.author)}>
      <div className="message-author">{author}{message.tool ? <em> · {message.tool}</em> : null}</div>
      {message.actions?.length ? <ActionChips actions={message.actions} /> : null}
      <p>{shown}</p>
      {isLong ? (
        <button className="message-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      ) : null}
    </article>
  );
}

const statusLabel: Record<string, string> = { typing: "пишет", mcp: "MCP", done: "готов", waiting: "ждёт", recovering: "recovery", fired: "уволен", hired: "нанят" };
const initCommandPattern = /^\/?init$/i;
const projectStatusLabel = { draft: "Черновик", active: "В работе", scaffolded: "Каркас", built: "Собран" };
const agentAvatar: Record<AgentRole, string> = {
  architect: "🧙‍♂️",
  critic: "🦉",
  researcher: "🔎",
  arbiter: "⚖️",
  coder: "🤖",
  security: "🛡️",
  product: "🚀",
  tester: "🧪",
};

function agentDisplayName(agent: { id: string; name: string; role: AgentRole }, defaultAgentId?: string): string {
  const prefix = agent.id === (defaultAgentId ?? "architect") ? "Главный · " : "";
  return `${agentAvatar[agent.role]} ${prefix}${agent.name}`;
}

function formatWorkDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}ч ${minutes.toString().padStart(2, "0")}м`;
  if (minutes > 0) return `${minutes}м ${seconds.toString().padStart(2, "0")}с`;
  return `${seconds}с`;
}

function formatLimitReset(iso: string, now: number): string {
  const diffMs = Date.parse(iso) - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "скоро";
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return days + "д " + hours + "ч";
  if (hours > 0) return hours + "ч " + minutes.toString().padStart(2, "0") + "м";
  return minutes + "м";
}

function providerAccessTone(provider: ProviderConfig): "ok" | "warn" | "muted" {
  if (!providerHasApiAccess(provider)) return "muted";
  return providerWorks(provider) ? "ok" : "warn";
}

function ComposerLimitBar({
  provider,
  providers,
  expanded,
  now,
  onToggle,
  onOpenProviders,
}: {
  provider?: ProviderConfig;
  providers: ProviderConfig[];
  expanded: boolean;
  now: number;
  onToggle: () => void;
  onOpenProviders: () => void;
}) {
  if (!provider) return null;
  const windows = getProviderLimitSnapshot(provider, now);
  const primary = windows[0];
  const accessTone = providerAccessTone(provider);
  const hasAccess = providerHasApiAccess(provider);
  const keyedProviders = providers.filter(providerHasApiAccess);
  const workingCount = keyedProviders.filter(providerWorks).length;
  const barStyle = primary ? { width: hasAccess ? `${primary.remainingPercent}%` : "0%" } : undefined;

  return (
    <div className={"composer-limit-panel" + (expanded ? " open" : "")}>
      <div className="composer-limit-summary">
        <div className="composer-limit-copy">
          <span className={"provider-mini-dot " + accessTone} aria-hidden="true" />
          <strong>{provider.name}</strong>
          <span>{!hasAccess ? "нет ключа · лимит не активен" : primary ? `${primary.label}: осталось ${formatLimitAmount(primary.tokenRemaining)} ток.` : providerAccessLabel(provider)}</span>
        </div>
        {primary ? (
          <div className={"composer-limit-meter" + (hasAccess ? "" : " inactive")} title="Локальный счётчик по запросам приложения; точные лимиты зависят от тарифа провайдера.">
            <span style={barStyle} />
          </div>
        ) : (
          <div className="composer-limit-meter unlimited" title="Локальный провайдер без API-ключа и внешнего лимита.">
            <span />
          </div>
        )}
        <span className="composer-limit-reset">{!hasAccess ? "добавьте ключ" : primary ? "сброс " + formatLimitReset(primary.resetsAt, now) : "без внешнего API"}</span>
        <button className="mini-action ghosty" type="button" onClick={onToggle} aria-expanded={expanded} title={expanded ? "Скрыть лимиты" : "Показать длинные лимиты и провайдеры"}>
          <i className={"ti ti-" + (expanded ? "chevron-up" : "chevron-down")} aria-hidden="true" />
        </button>
      </div>

      {expanded ? (
        <div className="composer-limit-details">
          <div className="composer-limit-windows">
            {windows.length ? windows.map((window) => (
              <div className="composer-limit-window" key={window.id}>
                <div>
                  <b>{window.label}</b>
                  <small>сброс через {formatLimitReset(window.resetsAt, now)}</small>
                </div>
                <span>{formatLimitAmount(window.tokenRemaining)} ток. · {window.requestRemaining} req</span>
              </div>
            )) : (
              <div className="composer-limit-window">
                <div>
                  <b>Локально</b>
                  <small>лимит задаёт только ваша машина</small>
                </div>
                <span>∞</span>
              </div>
            )}
          </div>
          <div className="composer-provider-strip" aria-label="Доступные API провайдеры">
            <span className="provider-strip-summary">{workingCount}/{providers.length} API работают</span>
            {providers.map((item) => (
              <span className={"provider-strip-pill " + providerAccessTone(item)} key={item.id} title={providerAccessLabel(item)}>
                <span className={"provider-mini-dot " + providerAccessTone(item)} aria-hidden="true" />
                {item.name}
              </span>
            ))}
            <button className="provider-strip-manage" type="button" onClick={onOpenProviders}>Настроить</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChatScreen() {
  const [prompt, setPrompt] = useState("");
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const [libraryView, setLibraryView] = useState<LibraryView>("chat");
  const [clearArchiveMemoryOnly, setClearArchiveMemoryOnly] = useState(false);
  const [archiveAction, setArchiveAction] = useState<ArchiveAction | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState("");
  const [agentQuestionTargetId, setAgentQuestionTargetId] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [limitsExpanded, setLimitsExpanded] = useState(false);
  const agents = useAppStore((state) => state.agents);
  const providers = useAppStore((state) => state.providers);
  const projects = useAppStore((state) => state.projects);
  const sessions = useAppStore((state) => state.sessions);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const session = useAppStore((state) => state.session);
  const mcpServers = useAppStore((state) => state.mcpServers);
  const runTeam = useAppStore((state) => state.runTeam);
  const runAuto = useAppStore((state) => state.runAuto);
  const startAgentImplementation = useAppStore((state) => state.startAgentImplementation);
  const enqueueAgentQuestion = useAppStore((state) => state.enqueueAgentQuestion);
  const clearQueuedAgentQuestion = useAppStore((state) => state.clearQueuedAgentQuestion);
  const runAgentDialogQuestion = useAppStore((state) => state.runAgentDialogQuestion);
  const appSettings = useAppStore((state) => state.appSettings);
  const setAppSettings = useAppStore((state) => state.setAppSettings);
  const autoRunning = useAppStore((state) => state.autoRunning);
  const agentDialogMessages = useAppStore((state) => state.agentDialogMessages);
  const agentDialogOpen = useAppStore((state) => state.agentDialogOpen);
  const agentDialogBusy = useAppStore((state) => state.agentDialogBusy);
  const agentDialogAgentId = useAppStore((state) => state.agentDialogAgentId);
  const setAgentDialogOpen = useAppStore((state) => state.setAgentDialogOpen);
  const clearAgentDialog = useAppStore((state) => state.clearAgentDialog);
  const createProject = useAppStore((state) => state.createProject);
  const createSession = useAppStore((state) => state.createSession);
  const selectProject = useAppStore((state) => state.selectProject);
  const selectSession = useAppStore((state) => state.selectSession);
  const archiveProject = useAppStore((state) => state.archiveProject);
  const archiveSession = useAppStore((state) => state.archiveSession);
  const restoreProject = useAppStore((state) => state.restoreProject);
  const restoreSession = useAppStore((state) => state.restoreSession);
  const clearArchiveMemory = useAppStore((state) => state.clearArchiveMemory);
  const deleteArchive = useAppStore((state) => state.deleteArchive);
  const workspacePath = useAppStore((state) => state.workspacePath);
  const selectWorkspaceFolder = useAppStore((state) => state.selectWorkspaceFolder);
  const clearWorkspaceFolder = useAppStore((state) => state.clearWorkspaceFolder);
  const initWorkspace = useAppStore((state) => state.initWorkspace);
  const lastWorkspaceInit = useAppStore((state) => state.lastWorkspaceInit);
  const setSessionMode = useAppStore((state) => state.setSessionMode);
  const setScreen = useAppStore((state) => state.setScreen);
  const artifact = useAppStore((state) => state.artifact);
  const implementationChecklist = useAppStore((state) => state.implementationChecklist);
  const busy = useAppStore((state) => state.busy);
  const activeRunMode = useAppStore((state) => state.activeRunMode);
  const liveFileActivity = useAppStore((state) => state.liveFileActivity);
  const queuedAgentQuestions = useAppStore((state) => state.queuedAgentQuestions);
  const projectWorkTimers = useAppStore((state) => state.projectWorkTimers);
  const agentRunCheckpoints = useAppStore((state) => state.agentRunCheckpoints);
  const activeWorkStartedAt = useAppStore((state) => state.activeWorkStartedAt);
  const tools = listAvailableTools(mcpServers).filter((tool) => tool.enabled);
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const archivedProjects = projects.filter((project) => project.archivedAt);
  const activeProject = activeProjects.find((project) => project.id === activeProjectId);
  const projectSessions = sessions.filter((item) => item.projectId === activeProjectId && !item.archivedAt);
  const archivedSessions = sessions.filter((item) => item.archivedAt && !projects.find((project) => project.id === item.projectId)?.archivedAt);
  const archiveItems = [
    ...archivedProjects.map((project) => ({ kind: "project" as const, id: project.id, title: project.title, meta: projectArchiveMeta(project.id), date: project.archivedAt ?? "" })),
    ...archivedSessions.map((item) => ({ kind: "session" as const, id: item.id, title: item.title, meta: archivedSessionMeta(item), date: item.archivedAt ?? "" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const archivePreviewItems = archiveItems.slice(0, 3);
  const archiveCount = archiveItems.length;
  const canChat = Boolean(activeProject && activeSessionId);
  const hasUserTask = session.messages.some((message) => message.author === "user" && message.text.trim());
  const agentMessages = session.messages.filter((message) => Boolean(message.agentRole));
  const debateRoles = agentMessages.map((message) => message.agentRole as AgentRole);
  const showDebateSummary = hasUserTask && session.mode === "planning" && agentMessages.length > 0;
  const showTaskGuard = canChat && !hasUserTask && !busy;
  const checklistCurrent = implementationChecklist.length === artifact.steps.length && artifact.steps.every((step, index) => implementationChecklist[index]?.step === step);
  const checklistDone = checklistCurrent && implementationChecklist.length > 0 && implementationChecklist.every((item) => item.done);
  const implementationComplete = artifact.status === "built" || checklistDone;
  const projectQuestionMode = canChat && implementationComplete;
  const canRunImplementation = canChat && hasUserTask && artifact.status === "scaffolded" && !implementationComplete;
  const implementationStarted = canRunImplementation && session.mode !== "planning" && agentMessages.length > 0;
  const latestSystemMessage = [...session.messages].reverse().find((message) => message.author === "system");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const agentDialogListRef = useRef<HTMLDivElement | null>(null);
  const mainQuestionAgentId = agents.find((agent) => agent.id === appSettings.operatorDefaultAgentId)?.id
    ?? agents.find((agent) => agent.role === "architect")?.id
    ?? agents[0]?.id
    ?? "";
  const selectedQuestionAgentId = projectQuestionMode ? mainQuestionAgentId : agentQuestionTargetId || mainQuestionAgentId;
  const activeDialogAgent = agents.find((agent) => agent.id === (agentDialogAgentId || selectedQuestionAgentId));
  const selectedQuestionAgent = agents.find((agent) => agent.id === selectedQuestionAgentId);
  const selectedQuestionProvider = providers.find((provider) => provider.id === selectedQuestionAgent?.providerId)
    ?? providers.find(providerHasApiAccess)
    ?? providers[0];
  const activeElapsedMs = activeWorkStartedAt ? Math.max(0, nowTick - Date.parse(activeWorkStartedAt)) : 0;
  const projectWorkMs = (projectWorkTimers[activeProjectId] ?? 0) + activeElapsedMs;
  const visibleCheckpoints = agentRunCheckpoints.slice(-4).reverse();

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [session.messages.length, busy, queuedAgentQuestions.length]);

  useEffect(() => {
    const list = agentDialogListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [agentDialogMessages.length, agentDialogBusy]);

  useEffect(() => {
    if (agentDialogOpen) setRightPanelCollapsed(false);
  }, [agentDialogOpen]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  function modelLabel(providerId: string, modelId: string): string {
    const provider = providers.find((item) => item.id === providerId);
    return provider?.models.find((model) => model.id === modelId)?.label ?? provider?.name ?? "";
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || !canChat) return;
    setPrompt("");
    const questionTargetId = projectQuestionMode ? mainQuestionAgentId : selectedQuestionAgentId;
    if (busy || autoRunning || agentDialogBusy) {
      await enqueueAgentQuestion(value, questionTargetId);
      return;
    }
    if (initCommandPattern.test(value)) {
      await initWorkspace(true);
      return;
    }
    if (projectQuestionMode) {
      await runAgentDialogQuestion(value, mainQuestionAgentId);
      return;
    }
    if (appSettings.autoMode) {
      await runAuto(value);
      return;
    }
    await runTeam(value, "planning");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function handleSelectWorkspace() {
    setSelectingWorkspace(true);
    try {
      await selectWorkspaceFolder();
    } finally {
      setSelectingWorkspace(false);
    }
  }

  async function handleRunImplementationRound() {
    if (!canRunImplementation || busy || autoRunning) return;
    if (appSettings.autoMode) {
      await startAgentImplementation();
      return;
    }
    await runTeam("Режим реализации: выполняйте PLAN.md как команда разработчиков. Не обсуждайте по кругу: для каждого ответа укажите конкретные файлы, действие create/update/delete, код или diff и команды проверки.", "implementation");
  }

  function messageAuthorLabel(message: typeof session.messages[number]): string {
    if (message.agentRole) return roleLabel(message.agentRole);
    if (message.author === "system") return "Система";
    return "Пользователь";
  }

  function agentDialogAuthorLabel(message: AgentDialogMessage): string {
    if (message.author === "user") return "Вы";
    if (message.agentRole) return roleLabel(message.agentRole);
    return agents.find((agent) => agent.id === message.agentId)?.name ?? "Агент";
  }

  function pluralRu(count: number, one: string, few: string, many: string): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function sessionMeta(item: typeof sessions[number]): string {
    const count = item.messages.length;
    return count ? count + " " + pluralRu(count, "реплика", "реплики", "реплик") : "пока нет реплик";
  }

  function projectMeta(projectId: string): string {
    const project = projects.find((item) => item.id === projectId);
    const count = sessions.filter((item) => item.projectId === projectId && !item.archivedAt).length;
    return (project ? projectStatusLabel[project.status] : "Проект") + " · " + count + " " + pluralRu(count, "сессия", "сессии", "сессий");
  }

  function projectArchiveMeta(projectId: string): string {
    const projectSessions = sessions.filter((item) => item.projectId === projectId);
    const count = projectSessions.length;
    const memoryCleared = count > 0 && projectSessions.every((item) => item.messages.length === 0 && item.tokensUsed === 0);
    return "проект · " + count + " " + pluralRu(count, "сессия", "сессии", "сессий") + (memoryCleared ? " · память очищена" : "");
  }

  function projectTitle(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.title ?? "Проект";
  }

  function archivedSessionMeta(item: typeof sessions[number]): string {
    const memoryState = item.messages.length === 0 && item.tokensUsed === 0 ? " · память очищена" : "";
    return "сессия · " + projectTitle(item.projectId) + memoryState;
  }


  function openChatView() {
    setLibraryView("chat");
  }

  function openProject(projectId: string) {
    selectProject(projectId);
    openChatView();
  }

  function openSession(sessionId: string) {
    selectSession(sessionId);
    openChatView();
  }

  function restoreAndOpenProject(projectId: string) {
    restoreProject(projectId);
    openChatView();
  }

  function restoreAndOpenSession(sessionId: string) {
    restoreSession(sessionId);
    openChatView();
  }

  function handleClearArchive() {
    setArchiveNotice("");
    setArchiveAction(clearArchiveMemoryOnly ? "clear-memory" : "delete-archive");
  }

  async function confirmArchiveAction() {
    if (!archiveAction || archiveBusy) return;
    const action = archiveAction;
    setArchiveBusy(true);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      if (action === "clear-memory") {
        clearArchiveMemory();
        setArchiveNotice("Память архивных сессий очищена. Карточки оставлены, реплики удалены.");
      } else {
        deleteArchive();
        setArchiveNotice("");
        openChatView();
      }
      setArchiveAction(null);
    } catch (error) {
      setArchiveNotice("Не удалось выполнить действие: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setArchiveBusy(false);
    }
  }

  function renderLibraryCard({
    key,
    title,
    meta,
    actionLabel,
    muted,
    onOpen,
    onAction,
  }: {
    key: string;
    title: string;
    meta: string;
    actionLabel?: string;
    muted?: boolean;
    onOpen?: () => void;
    onAction?: () => void;
  }) {
    return (
      <div className={muted ? "library-card muted" : "library-card"} key={key}>
        <button className="library-card-main" type="button" disabled={!onOpen} onClick={onOpen}>
          <span>{title}</span>
          <small>{meta}</small>
        </button>
        {actionLabel && onAction ? <button className="pill-action restore" type="button" onClick={onAction}>{actionLabel}</button> : null}
      </div>
    );
  }

  function renderLibraryPanel() {
    if (libraryView === "projects") {
      return (
        <section className="library-screen">
          <div className="library-header">
            <div>
              <h2>{"\u0412\u0441\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u044b"}</h2>
              <p>{"\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043d\u0430 \u043f\u0440\u043e\u0435\u043a\u0442, \u0447\u0442\u043e\u0431\u044b \u043f\u0435\u0440\u0435\u0439\u0442\u0438 \u0432\u043d\u0443\u0442\u0440\u044c."}</p>
            </div>
            <button className="ghost" type="button" onClick={openChatView}>{"\u041d\u0430\u0437\u0430\u0434 \u043a \u0447\u0430\u0442\u0443"}</button>
          </div>
          <div className="library-list">
            {activeProjects.map((project) => renderLibraryCard({ key: project.id, title: project.title, meta: projectMeta(project.id), onOpen: () => openProject(project.id) }))}
            {archivedProjects.map((project) => renderLibraryCard({ key: project.id, title: project.title, meta: projectArchiveMeta(project.id), actionLabel: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c", muted: true, onAction: () => restoreAndOpenProject(project.id) }))}
          </div>
        </section>
      );
    }

    if (libraryView === "sessions") {
      const visibleSessions = sessions.filter((item) => !projects.find((project) => project.id === item.projectId)?.archivedAt);
      return (
        <section className="library-screen">
          <div className="library-header">
            <div>
              <h2>{"\u0412\u0441\u0435 \u0441\u0435\u0441\u0441\u0438\u0438"}</h2>
              <p>{"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0435\u0441\u0441\u0438\u044e, \u0447\u0442\u043e\u0431\u044b \u043f\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 \u0434\u0438\u0430\u043b\u043e\u0433."}</p>
            </div>
            <button className="ghost" type="button" onClick={openChatView}>{"\u041d\u0430\u0437\u0430\u0434 \u043a \u0447\u0430\u0442\u0443"}</button>
          </div>
          <div className="library-list">
            {visibleSessions.map((item) => item.archivedAt
              ? renderLibraryCard({ key: item.id, title: item.title, meta: "\u0430\u0440\u0445\u0438\u0432 \u00b7 " + projectTitle(item.projectId), actionLabel: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c", muted: true, onAction: () => restoreAndOpenSession(item.id) })
              : renderLibraryCard({ key: item.id, title: item.title, meta: projectTitle(item.projectId) + " \u00b7 " + sessionMeta(item), onOpen: () => openSession(item.id) }))}
          </div>
        </section>
      );
    }

    if (libraryView === "archive") {
      return (
        <section className="library-screen">
          <div className="library-header">
            <div>
              <h2>{"\u041f\u043e\u043b\u043d\u044b\u0439 \u0430\u0440\u0445\u0438\u0432"}</h2>
              <p>{archiveCount}{" \u0437\u0430\u043f\u0438\u0441\u0435\u0439. \u041c\u043e\u0436\u043d\u043e \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0438\u043b\u0438 \u043e\u0447\u0438\u0441\u0442\u0438\u0442\u044c."}</p>
            </div>
            <button className="ghost" type="button" onClick={openChatView}>{"\u041d\u0430\u0437\u0430\u0434 \u043a \u0447\u0430\u0442\u0443"}</button>
          </div>
          <div className="archive-danger">
            <label className="checkbox-label compact">
              <input
                type="checkbox"
                checked={clearArchiveMemoryOnly}
                disabled={archiveBusy}
                onChange={(event) => {
                  setClearArchiveMemoryOnly(event.target.checked);
                  setArchiveAction(null);
                  setArchiveNotice("");
                }}
              />
              <span>{"\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0430\u043c\u044f\u0442\u044c, \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c"}</span>
            </label>
            <button className="danger-button" type="button" disabled={archiveCount === 0 || archiveBusy} onClick={handleClearArchive}>
              {archiveBusy ? "Выполняю…" : clearArchiveMemoryOnly ? "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u043f\u0430\u043c\u044f\u0442\u044c" : "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0432\u0435\u0441\u044c \u0430\u0440\u0445\u0438\u0432"}
            </button>
          </div>
          {archiveAction ? (
            <div className="archive-confirm">
              <div>
                <b>{archiveAction === "clear-memory" ? "Очистить память архива?" : "Удалить весь архив?"}</b>
                <p>{archiveAction === "clear-memory"
                  ? "Карточки проектов и сессий останутся, но все реплики и токены внутри архивных сессий будут удалены."
                  : "Архивные проекты, сессии и их память будут удалены без восстановления."}</p>
              </div>
              <div className="archive-confirm-actions">
                <button type="button" disabled={archiveBusy} onClick={() => setArchiveAction(null)}>Отмена</button>
                <button className="danger-button" type="button" disabled={archiveBusy} onClick={() => void confirmArchiveAction()}>
                  {archiveAction === "clear-memory" ? "Да, очистить" : "Да, удалить"}
                </button>
              </div>
            </div>
          ) : null}
          {archiveNotice ? <p className="archive-notice">{archiveNotice}</p> : null}
          <div className="library-list">
            {archiveCount === 0 ? <p className="small-muted archive-empty">{"\u0410\u0440\u0445\u0438\u0432 \u043f\u0443\u0441\u0442"}</p> : null}
            {archiveItems.map((item) => renderLibraryCard({
              key: item.kind + item.id,
              title: item.title,
              meta: item.meta,
              actionLabel: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c",
              muted: true,
              onAction: () => item.kind === "project" ? restoreAndOpenProject(item.id) : restoreAndOpenSession(item.id),
            }))}
          </div>
        </section>
      );
    }

    return null;
  }

  return (
    <div className={"chat-layout" + (leftPanelCollapsed ? " left-collapsed" : "") + (rightPanelCollapsed ? " right-collapsed" : "")}>
      <aside className={leftPanelCollapsed ? "sidebar-panel side-panel-collapsed" : "sidebar-panel"}>
        {leftPanelCollapsed ? (
          <button
            className="panel-collapse-rail"
            type="button"
            title="Развернуть проекты"
            aria-label="Развернуть левую панель"
            onClick={() => setLeftPanelCollapsed(false)}
          >
            <i className="ti ti-layout-sidebar-left-expand" aria-hidden="true" />
            <span>Проекты</span>
          </button>
        ) : (
        <>
        <div className="panel-heading">
          <div className="panel-title">Проекты</div>
          <div className="panel-heading-actions">
            <button className="mini-action" type="button" onClick={() => createProject()}>+</button>
            <button className="mini-action ghosty" type="button" title="Свернуть левую панель" aria-label="Свернуть левую панель" onClick={() => setLeftPanelCollapsed(true)}>
              <i className="ti ti-layout-sidebar-left-collapse" aria-hidden="true" />
            </button>
          </div>
        </div>
        {activeProjects.slice(0, 3).map((project) => (
          <div className={project.id === activeProjectId ? "session-row project-pill active" : "session-row project-pill"} key={project.id}>
            <button className="pill-main" type="button" onClick={() => selectProject(project.id)}>
              <span>{project.title}</span>
              <small>{projectMeta(project.id)}</small>
            </button>
            <button className="pill-action" type="button" title="Переместить проект в архив" onClick={() => archiveProject(project.id)}>Архив</button>
          </div>
        ))}
        {activeProjects.length > 0 ? (
          <button className="thin-more" type="button" onClick={() => setLibraryView("projects")}>
            Показать все проекты · {activeProjects.length}
          </button>
        ) : null}
        <button className="session-pill create-pill" type="button" onClick={() => createProject()}>
          Новый проект
          <small>создать вкладку проекта</small>
        </button>

        <div className="panel-heading spaced">
          <div className="panel-title">Сессии</div>
          <button className="mini-action" type="button" disabled={!activeProject} onClick={() => createSession()}>+</button>
        </div>
        {!activeProject ? <p className="small-muted archive-empty">Создайте или восстановите проект</p> : null}
        {activeProject && projectSessions.length === 0 ? <p className="small-muted archive-empty">Активных сессий нет</p> : null}
        {projectSessions.slice(0, 3).map((item) => (
          <div className={item.id === activeSessionId ? "session-row active" : "session-row"} key={item.id}>
            <button className="pill-main" type="button" onClick={() => selectSession(item.id)}>
              <span>{item.title}</span>
              <small>{sessionMeta(item)}</small>
            </button>
            <button className="pill-action" type="button" title="Переместить сессию в архив" onClick={() => archiveSession(item.id)}>Архив</button>
          </div>
        ))}
        {projectSessions.length > 0 ? (
          <button className="thin-more" type="button" onClick={() => setLibraryView("sessions")}>
            Показать все сессии · {projectSessions.length}
          </button>
        ) : null}
        <button className="session-pill create-pill" type="button" disabled={!activeProject} onClick={() => createSession()}>
          Новая сессия
          <small>{activeProject ? activeProject.title : "выберите проект"}</small>
        </button>
        <div className="panel-heading spaced">
          <div className="panel-title">Архив</div>
          <small>{archiveCount}</small>
        </div>
        {archiveCount === 0 ? <p className="small-muted archive-empty">{"\u0410\u0440\u0445\u0438\u0432 \u043f\u0443\u0441\u0442"}</p> : null}
        {archivePreviewItems.map((item) => (
          <div className="session-row archive-row" key={item.kind + item.id}>
            <div className="pill-main static">
              <span>{item.title}</span>
              <small>{item.meta}</small>
            </div>
            <button className="pill-action restore" type="button" title={"\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c"} onClick={() => item.kind === "project" ? restoreAndOpenProject(item.id) : restoreAndOpenSession(item.id)}>{"\u0412\u0435\u0440\u043d\u0443\u0442\u044c"}</button>
          </div>
        ))}
        {archiveCount > 0 ? (
          <button className="thin-more" type="button" onClick={() => setLibraryView("archive")}>
            {"\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0432\u0435\u0441\u044c \u0430\u0440\u0445\u0438\u0432 \u00b7 "}{archiveCount}
          </button>
        ) : null}
        </>
        )}
      </aside>
      <section className="conversation-panel">
        {libraryView !== "chat" ? renderLibraryPanel() : (
        <>
        <div className="chat-toolbar">
          <button className={session.mode === "planning" ? "chip-button on" : "chip-button"} type="button" disabled={!canChat} onClick={() => setSessionMode("planning")}>Planning</button>
          <button className={session.mode === "chat" ? "chip-button on" : "chip-button"} type="button" disabled={!canChat} onClick={() => setSessionMode("chat")}>Chat</button>
          <button
            className={agentDialogOpen ? "chip-button on" : "chip-button"}
            type="button"
            disabled={!canChat && agentDialogMessages.length === 0}
            onClick={() => setAgentDialogOpen(!agentDialogOpen)}
            title="Отдельный чат для вопросов, которые попали в очередь к агентам"
          >
            <i className="ti ti-messages" aria-hidden="true" /> Чат агента {agentDialogMessages.length ? `· ${agentDialogMessages.length}` : ""}
          </button>
          <button
            className={appSettings.autoMode ? "chip-button on auto-toggle" : "chip-button auto-toggle"}
            type="button"
            title="Авто-режим: команда сама доходит до результата без подтверждений (планирование → каркас → раунды реализации)"
            onClick={() => setAppSettings({ autoMode: !appSettings.autoMode })}
          >
            <i className="ti ti-bolt" aria-hidden="true" /> Авто {appSettings.autoMode ? "вкл" : "выкл"}
          </button>
          <span className="work-timer" title="Время активной работы агентов над текущим проектом"><i className="ti ti-clock-hour-4" aria-hidden="true" /> {formatWorkDuration(projectWorkMs)}</span>
          <span><i className="ti ti-coin" aria-hidden="true" /> {session.tokensUsed.toLocaleString("ru-RU")} / {session.tokenBudget.toLocaleString("ru-RU")}</span>
        </div>
        {autoRunning ? (
          <div className="auto-running-banner">
            <span className="team-thinking-spinner" aria-hidden="true" />
            Авто-режим: команда идёт от плана к коду без подтверждений. Можно выключить тумблером «Авто».
          </div>
        ) : null}
        {projectQuestionMode && !autoRunning ? (
          <div className="project-qa-banner">
            <i className="ti ti-message-question" aria-hidden="true" />
            Проект завершён: новые сообщения идут как вопросы по проекту. Отвечает только главный агент, команда и запись кода не запускаются.
          </div>
        ) : null}
        {latestSystemMessage ? (
          <div className="pinned-system-message">
            <span>{"\u0421\u0438\u0441\u0442\u0435\u043c\u0430"}</span>
            <p>{latestSystemMessage.text}</p>
          </div>
        ) : null}
        <div className="message-list" ref={messageListRef}>
          {showTaskGuard ? (
            <div className="task-guard-card pulse-cta">
              <b>Сначала отправьте задачу</b>
              <p>Агенты не начнут разбор без контекста. Напишите, что нужно построить, исправить или исследовать — после этого команда поймёт, над чем работать.</p>
            </div>
          ) : null}
          {session.messages.length === 0 ? (
            <div className="empty-chat">
              <b>{canChat ? "Новая сессия готова" : activeProject ? "Активных сессий нет" : "Активных проектов нет"}</b>
              <p>{canChat ? "Опишите задачу — после первой реплики вкладка получит название проекта и сохранится в списке сессий." : activeProject ? "Нажмите + в блоке «Сессии», чтобы создать новую сессию, или восстановите её из архива." : "Создайте новый проект или откройте «Топологию», чтобы сначала выбрать тип команды."}</p>
              {!canChat ? (
                <div className="empty-chat-actions">
                  {activeProject ? (
                    <button className="primary" type="button" onClick={() => createSession()}>
                      <i className="ti ti-message-plus" aria-hidden="true" /> Создать сессию
                    </button>
                  ) : (
                    <>
                      <button className="primary" type="button" onClick={() => createProject()}>
                        <i className="ti ti-plus" aria-hidden="true" /> Создать проект
                      </button>
                      <button type="button" onClick={() => setScreen("topology")}>
                        <i className="ti ti-sitemap" aria-hidden="true" /> Выбрать тип команды
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : session.messages.map((message) => (
            <MessageItem key={message.id} message={message} author={messageAuthorLabel(message)} />
          ))}
          {busy && liveFileActivity.length ? (
            <div className="live-files-panel">
              <div className="live-files-head">
                <span><i className="ti ti-files" aria-hidden="true" /> Файлы в работе</span>
                <small>{liveFileActivity.length} последних</small>
              </div>
              <div className="live-files-list">
                {liveFileActivity.slice(0, 8).map((item) => (
                  <div className={"live-file-item " + item.status} key={item.id}>
                    <span className="live-file-icon"><i className={"ti ti-" + (item.status === "failed" ? "alert-triangle" : item.status === "written" ? "check" : "pencil")} aria-hidden="true" /></span>
                    <div>
                      <b>{item.path}</b>
                      <small>{item.agentName} · {item.action === "create" ? "создаёт" : item.action === "plan" ? "план" : item.action === "error" ? "ошибка" : "редактирует"}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {busy ? <TeamThinking agents={agents} mode={activeRunMode ?? "planning"} projectTitle={activeProject?.title} /> : null}
          {queuedAgentQuestions.length ? (
            <div className="agent-queue-panel">
              <div className="live-files-head">
                <span><i className="ti ti-list-details" aria-hidden="true" /> Очередь вопросов агентам</span>
                <small>{queuedAgentQuestions.length}</small>
              </div>
              {queuedAgentQuestions.map((question, index) => {
                const target = agents.find((agent) => agent.id === question.targetAgentId);
                return (
                  <div className="queued-question" key={question.id}>
                    <span>{index + 1}</span>
                    <div>
                      <b>{target ? target.name : "Главный агент"}</b>
                      <small>{question.text}</small>
                    </div>
                    <button type="button" onClick={() => clearQueuedAgentQuestion(question.id)} title="Убрать из очереди">×</button>
                  </div>
                );
              })}
            </div>
          ) : null}
          {!busy && showDebateSummary ? (
            <DebateSummary artifact={artifact} roles={debateRoles} onGoToBuild={() => setScreen("build")} />
          ) : null}
          {!busy && !autoRunning && !appSettings.autoMode && canRunImplementation ? (
            <div className="chat-implementation-cta pulse-cta">
              <b>{implementationStarted ? "Реализация идёт — это не сброс плана" : "Дальше — запустить работу агентов"}</b>
              <p>{implementationStarted
                ? "Раунд завершён, файлы записаны в рабочую папку. Каждый клик запускает следующий раунд: агенты добавляют и правят файлы, прогресс сохраняется на диск."
                : "Нажмите кнопку: агенты перейдут от плана к реализации и начнут писать файлы в рабочую папку."}</p>
              <button className="primary wide" type="button" onClick={() => void handleRunImplementationRound()}>
                <i className="ti ti-player-play" aria-hidden="true" /> {implementationStarted ? "Продолжить реализацию" : "Запустить работу агентов"}
              </button>
            </div>
          ) : null}
        </div>
        </>
        )}
      </section>
      <aside className={rightPanelCollapsed ? "right-panel side-panel-collapsed" : "right-panel"}>
        {rightPanelCollapsed ? (
          <button
            className="panel-collapse-rail"
            type="button"
            title="Развернуть агентов"
            aria-label="Развернуть правую панель"
            onClick={() => setRightPanelCollapsed(false)}
          >
            <i className="ti ti-layout-sidebar-right-expand" aria-hidden="true" />
            <span>Агенты</span>
          </button>
        ) : (
        <>
        <div className="panel-heading compact">
          <div className="panel-title">Активные агенты</div>
          <button className="mini-action ghosty" type="button" title="Свернуть правую панель" aria-label="Свернуть правую панель" onClick={() => setRightPanelCollapsed(true)}>
            <i className="ti ti-layout-sidebar-right-collapse" aria-hidden="true" />
          </button>
        </div>
        {agents.map((agent) => <div className="agent-status" key={agent.id}><span className="agent-avatar" aria-hidden="true">{agentAvatar[agent.role]}</span><span className={"dot " + agent.status} /><div><b>{agent.name}</b><small>{modelLabel(agent.providerId, agent.modelId)}</small><small>{statusLabel[agent.status] ?? agent.status}</small></div></div>)}
        {visibleCheckpoints.length ? (
          <section className="agent-queue-panel">
            <div className="panel-title">Supervisor checkpoints</div>
            {visibleCheckpoints.map((checkpoint) => {
              const owner = agents.find((agent) => agent.id === checkpoint.leaseOwner);
              return (
                <div className="agent-status" key={checkpoint.id}>
                  <span className={"dot " + (checkpoint.status === "failed" ? "warning" : checkpoint.status === "active" ? "typing" : "done")} />
                  <div>
                    <b>{owner?.name ?? checkpoint.leaseOwner}</b>
                    <small>{checkpoint.status} · lease до {new Date(checkpoint.leaseExpiresAt).toLocaleTimeString()}</small>
                    {checkpoint.replacementAgentId ? <small>recovered from {checkpoint.agentId}</small> : null}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}
        {agentDialogOpen || agentDialogMessages.length ? (
          <section className="agent-dialog-panel">
            <div className="agent-dialog-head">
              <div>
                <b>Отдельный чат агента</b>
                <small>{activeDialogAgent ? activeDialogAgent.name : "очередь вопросов"}</small>
              </div>
              <div className="agent-dialog-actions">
                {agentDialogMessages.length ? (
                  <button className="mini-action ghosty" type="button" title="Очистить отдельный чат" onClick={clearAgentDialog}>
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                ) : null}
                <button className="mini-action ghosty" type="button" title={agentDialogOpen ? "Свернуть чат агента" : "Открыть чат агента"} onClick={() => setAgentDialogOpen(!agentDialogOpen)}>
                  <i className={"ti ti-" + (agentDialogOpen ? "chevron-up" : "chevron-down")} aria-hidden="true" />
                </button>
              </div>
            </div>
            {agentDialogOpen ? (
              <>
                <div className="agent-dialog-list" ref={agentDialogListRef}>
                  {agentDialogMessages.length === 0 ? (
                    <p className="small-muted">Вопросы агенту из очереди появятся здесь, а основной диалог останется на месте.</p>
                  ) : agentDialogMessages.map((message) => (
                    <MessageItem key={message.id} message={message} author={agentDialogAuthorLabel(message)} />
                  ))}
                  {agentDialogBusy ? (
                    <div className="agent-dialog-typing">
                      <span className="team-thinking-spinner" aria-hidden="true" />
                      <small>Агент отвечает в отдельном чате…</small>
                    </div>
                  ) : null}
                </div>
                {queuedAgentQuestions.length ? <p className="agent-dialog-queue-note">В очереди ещё: {queuedAgentQuestions.length}</p> : null}
              </>
            ) : null}
          </section>
        ) : null}
        <div className="panel-title spaced">MCP</div>
        <p className="small-muted">{describeMcpHealth(mcpServers)}</p>
        <div className="tool-list">{tools.slice(0, 7).map((tool) => <Chip key={tool.id} tone={tool.kind === "web-search" ? "info" : "default"}>{tool.label}</Chip>)}</div>
        <button className="ghost wide" type="button" onClick={() => setScreen("mcp")}>Настроить MCP</button>
        <div className="panel-title spaced">Workspace</div>
        <p className="small-muted workspace-path" title={workspacePath}>{workspacePath ?? "Папка не выбрана"}</p>
        <div className="tool-list">
          <button className="chip-button" type="button" disabled={selectingWorkspace} onClick={() => void handleSelectWorkspace()}>{selectingWorkspace ? "Выбираем..." : workspacePath ? "Сменить папку" : "Выбрать папку"}</button>
          {workspacePath ? <button className="chip-button" type="button" disabled={busy} onClick={clearWorkspaceFolder}>Сброс</button> : null}
          <button className="chip-button on" type="button" disabled={busy} onClick={() => void initWorkspace(true)}>init</button>
        </div>
        {lastWorkspaceInit ? <p className="small-muted init-result">{lastWorkspaceInit.createdFiles.length} создано · {lastWorkspaceInit.existingFiles.length} уже было</p> : null}
        </>
        )}
      </aside>
      {libraryView === "chat" ? (
        <form className="composer" onSubmit={(event) => void submitPrompt(event)}>
          <div className="composer-main">
            <div className="composer-topline">
              <span className="composer-kicker">{projectQuestionMode ? "Вопрос по готовому проекту" : "\u0417\u0430\u0434\u0430\u0447\u0430 \u0434\u043b\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u044b"}</span>
              <span className="composer-hint">{"Enter \u2014 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u00b7 Shift+Enter \u2014 \u043d\u043e\u0432\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430"}</span>
            </div>
            <ComposerLimitBar
              provider={selectedQuestionProvider}
              providers={providers}
              expanded={limitsExpanded}
              now={nowTick}
              onToggle={() => setLimitsExpanded((value) => !value)}
              onOpenProviders={() => setScreen("providers")}
            />
            <div className="composer-input-row">
              <div className="agent-target-box">
                <select
                  aria-label="\u041a\u043e\u043c\u0443 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0432\u043e\u043f\u0440\u043e\u0441"
                  className="agent-target-select"
                  disabled={!canChat || projectQuestionMode}
                  value={selectedQuestionAgentId}
                  onChange={(event) => setAgentQuestionTargetId(event.target.value)}
                  title={projectQuestionMode ? "Проект завершён: вопросы принимает только главный агент" : busy || autoRunning || agentDialogBusy ? "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u043f\u0430\u0434\u0451\u0442 \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c \u0438 \u043e\u0442\u043a\u0440\u043e\u0435\u0442\u0441\u044f \u0432 \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e\u043c \u0447\u0430\u0442\u0435 \u0430\u0433\u0435\u043d\u0442\u0430" : "\u041a\u043e\u043c\u0443 \u0430\u0434\u0440\u0435\u0441\u043e\u0432\u0430\u0442\u044c \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0443\u044e \u0440\u0435\u043f\u043b\u0438\u043a\u0443"}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agentDisplayName(agent, appSettings.operatorDefaultAgentId)}</option>
                  ))}
                </select>
                <span>{projectQuestionMode ? "Отвечает главный" : "\u0417\u0430\u0434\u0430\u0439 \u0432\u043e\u043f\u0440\u043e\u0441"}</span>
              </div>
              <textarea
                aria-label={projectQuestionMode ? "Вопрос по готовому проекту" : "\u0417\u0430\u0434\u0430\u0447\u0430 \u0434\u043b\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u044b"}
                disabled={!canChat}
                placeholder={canChat ? projectQuestionMode ? "Спросите о готовом проекте — ответит только главный агент…" : busy || autoRunning || agentDialogBusy ? "\u0412\u043e\u043f\u0440\u043e\u0441 \u0430\u0433\u0435\u043d\u0442\u0443 \u043f\u043e\u043f\u0430\u0434\u0451\u0442 \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c \u0438 \u043e\u0442\u043a\u0440\u043e\u0435\u0442\u0441\u044f \u0441\u043f\u0440\u0430\u0432\u0430\u2026" : "\u0417\u0430\u0434\u0430\u0447\u0430 \u0434\u043b\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u044b\u2026 \u0438\u043b\u0438 /init" : "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u0430\u043a\u0442\u0438\u0432\u043d\u0443\u044e \u0441\u0435\u0441\u0441\u0438\u044e"}
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
            </div>
          </div>
          <div className="composer-actions">
            <button className="primary" type="submit" disabled={!prompt.trim() || !canChat}>{busy || autoRunning || agentDialogBusy ? (projectQuestionMode ? "В очередь к главному" : "\u0412 \u043e\u0447\u0435\u0440\u0435\u0434\u044c") : projectQuestionMode ? "Спросить" : "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c"}</button>
            <button type="button" onClick={() => setScreen("build")}>{"\u041a \u0440\u0435\u0448\u0435\u043d\u0438\u044e"}</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
