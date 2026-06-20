import { checklistComplete, checklistProgress, type ChecklistItem } from "./checklist";
import type { PlanArtifact, ProjectConfig, ProjectReadinessStatus } from "../types";

export type AutoStopReason = "complete" | "limit" | "stalled" | "auto-off" | "busy";

export interface AutoRoundDecisionInput {
  checklist: ChecklistItem[];
  round: number;
  cap: number;
  stalledRounds: number;
  autoMode: boolean;
  busy: boolean;
}

export type AutoRoundDecision =
  | { action: "run" }
  | { action: "stop"; reason: AutoStopReason };

export function decideAutoRound(input: AutoRoundDecisionInput): AutoRoundDecision {
  if (!input.autoMode) return { action: "stop", reason: "auto-off" };
  if (input.busy) return { action: "stop", reason: "busy" };
  if (checklistComplete(input.checklist)) return { action: "stop", reason: "complete" };
  if (input.round >= input.cap) return { action: "stop", reason: "limit" };
  // Do not stop just because three previous rounds were "quiet". A model can
  // return prose, hit a provider fallback, or be replaced by the supervisor and
  // still recover on the next pass. Keep handing the remaining checklist back to
  // the agents until the checklist is complete or the configured safety cap is
  // reached.
  return { action: "run" };
}

export function nextStalledRounds(previous: ChecklistItem[], next: ChecklistItem[], filesWritten: number | undefined, currentStalled: number): number {
  const advanced = checklistProgress(next).done > checklistProgress(previous).done;
  const wroteFiles = Boolean(filesWritten && filesWritten > 0);
  // A round is stalled only when it neither writes files nor closes checklist
  // items. If agents are still producing files, keep going until verification
  // catches up or the user's round cap is reached.
  return advanced || wroteFiles ? 0 : currentStalled + 1;
}

export function buildAutoImplementationSummary(checklist: ChecklistItem[], reason: AutoStopReason, cap: number): string {
  const progress = checklistProgress(checklist);
  const complete = checklistComplete(checklist);
  if (complete) {
    return `✅ Готово: выполнены все ${progress.total} пунктов плана. Финальная проверка пройдена, можно уведомить пользователя о готовности.`;
  }

  const remaining = checklist.filter((item) => !item.done).map((item) => "• " + item.step);
  const stopReasonText = reason === "limit"
    ? `\nПричина: достигнут лимит ${cap} раундов реализации. Оставшиеся пункты уже возвращены агентам как чеклист правок; увеличьте лимит в настройках или уточните задачу.`
    : reason === "stalled"
      ? "\nПричина: повторные раунды не записали файлов и не продвинули чеклист."
      : reason === "auto-off"
        ? "\nПричина: авто-режим был выключен."
        : reason === "busy"
          ? "\nПричина: уже запущена другая операция."
          : "";

  return `⏸️ Остановлено: выполнено ${progress.done} из ${progress.total} пунктов. Чеклист ниже нужно вернуть агентам на правку, затем повторить тестовый этап.${stopReasonText}${remaining.length ? "\nОсталось:\n" + remaining.join("\n") : ""}`;
}

function readinessSatisfied(readinessStatus?: ProjectReadinessStatus): boolean {
  return !readinessStatus || !["partial", "failed"].includes(readinessStatus);
}

export function projectStatusAfterImplementationRound(readinessStatus?: ProjectReadinessStatus): ProjectConfig["status"] {
  // An implementation round can prepare/repair the scaffold, but final "built"
  // is reserved for the checklist verifier. This prevents premature success.
  return readinessSatisfied(readinessStatus) ? "scaffolded" : "active";
}

export function artifactStatusAfterImplementationRound(readinessStatus?: ProjectReadinessStatus): PlanArtifact["status"] {
  return readinessSatisfied(readinessStatus) ? "scaffolded" : "draft";
}
