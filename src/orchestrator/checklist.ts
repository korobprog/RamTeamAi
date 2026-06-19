// Checklist-driven completion for autonomous implementation.
//
// The team must run end to end without manual checks, so each plan step becomes
// a checklist item that is verified every round. Verification is a hybrid: a
// verifier agent issues a per-item verdict, and if that output is missing or
// unparseable we fall back to a deterministic, file-based check so a flaky model
// can never stall the build. These functions are pure so they can be unit-tested
// without the store, the browser, or any provider.

import type { ProjectReadinessStatus } from "../types";

export type ChecklistSource = "verifier" | "heuristic" | "pending";

export interface ChecklistItem {
  id: string;
  index: number;
  step: string;
  done: boolean;
  source: ChecklistSource;
  note?: string;
}

export interface ChecklistVerdict {
  done: boolean;
  note?: string;
}

export type ChecklistEvidenceContents = Record<string, string>;

const IMPLEMENTATION_ACTION_TOKENS = /созда|собра|реализ|напис|замен|встав|подключ|добав|обнов|исправ|настро|установ|интегр|create|implement|write|replace|connect|configure|install|add|update|fix/i;
const COMMAND_OR_VERIFICATION_TOKENS = /(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|build|test|lint|check)|\b(?:dev|build|test|lint)\b|запуст|провер|прогнать|smoke|сборк|тест/i;
const NON_BLOCKING_TOKENS = /выбрать\s+следующ|следующий\s+вариант|нажм|клик|после\s+клика|если\s+нуж(?:ен|на|но|ны)|при\s+необходимости|опциональ|можно\s+добав|в\s+следующ(?:ей|их)\s+итерац|я\s+(?:разложу|подготовлю|добавлю|сделаю)|дальше\s+можно/i;
const EXPLICIT_FILE_PATTERN = /(?:`|["'])?((?:(?:src|app|components|lib|pages|styles|tests|assets|docs|src-tauri)\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+)|(?:package|vite\.config|tsconfig|tailwind\.config|postcss\.config|components)\.[A-Za-z0-9.]+|(?:App|main|index|styles)\.(?:tsx?|jsx?|css))(?:`|["'])?/gi;

interface StepEvidence {
  known: boolean;
  satisfied: boolean;
  note?: string;
}

export function isNonBlockingImplementationStep(step: string): boolean {
  const text = step.trim();
  if (!text) return true;
  if (NON_BLOCKING_TOKENS.test(text)) return true;

  const hasImplementationAction = IMPLEMENTATION_ACTION_TOKENS.test(text);
  const commandOrVerificationOnly = COMMAND_OR_VERIFICATION_TOKENS.test(text) && !hasImplementationAction;
  return commandOrVerificationOnly;
}

function nonBlockingNote(): string {
  return "Служебный/проверочный пункт не требует нового раунда написания кода.";
}

function isManualVerificationConcern(note?: string): boolean {
  if (!note) return false;
  const mentionsVerification = COMMAND_OR_VERIFICATION_TOKENS.test(note);
  const mentionsMissingImplementation = /не\s+(?:подключ|создан|создана|созданы|установлен|добавлен|вставлен|замен[её]н|реализ|напис|найден|обнаруж)|нет\s+(?:файл|компонент|зависим|код|реализац)|missing\s+(?:file|dependency|implementation|code)/i.test(note);
  const mentionsFailedCheck = /ошиб|пада|failed|failure|error|не\s+проход|слом|broken/i.test(note);
  return mentionsVerification && !mentionsMissingImplementation && !mentionsFailedCheck;
}

function deterministicEvidenceProvesDone(item?: ChecklistItem): boolean {
  return Boolean(item?.done && item.note?.startsWith("Найдены файлы/зависимости"));
}

function deterministicEvidenceProvesMissing(item?: ChecklistItem): boolean {
  return Boolean(
    item &&
    !item.done &&
    (
      item.note?.startsWith("Нет файлов:") ||
      item.note?.startsWith("Файлы ещё заглушки:") ||
      item.note?.startsWith("Нет доказательств подключения:")
    ),
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е");
}

function contentBlob(contents: ChecklistEvidenceContents): string {
  return Object.entries(contents)
    .map(([path, content]) => `${path}\n${content}`)
    .join("\n")
    .toLowerCase();
}

function extractExplicitFiles(step: string): string[] {
  return [...step.matchAll(EXPLICIT_FILE_PATTERN)].map((match) => {
    const path = normalizePath(match[1]);
    if (/^(?:App|main)\.(?:tsx?|jsx?)$/i.test(path) || /^(?:index|styles)\.css$/i.test(path)) {
      return "src/" + path;
    }
    return path;
  }).filter(Boolean);
}

function hasMeaningfulSource(normalizedFiles: string[], contents: ChecklistEvidenceContents): boolean {
  const sourceFiles = normalizedFiles.filter((file) => /^src\/.+\.(tsx?|jsx?|vue|svelte|css|html)$/.test(file));
  if (!sourceFiles.length) return false;
  const app = contents["src/App.tsx"] ?? contents["src/App.jsx"] ?? "";
  if (app && app.length > 160 && !app.includes("ready for the agent team to extend")) return true;
  return sourceFiles.some((file) => {
    const content = contents[file];
    return content ? content.trim().length > 120 && !content.includes("ready for the agent team to extend") : true;
  });
}

function evaluateTechEvidence(step: string, normalizedFiles: string[], contents: ChecklistEvidenceContents): StepEvidence {
  const text = normalizeText(step);
  const blob = contentBlob(contents);
  const hasContentEvidence = Object.keys(contents).length > 0;
  const requiresContentEvidence = /tailwind|lucide|shadcn/.test(text);
  if (!hasContentEvidence && requiresContentEvidence) {
    return {
      known: true,
      satisfied: false,
      note: "Нет содержимого файлов для проверки подключения зависимостей.",
    };
  }
  if (!hasContentEvidence) return { known: false, satisfied: false };
  const missing: string[] = [];

  if (/tailwind/.test(text) && !/tailwindcss|@tailwind|@import\s+["']tailwindcss/.test(blob) && !normalizedFiles.some((file) => /tailwind\.config\./.test(file))) {
    missing.push("Tailwind");
  }
  if (/lucide/.test(text) && !blob.includes("lucide-react")) {
    missing.push("lucide-react");
  }
  if (/shadcn/.test(text) && !blob.includes("@/components/ui") && !normalizedFiles.includes("components.json")) {
    missing.push("shadcn/ui");
  }
  if (/\bvite\b/.test(text) && !normalizedFiles.includes("vite.config.ts") && !normalizedFiles.includes("vite.config.js") && !blob.includes("\"vite\"")) {
    missing.push("Vite");
  }
  const mentionsReactFramework = /\breact\b/.test(text) && !/lucide-react/.test(text);
  if (mentionsReactFramework && !blob.includes("\"react\"") && !blob.includes("from \"react\"") && !blob.includes("from 'react'")) {
    missing.push("React");
  }
  if (/typescript|\btsx?\b/.test(text) && !normalizedFiles.includes("tsconfig.json") && !normalizedFiles.some((file) => /\.(ts|tsx)$/.test(file))) {
    missing.push("TypeScript");
  }

  const known = /tailwind|lucide|shadcn|\bvite\b|typescript|\btsx?\b/.test(text) || mentionsReactFramework;
  return {
    known,
    satisfied: known && missing.length === 0,
    note: missing.length ? "Нет доказательств подключения: " + missing.join(", ") + "." : undefined,
  };
}

function evaluateFileEvidence(step: string, normalizedFiles: string[], contents: ChecklistEvidenceContents): StepEvidence {
  const explicitFiles = extractExplicitFiles(step);
  if (!explicitFiles.length) return { known: false, satisfied: false };

  const missing = explicitFiles.filter((file) => !normalizedFiles.includes(file));
  const stubbed = explicitFiles.filter((file) => contents[file]?.includes("ready for the agent team to extend"));
  return {
    known: true,
    satisfied: missing.length === 0 && stubbed.length === 0,
    note: missing.length
      ? "Нет файлов: " + missing.join(", ") + "."
      : stubbed.length
        ? "Файлы ещё заглушки: " + stubbed.join(", ") + "."
        : undefined,
  };
}

function evaluateStepEvidence(step: string, normalizedFiles: string[], contents: ChecklistEvidenceContents, readyDone: boolean): StepEvidence {
  const fileEvidence = evaluateFileEvidence(step, normalizedFiles, contents);
  const techEvidence = evaluateTechEvidence(step, normalizedFiles, contents);
  const known = fileEvidence.known || techEvidence.known;
  if (!known) return { known: false, satisfied: readyDone };

  const blockers = [fileEvidence, techEvidence].filter((item) => item.known && !item.satisfied);
  return {
    known: true,
    satisfied: blockers.length === 0,
    note: blockers.map((item) => item.note).filter(Boolean).join(" ") || undefined,
  };
}

export function buildChecklist(steps: string[]): ChecklistItem[] {
  return steps.map((step, index) => {
    const nonBlocking = isNonBlockingImplementationStep(step);
    return {
      id: "step-" + index,
      index,
      step,
      done: nonBlocking,
      source: nonBlocking ? "heuristic" as const : "pending" as const,
      note: nonBlocking ? nonBlockingNote() : undefined,
    };
  });
}

export function checklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.done);
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

export function checklistMatchesSteps(steps: string[], checklist: ChecklistItem[]): boolean {
  return steps.length === checklist.length && steps.every((step, index) => checklist[index]?.step === step);
}

export function pendingImplementationSteps(steps: string[], checklist: ChecklistItem[] = []): string[] {
  const byIndex = new Map(checklist.map((item) => [item.index, item]));
  return steps.filter((step, index) => !isNonBlockingImplementationStep(step) && !byIndex.get(index)?.done);
}

// Prompt for the verifier agent. It must echo the numbered list back with a
// strict DONE/TODO marker per item so the verdict is machine-parseable.
export function renderVerificationPrompt(steps: string[]): string {
  const list = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return [
    "Режим проверки. Ты — арбитр приёмки. На основе плана и снимка рабочей папки ниже реши, какие пункты ДЕЙСТВИТЕЛЬНО выполнены в коде, а какие ещё нет.",
    "Верни РОВНО один пункт на строку в формате: `<номер>. DONE — причина` либо `<номер>. TODO — что осталось`.",
    "DONE ставь только если в реальных файлах есть готовая реализация пункта (а не план или заглушка). Не добавляй ничего, кроме этого списка.",
    "Не блокируй раунды на служебных шагах вроде выбора следующего варианта, нажатия кнопки или ручного запуска `npm run dev`: если код и файлы уже на месте, такие пункты считаются DONE.",
    "",
    "Пункты:",
    list,
  ].join("\n");
}

// Cyrillic words are matched as plain substrings: JS `\b` is ASCII-only and does
// not form boundaries around Cyrillic letters.
const DONE_TOKENS = /\b(?:done|complete[d]?)\b|готов|выполнен|сделан|реализован|\[\s*[xXхХ✓]\s*\]|✅/i;
const TODO_TOKENS = /\b(?:todo|pending|missing)\b|не\s*готов|не\s*выполнен|не\s*сделан|не\s*реализован|в\s*процесс|осталось|\[\s*\]|❌/i;

// Parse the verifier output into a per-index verdict. Tolerant of numbering
// styles, markdown checkboxes and emoji so a slightly off-format answer still
// counts instead of forcing a fallback.
export function parseChecklistVerdict(text: string, steps: string[]): Map<number, ChecklistVerdict> {
  const verdicts = new Map<number, ChecklistVerdict>();
  if (!text) return verdicts;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[*_`>]/g, "").trim();
    if (!line) continue;

    const numbered = line.match(/^\s*(?:[-*•]\s*)?(?:\[\s*[xXхХ✓ ]?\s*\]\s*)?(\d{1,3})[.):]/);
    const index = numbered ? Number(numbered[1]) - 1 : undefined;
    if (index === undefined || index < 0 || index >= steps.length) continue;

    const hasDone = DONE_TOKENS.test(line);
    const hasTodo = TODO_TOKENS.test(line);
    // A line that mentions neither is ambiguous: skip it so the fallback decides.
    if (!hasDone && !hasTodo) continue;
    // If both appear (e.g. "DONE, осталось мелочь") treat the explicit TODO as
    // the stronger signal — we would rather run one more round than stop early.
    const done = hasDone && !hasTodo;
    const note = line.replace(/^\s*(?:[-*•]\s*)?(?:\[[^\]]*\]\s*)?\d{1,3}[.):]\s*/, "").trim() || undefined;
    verdicts.set(index, { done, note });
  }

  return verdicts;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").trim();
}

// Deterministic fallback. Once the project readiness contract is satisfied and
// real source files exist, the plan is considered delivered — this guarantees
// the loop terminates even if the verifier model is permanently unavailable.
export function heuristicChecklist(
  steps: string[],
  files: string[],
  readyStatus: ProjectReadinessStatus,
  contents: ChecklistEvidenceContents = {},
): ChecklistItem[] {
  const normalized = files.map(normalizePath);
  const ready = readyStatus === "scaffold-ok" || readyStatus === "build-ok";
  const hasRealSource = hasMeaningfulSource(normalized, contents);
  const done = ready && hasRealSource;
  return steps.map((step, index) => {
    const nonBlocking = isNonBlockingImplementationStep(step);
    const evidence = evaluateStepEvidence(step, normalized, contents, done);
    const itemDone = nonBlocking || evidence.satisfied || (!evidence.known && done);
    return {
      id: "step-" + index,
      index,
      step,
      done: itemDone,
      source: "heuristic" as const,
      note: nonBlocking
        ? nonBlockingNote()
        : itemDone
          ? evidence.known
            ? "Найдены файлы/зависимости для пункта (детерминированная проверка)."
            : "Рабочий проект и исходники на месте; точные признаки пункта не распознаны."
          : evidence.note ?? "Проект ещё не собран до рабочего состояния.",
    };
  });
}

// Merge a verifier verdict over the deterministic baseline: trust the verifier
// per item where it spoke, fall back to the heuristic otherwise.
export function mergeChecklist(
  steps: string[],
  verdicts: Map<number, ChecklistVerdict>,
  fallback: ChecklistItem[],
): ChecklistItem[] {
  return steps.map((step, index) => {
    const verdict = verdicts.get(index);
    const base = fallback[index];
    if (verdict) {
      if (verdict.done && deterministicEvidenceProvesMissing(base)) {
        return base;
      }
      if (!verdict.done && base?.done && (
        isNonBlockingImplementationStep(step) ||
        isManualVerificationConcern(verdict.note) ||
        deterministicEvidenceProvesDone(base)
      )) {
        return base;
      }
      return {
        id: "step-" + index,
        index,
        step,
        done: verdict.done,
        source: "verifier" as const,
        note: verdict.note ?? base?.note,
      };
    }
    return base ?? { id: "step-" + index, index, step, done: false, source: "pending" as const };
  });
}
