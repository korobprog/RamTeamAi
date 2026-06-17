import { useEffect } from "react";
import { FRamTeamAie } from "./components/FRamTeamAie";
import { UpdateNotice } from "./components/UpdateNotice";
import { AgentBuilderScreen } from "./screens/AgentBuilderScreen";
import { BuildScreen } from "./screens/BuildScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { CustomApiScreen } from "./screens/CustomApiScreen";
import { McpScreen } from "./screens/McpScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ProvidersScreen } from "./screens/ProvidersScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TopologyScreen } from "./screens/TopologyScreen";
import { useAppStore } from "./store/appStore";

export default function App() {
  const screen = useAppStore((state) => state.screen);
  const hydrateAccount = useAppStore((state) => state.hydrateAccount);

  useEffect(() => {
    void hydrateAccount();
  }, [hydrateAccount]);

  return (
    <FRamTeamAie>
      <UpdateNotice />
      {screen === "onboarding" && <OnboardingScreen />}
      {screen === "providers" && <ProvidersScreen />}
      {screen === "custom-api" && <CustomApiScreen />}
      {screen === "mcp" && <McpScreen />}
      {screen === "agent-builder" && <AgentBuilderScreen />}
      {screen === "topology" && <TopologyScreen />}
      {screen === "chat" && <ChatScreen />}
      {screen === "build" && <BuildScreen />}
      {screen === "settings" && <SettingsScreen />}
    </FRamTeamAie>
  );
}
