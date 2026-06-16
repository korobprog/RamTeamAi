import type { AgentRole } from "../types";

const labels: Record<AgentRole, string> = {
  architect: "Архитектор",
  critic: "Критик",
  researcher: "Исследователь",
  arbiter: "Арбитр",
};

export function RoleBadge({ role }: { role: AgentRole }) {
  return <span className={"role-badge " + role}>{labels[role]}</span>;
}

export function roleLabel(role: AgentRole): string {
  return labels[role];
}
