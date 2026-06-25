import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planArtifactSeed, sessionSeed } from "../../data/seed";
import type { BuildResult } from "../../types";

const workbenchHarness = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../store/appStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(workbenchHarness.state),
}));

function setWorkbenchState(patch: Partial<Record<string, unknown>> = {}) {
  const lastBuild: BuildResult = {
    phase: "implementation",
    rootPath: "C:/tmp/ram-preview",
    files: ["package.json", "src/App.tsx", "src/index.css", "src-tauri/src/main.rs"],
    skipped: false,
    message: "built",
    readiness: {
      contract: "tauri-react",
      status: "build-ok",
      requiredFiles: ["package.json", "src/App.tsx"],
      presentFiles: ["package.json", "src/App.tsx"],
      missingFiles: [],
      warnings: [],
      message: "Project is ready.",
    },
  };
  workbenchHarness.state = {
    artifact: { ...planArtifactSeed, status: "built" as const },
    session: sessionSeed,
    lastBuild,
    workspacePath: "C:/tmp/ram-preview",
    liveFileActivity: [],
    runAgentDialogQuestion: vi.fn(),
    busy: false,
    setScreen: vi.fn(),
    ...patch,
  };
}

async function renderWorkbench() {
  const { PostBuildWorkbenchScreen } = await import("../PostBuildWorkbenchScreen");
  return renderToStaticMarkup(React.createElement(PostBuildWorkbenchScreen));
}

describe("PostBuildWorkbenchScreen", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setWorkbenchState();
  });

  it("renders the split-screen repair workspace", async () => {
    const html = await renderWorkbench();

    expect(html).toContain("Точечные правки после сборки");
    expect(html).toContain("Чат правок");
    expect(html).toContain("live-preview");
    expect(html).toContain("toolce inspector");
    expect(html).toContain("Терминал и логи ошибок");
    expect(html).toContain("Карта проекта");
    expect(html).toContain("src-tauri/src/main.rs");
  });
});
