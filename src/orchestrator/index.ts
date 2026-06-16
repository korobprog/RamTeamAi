import type { AgentConfig, ChatMessage, PlanArtifact, TopologyConfig } from "../types";

const roleLines: Record<string, string> = {
  architect: "Предлагаю модульную схему: provider adapters → orchestrator → MCP tools → project builder.",
  critic: "Проверка: нужны лимиты токенов, таймауты и явное подтверждение перед записью на диск.",
  researcher: "Через MCP/Web инструменты агент фиксирует источники и обновляет план перед Build.",
  arbiter: "Консенсус: сначала безопасный каркас, затем расширение провайдеров и топологий.",
};

export async function runPlanningRound(agents: AgentConfig[], topology: TopologyConfig, currentTokens: number, userPrompt = ""): Promise<ChatMessage[]> {
  const activeAgents = topology.kind === "pipeline" ? agents : agents.slice(0, Math.min(agents.length, 3));
  const focus = userPrompt.trim() || "продолжить развитие Neurogate MVP";
  const topologyNote = topology.kind === "debate"
    ? `Формат debate: сверяю аргументы с другими агентами, максимум ${topology.maxRounds} раундов.`
    : topology.kind === "pipeline"
      ? "Формат pipeline: передаю результат следующему агенту без потери контекста."
      : "Формат supervisor: выполняю подзадачу от ведущего агента.";
  await new Promise((resolve) => window.setTimeout(resolve, 420));

  return activeAgents.map((agent, index) => ({
    id: "round-" + Date.now() + "-" + agent.id,
    author: agent.id,
    agentRole: agent.role,
    text: `${topology.kind === "supervisor" && index > 0 ? agent.name + ": " : ""}${roleLines[agent.role]} Фокус задачи: ${focus}. ${topologyNote}`,
    createdAt: new Date().toISOString(),
    tokens: 740 + Math.round(currentTokens / 10_000) * 20 + index * 80,
    tool: agent.tools.includes("mcp") ? "mcp" : undefined,
  }));
}

export function synthesizePlan(messages: ChatMessage[], artifact: PlanArtifact): PlanArtifact {
  const risksMentioned = messages.some((message) => message.text.toLowerCase().includes("лимит"));
  return { ...artifact, edited: true, status: "draft", steps: risksMentioned ? artifact.steps : [...artifact.steps.slice(0, 4), "Добавить лимиты раундов/токенов и арбитра против зацикливания", ...artifact.steps.slice(4)] };
}
