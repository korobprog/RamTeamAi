import { safeInvoke } from "../lib/tauri";
import type { McpServerConfig, McpServerTestResult, McpToolCallResult, ToolKind } from "../types";

export interface ToolRegistryEntry { id: string; label: string; kind: ToolKind; serverId?: string; enabled: boolean; }

export function listAvailableTools(servers: McpServerConfig[]): ToolRegistryEntry[] {
  const builtIns: ToolRegistryEntry[] = [
    { id: "files", label: "Файлы", kind: "files", enabled: true },
    { id: "project-builder", label: "Project Builder", kind: "project-builder", enabled: true },
  ];
  const mcpTools = servers.flatMap((server) => server.tools.map((tool) => ({
    id: server.id + ":" + tool,
    label: server.name + ": " + tool,
    kind: server.id === "web-search" ? "web-search" as const : "mcp" as const,
    serverId: server.id,
    enabled: server.enabled && server.status !== "warning",
  })));
  return [...builtIns, ...mcpTools];
}

export function describeMcpHealth(servers: McpServerConfig[]): string {
  const connected = servers.filter((server) => server.enabled && server.status === "connected").length;
  const tools = servers.reduce((sum, server) => sum + (server.enabled && server.status !== "warning" ? server.tools.length : 0), 0);
  return connected + "/" + servers.length + " MCP подключено · " + tools + " инструментов доступно агентам";
}

export function formatMcpToolsForPrompt(servers: McpServerConfig[]): string {
  const available = servers.filter((server) => server.enabled && server.status !== "warning" && server.tools.length > 0);
  if (available.length === 0) return "MCP: подключённых инструментов пока нет. Если нужен внешний контекст, попроси пользователя подключить MCP-сервер на экране MCP.";
  return [
    "Доступные MCP-инструменты:",
    ...available.map((server) => "- " + server.name + " (" + server.transport + ", id: " + server.id + "): " + server.tools.join(", ")),
    "Если для ответа нужен MCP-вызов, явно укажи сервер, инструмент и JSON-аргументы.",
  ].join("\n");
}

export async function testMcpConnection(server: McpServerConfig): Promise<McpServerTestResult> {
  return safeInvoke<McpServerTestResult>(
    "test_mcp_server",
    { server },
    () => {
      throw new Error("MCP-подключения доступны в Tauri desktop. Запусти npm run tauri:dev.");
    },
  );
}

export async function callMcpTool(server: McpServerConfig, toolName: string, args: unknown): Promise<McpToolCallResult> {
  return safeInvoke<McpToolCallResult>(
    "call_mcp_tool",
    { server, toolName, arguments: args },
    () => {
      throw new Error("MCP-вызовы доступны в Tauri desktop. Запусти npm run tauri:dev.");
    },
  );
}
