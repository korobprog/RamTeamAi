import type { ReactNode } from "react";
import { SectionTitle, Chip } from "../components/FRamTeamAie";
import { useAppStore } from "../store/appStore";
import type { TopologyKind } from "../types";

const PURPLE = "#7F77DD";
const TEAL = "#1D9E75";
const CORAL = "#D85A30";
const GRAY = "#888780";

const topologyArt: Record<TopologyKind, ReactNode> = {
  supervisor: (
    <svg viewBox="0 0 160 90" role="img" aria-label="Схема supervisor">
      <circle cx="80" cy="20" r="13" fill={PURPLE} />
      <circle cx="35" cy="70" r="12" fill={GRAY} />
      <circle cx="80" cy="70" r="12" fill={GRAY} />
      <circle cx="125" cy="70" r="12" fill={GRAY} />
      <path d="M73 30 L42 60 M80 33 L80 58 M87 30 L118 60" stroke={GRAY} strokeWidth="1.5" fill="none" />
    </svg>
  ),
  debate: (
    <svg viewBox="0 0 160 90" role="img" aria-label="Схема debate">
      <circle cx="35" cy="45" r="13" fill={PURPLE} />
      <circle cx="125" cy="30" r="13" fill={TEAL} />
      <circle cx="125" cy="65" r="13" fill={CORAL} />
      <path d="M48 42 L112 31 M48 48 L112 63 M125 43 L125 52" stroke={GRAY} strokeWidth="1.5" fill="none" />
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 160 90" role="img" aria-label="Схема pipeline">
      <defs>
        <marker id="topo-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill={GRAY} />
        </marker>
      </defs>
      <circle cx="28" cy="45" r="12" fill={PURPLE} />
      <circle cx="80" cy="45" r="12" fill={TEAL} />
      <circle cx="132" cy="45" r="12" fill={CORAL} />
      <path d="M42 45 L64 45 M94 45 L116 45" stroke={GRAY} strokeWidth="1.5" fill="none" markerEnd="url(#topo-arrow)" />
    </svg>
  ),
};

const cards: Array<{ kind: TopologyKind; title: string; text: string }> = [
  { kind: "supervisor", title: "Supervisor", text: "Supervisor делегирует подзадачи суб-агентам" },
  { kind: "debate", title: "Debate", text: "Peer debate: спор, критика и консенсус" },
  { kind: "pipeline", title: "Pipeline", text: "Выход одного агента становится входом следующего" },
];

export function TopologyScreen() {
  const topology = useAppStore((state) => state.topology);
  const agents = useAppStore((state) => state.agents);
  const setTopology = useAppStore((state) => state.setTopology);
  const startTeam = useAppStore((state) => state.startTeam);
  const busy = useAppStore((state) => state.busy);

  return (
    <div className="screen-stack">
      <SectionTitle icon="sitemap" title="Топология команды" subtitle="Supervisor, debate или pipeline с лимитами раундов и арбитром" />
      <div className="topology-grid">
        {cards.map((card) => (
          <button className={topology.kind === card.kind ? "topology-card selected" : "topology-card"} key={card.kind} type="button" onClick={() => setTopology({ kind: card.kind })}>
            {card.kind === "debate" ? <Chip tone="info">Planning</Chip> : null}
            <b>{card.title}</b>
            <span>{card.text}</span>
            <div className="topology-art">{topologyArt[card.kind]}</div>
          </button>
        ))}
      </div>
      <div className="topology-controls">
        <label>Макс. раундов<input type="number" min={1} max={20} value={topology.maxRounds} onChange={(event) => setTopology({ maxRounds: Number(event.target.value) })} /></label>
        <label>Арбитр<select value={topology.arbiterAgentId} onChange={(event) => setTopology({ arbiterAgentId: event.target.value })}>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label>
        <button className="primary" type="button" disabled={busy} onClick={() => void startTeam()}>{busy ? "Открываем..." : "Перейти к постановке задачи"}</button>
      </div>
    </div>
  );
}
