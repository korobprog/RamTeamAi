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
  if (input.stalledRounds >= 3) return { action: "stop", reason: "stalled" };
  if (input.round >= input.cap) return { action: "stop", reason: "limit" };
  return { action: "run" };
}

export function nextStalledRounds(previous: ChecklistItem[], next: ChecklistItem[], _filesWritten: number | undefined, currentStalled: number): number {
  const advanced = checklistProgress(next).done > checklistProgress(previous).done;
  // File rewrites alone are not proof of progress: a stuck agent can keep
  // replacing the same file forever. The loop only resets when verification
  // closes at least one more checklist item.
  return advanced ? 0 : currentStalled + 1;
}

export function buildAutoImplementationSummary(checklist: ChecklistItem[], reason: AutoStopReason, cap: number): string {
  const progress = checklistProgress(checklist);
  const complete = checklistComplete(checklist);
  if (complete) {
    return `✅ Готово: выполнены все ${progress.total} пунктов плана. Реализация завершена автоматически.`;
  }

  const remaining = checklist.filter((item) => !item.done).map((item) => "• " + item.step);
  const stopReasonText = reason === "limit"
    ? `\nПричина: достигнут лимит ${cap} раундов реализации. Увеличьте лимит в настройках или уточните оставшиеся пункты.`
    : reason === "stalled"
      ? "\nПричина: три раунда подряд не дали новых файлов и не продвинули чеклист."
      : reason === "auto-off"
        ? "\nПричина: авто-режим был выключен."
        : reason === "busy"
          ? "\nПричина: уже запущена другая операция."
          : "";

  return `⏸️ Остановлено: выполнено ${progress.done} из ${progress.total} пунктов.${stopReasonText}${remaining.length ? "\nОсталось:\n" + remaining.join("\n") : ""}`;
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
