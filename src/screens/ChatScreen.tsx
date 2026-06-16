import { useState, type FormEvent } from "react";
import { Chip } from "../components/FNeurogatee";
import { RoleBadge, roleLabel } from "../components/RoleBadge";
import { describeMcpHealth, listAvailableTools } from "../mcp/manager";
import { useAppStore } from "../store/appStore";

const statusLabel: Record<string, string> = { typing: "пишет", mcp: "MCP", done: "готов", waiting: "ждёт" };

export function ChatScreen() {
  const [prompt, setPrompt] = useState("");
  const agents = useAppStore((state) => state.agents);
  const providers = useAppStore((state) => state.providers);
  const session = useAppStore((state) => state.session);
  const mcpServers = useAppStore((state) => state.mcpServers);
  const runTeam = useAppStore((state) => state.runTeam);
  const setSessionMode = useAppStore((state) => state.setSessionMode);
  const setScreen = useAppStore((state) => state.setScreen);
  const busy = useAppStore((state) => state.busy);
  const tools = listAvailableTools(mcpServers).filter((tool) => tool.enabled);

  function modelLabel(providerId: string, modelId: string): string {
    const provider = providers.find((item) => item.id === providerId);
    return provider?.models.find((model) => model.id === modelId)?.label ?? provider?.name ?? "";
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy) return;
    setPrompt("");
    await runTeam(value);
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar-panel">
        <div className="panel-title">Сессии</div>
        <button className="session-pill active" type="button">{session.title}<small>{session.messages.length} реплик</small></button>
        <button className="session-pill" type="button">Новый проект<small>Planning draft</small></button>
        <div className="panel-title spaced">Команда</div>
        {agents.map((agent) => <div className="agent-mini" key={agent.id}><RoleBadge role={agent.role} /><span>{agent.name}</span></div>)}
      </aside>
      <section className="conversation-panel">
        <div className="chat-toolbar">
          <button className={session.mode === "planning" ? "chip-button on" : "chip-button"} type="button" onClick={() => setSessionMode("planning")}>Planning</button>
          <button className={session.mode === "chat" ? "chip-button on" : "chip-button"} type="button" onClick={() => setSessionMode("chat")}>Chat</button>
          <span><i className="ti ti-coin" aria-hidden="true" /> {session.tokensUsed.toLocaleString("ru-RU")} / {session.tokenBudget.toLocaleString("ru-RU")}</span>
        </div>
        <div className="message-list">
          {session.messages.map((message) => (
            <article className={"message " + (message.agentRole ?? "user")} key={message.id}>
              <div className="message-author">{message.agentRole ? roleLabel(message.agentRole) : "Пользователь"}{message.tool ? <em> · {message.tool}</em> : null}</div>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
        <form className="composer" onSubmit={(event) => void submitPrompt(event)}>
          <input
            aria-label="Задача для команды"
            disabled={busy}
            placeholder="Задача для команды…"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button className="primary" type="submit" disabled={busy || !prompt.trim()}>{busy ? "…" : "Отправить"}</button>
          <button type="button" onClick={() => setScreen("build")}>К решению</button>
        </form>
      </section>
      <aside className="right-panel">
        <div className="panel-title">Активные агенты</div>
        {agents.map((agent) => <div className="agent-status" key={agent.id}><span className={"dot " + agent.status} /><div><b>{agent.name}</b><small>{modelLabel(agent.providerId, agent.modelId)}</small><small>{statusLabel[agent.status] ?? agent.status}</small></div></div>)}
        <div className="panel-title spaced">MCP</div>
        <p className="small-muted">{describeMcpHealth(mcpServers)}</p>
        <div className="tool-list">{tools.slice(0, 7).map((tool) => <Chip key={tool.id} tone={tool.kind === "web-search" ? "info" : "default"}>{tool.label}</Chip>)}</div>
      </aside>
    </div>
  );
}
