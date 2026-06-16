import { create } from "zustand";
import { agentsSeed, mcpServersSeed, planArtifactSeed, providersSeed, sessionSeed, topologySeed } from "../data/seed";
import { runPlanningRound, synthesizePlan } from "../orchestrator";
import { testProviderConnection } from "../providers";
import { buildProject } from "../projectBuilder";
import type { AgentConfig, BuildResult, ChatMessage, McpServerConfig, PlanArtifact, ProviderConfig, ScreenId, SessionConfig, TopologyConfig } from "../types";

interface AppState {
  screen: ScreenId;
  providers: ProviderConfig[];
  agents: AgentConfig[];
  session: SessionConfig;
  topology: TopologyConfig;
  artifact: PlanArtifact;
  mcpServers: McpServerConfig[];
  lastBuild?: BuildResult;
  busy: boolean;
  setScreen: (screen: ScreenId) => void;
  upsertProvider: (provider: ProviderConfig) => void;
  testProvider: (providerId: string) => Promise<void>;
  updateAgent: (agent: AgentConfig) => void;
  setTopology: (patch: Partial<TopologyConfig>) => void;
  setSessionMode: (mode: SessionConfig["mode"]) => void;
  runTeam: (prompt?: string) => Promise<void>;
  updateArtifact: (patch: Partial<PlanArtifact>) => void;
  requestBuild: (confirmed: boolean) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: "onboarding",
  providers: providersSeed,
  agents: agentsSeed,
  session: sessionSeed,
  topology: topologySeed,
  artifact: planArtifactSeed,
  mcpServers: mcpServersSeed,
  busy: false,
  setScreen: (screen) => set({ screen }),
  upsertProvider: (provider) => set((state) => ({
    providers: state.providers.some((item) => item.id === provider.id)
      ? state.providers.map((item) => (item.id === provider.id ? provider : item))
      : [...state.providers, provider],
  })),
  testProvider: async (providerId) => {
    const provider = get().providers.find((item) => item.id === providerId);
    if (!provider) return;
    set({ busy: true });
    const result = await testProviderConnection(provider);
    set((state) => ({
      busy: false,
      providers: state.providers.map((item) => item.id === providerId
        ? { ...item, status: result.ok ? "connected" : "warning", latencyMs: result.latencyMs }
        : item),
    }));
  },
  updateAgent: (agent) => set((state) => ({ agents: state.agents.map((item) => (item.id === agent.id ? agent : item)) })),
  setTopology: (patch) => set((state) => ({ topology: { ...state.topology, ...patch } })),
  setSessionMode: (mode) => set((state) => ({ session: { ...state.session, mode } })),
  runTeam: async (prompt = "") => {
    const { agents, topology, session } = get();
    const trimmedPrompt = prompt.trim();
    const userMessage: ChatMessage | undefined = trimmedPrompt
      ? {
        id: "user-" + Date.now(),
        author: "user",
        text: trimmedPrompt,
        createdAt: new Date().toISOString(),
        tokens: Math.max(24, Math.ceil(trimmedPrompt.length / 4)),
      }
      : undefined;
    const baseMessages = userMessage ? [...session.messages, userMessage] : session.messages;

    const nextMode = trimmedPrompt ? session.mode : "planning";

    set({
      busy: true,
      screen: "chat",
      agents: agents.map((agent) => ({
        ...agent,
        status: agent.tools.includes("mcp") ? "mcp" : "typing",
      })),
      session: {
        ...session,
        mode: nextMode,
        messages: baseMessages,
        tokensUsed: baseMessages.reduce((sum, message) => sum + message.tokens, 0),
      },
    });

    const messages = await runPlanningRound(agents, topology, session.tokensUsed + (userMessage?.tokens ?? 0), trimmedPrompt);
    set((state) => {
      const nextMessages = [...baseMessages, ...messages];
      return {
        busy: false,
        agents: state.agents.map((agent) => ({ ...agent, status: "done" })),
        session: {
          ...state.session,
          mode: nextMode,
          messages: nextMessages,
          tokensUsed: nextMessages.reduce((sum, message) => sum + message.tokens, 0),
        },
        artifact: synthesizePlan(nextMessages, state.artifact),
      };
    });
  },
  updateArtifact: (patch) => set((state) => ({ artifact: { ...state.artifact, ...patch, edited: true } })),
  requestBuild: async (confirmed) => {
    const artifact = get().artifact;
    set({ busy: true });
    const result = await buildProject(artifact, confirmed);
    set((state) => ({
      busy: false,
      lastBuild: result,
      artifact: confirmed ? { ...state.artifact, status: "built" } : state.artifact,
    }));
  },
}));
