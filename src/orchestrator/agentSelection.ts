import type { AgentConfig, AgentRunMode, TopologyKind } from "../types";

// In implementation mode the running team must include an engineer, otherwise
// planning roles keep discussing and never emit writable file blocks.
export function implementationRank(agent: AgentConfig): number {
  let score = 0;
  if (agent.role === "coder") score += 100;
  if (agent.tools.includes("project-builder")) score += 10;
  if (agent.tools.includes("files")) score += 5;
  return score;
}

function canProduceImplementation(agent: AgentConfig): boolean {
  return agent.role === "coder" || agent.tools.includes("project-builder");
}

function implementationPool(agents: AgentConfig[]): AgentConfig[] {
  const coders = agents.filter((agent) => agent.role === "coder");
  if (coders.length) return coders;

  const builders = agents.filter(canProduceImplementation);
  if (builders.length) return builders;

  // Last-resort fallback keeps older/custom setups usable, but ordinary
  // implementation rounds should never prefer discussion roles over engineers.
  return agents;
}

export function selectImplementationAgents(agents: AgentConfig[], limit = 3): AgentConfig[] {
  const pool = implementationPool(agents);
  if (pool.length <= limit) return [...pool].sort((a, b) => implementationRank(b) - implementationRank(a));
  const ranked = [...pool].sort((a, b) => implementationRank(b) - implementationRank(a));
  const selected = ranked.slice(0, limit);
  const builder = ranked.find((agent) => implementationRank(agent) >= 100 || agent.tools.includes("project-builder"));
  if (builder && !selected.some((agent) => agent.id === builder.id)) {
    selected[selected.length - 1] = builder;
  }
  // Lead with the strongest builder so it sets the code-writing tone of the round.
  return selected.sort((a, b) => implementationRank(b) - implementationRank(a));
}

export function selectRunAgents(
  agents: AgentConfig[],
  options: {
    mode: AgentRunMode;
    topologyKind: TopologyKind;
    targetAgent?: AgentConfig;
    implementationLimit?: number;
    planningLimit?: number;
  },
): AgentConfig[] {
  if (options.targetAgent) return [options.targetAgent];
  // Implementation must always be code-capable, even in pipeline topology. The
  // pipeline mode is useful for planning, but in implementation it causes review
  // roles to talk in circles instead of writing files.
  if (options.mode === "implementation") {
    return selectImplementationAgents(agents, options.implementationLimit ?? 3);
  }
  if (options.topologyKind === "pipeline") return agents;
  return agents.slice(0, Math.min(agents.length, options.planningLimit ?? 3));
}
