import { SectionTitle, Chip } from "../components/FNeurogatee";
import { RoleBadge } from "../components/RoleBadge";
import { useAppStore } from "../store/appStore";
import type { AgentConfig, AgentRole, ToolKind } from "../types";

const roleOptions: Array<{ value: AgentRole; label: string }> = [
  { value: "architect", label: "Архитектор" },
  { value: "critic", label: "Критик" },
  { value: "researcher", label: "Исследователь" },
  { value: "arbiter", label: "Арбитр" },
];
const toolOptions: ToolKind[] = ["web-search", "files", "mcp", "project-builder"];

export function AgentBuilderScreen() {
  const agents = useAppStore((state) => state.agents);
  const providers = useAppStore((state) => state.providers);
  const updateAgent = useAppStore((state) => state.updateAgent);
  const setScreen = useAppStore((state) => state.setScreen);
  const selected = agents[0];
  const provider = providers.find((item) => item.id === selected.providerId) ?? providers[0];

  function patch(patchValue: Partial<AgentConfig>) {
    updateAgent({ ...selected, ...patchValue });
  }

  function toggleTool(tool: ToolKind) {
    patch({ tools: selected.tools.includes(tool) ? selected.tools.filter((item) => item !== tool) : [...selected.tools, tool] });
  }

  return (
    <div className="screen-stack">
      <SectionTitle icon="robot" title="Agent Builder" subtitle="Провайдер, модель, роль, промпт и инструменты агента" />
      <div className="agent-header">
        <div className={"avatar " + selected.role}><i className="ti ti-robot" aria-hidden="true" /></div>
        <label className="wide-label">Имя агента<input value={selected.name} onChange={(event) => patch({ name: event.target.value })} /></label>
        <RoleBadge role={selected.role} />
      </div>
      <div className="form-grid">
        <label>Провайдер<select value={selected.providerId} onChange={(event) => patch({ providerId: event.target.value, modelId: providers.find((item) => item.id === event.target.value)?.models[0]?.id ?? selected.modelId })}>{providers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Модель<select value={selected.modelId} onChange={(event) => patch({ modelId: event.target.value })}>{provider.models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
        <label>Роль<select value={selected.role} onChange={(event) => patch({ role: event.target.value as AgentRole })}>{roleOptions.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}</select></label>
        <label>Бюджет токенов<input value={String(selected.tokenBudget)} onChange={(event) => patch({ tokenBudget: Number(event.target.value.replace(/\D/g, "")) || 0 })} /></label>
      </div>
      <label className="textarea-label">Системный промпт<textarea value={selected.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} /></label>
      <div>
        <div className="mini-label">Инструменты</div>
        <div className="chip-row">
          {toolOptions.map((tool) => <button className={selected.tools.includes(tool) ? "chip-button on" : "chip-button"} type="button" key={tool} onClick={() => toggleTool(tool)}>{tool}</button>)}
          <Chip>+ добавить</Chip>
        </div>
      </div>
      <div className="bottom-bar"><button type="button" onClick={() => setScreen("providers")}>Отмена</button><button className="primary" type="button" onClick={() => setScreen("topology")}>Сохранить агента</button></div>
    </div>
  );
}
