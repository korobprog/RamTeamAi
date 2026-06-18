import type { AgentRole, PlanArtifact } from "../types";
import { roleLabel } from "../lib/roles";

export function DebateSummary({
  artifact,
  roles,
  onGoToBuild,
}: {
  artifact: PlanArtifact;
  roles: AgentRole[];
  onGoToBuild: () => void;
}) {
  const steps = artifact.steps.slice(0, 5);
  const uniqueRoles = Array.from(new Set(roles));

  return (
    <div className="debate-summary">
      <div className="debate-summary-head">
        <span className="debate-summary-icon"><i className="ti ti-flag-check" aria-hidden="true" /></span>
        <div>
          <b>К чему пришли</b>
          <small>Итог обсуждения команды · {uniqueRoles.length} участника</small>
        </div>
      </div>

      <ul className="debate-points">
        {steps.map((step, index) => (
          <li key={step + index}><span className="debate-point-num">{index + 1}</span>{step}</li>
        ))}
      </ul>

      <div className="debate-scheme" aria-hidden="true">
        <div className="debate-scheme-agents">
          {uniqueRoles.map((role) => (
            <span className={"debate-node " + role} key={role}>{roleLabel(role)}</span>
          ))}
        </div>
        <span className="debate-arrow"><i className="ti ti-chevron-right" /></span>
        <span className="debate-node arbiter">Арбитр</span>
        <span className="debate-arrow"><i className="ti ti-chevron-right" /></span>
        <span className="debate-node decision">Решение</span>
      </div>

      <button className="primary wide" type="button" onClick={onGoToBuild}>
        <i className="ti ti-arrow-right" aria-hidden="true" /> Перейти к решению
      </button>
    </div>
  );
}
