import { useEffect, useState } from "react";
import type { AgentConfig, AgentRole } from "../types";
import { roleLabel } from "./RoleBadge";

const roleColor: Record<AgentRole, string> = {
  architect: "#534AB7",
  critic: "#1D9E75",
  researcher: "#D85A30",
  arbiter: "#185FA5",
  coder: "#0B7285",
  security: "#C92A2A",
  product: "#9C36B5",
  tester: "#5C940D",
};

const rolePhrases: Record<AgentRole, string[]> = {
  architect: ["Рисую слои…", "Свяжем модули!", "Где тут оркестратор?", "Каркас готов 👌"],
  critic: ["А это безопасно?", "Тут нужны лимиты", "Вижу риск 👀", "Проверь edge-case"],
  researcher: ["Ищу в доках…", "Нашёл пример!", "Сверяю факты", "Есть источник ✅"],
  arbiter: ["Свожу мнения…", "Выбираю план", "Стоп зацикливанию", "Решение близко"],
  coder: ["Пишу хелпер…", "Чистый код!", "Тип не сходится 🤔", "Готово, дальше"],
  security: ["Где ключи?", "Sandbox ок?", "Секреты в keychain", "Права урезал"],
  product: ["А юзеру понятно?", "Меньше кликов", "Ценность ясна", "UX отрисован"],
  tester: ["Пишу smoke-тест", "Регрессию закрыл", "Зелёный билд ✅", "Ещё кейс…"],
};

export function TeamThinking({ agents }: { agents: AgentConfig[] }) {
  const [tick, setTick] = useState(0);
  const crew = agents.length ? agents : [];

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1700);
    return () => window.clearInterval(id);
  }, []);

  if (!crew.length) return null;

  return (
    <div className="team-thinking" role="status" aria-live="polite">
      <div className="team-thinking-head">
        <span className="team-thinking-spinner" aria-hidden="true" />
        Команда обсуждает задачу…
      </div>
      <div className="team-desks">
        {crew.map((agent, index) => {
          const phrases = rolePhrases[agent.role] ?? ["Думаю…"];
          const phrase = phrases[(tick + index) % phrases.length];
          const color = roleColor[agent.role] ?? "#534AB7";
          const working = agent.status === "typing" || agent.status === "mcp";
          return (
            <div className={working ? "team-desk working" : "team-desk"} key={agent.id} style={{ animationDelay: index * 0.25 + "s" }}>
              <div className="team-bubble" style={{ borderColor: color, color }}>
                {agent.status === "mcp" ? "⚙ " : ""}{phrase}
              </div>
              <div className="team-character" style={{ background: color + "1A", color }} aria-hidden="true">
                <i className="ti ti-user" />
              </div>
              <div className="team-monitor" style={{ borderColor: color }} aria-hidden="true">
                <span className={working ? "team-typing on" : "team-typing"} style={{ background: color }} />
              </div>
              <small style={{ color }}>{roleLabel(agent.role)}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
