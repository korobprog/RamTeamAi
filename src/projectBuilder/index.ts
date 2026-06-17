import { isTauriRuntime, safeInvoke } from "../lib/tauri";
import type { AgentConfig, BuildResult, ImplementationAssignment, PlanArtifact } from "../types";
import { hasWebWorkspaceFolder, initWorkspaceFiles, writeWebWorkspaceFile, writeWorkspaceTextFile } from "../workspace";

const WORKSPACE_BUILD_FILES = ["MEMORY.md", "PLAN.md", "README.md", "IMPLEMENTATION.md", "docs/plan.md", "docs/agent-tasks.md", "src/.gitkeep", "tests/.gitkeep"];
const APP_BUILD_FILES = [
  "src/providers/index.ts",
  "src/orchestrator/index.ts",
  "src/mcp/manager.ts",
  "src/projectBuilder/index.ts",
  "src-tauri/src/core/provider.rs",
  "src-tauri/src/core/orchestrator.rs",
  "src-tauri/src/core/project_builder.rs",
];

export function previewProjectFiles(artifact: PlanArtifact, hasWorkspace = false): string[] {
  const generatedFiles = hasWorkspace ? WORKSPACE_BUILD_FILES : [];
  return [...generatedFiles, ...APP_BUILD_FILES].filter(
    (file) =>
      generatedFiles.includes(file) ||
      artifact.projectTree.includes(file.split("/")[1]) ||
      file.includes("src-tauri"),
  );
}

export function planImplementationAssignments(
  artifact: PlanArtifact,
  agents: AgentConfig[],
): ImplementationAssignment[] {
  const summaries: Record<string, { summary: string; deliverables: string[] }> = {
    architect: {
      summary: "Фиксирует модульные границы, контракты между слоями и порядок интеграции.",
      deliverables: ["Архитектурные решения в PLAN.md", "Контракты для providers / orchestrator / builder"],
    },
    coder: {
      summary: "Реализует основной код по шагам плана и собирает рабочие модули.",
      deliverables: [artifact.steps[0] ?? "Первый шаг плана", artifact.steps[1] ?? "Следующий шаг плана"],
    },
    critic: {
      summary: "Проверяет противоречия плана, технический долг и опасные упрощения.",
      deliverables: ["Список рисков", "Замечания перед merge / релизом"],
    },
    researcher: {
      summary: "Уточняет внешние зависимости, MCP-интеграции и спорные решения по документации.",
      deliverables: ["Проверенные ссылки и заметки", "Ограничения API / SDK"],
    },
    tester: {
      summary: "Готовит smoke-check и сценарии проверки после каждого блока реализации.",
      deliverables: ["Чеклист проверки", "Сценарии для ручного и авто-тестирования"],
    },
    security: {
      summary: "Проверяет хранение ключей, права доступа и безопасные дефолты.",
      deliverables: ["Security checklist", "Проверка секретов и sandbox-ограничений"],
    },
    product: {
      summary: "Следит, чтобы пользовательский поток оставался понятным и завершённым.",
      deliverables: ["UX-проверка сценария", "Список обязательных экранов и состояний"],
    },
    arbiter: {
      summary: "Собирает итоговые решения команды и снимает блокеры между ролями.",
      deliverables: ["Итоговые решения", "Приоритет следующей итерации"],
    },
  };

  return agents.map((agent, index) => {
    const fallbackStep = artifact.steps[index] ?? artifact.steps[artifact.steps.length - 1] ?? "Синхронизировать следующий шаг плана";
    const preset = summaries[agent.role] ?? {
      summary: "Берёт следующий подтверждённый шаг плана и двигает реализацию вперёд.",
      deliverables: [fallbackStep],
    };

    return {
      role: agent.role,
      owner: agent.name,
      summary: preset.summary,
      deliverables: preset.deliverables.length ? preset.deliverables : [fallbackStep],
    };
  });
}

export function renderImplementationPlan(artifact: PlanArtifact, assignments: ImplementationAssignment[]): string {
  const taskList = assignments.length
    ? assignments.map((item, index) => [
      `### ${index + 1}. ${item.owner} (${item.role})`,
      item.summary,
      "",
      ...item.deliverables.map((deliverable) => `- [ ] ${deliverable}`),
    ].join("\n")).join("\n\n")
    : "- [ ] Синхронизировать следующий шаг реализации";

  return `# Implementation

Проект: ${artifact.title}

## Правило режима реализации

- Не обсуждать по кругу: каждый раунд должен давать конкретные изменения файлов или проверяемый блок кода.
- Если агент не может записать файл сам, он обязан вернуть точный путь, действие и код/diff.
- После каждого блока обновлять этот файл и \`PLAN.md\`.

## Следующие задачи агентам

${taskList}

## Проверки

- [ ] Запустить доступную сборку/линт/тесты.
- [ ] Проверить, что изменённые файлы находятся в выбранной рабочей папке.
- [ ] Зафиксировать блокеры и следующий конкретный шаг.
`;
}

export async function buildProject(
  artifact: PlanArtifact,
  confirmed: boolean,
  workspacePath?: string,
): Promise<BuildResult> {
  if (!isTauriRuntime()) {
    return buildProjectInWeb(artifact, confirmed, workspacePath);
  }

  return safeInvoke<BuildResult>("build_project", { artifact, confirmed, workspacePath });
}

async function buildProjectInWeb(
  artifact: PlanArtifact,
  confirmed: boolean,
  workspacePath?: string,
): Promise<BuildResult> {
  if (!confirmed) {
    return {
      phase: "scaffold",
      rootPath: workspacePath || "web://RamTeamAi Projects",
      files: previewProjectFiles(artifact, Boolean(workspacePath)),
      skipped: true,
      message: "Запись пропущена: нужно подтверждение пользователя.",
    };
  }

  if (!(await hasWebWorkspaceFolder())) {
    return {
      phase: "scaffold",
      rootPath: workspacePath || "web://RamTeamAi Projects",
      files: previewProjectFiles(artifact, Boolean(workspacePath)),
      skipped: false,
      message: workspacePath
        ? "Папка выбрана, но этот браузер не выдал доступ на запись. Для записи на диск используйте Chrome/Edge с File System Access API или Tauri-версию."
        : "В web-версии сначала выберите папку через браузерный диалог. Без доступа к File System Access API запись на диск недоступна.",
    };
  }

  const init = await initWorkspaceFiles(workspacePath || "web://RamTeamAi Projects");
  const files = [...init.files];

  const readmeResult = await writeWebWorkspaceFile("README.md", renderReadme(artifact), { overwrite: false });
  if (readmeResult && !files.includes(readmeResult.path)) files.push(readmeResult.path);

  const rootPath = init.rootPath;
  const rootPlanResult = await writeWorkspaceTextFile(rootPath, "PLAN.md", renderPlan(artifact), { overwrite: true });
  if (!files.includes(rootPlanResult.path)) files.push(rootPlanResult.path);

  const planResult = await writeWebWorkspaceFile("docs/plan.md", renderPlan(artifact), { overwrite: true });
  if (planResult && !files.includes(planResult.path)) files.push(planResult.path);

  const implementationResult = await writeWorkspaceTextFile(rootPath, "IMPLEMENTATION.md", renderImplementationPlan(artifact, []), { overwrite: true });
  if (!files.includes(implementationResult.path)) files.push(implementationResult.path);

  return {
    phase: "scaffold",
    rootPath: init.rootPath,
    files,
    skipped: false,
    message: "Проект записан в выбранную папку через браузерный доступ к файловой системе.",
  };
}

function renderReadme(artifact: PlanArtifact): string {
  return `# ${artifact.title}

Generated by RamTeamAi Project Builder.

Рабочие файлы системы:

- \`MEMORY.md\` — память проекта.
- \`PLAN.md\` — текущий план.
- \`docs/plan.md\` — build-снимок плана.
`;
}

function renderPlan(artifact: PlanArtifact): string {
  return `# План

## Стек
${artifact.stack.map((item) => `- ${item}`).join("\n")}

## Шаги
${artifact.steps.map((item) => `- ${item}`).join("\n")}
`;
}
