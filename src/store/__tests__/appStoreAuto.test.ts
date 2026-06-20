import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletionResult } from "../../providers";

const harness = vi.hoisted(() => ({
  files: new Map<string, string>(),
  implementationCalls: 0,
}));

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function installMemoryStorage() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
  };
  vi.stubGlobal("window", {
    localStorage,
    open: vi.fn(),
    setTimeout,
    clearTimeout,
  });
}

function seedScaffoldFiles(rootPath: string) {
  const seed: Record<string, string> = {
    "README.md": "# Test\n",
    "PLAN.md": "# Plan\n",
    "IMPLEMENTATION.md": "# Implementation\n",
    "docs/plan.md": "# Plan\n",
    "docs/agent-tasks.md": "# Tasks\n",
    "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }, null, 2),
    "tsconfig.json": "{}\n",
    "vite.config.ts": "import { defineConfig } from \"vite\";\n",
    "index.html": "<div id=\"root\"></div>\n<script type=\"module\" src=\"/src/main.tsx\"></script>\n",
    "src/main.tsx": "import React from \"react\";\nimport ReactDOM from \"react-dom/client\";\nimport App from \"./App\";\nimport \"./index.css\";\n",
    "src/App.tsx": "export default function App() { return <main>ready for the agent team to extend</main>; }\n",
    "src/index.css": "body { margin: 0; }\n",
  };
  for (const [path, content] of Object.entries(seed)) {
    const key = normalizePath(path);
    if (!harness.files.has(key)) harness.files.set(key, content);
  }
  return {
    phase: "scaffold",
    rootPath,
    files: [...harness.files.keys()],
    skipped: false,
    message: "mock scaffold ready",
    readiness: {
      contract: "frontend",
      status: "scaffold-ok",
      requiredFiles: ["package.json", "index.html", "src/App.tsx"],
      presentFiles: ["package.json", "index.html", "src/App.tsx"],
      missingFiles: [],
      stubFiles: [],
      warnings: [],
      message: "Project scaffold contract is satisfied.",
    },
  } as const;
}

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

vi.mock("../../workspace", () => ({
  clearStoredWebWorkspaceFolder: vi.fn(),
  initWorkspaceFiles: vi.fn(async () => ({ rootPath: "mem://workspace", files: [], createdFiles: [], existingFiles: [], message: "ok" })),
  pickWorkspaceFolder: vi.fn(async () => "mem://workspace"),
  listWorkspaceFiles: vi.fn(async () => [...harness.files.keys()]),
  readWorkspaceTextFile: vi.fn(async (_rootPath: string, relativePath: string) => {
    const path = normalizePath(relativePath);
    return { path, content: harness.files.get(path) ?? "", exists: harness.files.has(path) };
  }),
  writeWorkspaceTextFile: vi.fn(async (_rootPath: string, relativePath: string, content: string) => {
    const path = normalizePath(relativePath);
    const existed = harness.files.has(path);
    harness.files.set(path, content);
    return { path, created: !existed, overwritten: existed };
  }),
}));

vi.mock("../../providers", () => ({
  maskSecret: (value: string) => value,
  rememberProviderSecret: vi.fn(),
  testProviderConnection: vi.fn(),
  completeWithProvider: vi.fn(async (_provider, _agent, _messages, mode): Promise<CompletionResult> => {
    if (mode === "planning") {
      return {
        text: [
          "## Шаги",
          "1. Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
          "2. Подключить Tailwind и `lucide-react`, затем запустить `npm run dev`",
          "3. Вставить `src/App.tsx` и `src/index.css` в проект",
          "4. Выбрать следующий вариант: каркас проекта, премиум-дизайн или RU/EN",
        ].join("\n"),
        latencyMs: 1,
        tokens: 120,
      };
    }

    harness.implementationCalls += 1;
    if (harness.implementationCalls === 1) {
      return {
        text: [
          "Файл: src/App.tsx",
          "```tsx",
          "export default function App() {",
          "  return <main>Premium landing shell</main>;",
          "}",
          "```",
        ].join("\n"),
        latencyMs: 1,
        tokens: 80,
      };
    }

    return {
      text: [
        "Файл: package.json",
        "```json",
        JSON.stringify({
          scripts: { dev: "vite", build: "tsc && vite build", test: "vitest run" },
          dependencies: { react: "latest", "react-dom": "latest", "lucide-react": "latest", tailwindcss: "latest" },
          devDependencies: {
            vite: "latest",
            typescript: "latest",
            vitest: "latest",
            "@testing-library/react": "latest",
          },
        }, null, 2),
        "```",
        "",
        "Файл: src/App.tsx",
        "```tsx",
        "import { Sparkles } from \"lucide-react\";",
        "export default function App() {",
        "  return <main><Sparkles />Premium landing finished</main>;",
        "}",
        "```",
        "",
        "Файл: src/index.css",
        "```css",
        "@import \"tailwindcss\";",
        ".hero { min-height: 100vh; }",
        "```",
        "",
        "Файл: tests/App.test.tsx",
        "```tsx",
        "import { render, screen } from \"@testing-library/react\";",
        "import { describe, expect, it } from \"vitest\";",
        "import App from \"../src/App\";",
        "",
        "describe(\"App\", () => {",
        "  it(\"renders the premium landing\", () => {",
        "    render(<App />);",
        "    expect(screen.getByText(/Premium landing finished/)).toBeTruthy();",
        "  });",
        "});",
        "```",
      ].join("\n"),
      latencyMs: 1,
      tokens: 180,
    };
  }),
}));

vi.mock("../../projectBuilder", async () => {
  const actual = await vi.importActual<typeof import("../../projectBuilder")>("../../projectBuilder");
  return {
    ...actual,
    buildProject: vi.fn(async (_artifact, _confirmed, workspacePath?: string) => seedScaffoldFiles(workspacePath ?? "mem://workspace")),
  };
});

describe("appStore auto implementation integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.files.clear();
    harness.implementationCalls = 0;
    installMemoryStorage();
  });

  it("runs planning plus implementation rounds until checklist completion and marks built", async () => {
    const { useAppStore } = await import("../appStore");
    useAppStore.setState((state) => ({
      agents: state.agents.filter((agent) => agent.id === "coder"),
      providers: state.providers.map((provider) => provider.id === "RamTeamAi"
        ? { ...provider, status: "connected" as const, maskedKey: "test-key" }
        : provider),
      appSettings: { ...state.appSettings, autoMode: true, autoMaxRounds: 4, modelFallbackEnabled: false },
      workspacePath: "mem://workspace",
    }));

    await useAppStore.getState().runAuto("Сделай премиальный лендинг на Vite React TypeScript с Tailwind и lucide-react");

    const state = useAppStore.getState();
    expect(harness.implementationCalls).toBe(2);
    expect(state.artifact.status).toBe("built");
    expect(state.projects.find((project) => project.id === state.activeProjectId)?.status).toBe("built");
    expect(state.implementationChecklist.length).toBeGreaterThan(0);
    expect(state.implementationChecklist.every((item) => item.done)).toBe(true);
    expect(harness.files.get("src/index.css")).toContain("tailwindcss");
    expect(harness.files.get("src/App.tsx")).toContain("lucide-react");
    expect(harness.files.get("tests/App.test.tsx")).toContain("@testing-library/react");
  });

  it("continues automatically after a manual implementation start when auto mode is enabled", async () => {
    const { useAppStore } = await import("../appStore");
    const steps = [
      "Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
      "Подключить Tailwind и `lucide-react`, затем запустить `npm run dev`",
      "Вставить `src/App.tsx` и `src/index.css` в проект",
      "Выбрать следующий вариант: каркас проекта, премиум-дизайн или RU/EN",
    ];
    useAppStore.setState((state) => ({
      agents: state.agents.filter((agent) => agent.id === "coder"),
      providers: state.providers.map((provider) => provider.id === "RamTeamAi"
        ? { ...provider, status: "connected" as const, maskedKey: "test-key" }
        : provider),
      appSettings: { ...state.appSettings, autoMode: true, autoMaxRounds: 4, modelFallbackEnabled: false },
      workspacePath: "mem://workspace",
      artifact: {
        ...state.artifact,
        steps,
        status: "scaffolded" as const,
      },
    }));

    await useAppStore.getState().startAgentImplementation();

    const state = useAppStore.getState();
    expect(harness.implementationCalls).toBe(2);
    expect(state.autoRunning).toBe(false);
    expect(state.artifact.status).toBe("built");
    expect(state.implementationChecklist.every((item) => item.done)).toBe(true);
  });

  it("persists the selected session decision artifact and restores it after reload", async () => {
    const { useAppStore } = await import("../appStore");
    const activeSessionId = useAppStore.getState().activeSessionId;

    useAppStore.getState().updateArtifact({
      title: "Custom persisted decision",
      stack: ["React", "Vitest"],
      steps: ["Build the persisted app shell", "Add app-specific QA checks"],
      projectTree: "src/App.tsx\ntests/App.test.tsx",
      status: "approved",
    });

    const savedSessions = JSON.parse(window.localStorage.getItem("RamTeamAi.sessions.v1") ?? "[]") as Array<{
      id: string;
      artifact?: { steps?: string[]; stack?: string[] };
      implementationChecklist?: unknown[];
    }>;
    const savedActiveSession = savedSessions.find((session) => session.id === activeSessionId);
    expect(savedActiveSession?.artifact?.steps).toEqual(["Build the persisted app shell", "Add app-specific QA checks"]);
    expect(savedActiveSession?.implementationChecklist).toHaveLength(2);

    vi.resetModules();
    const { useAppStore: restoredStore } = await import("../appStore");
    const restored = restoredStore.getState();
    expect(restored.activeSessionId).toBe(activeSessionId);
    expect(restored.artifact.steps).toEqual(["Build the persisted app shell", "Add app-specific QA checks"]);
    expect(restored.artifact.stack).toEqual(["React", "Vitest"]);
    expect(restored.implementationChecklist).toHaveLength(2);
  });
});
