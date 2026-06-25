import type { BuildResult, PlanArtifact } from "../types";

export interface WorkbenchInspectorTarget {
  id: string;
  label: string;
  selector: string;
  component: string;
  file: string;
  line: number;
  dom: string;
  reason: string;
}

export interface WorkbenchMapSection {
  title: string;
  items: string[];
}

const DEFAULT_TARGETS: WorkbenchInspectorTarget[] = [
  {
    id: "app-shell",
    label: "Главный экран",
    selector: "#root > .app",
    component: "App",
    file: "src/App.tsx",
    line: 1,
    dom: "<main class=\"app\">…</main>",
    reason: "Корневой контейнер React-приложения обычно находится в App.tsx.",
  },
  {
    id: "hero",
    label: "Hero / первый экран",
    selector: "main section:first-child",
    component: "HeroSection",
    file: "src/App.tsx",
    line: 12,
    dom: "<section data-component=\"HeroSection\">…</section>",
    reason: "Первый визуальный блок чаще всего собран в верхней части App.tsx или компонента Hero.",
  },
  {
    id: "cta",
    label: "CTA-кнопка",
    selector: "button.primary, a.cta",
    component: "CallToAction",
    file: "src/App.tsx",
    line: 42,
    dom: "<button class=\"primary\">…</button>",
    reason: "CTA связан с интерактивными кнопками и ссылками в основном компоненте.",
  },
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function findPreferredFile(files: string[] | undefined, candidates: string[], fallback: string): string {
  const normalized = (files ?? []).map(normalizePath);
  return candidates.find((candidate) => normalized.includes(candidate)) ?? fallback;
}

function hasTreeNode(tree: string, needle: string): boolean {
  return tree.toLowerCase().includes(needle.toLowerCase());
}

export function createWorkbenchInspectorTargets(
  artifact: Pick<PlanArtifact, "projectTree" | "stack">,
  build?: Pick<BuildResult, "files">,
): WorkbenchInspectorTarget[] {
  const files = build?.files ?? [];
  const appFile = findPreferredFile(files, ["src/App.tsx", "src/App.jsx", "app/page.tsx", "pages/index.tsx"], "src/App.tsx");
  const cssFile = findPreferredFile(files, ["src/index.css", "src/styles.css", "src/App.css", "app/globals.css"], "src/index.css");
  const hasBackend = files.some((file) => normalizePath(file).startsWith("src-tauri/")) || hasTreeNode(artifact.projectTree, "src-tauri");
  const targets = DEFAULT_TARGETS.map((target) => ({ ...target, file: appFile }));

  targets.push({
    id: "style-surface",
    label: "Стили контейнера",
    selector: ".container, .card, .panel",
    component: "Stylesheet",
    file: cssFile,
    line: 1,
    dom: "<div class=\"container\">…</div>",
    reason: "Визуальные отступы, цвета и сетки правятся в основном CSS-файле проекта.",
  });

  if (hasBackend) {
    targets.push({
      id: "tauri-bridge",
      label: "Связь frontend ↔ Tauri",
      selector: "[data-tauri-command], form, button[data-action]",
      component: "Tauri command bridge",
      file: findPreferredFile(files, ["src-tauri/src/main.rs", "src-tauri/src/lib.rs"], "src-tauri/src/main.rs"),
      line: 1,
      dom: "invoke('command', payload)",
      reason: "Для Tauri-проектов IPC-команды и native-логика находятся в src-tauri.",
    });
  }

  return targets;
}

export function createWorkbenchMap(
  artifact: Pick<PlanArtifact, "title" | "stack" | "steps" | "projectTree">,
  build?: Pick<BuildResult, "files" | "readiness">,
): WorkbenchMapSection[] {
  const files = build?.files?.map(normalizePath) ?? [];
  const routes = files.filter((file) => /(^src\/|^app\/|^pages\/).*(page|route|router|App)\.(tsx|jsx|ts|js)$/.test(file));
  const components = files.filter((file) => /(^src\/components\/|Component|\.tsx$|\.jsx$)/.test(file)).slice(0, 8);
  const backend = files.filter((file) => file.startsWith("src-tauri/") || /api|server|route/.test(file)).slice(0, 8);
  const dataFlow = artifact.steps.slice(0, 5).map((step, index) => `${index + 1}. ${step}`);
  const warnings = build?.readiness?.warnings ?? [];

  return [
    { title: "Стек", items: artifact.stack.length ? artifact.stack : ["React / TypeScript"] },
    { title: "Маршруты и экраны", items: routes.length ? routes : ["src/App.tsx"] },
    { title: "Компоненты", items: components.length ? components : ["App", "Hero", "CTA", "Layout"] },
    { title: "Backend / IPC", items: backend.length ? backend : ["Нет backend-файлов в последней сборке"] },
    { title: "Потоки данных", items: dataFlow.length ? dataFlow : ["План реализации пока пуст"] },
    { title: "Риски и логи", items: warnings.length ? warnings : ["Критичных предупреждений готовности нет"] },
  ];
}

export function buildWorkbenchDomMessage(target: WorkbenchInspectorTarget): string {
  return [
    `Выбран элемент: ${target.label}`,
    `DOM: ${target.dom}`,
    `Selector: ${target.selector}`,
    `Предполагаемый компонент: ${target.component}`,
    `Где это в коде: ${target.file}:${target.line}`,
    `Задача: внеси точечную правку только для выбранного контейнера, не переписывая весь проект.`,
  ].join("\n");
}

export function inferPreviewUrl(rootPath?: string): string {
  if (!rootPath) return "http://127.0.0.1:5173";
  if (/^https?:\/\//i.test(rootPath)) return rootPath;
  return "http://127.0.0.1:5173";
}
