import type { AgentRole } from "../types";

export const roleLabels: Record<AgentRole, string> = {
  architect: "\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440",
  critic: "\u041a\u0440\u0438\u0442\u0438\u043a",
  researcher: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u044c",
  arbiter: "\u0410\u0440\u0431\u0438\u0442\u0440",
  coder: "\u0420\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a",
  security: "\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c",
  product: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442",
  tester: "\u0422\u0435\u0441\u0442\u0438\u0440\u043e\u0432\u0449\u0438\u043a",
};

export function roleLabel(role: AgentRole): string {
  return roleLabels[role];
}
