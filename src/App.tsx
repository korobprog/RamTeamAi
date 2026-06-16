import { FNeurogatee } from "./components/FNeurogatee";
import { AgentBuilderScreen } from "./screens/AgentBuilderScreen";
import { BuildScreen } from "./screens/BuildScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { CustomApiScreen } from "./screens/CustomApiScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { ProvidersScreen } from "./screens/ProvidersScreen";
import { TopologyScreen } from "./screens/TopologyScreen";
import { useAppStore } from "./store/appStore";

export default function App() {
  const screen = useAppStore((state) => state.screen);

  return (
    <FNeurogatee>
      {screen === "onboarding" && <OnboardingScreen />}
      {screen === "providers" && <ProvidersScreen />}
      {screen === "custom-api" && <CustomApiScreen />}
      {screen === "agent-builder" && <AgentBuilderScreen />}
      {screen === "topology" && <TopologyScreen />}
      {screen === "chat" && <ChatScreen />}
      {screen === "build" && <BuildScreen />}
    </FNeurogatee>
  );
}
