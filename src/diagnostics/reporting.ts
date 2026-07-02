import { APP_GITHUB_URL } from "../config/appMeta";
import type { DiagnosticCategory, DiagnosticEntry, DiagnosticSeverity } from "../types";

export type DiagnosticCategoryFilter = "all" | DiagnosticCategory;
export type DiagnosticSeverityFilter = "all" | DiagnosticSeverity;
export type DiagnosticReportFormat = "text" | "markdown";

export const diagnosticLabel: Record<DiagnosticCategory, string> = {
  runtime: "Runtime",
  ai: "AI",
  provider: "Provider",
  mcp: "MCP",
  workspace: "Workspace",
  sync: "Sync",
  build: "Build",
};

export const diagnosticCategoryLabel: Record<DiagnosticCategoryFilter, string> = {
  all: "All",
  runtime: "runtime",
  ai: "AI",
  provider: "provider",
  mcp: "MCP",
  workspace: "workspace",
  sync: "sync",
  build: "build",
};

export const diagnosticSeverityLabel: Record<DiagnosticSeverityFilter, string> = {
  all: "All severities",
  info: "info",
  warning: "warning",
  error: "error",
};

export const diagnosticCategoryFilters: DiagnosticCategoryFilter[] = [
  "all",
  "ai",
  "mcp",
  "runtime",
  "build",
  "provider",
  "workspace",
  "sync",
];

export const diagnosticSeverityFilters: DiagnosticSeverityFilter[] = ["all", "error", "warning", "info"];

export function formatDiagnosticTimestamp(value: string): string {
  return new Date(value).toLocaleString("ru-RU");
}

export function buildDiagnosticReport(entries: DiagnosticEntry[], format: DiagnosticReportFormat = "text"): string {
  return format === "markdown" ? buildDiagnosticMarkdownReport(entries) : buildDiagnosticTextReport(entries);
}

export function buildDiagnosticIssueUrl(entries: DiagnosticEntry[]): string {
  const preview = buildDiagnosticTextReport(entries);
  const limitedPreview = preview.length > 1400 ? `${preview.slice(0, 1400)}\n...` : preview;
  const firstEntry = entries[0];
  const title = firstEntry
    ? `[Diagnostics] ${firstEntry.title}`
    : "[Diagnostics] New issue report";
  const body = [
    "## Summary",
    `- entries: ${entries.length}`,
    `- errors: ${entries.filter((entry) => entry.severity === "error").length}`,
    `- warnings: ${entries.filter((entry) => entry.severity === "warning").length}`,
    `- AI: ${entries.filter((entry) => entry.category === "ai").length}`,
    `- MCP: ${entries.filter((entry) => entry.category === "mcp").length}`,
    `- runtime: ${entries.filter((entry) => entry.category === "runtime").length}`,
    `- build: ${entries.filter((entry) => entry.category === "build").length}`,
    "",
    "## What happened",
    "Describe what you were doing and what result you expected.",
    "",
    "## Diagnostics preview",
    "```text",
    limitedPreview,
    "```",
    "",
    "> Full diagnostics report was copied from RamTeamAi before opening this issue.",
  ].join("\n");

  return `${APP_GITHUB_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

function buildDiagnosticTextReport(entries: DiagnosticEntry[]): string {
  return [
    "RamTeamAi diagnostics report",
    `Generated: ${new Date().toLocaleString("ru-RU")}`,
    `Entries: ${entries.length}`,
    "",
    ...entries.flatMap((entry, index) => {
      const contextLines = Object.entries(entry.context ?? {}).map(([key, value]) => `  - ${key}: ${value}`);
      return [
        `${index + 1}. [${entry.severity.toUpperCase()}] ${diagnosticLabel[entry.category]} | ${entry.title}`,
        `   time: ${formatDiagnosticTimestamp(entry.updatedAt)}`,
        `   repeats: ${entry.count}`,
        `   message: ${entry.message}`,
        entry.source ? `   source: ${entry.source}` : "",
        entry.agentId ? `   agentId: ${entry.agentId}` : "",
        entry.providerId ? `   providerId: ${entry.providerId}` : "",
        entry.projectId ? `   projectId: ${entry.projectId}` : "",
        entry.sessionId ? `   sessionId: ${entry.sessionId}` : "",
        contextLines.length ? "   context:" : "",
        ...contextLines,
        entry.details ? `   details: ${entry.details}` : "",
        entry.stack ? `   stack:\n${entry.stack}` : "",
        "",
      ].filter(Boolean);
    }),
  ].join("\n");
}

function buildDiagnosticMarkdownReport(entries: DiagnosticEntry[]): string {
  return [
    "# RamTeamAi diagnostics report",
    "",
    `- Generated: ${new Date().toLocaleString("ru-RU")}`,
    `- Entries: ${entries.length}`,
    "",
    ...entries.flatMap((entry, index) => {
      const contextLines = Object.entries(entry.context ?? {}).map(([key, value]) => `  - ${key}: ${value}`);
      return [
        `## ${index + 1}. [${entry.severity.toUpperCase()}] ${entry.title}`,
        "",
        `- Category: ${diagnosticLabel[entry.category]}`,
        `- Time: ${formatDiagnosticTimestamp(entry.updatedAt)}`,
        `- Repeats: ${entry.count}`,
        `- Message: ${entry.message}`,
        entry.source ? `- Source: ${entry.source}` : "",
        entry.agentId ? `- Agent: ${entry.agentId}` : "",
        entry.providerId ? `- Provider: ${entry.providerId}` : "",
        entry.projectId ? `- Project: ${entry.projectId}` : "",
        entry.sessionId ? `- Session: ${entry.sessionId}` : "",
        contextLines.length ? "- Context:" : "",
        ...contextLines,
        entry.details ? ["", "### Details", "", entry.details].join("\n") : "",
        entry.stack ? ["", "### Stack", "", "```text", entry.stack, "```"].join("\n") : "",
        "",
      ].filter(Boolean);
    }),
  ].join("\n");
}
