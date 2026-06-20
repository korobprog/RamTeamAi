import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentsSeed, mcpServersSeed, planArtifactSeed, projectsSeed, providersSeed, sessionSeed } from "../../data/seed";
import type { ChatMessage, SessionConfig } from "../../types";

const chatHarness = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../store/appStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(chatHarness.state),
}));

function message(author: ChatMessage["author"], text: string, agentRole?: ChatMessage["agentRole"]): ChatMessage {
  return {
    id: author + "-" + Math.random(),
    author,
    agentRole,
    text,
    createdAt: new Date().toISOString(),
    tokens: Math.ceil(text.length / 4),
  };
}

function setChatState(patch: Partial<Record<string, unknown>> = {}) {
  const session: SessionConfig = {
    ...sessionSeed,
    messages: [
      message("user", "Сделай лендинг"),
      message("coder", "Файл: src/App.tsx", "coder"),
    ],
  };
  chatHarness.state = {
    agents: agentsSeed,
    providers: providersSeed,
    projects: projectsSeed,
    sessions: [session],
    activeProjectId: "project-default",
    activeSessionId: session.id,
    session,
    mcpServers: mcpServersSeed,
    runTeam: vi.fn(),
    runAuto: vi.fn(),
    startAgentImplementation: vi.fn(),
    enqueueAgentQuestion: vi.fn(),
    clearQueuedAgentQuestion: vi.fn(),
    runAgentDialogQuestion: vi.fn(),
    appSettings: { autoMode: true, operatorDefaultAgentId: "coder" },
    setAppSettings: vi.fn(),
    autoRunning: false,
    agentDialogMessages: [],
    agentDialogOpen: false,
    agentDialogBusy: false,
    agentDialogAgentId: undefined,
    setAgentDialogOpen: vi.fn(),
    clearAgentDialog: vi.fn(),
    createProject: vi.fn(),
    createSession: vi.fn(),
    selectProject: vi.fn(),
    selectSession: vi.fn(),
    archiveProject: vi.fn(),
    archiveSession: vi.fn(),
    restoreProject: vi.fn(),
    restoreSession: vi.fn(),
    clearArchiveMemory: vi.fn(),
    deleteArchive: vi.fn(),
    workspacePath: "mem://workspace",
    selectWorkspaceFolder: vi.fn(),
    clearWorkspaceFolder: vi.fn(),
    initWorkspace: vi.fn(),
    lastWorkspaceInit: undefined,
    setSessionMode: vi.fn(),
    setScreen: vi.fn(),
    artifact: { ...planArtifactSeed, status: "built" as const },
    implementationChecklist: planArtifactSeed.steps.map((step, index) => ({ id: "step-" + index, index, step, done: true, source: "heuristic" })),
    busy: false,
    activeRunMode: undefined,
    liveFileActivity: [],
    queuedAgentQuestions: [],
    projectWorkTimers: {},
    agentRunCheckpoints: [],
    activeWorkStartedAt: undefined,
    ...patch,
  };
}

async function renderChatScreen() {
  const { ChatScreen } = await import("../ChatScreen");
  return renderToStaticMarkup(React.createElement(ChatScreen));
}

describe("ChatScreen auto implementation CTA", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setChatState();
  });

  it("does not ask to continue implementation after auto mode already built the project", async () => {
    const html = await renderChatScreen();

    expect(html).not.toContain("Продолжить реализацию");
    expect(html).not.toContain("Реализация идёт");
  });

  it("switches the composer to main-agent Q&A when the project is built", async () => {
    const html = await renderChatScreen();

    expect(html).toContain("Вопрос по готовому проекту");
    expect(html).toContain("Отвечает главный");
    expect(html).toContain("Спросите о готовом проекте");
    expect(html).toContain("Спросить");
  });

  it("does not render a manual continue CTA while auto mode is enabled and checklist is still partial", async () => {
    setChatState({
      artifact: { ...planArtifactSeed, status: "scaffolded" as const },
      implementationChecklist: planArtifactSeed.steps.map((step, index) => ({ id: "step-" + index, index, step, done: index < 2, source: "heuristic" })),
      appSettings: { autoMode: true, operatorDefaultAgentId: "coder" },
    });

    const html = await renderChatScreen();

    expect(html).not.toContain("Продолжить реализацию");
    expect(html).not.toContain("Реализация идёт");
  });
});
