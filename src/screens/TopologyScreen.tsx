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

const cards: Array<{
  kind: TopologyKind;
  title: string;
  text: string;
  bestFor: string[];
  avoidFor: string;
  guide: string;
}> = [
  {
    kind: "supervisor",
    title: "Supervisor",
    text: "Supervisor делегирует подзадачи суб-агентам",
    bestFor: ["больших задач с несколькими независимыми направлениями", "исследования, дизайна, реализации и проверки в одной сессии", "быстрого распределения ролей между агентами"],
    avoidFor: "хуже подходит для линейных задач, где каждый шаг должен строго ждать предыдущий.",
    guide: "Выберите Supervisor, когда нужен координатор: он дробит цель на подзадачи, назначает исполнителей и собирает итоговое решение.",
  },
  {
    kind: "debate",
    title: "Debate",
    text: "Peer debate: спор, критика и консенсус",
    bestFor: ["планирования архитектуры и выбора подхода", "поиска рисков, слабых мест и альтернатив", "задач, где важна проверка аргументов перед реализацией"],
    avoidFor: "не лучший выбор для срочных одношаговых правок: обсуждение добавляет раунды и время.",
    guide: "Выберите Debate, когда качество решения важнее скорости: агенты спорят, критикуют варианты и приходят к более устойчивому плану.",
  },
  {
    kind: "pipeline",
    title: "Pipeline",
    text: "Выход одного агента становится входом следующего",
    bestFor: ["пошаговых процессов: анализ → план → реализация → ревью", "документов, релизов и задач с понятной последовательностью", "сценариев, где важна трассируемость каждого этапа"],
    avoidFor: "хуже подходит для параллельного исследования: слабый ранний шаг может повлиять на всю цепочку.",
    guide: "Выберите Pipeline, когда работа должна идти конвейером: каждый агент получает результат предыдущего и улучшает его на своём этапе.",
  },
];

export function TopologyScreen() {
  const topology = useAppStore((state) => state.topology);
  const agents = useAppStore((state) => state.agents);
  const setTopology = useAppStore((state) => state.setTopology);
  const startTeam = useAppStore((state) => state.startTeam);
  const busy = useAppStore((state) => state.busy);
  const selectedCard = cards.find((card) => card.kind === topology.kind) ?? cards[0];

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
      <section className="topology-guide" aria-live="polite">
        <div>
          <Chip tone="info">Гайд</Chip>
          <h3>{selectedCard.title}: когда выбирать</h3>
          <p>{selectedCard.guide}</p>
        </div>
        <div className="topology-guide-grid">
          <div>
            <b>Лучше всего подходит для</b>
            <ul>
              {selectedCard.bestFor.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <b>Когда выбрать другую топологию</b>
            <p>{selectedCard.avoidFor}</p>
          </div>
        </div>
      </section>
      <div className="topology-controls">
        <label>Макс. раундов<input type="number" min={1} max={20} value={topology.maxRounds} onChange={(event) => setTopology({ maxRounds: Number(event.target.value) })} /></label>
        <label>Арбитр<select value={topology.arbiterAgentId} onChange={(event) => setTopology({ arbiterAgentId: event.target.value })}>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label>
        <button className="primary" type="button" disabled={busy} onClick={() => void startTeam()}>{busy ? "Открываем..." : "Перейти к постановке задачи"}</button>
      </div>
    </div>
  );
}
