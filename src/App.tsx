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
import { PostBuildWorkbenchScreen } from "./screens/PostBuildWorkbenchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TopologyScreen } from "./screens/TopologyScreen";
import { useAppStore } from "./store/appStore";

export default function App() {
  const screen = useAppStore((state) => state.screen);
  const hydrateAccount = useAppStore((state) => state.hydrateAccount);
  const refreshProviderMonitoring = useAppStore((state) => state.refreshProviderMonitoring);
  const pushDiagnostic = useAppStore((state) => state.pushDiagnostic);
  const healthSupervisorEnabled = useAppStore((state) => state.appSettings.healthSupervisorEnabled);
  const providerHealthIntervalSec = useAppStore((state) => state.appSettings.providerHealthIntervalSec);

  useEffect(() => {
    void hydrateAccount();
  }, [hydrateAccount]);

  useEffect(() => {
    if (!healthSupervisorEnabled) return;
    refreshProviderMonitoring();
    const intervalMs = Math.max(15, providerHealthIntervalSec || 60) * 1000;
    const timer = window.setInterval(() => refreshProviderMonitoring(), intervalMs);
    return () => window.clearInterval(timer);
  }, [healthSupervisorEnabled, providerHealthIntervalSec, refreshProviderMonitoring]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      pushDiagnostic({
        severity: "error",
        category: "runtime",
        title: "Глобальная ошибка интерфейса",
        message: event.message || "Unhandled window error",
        source: "window.error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        context: {
          screen,
          file: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      pushDiagnostic({
        severity: "error",
        category: "runtime",
        title: "Необработанное отклонение Promise",
        message: reason instanceof Error ? reason.message : String(reason),
        source: "window.unhandledrejection",
        stack: reason instanceof Error ? reason.stack : undefined,
        context: {
          screen,
        },
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [pushDiagnostic, screen]);

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
      {screen === "workbench" && <PostBuildWorkbenchScreen />}
      {screen === "settings" && <SettingsScreen />}
    </FRamTeamAie>
  );
}
