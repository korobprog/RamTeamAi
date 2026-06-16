import type { McpServerConfig, ToolKind } from "../types";

export interface ToolRegistryEntry { id: string; label: string; kind: ToolKind; serverId?: string; enabled: boolean; }

export function listAvailableTools(servers: McpServerConfig[]): ToolRegistryEntry[] {
  const builtIns: ToolRegistryEntry[] = [
    { id: "files", label: "Файлы", kind: "files", enabled: true },
    { id: "project-builder", label: "Project Builder", kind: "project-builder", enabled: true },
  ];
  const mcpTools = servers.flatMap((server) => server.tools.map((tool) => ({ id: server.id + ":" + tool, label: server.name + ": " + tool, kind: server.id === "web-search" ? "web-search" as const : "mcp" as const, serverId: server.id, enabled: server.enabled })));
  return [...builtIns, ...mcpTools];
}

export function describeMcpHealth(servers: McpServerConfig[]): string {
  const enabled = servers.filter((server) => server.enabled).length;
  const tools = servers.reduce((sum, server) => sum + (server.enabled ? server.tools.length : 0), 0);
  return enabled + "/" + servers.length + " MCP серверов · " + tools + " инструментов доступно агентам";
}
