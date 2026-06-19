import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentsSeed, planArtifactSeed } from "../../data/seed";
import type { ChecklistItem } from "../../orchestrator/checklist";
import type { BuildResult, PlanArtifact } from "../../types";

const screenHarness = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../store/appStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(screenHarness.state),
}));

function setBuildScreenState(patch: Partial<Record<string, unknown>> = {}) {
  screenHarness.state = {
    artifact: planArtifactSeed,
    agents: agentsSeed,
    updateArtifact: vi.fn(),
    workspacePath: undefined,
    selectWorkspaceFolder: vi.fn(),
    clearWorkspaceFolder: vi.fn(),
    implementProject: vi.fn(),
    startAgentImplementation: vi.fn(),
    lastBuild: undefined,
    lastRunFilesWritten: undefined,
    activeRunMode: undefined,
    implementationChecklist: [],
    busy: false,
    ...patch,
  };
}

async function renderBuildScreen() {
  const { BuildScreen } = await import("../BuildScreen");
  return renderToStaticMarkup(React.createElement(BuildScreen));
}

describe("BuildScreen implementation checklist UI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setBuildScreenState();
  });

  it("does not mark the scaffold flow step done before the scaffold is ready", async () => {
    const html = await renderBuildScreen();

    expect(html).toContain("Каркас");
    expect(html).toContain("нужно создать");
    expect(html).toContain('<div class="flow-step"><span>1</span><b>Каркас</b>');
    expect(html).not.toContain('<div class="flow-step done"><span>1</span><b>Каркас</b><small>нужно создать</small>');
  });

  it("shows partial checklist progress and a continue action after an incomplete round", async () => {
    const steps = ["Создать src/App.tsx", "Подключить Tailwind и lucide-react"];
    const artifact: PlanArtifact = {
      ...planArtifactSeed,
      steps,
      status: "scaffolded",
    };
    const implementationChecklist: ChecklistItem[] = [
      { id: "step-0", index: 0, step: steps[0], done: true, source: "heuristic", note: "done" },
      { id: "step-1", index: 1, step: steps[1], done: false, source: "heuristic", note: "missing deps" },
    ];
    const lastBuild: BuildResult = {
      phase: "scaffold",
      rootPath: "mem://workspace",
      files: ["package.json", "src/App.tsx"],
      skipped: false,
      message: "scaffold ok",
      readiness: {
        contract: "frontend",
        status: "scaffold-ok",
        requiredFiles: ["package.json", "src/App.tsx"],
        presentFiles: ["package.json", "src/App.tsx"],
        missingFiles: [],
        warnings: [],
        message: "Project scaffold contract is satisfied.",
      },
    };
    setBuildScreenState({ artifact, implementationChecklist, lastRunFilesWritten: 1, lastBuild });

    const html = await renderBuildScreen();

    expect(html).toContain("1 из 2 готово");
    expect(html).toContain("Continue implementation");
    expect(html).toContain("нужно продолжить");
    expect(html).not.toContain("2 из 2 готово");
  });
});
