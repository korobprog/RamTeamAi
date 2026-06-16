import { useMemo, useState } from "react";
import { Chip, SectionTitle } from "../components/FNeurogatee";
import { useAppStore } from "../store/appStore";
import type { ProviderConfig } from "../types";
import { maskSecret, testProviderConnection } from "../providers";

export function CustomApiScreen() {
  const upsertProvider = useAppStore((state) => state.upsertProvider);
  const setScreen = useAppStore((state) => state.setScreen);
  const [name, setName] = useState("My LLM Gateway");
  const [baseUrl, setBaseUrl] = useState("https://api.myhost.ai/v1");
  const [auth, setAuth] = useState<ProviderConfig["auth"]>("bearer");
  const [stream, setStream] = useState<ProviderConfig["stream"]>("sse");
  const [secret, setSecret] = useState("gw-demo-secret-7c1");
  const [template, setTemplate] = useState('{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }');
  const [responsePath, setResponsePath] = useState("$.choices[0].message.content");
  const [streamPath, setStreamPath] = useState("$.choices[0].delta.content");
  const [testMessage, setTestMessage] = useState("Готов к тесту");

  const provider = useMemo<ProviderConfig>(() => ({
    id: "custom-gateway",
    name: name + " · custom",
    kind: "custom",
    baseUrl,
    auth,
    stream,
    keyRef: "keychain://Neurogate/custom-gateway",
    maskedKey: maskSecret(secret),
    status: "warning",
    requestTemplate: template,
    responsePath,
    streamChunkPath: streamPath,
    capabilities: { streaming: true, toolUse: true, vision: true, maxContext: 32_000 },
    models: [{ id: "gateway-default", label: "Gateway default", capabilities: { streaming: true, toolUse: true, vision: true, maxContext: 32_000 } }],
  }), [auth, baseUrl, name, responsePath, secret, stream, streamPath, template]);

  async function handleTest() {
    const result = await testProviderConnection(provider);
    setTestMessage(result.message + " · " + result.latencyMs + " ms");
  }

  function handleSave() {
    upsertProvider({ ...provider, status: "connected" });
    setScreen("agent-builder");
  }

  return (
    <div className="screen-stack">
      <SectionTitle icon="plug-connected" title="Мастер кастомного API" subtitle="Шаблон запроса, JSONPath ответа и capability-флаги" />
      <div className="form-grid">
        <label>Название<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label>Аутентификация<select value={auth} onChange={(event) => setAuth(event.target.value as ProviderConfig["auth"])}><option value="bearer">Bearer header</option><option value="header">Custom header</option><option value="query">API key query</option><option value="none">Без ключа</option></select></label>
        <label>Стриминг<select value={stream} onChange={(event) => setStream(event.target.value as ProviderConfig["stream"])}><option value="sse">SSE</option><option value="jsonl">JSON lines</option><option value="websocket">WebSocket</option><option value="none">Без стрима</option></select></label>
        <label>API key<input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
        <label>JSONPath ответа<input value={responsePath} onChange={(event) => setResponsePath(event.target.value)} /></label>
      </div>
      <label className="textarea-label">Маппинг тела<textarea value={template} onChange={(event) => setTemplate(event.target.value)} /></label>
      <div className="form-grid compact">
        <label>JSONPath чанка<input value={streamPath} onChange={(event) => setStreamPath(event.target.value)} /></label>
        <div className="capabilities"><Chip tone="info">streaming</Chip><Chip tone="info">tool-use</Chip><Chip tone="info">vision</Chip><Chip>ctx 32k</Chip></div>
      </div>
      <div className="bottom-bar"><span className="status-ok"><i className="ti ti-circle-check" aria-hidden="true" /> {testMessage}</span><div><button type="button" onClick={() => void handleTest()}>Тест</button><button className="primary" type="button" onClick={handleSave}>Сохранить</button></div></div>
    </div>
  );
}
