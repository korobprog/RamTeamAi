import { describe, expect, it } from "vitest";
import { agentsSeed } from "../../data/seed";
import { implementationRank, selectImplementationAgents, selectRunAgents } from "../agentSelection";
import type { AgentConfig, AgentRole, ToolKind } from "../../types";

function agent(id: string, role: AgentRole, tools: ToolKind[] = []): AgentConfig {
  return {
    id,
    name: id,
    role,
    providerId: "p",
    modelId: "m",
    systemPrompt: "",
    tokenBudget: 4096,
    tools,
    status: "waiting",
  };
}

describe("implementationRank", () => {
  it("ranks the coder above planning roles", () => {
    expect(implementationRank(agent("c", "coder", ["project-builder"]))).toBeGreaterThan(
      implementationRank(agent("a", "architect")),
    );
  });
});

describe("selectImplementationAgents", () => {
  it("prefers coders even when project-builder planning roles are within the limit", () => {
    const team = [agent("a", "architect", ["project-builder"]), agent("c", "coder")];
    expect(selectImplementationAgents(team, 3).map((item) => item.id)).toEqual(["c"]);
  });

  it("always includes an engineer so the round can write files", () => {
    const team = [
      agent("a", "architect"),
      agent("cr", "critic"),
      agent("r", "researcher"),
      agent("p", "product"),
      agent("c", "coder", ["project-builder", "files"]),
    ];
    const selected = selectImplementationAgents(team, 3);
    expect(selected.some((item) => item.role === "coder")).toBe(true);
    // The engineer should lead the round.
    expect(selected[0].role).toBe("coder");
  });

  it("filters out review-only roles when code-capable agents are available", () => {
    const team = [
      agent("cr", "critic", ["files"]),
      agent("r", "researcher", ["mcp"]),
      agent("c", "coder", ["project-builder", "files"]),
      agent("t", "tester", ["files", "mcp"]),
      agent("a", "architect", ["project-builder"]),
    ];
    const selected = selectImplementationAgents(team, 3);
    expect(selected.map((item) => item.id)).toEqual(["c", "t"]);
  });

  it("falls back to project-builder agents only when no coder exists", () => {
    const team = [
      agent("cr", "critic", ["files"]),
      agent("a", "architect", ["project-builder"]),
    ];
    expect(selectImplementationAgents(team, 3).map((item) => item.id)).toEqual(["a"]);
  });

  it("uses the coder plus QA agent from the default team for implementation", () => {
    expect(selectImplementationAgents(agentsSeed, 3).map((item) => item.role)).toEqual(["coder", "tester"]);
  });
});

describe("selectRunAgents", () => {
  it("keeps pipeline topology for planning", () => {
    const team = [agent("a", "architect"), agent("cr", "critic"), agent("r", "researcher"), agent("c", "coder")];
    expect(selectRunAgents(team, { mode: "planning", topologyKind: "pipeline" }).map((item) => item.id)).toEqual(["a", "cr", "r", "c"]);
  });

  it("ignores pipeline topology during implementation and runs only code-capable agents", () => {
    const team = [
      agent("a", "architect"),
      agent("cr", "critic"),
      agent("r", "researcher"),
      agent("c", "coder", ["project-builder", "files"]),
    ];
    expect(selectRunAgents(team, { mode: "implementation", topologyKind: "pipeline", implementationLimit: 3 }).map((item) => item.id)).toEqual(["c"]);
  });
});
