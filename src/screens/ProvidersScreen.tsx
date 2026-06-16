import { Chip, SectionTitle } from "../components/FNeurogatee";
import { useAppStore } from "../store/appStore";
import type { ProviderKind } from "../types";

const providerIcon: Record<ProviderKind, string> = {
  anthropic: "sparkles",
  openai: "circle",
  gemini: "stars",
  ollama: "server",
  neurogate: "route",
  custom: "plug",
};

function modelsCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + " модель";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return n + " модели";
  return n + " моделей";
}

export function ProvidersScreen() {
  const providers = useAppStore((state) => state.providers);
  const setScreen = useAppStore((state) => state.setScreen);
  const testProvider = useAppStore((state) => state.testProvider);

  return (
    <div className="screen-stack">
      <div className="toolbar">
        <SectionTitle icon="plug-connected" title="Провайдеры" subtitle="Единый реестр API, моделей и capability-флагов" />
        <button className="primary" type="button" onClick={() => setScreen("custom-api")}>Подключить API</button>
      </div>
      <div className="provider-list">
        {providers.map((provider) => (
          <article className="provider-card" key={provider.id}>
            <div className={"provider-icon " + provider.kind}><i className={"ti ti-" + providerIcon[provider.kind]} aria-hidden="true" /></div>
            <div className="provider-main">
              <div className="provider-name">{provider.name}</div>
              <code>{provider.maskedKey ?? provider.baseUrl}</code>
            </div>
            <div className="provider-meta">
              <span>{modelsCount(provider.models.length)}</span>
              <Chip tone={provider.status === "connected" ? "success" : provider.status === "warning" ? "warning" : "default"}>
                {provider.status === "connected" ? "активен" : provider.status === "warning" ? "проверить" : "нет ключа"}
              </Chip>
              <button className="ghost" type="button" onClick={() => void testProvider(provider.id)}>Тест</button>
            </div>
          </article>
        ))}
      </div>
      <p className="security-note"><i className="ti ti-lock" aria-hidden="true" /> Секреты хранятся в OS keychain; в SQLite остаются только ссылки вида <code>keychain://Neurogate/provider</code>.</p>
    </div>
  );
}
