import { isTauriRuntime, safeInvoke } from "../lib/tauri";
import type { AgentConfig, BuildResult, ImplementationAssignment, PlanArtifact, ProjectCompletenessContractId, ProjectCompletenessReport } from "../types";
import { hasWebWorkspaceFolder, initWorkspaceFiles, writeWebWorkspaceFile, writeWorkspaceTextFile } from "../workspace";

const WORKSPACE_BUILD_FILES = ["MEMORY.md", "PLAN.md", "README.md", "IMPLEMENTATION.md", "docs/plan.md", "docs/agent-tasks.md", "src/.gitkeep", "tests/.gitkeep"];
export const TAURI_REACT_REQUIRED_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  "src-tauri/build.rs",
  "src-tauri/src/main.rs",
];
// Marker baked into the generated scaffold App.tsx. While this string is still
// present the product itself has not been implemented yet — only the empty
// skeleton exists — so completeness must not report the project as done.
export const SCAFFOLD_APP_STUB_MARKER = "ready for the agent team to extend";
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
  const scaffoldFiles = requiresTauriReactScaffold(artifact) ? TAURI_REACT_REQUIRED_FILES : [];
  return unique([...generatedFiles, ...scaffoldFiles, ...APP_BUILD_FILES]).filter(
    (file) =>
      generatedFiles.includes(file) ||
      scaffoldFiles.includes(file) ||
      artifact.projectTree.includes(file.split("/")[1]) ||
      file.includes("src-tauri"),
  );
}

export function requiresTauriReactScaffold(artifact: PlanArtifact): boolean {
  const source = `${artifact.title}\n${artifact.stack.join("\n")}\n${artifact.steps.join("\n")}\n${artifact.projectTree}`.toLowerCase();
  const mentionsTauri = /\btauri\b|src-tauri/.test(source);
  const mentionsReact = /\breact\b|main\.tsx|app\.tsx/.test(source);
  return mentionsTauri && mentionsReact;
}

// Minimal front-end product contract: used when refining an existing web/React
// project rather than scaffolding a fresh Tauri desktop app. It does NOT demand
// the Rust backend skeleton (Cargo.toml, build.rs, src-tauri/src/main.rs), which
// is irrelevant to "add a landing to this project" and otherwise keeps the build
// stuck at "partial" forever.
export const FRONTEND_REQUIRED_FILES = ["package.json", "index.html", "src/App.tsx"];

// Decide which completeness contract applies from both the plan and what is
// actually on disk. The plan may mention Tauri/React simply because the host app
// is Tauri, so disk state breaks the tie: an existing front-end project (has a
// package.json but no Rust backend) is being refined, not scaffolded from zero.
export function selectCompletenessContract(
  artifact: PlanArtifact,
  files: string[] = [],
): ProjectCompletenessContractId {
  if (!requiresTauriReactScaffold(artifact)) return "generic";
  const normalized = files.map(normalizeProjectPath);
  const hasPackageJson = normalized.includes("package.json");
  const hasTauriBackend = normalized.some((file) => file.startsWith("src-tauri/"));
  // Established front-end project with no desktop backend → lighten the contract.
  if (hasPackageJson && !hasTauriBackend) return "frontend";
  return "tauri-react";
}

export function validateProjectCompleteness(
  artifact: PlanArtifact,
  files: string[],
  contract: ProjectCompletenessContractId = selectCompletenessContract(artifact, files),
  // Required files that exist on disk but still hold the generated scaffold stub
  // (i.e. the agents have not actually implemented them yet).
  stubFiles: string[] = [],
): ProjectCompletenessReport {
  const normalizedFiles = unique(files.map(normalizeProjectPath));
  const normalizedStubs = new Set(stubFiles.map(normalizeProjectPath));
  const requiredFiles = contract === "tauri-react"
    ? TAURI_REACT_REQUIRED_FILES
    : contract === "frontend"
      ? FRONTEND_REQUIRED_FILES
      : ["README.md", "PLAN.md", "IMPLEMENTATION.md"];
  const missingFiles = requiredFiles.filter((file) => !normalizedFiles.includes(file));
  // A required file that is still a scaffold stub is not "done": the skeleton is
  // present but the product itself has not been built. This is what stops the
  // project from being reported as complete the moment the empty scaffold lands.
  const stubbedFiles = requiredFiles.filter((file) => !missingFiles.includes(file) && normalizedStubs.has(file));
  const presentFiles = requiredFiles.filter((file) => normalizedFiles.includes(file) && !normalizedStubs.has(file));
  const hasLandingOnly = normalizedFiles.some((file) => file.startsWith("landing/")) && missingFiles.includes("package.json");
  const warnings = [
    hasLandingOnly
      ? "Detected a static landing fragment, but the Tauri/React scaffold is incomplete."
      : "",
    missingFiles.length
      ? `Missing required files: ${missingFiles.join(", ")}`
      : "",
    stubbedFiles.length
      ? `Scaffold stubs still not implemented: ${stubbedFiles.join(", ")}`
      : "",
  ].filter(Boolean);
  const status = missingFiles.length || stubbedFiles.length ? "partial" : "scaffold-ok";

  return {
    contract,
    status,
    requiredFiles,
    presentFiles,
    missingFiles,
    stubFiles: stubbedFiles,
    warnings,
    message: status === "scaffold-ok"
      ? "Project scaffold contract is satisfied."
      : hasLandingOnly
        ? "Project is partial: only a landing fragment was found, not a runnable Tauri/React scaffold."
        : stubbedFiles.length
          ? "Project is partial: the scaffold exists but the product files are still empty stubs."
          : "Project is partial: continue implementation to create missing scaffold files.",
  };
}

export function withProjectReadiness(artifact: PlanArtifact, result: BuildResult): BuildResult {
  return {
    ...result,
    readiness: validateProjectCompleteness(artifact, result.files),
  };
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
      id: agent.id,
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

  const result = await safeInvoke<BuildResult>("build_project", { artifact, confirmed, workspacePath });
  return withProjectReadiness(artifact, result);
}

async function buildProjectInWeb(
  artifact: PlanArtifact,
  confirmed: boolean,
  workspacePath?: string,
): Promise<BuildResult> {
  if (!confirmed) {
    return withProjectReadiness(artifact, {
      phase: "scaffold",
      rootPath: workspacePath || "web://RamTeamAi Projects",
      files: previewProjectFiles(artifact, Boolean(workspacePath)),
      skipped: true,
      message: "Write skipped: explicit user confirmation is required.",
    });
  }

  if (!(await hasWebWorkspaceFolder())) {
    return withProjectReadiness(artifact, {
      phase: "scaffold",
      rootPath: workspacePath || "web://RamTeamAi Projects",
      files: previewProjectFiles(artifact, Boolean(workspacePath)),
      skipped: false,
      message: workspacePath
        ? "A folder was selected, but this browser did not grant write access. Use Chrome/Edge with File System Access API or the Tauri app."
        : "Select a workspace folder first. Without File System Access API the web build cannot write to disk.",
    });
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

  if (requiresTauriReactScaffold(artifact)) {
    for (const [filePath, content] of Object.entries(renderTauriReactScaffold(artifact))) {
      const scaffoldResult = await writeWorkspaceTextFile(rootPath, filePath, content, { overwrite: false });
      if (!files.includes(scaffoldResult.path)) files.push(scaffoldResult.path);
    }
  }

  return withProjectReadiness(artifact, {
    phase: "scaffold",
    rootPath: init.rootPath,
    files,
    skipped: false,
    message: requiresTauriReactScaffold(artifact)
      ? "Project scaffold written, including the required Tauri + React files."
      : "Project scaffold written to the selected workspace.",
  });
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

function renderTauriReactScaffold(artifact: PlanArtifact): Record<string, string> {
  const title = artifact.title.replace(/`/g, "'");
  return {
    "package.json": JSON.stringify({
      name: safePackageName(artifact.title),
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
        tauri: "tauri",
      },
      dependencies: {
        "@tauri-apps/api": "latest",
        react: "latest",
        "react-dom": "latest",
      },
      devDependencies: {
        "@tauri-apps/cli": "latest",
        "@types/react": "latest",
        "@types/react-dom": "latest",
        "@vitejs/plugin-react": "latest",
        typescript: "latest",
        vite: "latest",
      },
    }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
      },
      include: ["src"],
      references: [{ path: "./tsconfig.node.json" }],
    }, null, 2) + "\n",
    "tsconfig.node.json": JSON.stringify({
      compilerOptions: {
        composite: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        allowSyntheticDefaultImports: true,
      },
      include: ["vite.config.ts"],
    }, null, 2) + "\n",
    "vite.config.ts": [
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      "",
      "export default defineConfig({",
      "  plugins: [react()],",
      "  server: { strictPort: true },",
      "});",
      "",
    ].join("\n"),
    "index.html": [
      '<div id="root"></div>',
      '<script type="module" src="/src/main.tsx"></script>',
      "",
    ].join("\n"),
    "src/main.tsx": [
      'import React from "react";',
      'import ReactDOM from "react-dom/client";',
      'import App from "./App";',
      'import "./index.css";',
      "",
      'ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(',
      "  <React.StrictMode>",
      "    <App />",
      "  </React.StrictMode>,",
      ");",
      "",
    ].join("\n"),
    "src/App.tsx": [
      "export default function App() {",
      "  return (",
      '    <main className="app-shell">',
      `      <h1>${title}</h1>`,
      `      <p>This Tauri + React scaffold is ${SCAFFOLD_APP_STUB_MARKER}.</p>`,
      "    </main>",
      "  );",
      "}",
      "",
    ].join("\n"),
    "src/index.css": [
      ":root { font-family: Inter, system-ui, sans-serif; color: #1f2937; background: #f8fafc; }",
      "body { margin: 0; }",
      ".app-shell { min-height: 100vh; display: grid; place-content: center; gap: 12px; padding: 48px; text-align: center; }",
      ".app-shell h1 { margin: 0; font-size: clamp(32px, 6vw, 64px); }",
      ".app-shell p { margin: 0; color: #64748b; }",
      "",
    ].join("\n"),
    "src-tauri/Cargo.toml": [
      "[package]",
      `name = "${safePackageName(artifact.title)}"`,
      'version = "0.1.0"',
      'edition = "2021"',
      "",
      "[build-dependencies]",
      'tauri-build = { version = "2", features = [] }',
      "",
      "[dependencies]",
      'tauri = { version = "2", features = [] }',
      'tauri-plugin-opener = "2"',
      'serde = { version = "1", features = ["derive"] }',
      'serde_json = "1"',
      "",
    ].join("\n"),
    "src-tauri/tauri.conf.json": JSON.stringify({
      productName: artifact.title || "RamTeamAi Project",
      version: "0.1.0",
      identifier: "com.ramteamai.generated",
      build: {
        beforeDevCommand: "npm run dev",
        beforeBuildCommand: "npm run build",
        devUrl: "http://localhost:1420",
        frontendDist: "../dist",
      },
      app: {
        windows: [{ title: artifact.title || "RamTeamAi Project", width: 1100, height: 720 }],
        security: { csp: null },
      },
      bundle: { active: true, targets: "all" },
    }, null, 2) + "\n",
    "src-tauri/build.rs": "fn main() {\n    tauri_build::build()\n}\n",
    "src-tauri/src/main.rs": [
      "#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]",
      "",
      "fn main() {",
      "    tauri::Builder::default()",
      "        .plugin(tauri_plugin_opener::init())",
      "        .run(tauri::generate_context!())",
      "        .expect(\"error while running tauri application\");",
      "}",
      "",
    ].join("\n"),
  };
}

function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function safePackageName(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii || "ramteamai-project";
}
