import { describe, expect, it } from "vitest";
import { implementationRank, selectImplementationAgents } from "../agentSelection";
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
  it("keeps all agents when within the limit", () => {
    const team = [agent("a", "architect"), agent("c", "coder")];
    expect(selectImplementationAgents(team, 3)).toHaveLength(2);
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
    expect(selected).toHaveLength(3);
    expect(selected.some((item) => item.role === "coder")).toBe(true);
    // The engineer should lead the round.
    expect(selected[0].role).toBe("coder");
  });
});
