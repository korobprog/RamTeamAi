import { describe, expect, it } from "vitest";
import { buildDiagnosticIssueUrl, buildDiagnosticReport } from "../reporting";
import type { DiagnosticEntry } from "../../types";

const entries: DiagnosticEntry[] = [
  {
    id: "diag-1",
    fingerprint: "fp-1",
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:05:00.000Z",
    severity: "error",
    category: "ai",
    title: "Agent failed to finish step",
    message: "No file blocks returned",
    source: "runTeam",
    context: { agent: "coder" },
    stack: "Error: boom",
    count: 2,
  },
];

describe("diagnostic reporting helpers", () => {
  it("builds a text report with the main entry fields", () => {
    const report = buildDiagnosticReport(entries, "text");
    expect(report).toContain("RamTeamAi diagnostics report");
    expect(report).toContain("[ERROR] AI");
    expect(report).toContain("Agent failed to finish step");
    expect(report).toContain("agent: coder");
  });

  it("builds a markdown report with stack details", () => {
    const report = buildDiagnosticReport(entries, "markdown");
    expect(report).toContain("# RamTeamAi diagnostics report");
    expect(report).toContain("## 1. [ERROR] Agent failed to finish step");
    expect(report).toContain("```text");
    expect(report).toContain("Error: boom");
  });

  it("builds a GitHub issue url with encoded diagnostics summary", () => {
    const url = buildDiagnosticIssueUrl(entries);
    expect(url).toContain("https://github.com/korobprog/RamTeamAi/issues/new?");
    expect(url).toContain(encodeURIComponent("[Diagnostics] Agent failed to finish step"));
    expect(url).toContain(encodeURIComponent("## Summary"));
  });
});
