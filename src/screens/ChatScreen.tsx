import { useState, type FormEvent } from "react";
import { Chip } from "../components/FRamTeamAie";
import { RoleBadge, roleLabel } from "../components/RoleBadge";
import { TeamThinking } from "../components/TeamThinking";
import { DebateSummary } from "../components/DebateSummary";
import { describeMcpHealth, listAvailableTools } from "../mcp/manager";
import { useAppStore } from "../store/appStore";
import type { AgentRole, ChatMessage } from "../types";

const COLLAPSE_LIMIT = 360;

function MessageItem({ message, author }: { message: ChatMessage; author: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.text.length > COLLAPSE_LIMIT;
  const shown = isLong && !expanded ? message.text.slice(0, COLLAPSE_LIMIT).trimEnd() + "…" : message.text;
  return (
    <article className={"message " + (message.agentRole ?? message.author)}>
      <div className="message-author">{author}{message.tool ? <em> · {message.tool}</em> : null}</div>
      <p>{shown}</p>
      {isLong ? (
        <button className="message-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Свернуть" : "Показать полностью"}
        </button>
      ) : null}
    </article>
  );
}

const statusLabel: Record<string, string> = { typing: "пишет", mcp: "MCP", done: "готов", waiting: "ждёт" };
const initCommandPattern = /^\/?init$/i;
const projectStatusLabel = { draft: "Черновик", active: "В работе", scaffolded: "Каркас", built: "Собран" };

export function ChatScreen() {
  const [prompt, setPrompt] = useState("");
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const agents = useAppStore((state) => state.agents);
  const providers = useAppStore((state) => state.providers);
  const projects = useAppStore((state) => state.projects);
  const sessions = useAppStore((state) => state.sessions);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const session = useAppStore((state) => state.session);
  const mcpServers = useAppStore((state) => state.mcpServers);
  const runTeam = useAppStore((state) => state.runTeam);
  const createProject = useAppStore((state) => state.createProject);
  const createSession = useAppStore((state) => state.createSession);
  const selectProject = useAppStore((state) => state.selectProject);
  const selectSession = useAppStore((state) => state.selectSession);
  const archiveProject = useAppStore((state) => state.archiveProject);
  const archiveSession = useAppStore((state) => state.archiveSession);
  const restoreProject = useAppStore((state) => state.restoreProject);
  const restoreSession = useAppStore((state) => state.restoreSession);
  const workspacePath = useAppStore((state) => state.workspacePath);
  const selectWorkspaceFolder = useAppStore((state) => state.selectWorkspaceFolder);
  const clearWorkspaceFolder = useAppStore((state) => state.clearWorkspaceFolder);
  const initWorkspace = useAppStore((state) => state.initWorkspace);
  const lastWorkspaceInit = useAppStore((state) => state.lastWorkspaceInit);
  const setSessionMode = useAppStore((state) => state.setSessionMode);
  const setScreen = useAppStore((state) => state.setScreen);
  const artifact = useAppStore((state) => state.artifact);
  const busy = useAppStore((state) => state.busy);
  const tools = listAvailableTools(mcpServers).filter((tool) => tool.enabled);
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const archivedProjects = projects.filter((project) => project.archivedAt);
  const activeProject = activeProjects.find((project) => project.id === activeProjectId);
  const projectSessions = sessions.filter((item) => item.projectId === activeProjectId && !item.archivedAt);
  const archivedSessions = sessions.filter((item) => item.archivedAt && !projects.find((project) => project.id === item.projectId)?.archivedAt);
  const canChat = Boolean(activeProject && activeSessionId);
  const hasUserTask = session.messages.some((message) => message.author === "user" && message.text.trim());
  const agentMessages = session.messages.filter((message) => Boolean(message.agentRole));
  const debateRoles = agentMessages.map((message) => message.agentRole as AgentRole);
  const showDebateSummary = hasUserTask && session.mode === "planning" && agentMessages.length > 0;
  const showTaskGuard = canChat && !hasUserTask && !busy;
  const canRunImplementation = canChat && hasUserTask && (artifact.status === "scaffolded" || artifact.status === "built");

  function modelLabel(providerId: string, modelId: string): string {
    const provider = providers.find((item) => item.id === providerId);
    return provider?.models.find((model) => model.id === modelId)?.label ?? provider?.name ?? "";
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy || !canChat) return;
    setPrompt("");
    if (initCommandPattern.test(value)) {
      await initWorkspace(true);
      return;
    }
    await runTeam(value);
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
    if (!canRunImplementation || busy) return;
    await runTeam("Режим реализации: начните выполнять план как команда разработчиков. Разбейте работу по файлам, напишите следующий конкретный шаг реализации, укажите что менять в рабочей папке и какие проверки выполнить.");
  }

  function messageAuthorLabel(message: typeof session.messages[number]): string {
    if (message.agentRole) return roleLabel(message.agentRole);
    if (message.author === "system") return "Система";
    return "Пользователь";
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
    const count = sessions.filter((item) => item.projectId === projectId).length;
    return "проект · " + count + " " + pluralRu(count, "сессия", "сессии", "сессий");
  }

  function projectTitle(projectId: string): string {
    return projects.find((project) => project.id === projectId)?.title ?? "Проект";
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar-panel">
        <div className="panel-heading">
          <div className="panel-title">Проекты</div>
          <button className="mini-action" type="button" onClick={() => createProject()}>+</button>
        </div>
        {activeProjects.map((project) => (
          <div className={project.id === activeProjectId ? "session-row project-pill active" : "session-row project-pill"} key={project.id}>
            <button className="pill-main" type="button" onClick={() => selectProject(project.id)}>
              <span>{project.title}</span>
              <small>{projectMeta(project.id)}</small>
            </button>
            <button className="pill-action" type="button" title="Переместить проект в архив" onClick={() => archiveProject(project.id)}>Архив</button>
          </div>
        ))}
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
        {projectSessions.map((item) => (
          <div className={item.id === activeSessionId ? "session-row active" : "session-row"} key={item.id}>
            <button className="pill-main" type="button" onClick={() => selectSession(item.id)}>
              <span>{item.title}</span>
              <small>{sessionMeta(item)}</small>
            </button>
            <button className="pill-action" type="button" title="Переместить сессию в архив" onClick={() => archiveSession(item.id)}>Архив</button>
          </div>
        ))}
        <button className="session-pill create-pill" type="button" disabled={!activeProject} onClick={() => createSession()}>
          Новая сессия
          <small>{activeProject ? activeProject.title : "выберите проект"}</small>
        </button>
        <div className="panel-heading spaced">
          <div className="panel-title">Архив</div>
          <small>{archivedProjects.length + archivedSessions.length}</small>
        </div>
        {archivedProjects.length === 0 && archivedSessions.length === 0 ? <p className="small-muted archive-empty">Архив пуст</p> : null}
        {archivedProjects.map((project) => (
          <div className="session-row archive-row" key={project.id}>
            <div className="pill-main static">
              <span>{project.title}</span>
              <small>{projectArchiveMeta(project.id)}</small>
            </div>
            <button className="pill-action restore" type="button" title="Восстановить проект" onClick={() => restoreProject(project.id)}>Вернуть</button>
          </div>
        ))}
        {archivedSessions.map((item) => (
          <div className="session-row archive-row" key={item.id}>
            <div className="pill-main static">
              <span>{item.title}</span>
              <small>сессия · {projectTitle(item.projectId)}</small>
            </div>
            <button className="pill-action restore" type="button" title="Восстановить сессию" onClick={() => restoreSession(item.id)}>Вернуть</button>
          </div>
        ))}
        <div className="panel-title spaced">Команда</div>
        {agents.map((agent) => <div className="agent-mini" key={agent.id}><RoleBadge role={agent.role} /><span>{agent.name}</span></div>)}
      </aside>
      <section className="conversation-panel">
        <div className="chat-toolbar">
          <button className={session.mode === "planning" ? "chip-button on" : "chip-button"} type="button" disabled={!canChat} onClick={() => setSessionMode("planning")}>Planning</button>
          <button className={session.mode === "chat" ? "chip-button on" : "chip-button"} type="button" disabled={!canChat} onClick={() => setSessionMode("chat")}>Chat</button>
          <span><i className="ti ti-coin" aria-hidden="true" /> {session.tokensUsed.toLocaleString("ru-RU")} / {session.tokenBudget.toLocaleString("ru-RU")}</span>
        </div>
        <div className="message-list">
          {showTaskGuard ? (
            <div className="task-guard-card pulse-cta">
              <b>Сначала отправьте задачу</b>
              <p>Агенты не начнут разбор без контекста. Напишите, что нужно построить, исправить или исследовать — после этого команда поймёт, над чем работать.</p>
            </div>
          ) : null}
          {session.messages.length === 0 ? (
            <div className="empty-chat">
              <b>{canChat ? "Новая сессия готова" : activeProject ? "Активных сессий нет" : "Активных проектов нет"}</b>
              <p>{canChat ? "Опишите задачу — после первой реплики вкладка получит название проекта и сохранится в списке сессий." : activeProject ? "Нажмите + в блоке «Сессии», чтобы создать новую сессию, или восстановите её из архива." : "Нажмите + в блоке «Проекты», чтобы создать новый проект, или восстановите проект из архива."}</p>
            </div>
          ) : session.messages.map((message) => (
            <MessageItem key={message.id} message={message} author={messageAuthorLabel(message)} />
          ))}
          {busy ? <TeamThinking agents={agents} /> : null}
          {!busy && showDebateSummary ? (
            <DebateSummary artifact={artifact} roles={debateRoles} onGoToBuild={() => setScreen("build")} />
          ) : null}
          {!busy && canRunImplementation ? (
            <div className="chat-implementation-cta pulse-cta">
              <b>Дальше — запустить работу агентов</b>
              <p>Нажмите кнопку: агенты перейдут от плана к следующему раунду реализации и напишут, что делать в файлах.</p>
              <button className="primary wide" type="button" onClick={() => void handleRunImplementationRound()}>
                <i className="ti ti-player-play" aria-hidden="true" /> Запустить работу агентов
              </button>
            </div>
          ) : null}
        </div>
        <form className="composer" onSubmit={(event) => void submitPrompt(event)}>
          <input
            aria-label="Задача для команды"
            disabled={busy || !canChat}
            placeholder={canChat ? "Задача для команды… или /init" : "Сначала создайте активную сессию"}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button className="primary" type="submit" disabled={busy || !prompt.trim() || !canChat}>{busy ? "…" : "Отправить"}</button>
          <button type="button" onClick={() => setScreen("build")}>К решению</button>
        </form>
      </section>
      <aside className="right-panel">
        <div className="panel-title">Активные агенты</div>
        {agents.map((agent) => <div className="agent-status" key={agent.id}><span className={"dot " + agent.status} /><div><b>{agent.name}</b><small>{modelLabel(agent.providerId, agent.modelId)}</small><small>{statusLabel[agent.status] ?? agent.status}</small></div></div>)}
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
      </aside>
    </div>
  );
}
