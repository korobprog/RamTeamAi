import type { AgentConfig } from "../types";

// In implementation mode the running team must include an engineer, otherwise
// planning roles keep discussing and never emit writable file blocks.
export function implementationRank(agent: AgentConfig): number {
  let score = 0;
  if (agent.role === "coder") score += 100;
  if (agent.tools.includes("project-builder")) score += 10;
  if (agent.tools.includes("files")) score += 5;
  return score;
}

export function selectImplementationAgents(agents: AgentConfig[], limit = 3): AgentConfig[] {
  if (agents.length <= limit) return agents;
  const ranked = [...agents].sort((a, b) => implementationRank(b) - implementationRank(a));
  const selected = ranked.slice(0, limit);
  const builder = ranked.find((agent) => implementationRank(agent) >= 100 || agent.tools.includes("project-builder"));
  if (builder && !selected.some((agent) => agent.id === builder.id)) {
    selected[selected.length - 1] = builder;
  }
  // Lead with the strongest builder so it sets the code-writing tone of the round.
  return selected.sort((a, b) => implementationRank(b) - implementationRank(a));
}
