import type { AgentRole } from "../types";
import { roleLabel } from "../lib/roles";

export function RoleBadge({ role }: { role: AgentRole }) {
  return <span className={"role-badge " + role}>{roleLabel(role)}</span>;
}
