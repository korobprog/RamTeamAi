import { useEffect, useMemo, useState } from "react";
import { SectionTitle, Chip } from "../components/FRamTeamAie";
import { RoleBadge } from "../components/RoleBadge";
import { roleLabel } from "../lib/roles";
import { useAppStore } from "../store/appStore";
import type { AgentConfig, AgentRole, ProviderConfig, ToolKind } from "../types";

const L = {
  subtitle: "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439 \u0430\u0433\u0435\u043d\u0442\u043e\u0432, \u043d\u0430\u0437\u043d\u0430\u0447\u0430\u0439 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u0430, \u043c\u043e\u0434\u0435\u043b\u044c, \u0440\u043e\u043b\u044c \u0438 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b",
  newAgent: "+ \u041d\u043e\u0432\u044b\u0439 \u0430\u0433\u0435\u043d\u0442",
  addProvider: "+ \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u0430",
  agentList: "\u0421\u043f\u0438\u0441\u043e\u043a \u0430\u0433\u0435\u043d\u0442\u043e\u0432",
  agentName: "\u0418\u043c\u044f \u0430\u0433\u0435\u043d\u0442\u0430",
  provider: "\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440",
  model: "\u041c\u043e\u0434\u0435\u043b\u044c",
  profession: "\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u044f",
  tokenBudget: "\u0411\u044e\u0434\u0436\u0435\u0442 \u0442\u043e\u043a\u0435\u043d\u043e\u0432",
  systemPrompt: "\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0439 \u043f\u0440\u043e\u043c\u043f\u0442",
  tools: "\u0418\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u044b",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  saveAgent: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0430\u0433\u0435\u043d\u0442\u0430",
};

const roleOptions: Array<{ value: AgentRole; label: string; prompt: string }> = [
  { value: "architect", label: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440", prompt: "\u0422\u044b \u0432\u0435\u0434\u0443\u0449\u0438\u0439 \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440. \u041f\u0440\u043e\u0435\u043a\u0442\u0438\u0440\u0443\u0439 \u0441\u043b\u043e\u0438 \u0438 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u044b \u043c\u043e\u0434\u0443\u043b\u044c\u043d\u043e." },
  { value: "coder", label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a", prompt: "\u0422\u044b \u0441\u0438\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a. \u041f\u0438\u0448\u0438 \u043f\u0440\u043e\u0441\u0442\u043e\u0439, \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043c\u044b\u0439 \u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c\u044b\u0439 \u043a\u043e\u0434." },
  { value: "critic", label: "\u041a\u0440\u0438\u0442\u0438\u043a", prompt: "\u0418\u0449\u0438 \u0440\u0438\u0441\u043a\u0438, \u043f\u0440\u043e\u0442\u0438\u0432\u043e\u0440\u0435\u0447\u0438\u044f, \u0441\u043b\u0430\u0431\u044b\u0435 \u043c\u0435\u0441\u0442\u0430 \u0430\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u0443\u0440\u044b \u0438 \u0434\u043e\u0440\u043e\u0433\u0438\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u044f." },
  { value: "researcher", label: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c", prompt: "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0439 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0441\u0432\u0435\u0434\u0435\u043d\u0438\u044f \u0447\u0435\u0440\u0435\u0437 web-search \u0438 MCP, \u0444\u0438\u043a\u0441\u0438\u0440\u0443\u0439 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438." },
  { value: "security", label: "\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c", prompt: "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0439 \u0443\u0433\u0440\u043e\u0437\u044b, \u0441\u0435\u043a\u0440\u0435\u0442\u044b, \u043f\u0440\u0430\u0432\u0430 \u0434\u043e\u0441\u0442\u0443\u043f\u0430, sandbox \u0438 \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435." },
  { value: "product", label: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442", prompt: "\u0414\u0443\u043c\u0430\u0439 \u043e \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u0441\u043a\u043e\u043c \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438, \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u0444\u0443\u043d\u043a\u0446\u0438\u0438, UX \u0438 \u043f\u0440\u0438\u043e\u0440\u0438\u0442\u0435\u0442\u0430\u0445." },
  { value: "tester", label: "\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0449\u0438\u043a", prompt: "\u0414\u0435\u0439\u0441\u0442\u0432\u0443\u0439 \u043a\u0430\u043a QA: \u0443\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0439 \u043f\u0430\u043a\u0435\u0442\u044b, \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0439 \u043f\u0440\u043e\u0435\u043a\u0442, build/lint/test/check, \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0439 UI \u0447\u0435\u0440\u0435\u0437 Browser/Playwright MCP \u0438 DevTools. \u0415\u0441\u043b\u0438 \u0435\u0441\u0442\u044c \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f, \u0441\u043e\u0437\u0434\u0430\u0439 \u0434\u0435\u043c\u043e-\u0430\u043a\u043a\u0430\u0443\u043d\u0442. \u0415\u0441\u043b\u0438 \u0442\u0435\u0441\u0442\u044b \u043f\u0430\u0434\u0430\u044e\u0442, \u0432\u0435\u0440\u043d\u0438 \u0430\u0433\u0435\u043d\u0442\u0430\u043c \u0447\u0435\u043a\u043b\u0438\u0441\u0442 \u043e\u0448\u0438\u0431\u043e\u043a; \u0435\u0441\u043b\u0438 \u0432\u0441\u0451 \u0437\u0435\u043b\u0451\u043d\u043e\u0435, \u0443\u0432\u0435\u0434\u043e\u043c\u0438 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f." },
  { value: "arbiter", label: "\u0410\u0440\u0431\u0438\u0442\u0440", prompt: "\u0421\u0432\u043e\u0434\u0438 \u043c\u043d\u0435\u043d\u0438\u044f \u0430\u0433\u0435\u043d\u0442\u043e\u0432 \u043a \u043e\u0434\u043d\u043e\u043c\u0443 \u0440\u0435\u0448\u0435\u043d\u0438\u044e \u0438 \u043e\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0439 \u0437\u0430\u0446\u0438\u043a\u043b\u0438\u0432\u0430\u043d\u0438\u0435." },
];
const toolOptions: ToolKind[] = ["web-search", "files", "mcp", "project-builder"];

function defaultProvider(providers: ProviderConfig[]): ProviderConfig {
  return providers.find((provider) => provider.id === "RamTeamAi") ?? providers[0];
}

function defaultModel(provider: ProviderConfig): string {
  return provider.models.find((model) => model.id === "gpt-5.4-mini")?.id ?? provider.models[0]?.id ?? "";
}

function defaultToolsForRole(role: AgentRole): ToolKind[] {
  if (role === "researcher") return ["web-search", "mcp"];
  if (role === "tester") return ["files", "mcp"];
  if (role === "coder") return ["files", "project-builder"];
  return ["files"];
}

function createAgent(providers: ProviderConfig[], role: AgentRole = "architect"): AgentConfig {
  const provider = defaultProvider(providers);
  const roleOption = roleOptions.find((item) => item.value === role) ?? roleOptions[0];
  return {
    id: "agent-" + Date.now(),
    name: roleOption.label,
    role,
    providerId: provider.id,
    modelId: defaultModel(provider),
    systemPrompt: roleOption.prompt,
    tokenBudget: 40_000,
    tools: defaultToolsForRole(role),
    status: "waiting",
  };
}

export function AgentBuilderScreen() {
  const agents = useAppStore((state) => state.agents);
  const providers = useAppStore((state) => state.providers);
  const updateAgent = useAppStore((state) => state.updateAgent);
  const upsertAgent = useAppStore((state) => state.upsertAgent);
  const setScreen = useAppStore((state) => state.setScreen);
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");

  useEffect(() => {
    if (agents.some((agent) => agent.name.includes("?") || agent.systemPrompt.includes("?"))) {
      const cleanAgent = createAgent(providers, "architect");
      upsertAgent({ ...cleanAgent, id: "architect" });
      setSelectedAgentId("architect");
    }
  }, [agents, providers, upsertAgent]);

  const selected = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? createAgent(providers), [agents, providers, selectedAgentId]);
  const provider = providers.find((item) => item.id === selected.providerId) ?? defaultProvider(providers);

  function patch(patchValue: Partial<AgentConfig>) {
    updateAgent({ ...selected, ...patchValue });
  }

  function toggleTool(tool: ToolKind) {
    patch({ tools: selected.tools.includes(tool) ? selected.tools.filter((item) => item !== tool) : [...selected.tools, tool] });
  }

  function handleProviderChange(providerId: string) {
    const nextProvider = providers.find((item) => item.id === providerId) ?? defaultProvider(providers);
    patch({ providerId, modelId: defaultModel(nextProvider) });
  }

  function handleRoleChange(role: AgentRole) {
    const option = roleOptions.find((item) => item.value === role) ?? roleOptions[0];
    patch({ role, name: option.label, systemPrompt: option.prompt, tools: defaultToolsForRole(role) });
  }

  function handleNewAgent() {
    const agent = createAgent(providers, "architect");
    upsertAgent(agent);
    setSelectedAgentId(agent.id);
  }

  return (
    <div className="screen-stack">
      <SectionTitle icon="robot" title="Agent Builder" subtitle={L.subtitle} />
      <div className="agent-actions"><button type="button" onClick={handleNewAgent}>{L.newAgent}</button><button type="button" onClick={() => setScreen("custom-api")}>{L.addProvider}</button></div>
      <div className="agent-list" aria-label={L.agentList}>{agents.map((agent) => <button className={agent.id === selected.id ? "agent-list-item active" : "agent-list-item"} type="button" key={agent.id} onClick={() => setSelectedAgentId(agent.id)}><RoleBadge role={agent.role} /><span>{agent.name}</span></button>)}</div>
      <div className="agent-header"><div className={"avatar " + selected.role}><i className="ti ti-robot" aria-hidden="true" /></div><label className="wide-label">{L.agentName}<input value={selected.name} onChange={(event) => patch({ name: event.target.value })} /></label><RoleBadge role={selected.role} /></div>
      <div className="form-grid">
        <label>{L.provider}<select value={selected.providerId} onChange={(event) => handleProviderChange(event.target.value)}>{providers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>{L.model}<select value={selected.modelId} onChange={(event) => patch({ modelId: event.target.value })}>{provider.models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
        <label>{L.profession}<select value={selected.role} onChange={(event) => handleRoleChange(event.target.value as AgentRole)}>{roleOptions.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}</select></label>
        <label>{L.tokenBudget}<input value={String(selected.tokenBudget)} onChange={(event) => patch({ tokenBudget: Number(event.target.value.replace(/\D/g, "")) || 0 })} /></label>
      </div>
      <label className="textarea-label">{L.systemPrompt}<textarea value={selected.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} /></label>
      <div><div className="mini-label">{L.tools}</div><div className="chip-row">{toolOptions.map((tool) => <button className={selected.tools.includes(tool) ? "chip-button on" : "chip-button"} type="button" key={tool} onClick={() => toggleTool(tool)}>{tool}</button>)}<Chip>{roleLabel(selected.role)}</Chip></div></div>
      <div className="bottom-bar"><button type="button" onClick={() => setScreen("providers")}>{L.cancel}</button><button className="primary" type="button" onClick={() => setScreen("topology")}>{L.saveAgent}</button></div>
    </div>
  );
}
