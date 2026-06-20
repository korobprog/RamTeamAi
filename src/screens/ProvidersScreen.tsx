import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { ProviderMonitor } from "../components/ProviderMonitor";
import { NEUROGATE_INVITE_URL, NEUROGATE_PROMO_CREDIT, NEUROGATE_PROVIDER_ID } from "../config/neurogateReferral";
import { useAppStore } from "../store/appStore";
import type { ProviderConfig, ProviderKind } from "../types";
import type { ProviderTestResult } from "../providers";

const L = {
  providers: "\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b",
  subtitle: "\u0413\u043e\u0442\u043e\u0432\u044b\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 API - \u0432\u0441\u0442\u0430\u0432\u044c \u043a\u043b\u044e\u0447 \u0438\u043b\u0438 \u0438\u0437\u043c\u0435\u043d\u0438 \u043f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b",
  customApi: "\u041a\u0430\u0441\u0442\u043e\u043c\u043d\u044b\u0439 API",
  active: "\u0430\u043a\u0442\u0438\u0432\u0435\u043d",
  check: "\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c",
  noKey: "\u043d\u0435\u0442 \u043a\u043b\u044e\u0447\u0430",
  noKeyAuth: "\u0411\u0435\u0437 \u043a\u043b\u044e\u0447\u0430",
  modelOne: " \u043c\u043e\u0434\u0435\u043b\u044c",
  modelFew: " \u043c\u043e\u0434\u0435\u043b\u0438",
  modelMany: " \u043c\u043e\u0434\u0435\u043b\u0435\u0439",
  settings: "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438",
  addKey: "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043a\u043b\u044e\u0447",
  changeKey: "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043a\u043b\u044e\u0447",
  test: "\u0422\u0435\u0441\u0442",
  name: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435",
  auth: "\u0410\u0443\u0442\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f",
  streaming: "\u0421\u0442\u0440\u0438\u043c\u0438\u043d\u0433",
  noStream: "\u0411\u0435\u0437 \u0441\u0442\u0440\u0438\u043c\u0430",
  responsePath: "JSONPath \u043e\u0442\u0432\u0435\u0442\u0430",
  chunkPath: "JSONPath \u0447\u0430\u043d\u043a\u0430",
  bodyMapping: "\u041c\u0430\u043f\u043f\u0438\u043d\u0433 \u0442\u0435\u043b\u0430",
  saveSettings: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438",
  saveKey: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u043b\u044e\u0447",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  keyPlaceholder: "\u0412\u0441\u0442\u0430\u0432\u044c API key",
  testing: "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c...",
  neurogatePromoTitle: "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 Neurogate API",
  neurogatePromoText: "\u041f\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u0432 Neurogate, \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u0435 {credit} \u043d\u0430 \u043f\u0435\u0440\u0432\u043e\u0435 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435, \u0437\u0430\u0442\u0435\u043c \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 API key \u0432 \u044d\u0442\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435.",
  neurogatePromoButton: "\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c {credit}",
  secretNote: "\u0421\u0435\u043a\u0440\u0435\u0442\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u0432 OS keychain; \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u043e\u0432 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e.",
};

const providerIcon: Record<ProviderKind, string> = {
  anthropic: "sparkles",
  openai: "circle",
  gemini: "stars",
  ollama: "server",
  RamTeamAi: "route",
  custom: "plug",
};

function modelsCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return n + L.modelOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return n + L.modelFew;
  return n + L.modelMany;
}

function statusLabel(status: ProviderConfig["status"]): string {
  if (status === "connected") return L.active;
  if (status === "warning") return L.check;
  return L.noKey;
}

function authLabel(auth: ProviderConfig["auth"]): string {
  if (auth === "bearer") return "Bearer";
  if (auth === "query") return "Query key";
  if (auth === "header") return "Header key";
  return L.noKeyAuth;
}

export function ProvidersScreen() {
  const providers = useAppStore((state) => state.providers);
  const setScreen = useAppStore((state) => state.setScreen);
  const testProvider = useAppStore((state) => state.testProvider);
  const saveProviderSecret = useAppStore((state) => state.saveProviderSecret);
  const hydrateProviderSecrets = useAppStore((state) => state.hydrateProviderSecrets);
  const refreshProviderMonitoring = useAppStore((state) => state.refreshProviderMonitoring);
  const upsertProvider = useAppStore((state) => state.upsertProvider);
  const busy = useAppStore((state) => state.busy);
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [draftProvider, setDraftProvider] = useState<ProviderConfig | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  useEffect(() => {
    void hydrateProviderSecrets();
  }, [hydrateProviderSecrets]);

  async function handleSave(providerId: string) {
    await saveProviderSecret(providerId, secrets[providerId] ?? "");
    setSecrets((current) => ({ ...current, [providerId]: "" }));
    setOpenProviderId(null);
  }

  async function handleTest(providerId: string) {
    setTestingProviderId(providerId);
    const result = await testProvider(providerId);
    if (result) setTestResults((current) => ({ ...current, [providerId]: result }));
    setTestingProviderId(null);
  }

  function openSettings(provider: ProviderConfig) {
    setEditingProviderId(provider.id);
    setDraftProvider({ ...provider });
    setOpenProviderId(null);
  }

  function closeSettings() {
    setEditingProviderId(null);
    setDraftProvider(null);
  }

  function saveSettings() {
    if (!draftProvider) return;
    upsertProvider(draftProvider);
    closeSettings();
  }

  function patchDraft(patch: Partial<ProviderConfig>) {
    setDraftProvider((current) => current ? { ...current, ...patch } : current);
  }

  async function openNeurogateInvite() {
    try {
      await openUrl(NEUROGATE_INVITE_URL);
    } catch {
      window.open(NEUROGATE_INVITE_URL, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="screen-stack">
      <div className="toolbar">
        <SectionTitle icon="plug-connected" title={L.providers} subtitle={L.subtitle} />
        <button className="primary" type="button" onClick={() => setScreen("custom-api")}>{L.customApi}</button>
      </div>
      <ProviderMonitor providers={providers} onRefresh={refreshProviderMonitoring} />
      <div className="provider-list">
        {providers.map((provider) => {
          const needsKey = provider.auth !== "none";
          const isKeyOpen = openProviderId === provider.id;
          const isSettingsOpen = editingProviderId === provider.id && draftProvider;
          const testResult = testResults[provider.id];
          const isTesting = testingProviderId === provider.id;
          return (
            <article className="provider-card" key={provider.id}>
              <div className={"provider-icon " + provider.kind}><i className={"ti ti-" + providerIcon[provider.kind]} aria-hidden="true" /></div>
              <div className="provider-main">
                <div className="provider-name">{provider.name}</div>
                <code>{provider.maskedKey ?? provider.baseUrl}</code>
                <small className="provider-settings">{authLabel(provider.auth)}{" / "}{provider.stream.toUpperCase()}{" / "}{provider.baseUrl}</small>

                {provider.id === NEUROGATE_PROVIDER_ID ? (
                  <div className="provider-promo">
                    <span>
                      <b>{L.neurogatePromoTitle}</b>
                      <small>{L.neurogatePromoText.replace("{credit}", NEUROGATE_PROMO_CREDIT)}</small>
                    </span>
                    <button className="primary" type="button" onClick={() => void openNeurogateInvite()}>
                      {L.neurogatePromoButton.replace("{credit}", NEUROGATE_PROMO_CREDIT)}
                    </button>
                  </div>
                ) : null}

                {isSettingsOpen ? (
                  <div className="provider-edit-panel">
                    <div className="form-grid">
                      <label>{L.name}<input value={draftProvider.name} onChange={(event) => patchDraft({ name: event.target.value })} /></label>
                      <label>Base URL<input value={draftProvider.baseUrl} onChange={(event) => patchDraft({ baseUrl: event.target.value })} /></label>
                      <label>{L.auth}<select value={draftProvider.auth} onChange={(event) => patchDraft({ auth: event.target.value as ProviderConfig["auth"] })}><option value="bearer">Bearer header</option><option value="header">Custom header</option><option value="query">API key query</option><option value="none">{L.noKeyAuth}</option></select></label>
                      <label>{L.streaming}<select value={draftProvider.stream} onChange={(event) => patchDraft({ stream: event.target.value as ProviderConfig["stream"] })}><option value="sse">SSE</option><option value="jsonl">JSON lines</option><option value="websocket">WebSocket</option><option value="none">{L.noStream}</option></select></label>
                      <label>{L.responsePath}<input value={draftProvider.responsePath ?? ""} onChange={(event) => patchDraft({ responsePath: event.target.value })} /></label>
                      <label>{L.chunkPath}<input value={draftProvider.streamChunkPath ?? ""} onChange={(event) => patchDraft({ streamChunkPath: event.target.value })} /></label>
                    </div>
                    <label className="textarea-label">{L.bodyMapping}<textarea value={draftProvider.requestTemplate ?? ""} onChange={(event) => patchDraft({ requestTemplate: event.target.value })} /></label>
                    <div className="provider-edit-actions"><button className="primary" type="button" onClick={saveSettings}>{L.saveSettings}</button><button type="button" onClick={closeSettings}>{L.cancel}</button></div>
                  </div>
                ) : null}

                {isKeyOpen && needsKey ? (
                  <div className="provider-key-row">
                    <input aria-label={"API key " + provider.name} autoFocus placeholder={L.keyPlaceholder} type="password" value={secrets[provider.id] ?? ""} onChange={(event) => setSecrets((current) => ({ ...current, [provider.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void handleSave(provider.id); if (event.key === "Escape") setOpenProviderId(null); }} />
                    <button className="primary" disabled={busy || !(secrets[provider.id] ?? "").trim()} type="button" onClick={() => void handleSave(provider.id)}>{L.saveKey}</button>
                    <button type="button" onClick={() => setOpenProviderId(null)}>{L.cancel}</button>
                  </div>
                ) : null}
              </div>
              <div className="provider-meta">
                <span>{modelsCount(provider.models.length)}</span>
                <Chip tone={provider.status === "connected" ? "success" : provider.status === "warning" ? "warning" : "default"}>{statusLabel(provider.status)}</Chip>
                <button className="ghost" type="button" onClick={() => openSettings(provider)}>{L.settings}</button>
                {needsKey ? <button className="ghost" type="button" onClick={() => { setOpenProviderId(isKeyOpen ? null : provider.id); closeSettings(); }}>{provider.status === "connected" ? L.changeKey : L.addKey}</button> : null}
                <button className="ghost" disabled={busy || isTesting || provider.status === "not-configured"} type="button" onClick={() => void handleTest(provider.id)}>{isTesting ? L.testing : L.test}</button>
              </div>
              {testResult ? <div className={"provider-test-result " + (testResult.ok ? "ok" : "error")}>{testResult.message} ? {testResult.latencyMs} ms</div> : null}
            </article>
          );
        })}
      </div>
      <p className="security-note"><i className="ti ti-lock" aria-hidden="true" /> {L.secretNote}</p>
    </div>
  );
}
