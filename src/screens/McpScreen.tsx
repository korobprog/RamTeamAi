import { useEffect, useMemo, useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { describeMcpHealth } from "../mcp/manager";
import { useAppStore } from "../store/appStore";
import type { McpServerConfig, McpServerTestResult, McpToolCallResult } from "../types";

const L = {
  title: "MCP-сервисы",
  subtitle: "Подключай внешние MCP-серверы по stdio или Streamable HTTP, проверяй инструменты и вызывай их вручную.",
  add: "+ Добавить MCP",
  name: "Название",
  transport: "Транспорт",
  commandOrUrl: "Команда или URL",
  enabled: "Доступен агентам",
  save: "Сохранить",
  cancel: "Отмена",
  test: "Подключить / обновить tools",
  testing: "Подключаем...",
  delete: "Удалить",
  tools: "Инструменты",
  noTools: "Инструменты появятся после успешного подключения.",
  callTool: "Вызвать tool",
  arguments: "JSON-аргументы",
  result: "Результат",
  invalidJson: "Некорректный JSON аргументов.",
};

function createDraft(): McpServerConfig {
  return {
    id: "mcp-" + Date.now(),
    name: "Новый MCP server",
    transport: "stdio",
    commandOrUrl: "",
    enabled: true,
    tools: [],
    status: "not-configured",
  };
}

function statusLabel(server: McpServerConfig): string {
  if (!server.enabled) return "выключен";
  if (server.status === "connected") return "подключен";
  if (server.status === "warning") return "ошибка";
  return "не проверен";
}

function statusTone(server: McpServerConfig): "default" | "success" | "warning" {
  if (server.status === "connected" && server.enabled) return "success";
  if (server.status === "warning") return "warning";
  return "default";
}

export function McpScreen() {
  const servers = useAppStore((state) => state.mcpServers);
  const upsertMcpServer = useAppStore((state) => state.upsertMcpServer);
  const removeMcpServer = useAppStore((state) => state.removeMcpServer);
  const testMcpServer = useAppStore((state) => state.testMcpServer);
  const invokeMcpTool = useAppStore((state) => state.callMcpTool);
  const busy = useAppStore((state) => state.busy);

  const [selectedServerId, setSelectedServerId] = useState(servers[0]?.id ?? "");
  const [draft, setDraft] = useState<McpServerConfig | null>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, McpServerTestResult>>({});
  const [selectedTool, setSelectedTool] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolResult, setToolResult] = useState<McpToolCallResult | null>(null);
  const [toolError, setToolError] = useState("");

  const selectedServer = useMemo(() => servers.find((server) => server.id === selectedServerId) ?? servers[0], [servers, selectedServerId]);

  useEffect(() => {
    if (servers.length > 0 && !servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  useEffect(() => {
    if (!selectedServer) {
      setSelectedTool("");
      return;
    }
    if (!selectedServer.tools.includes(selectedTool)) {
      setSelectedTool(selectedServer.tools[0] ?? "");
    }
  }, [selectedServer, selectedTool]);

  function openEditor(server: McpServerConfig) {
    setDraft({ ...server, tools: [...server.tools] });
    setToolResult(null);
    setToolError("");
  }

  function patchDraft(patch: Partial<McpServerConfig>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function saveDraft() {
    if (!draft) return;
    upsertMcpServer(draft);
    setSelectedServerId(draft.id);
    setDraft(null);
  }

  async function handleTest(serverId: string) {
    setTestingServerId(serverId);
    const result = await testMcpServer(serverId);
    if (result) setTestResults((current) => ({ ...current, [serverId]: result }));
    setTestingServerId(null);
  }

  async function handleCallTool() {
    if (!selectedServer || !selectedTool) return;
    setToolResult(null);
    setToolError("");
    let parsedArgs: unknown;
    try {
      parsedArgs = toolArgs.trim() ? JSON.parse(toolArgs) : {};
    } catch {
      setToolError(L.invalidJson);
      return;
    }

    try {
      const result = await invokeMcpTool(selectedServer.id, selectedTool, parsedArgs);
      if (result) setToolResult(result);
    } catch (error) {
      setToolError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="screen-stack">
      <div className="toolbar">
        <SectionTitle icon="plug-connected" title={L.title} subtitle={L.subtitle} />
        <button className="primary" type="button" onClick={() => setDraft(createDraft())}>{L.add}</button>
      </div>

      <div className="mcp-layout">
        <aside className="mcp-list" aria-label="MCP servers">
          <p className="small-muted">{describeMcpHealth(servers)}</p>
          {servers.map((server) => {
            const result = testResults[server.id];
            const isSelected = selectedServer?.id === server.id;
            const isTesting = testingServerId === server.id;
            return (
              <button className={isSelected ? "mcp-card selected" : "mcp-card"} key={server.id} type="button" onClick={() => { setSelectedServerId(server.id); setDraft(null); }}>
                <span>
                  <b>{server.name}</b>
                  <small>{server.transport} · {server.commandOrUrl || "не задано"}</small>
                </span>
                <Chip tone={statusTone(server)}>{isTesting ? L.testing : statusLabel(server)}</Chip>
                {result ? <small className={result.ok ? "status-ok" : "mcp-error"}>{result.message}</small> : null}
              </button>
            );
          })}
        </aside>

        <section className="mcp-editor">
          {draft ? (
            <>
              <div className="panel-title">Настройка MCP-сервера</div>
              <div className="form-grid">
                <label>{L.name}<input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} /></label>
                <label>ID<input value={draft.id} onChange={(event) => patchDraft({ id: event.target.value.trim() })} /></label>
                <label>{L.transport}<select value={draft.transport} onChange={(event) => patchDraft({ transport: event.target.value as McpServerConfig["transport"] })}><option value="stdio">stdio command</option><option value="http">Streamable HTTP</option></select></label>
                <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => patchDraft({ enabled: event.target.checked })} />{L.enabled}</label>
              </div>
              <label className="textarea-label">{L.commandOrUrl}<textarea value={draft.commandOrUrl} onChange={(event) => patchDraft({ commandOrUrl: event.target.value })} placeholder={draft.transport === "stdio" ? "npx -y @modelcontextprotocol/server-filesystem ." : "http://localhost:3000/mcp"} /></label>
              <div className="bottom-bar">
                <button type="button" onClick={() => setDraft(null)}>{L.cancel}</button>
                <button className="primary" type="button" onClick={saveDraft} disabled={!draft.name.trim() || !draft.id.trim()}>{L.save}</button>
              </div>
            </>
          ) : selectedServer ? (
            <>
              <div className="mcp-detail-header">
                <div>
                  <h2>{selectedServer.name}</h2>
                  <p className="small-muted">{selectedServer.transport} · {selectedServer.commandOrUrl}</p>
                </div>
                <Chip tone={statusTone(selectedServer)}>{statusLabel(selectedServer)}</Chip>
              </div>
              <div className="mcp-actions">
                <button className="primary" disabled={busy || testingServerId === selectedServer.id} type="button" onClick={() => void handleTest(selectedServer.id)}>{testingServerId === selectedServer.id ? L.testing : L.test}</button>
                <button type="button" onClick={() => openEditor(selectedServer)}>Настройки</button>
                <button type="button" onClick={() => { removeMcpServer(selectedServer.id); setDraft(null); }}>{L.delete}</button>
              </div>
              {selectedServer.lastError ? <p className="mcp-error">{selectedServer.lastError}</p> : null}

              <div className="panel-title spaced">{L.tools}</div>
              {selectedServer.tools.length > 0 ? (
                <div className="tool-list">{selectedServer.tools.map((tool) => <Chip key={tool}>{tool}</Chip>)}</div>
              ) : <p className="small-muted">{L.noTools}</p>}

              <div className="panel-title spaced">{L.callTool}</div>
              <div className="form-grid compact">
                <label>{L.tools}<select value={selectedTool} onChange={(event) => setSelectedTool(event.target.value)} disabled={selectedServer.tools.length === 0}>{selectedServer.tools.map((tool) => <option value={tool} key={tool}>{tool}</option>)}</select></label>
                <button className="primary" disabled={busy || !selectedTool} type="button" onClick={() => void handleCallTool()}>{L.callTool}</button>
              </div>
              <label className="textarea-label">{L.arguments}<textarea value={toolArgs} onChange={(event) => setToolArgs(event.target.value)} /></label>
              {toolError ? <p className="mcp-error">{toolError}</p> : null}
              {toolResult ? (
                <div className="mcp-result">
                  <div className="panel-title">{L.result} · {toolResult.latencyMs} ms · {toolResult.ok ? "ok" : "error"}</div>
                  <pre>{toolResult.content || JSON.stringify(toolResult.raw, null, 2)}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <p className="small-muted">Добавь MCP-сервер, чтобы инструменты стали доступны агентам.</p>
          )}
        </section>
      </div>
    </div>
  );
}
