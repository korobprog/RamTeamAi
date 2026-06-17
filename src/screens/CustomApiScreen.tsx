import { useMemo, useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { useAppStore } from "../store/appStore";
import type { ProviderConfig } from "../types";
import { testProviderConnection } from "../providers";

const L = {
  title: "\u041c\u0430\u0441\u0442\u0435\u0440 \u043a\u0430\u0441\u0442\u043e\u043c\u043d\u043e\u0433\u043e API",
  subtitle: "\u0428\u0430\u0431\u043b\u043e\u043d \u0437\u0430\u043f\u0440\u043e\u0441\u0430, JSONPath \u043e\u0442\u0432\u0435\u0442\u0430 \u0438 capability-\u0444\u043b\u0430\u0433\u0438",
  ready: "\u0413\u043e\u0442\u043e\u0432 \u043a \u0442\u0435\u0441\u0442\u0443",
  name: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435",
  auth: "\u0410\u0443\u0442\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f",
  streaming: "\u0421\u0442\u0440\u0438\u043c\u0438\u043d\u0433",
  noKey: "\u0411\u0435\u0437 \u043a\u043b\u044e\u0447\u0430",
  noStream: "\u0411\u0435\u0437 \u0441\u0442\u0440\u0438\u043c\u0430",
  insertKey: "\u0412\u0441\u0442\u0430\u0432\u044c \u043a\u043b\u044e\u0447",
  responsePath: "JSONPath \u043e\u0442\u0432\u0435\u0442\u0430",
  bodyMapping: "\u041c\u0430\u043f\u043f\u0438\u043d\u0433 \u0442\u0435\u043b\u0430",
  chunkPath: "JSONPath \u0447\u0430\u043d\u043a\u0430",
  test: "\u0422\u0435\u0441\u0442",
  save: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c",
};

export function CustomApiScreen() {
  const upsertProvider = useAppStore((state) => state.upsertProvider);
  const saveProviderSecret = useAppStore((state) => state.saveProviderSecret);
  const setScreen = useAppStore((state) => state.setScreen);
  const busy = useAppStore((state) => state.busy);
  const [name, setName] = useState("My LLM Gateway");
  const [baseUrl, setBaseUrl] = useState("https://api.myhost.ai/v1");
  const [auth, setAuth] = useState<ProviderConfig["auth"]>("bearer");
  const [stream, setStream] = useState<ProviderConfig["stream"]>("sse");
  const [secret, setSecret] = useState("");
  const [template, setTemplate] = useState('{ "model": "{{model}}", "messages": {{messages}}, "stream": {{stream}} }');
  const [responsePath, setResponsePath] = useState("$.choices[0].message.content");
  const [streamPath, setStreamPath] = useState("$.choices[0].delta.content");
  const [testMessage, setTestMessage] = useState(L.ready);

  const provider = useMemo<ProviderConfig>(() => ({
    id: "custom-gateway",
    name: name + " ? custom",
    kind: "custom",
    baseUrl,
    auth,
    stream,
    status: "not-configured",
    requestTemplate: template,
    responsePath,
    streamChunkPath: streamPath,
    capabilities: { streaming: stream !== "none", toolUse: true, vision: true, maxContext: 32_000 },
    models: [{ id: "gateway-default", label: "Gateway default", capabilities: { streaming: stream !== "none", toolUse: true, vision: true, maxContext: 32_000 } }],
  }), [auth, baseUrl, name, responsePath, stream, streamPath, template]);

  async function handleTest() {
    const result = await testProviderConnection({ ...provider, status: auth === "none" || secret.trim() ? "connected" : "not-configured" });
    setTestMessage(result.message + " ? " + result.latencyMs + " ms");
  }

  async function handleSave() {
    const needsKey = auth !== "none";
    upsertProvider({ ...provider, status: needsKey ? "not-configured" : "connected" });
    if (needsKey && secret.trim()) {
      await saveProviderSecret(provider.id, secret);
    }
    setScreen("providers");
  }

  const canSave = auth === "none" || secret.trim().length > 0;

  return (
    <div className="screen-stack">
      <SectionTitle icon="plug-connected" title={L.title} subtitle={L.subtitle} />
      <div className="form-grid">
        <label>{L.name}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label>{L.auth}<select value={auth} onChange={(event) => setAuth(event.target.value as ProviderConfig["auth"])}><option value="bearer">Bearer header</option><option value="header">Custom header</option><option value="query">API key query</option><option value="none">{L.noKey}</option></select></label>
        <label>{L.streaming}<select value={stream} onChange={(event) => setStream(event.target.value as ProviderConfig["stream"])}><option value="sse">SSE</option><option value="jsonl">JSON lines</option><option value="websocket">WebSocket</option><option value="none">{L.noStream}</option></select></label>
        <label>API key<input placeholder={L.insertKey} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
        <label>{L.responsePath}<input value={responsePath} onChange={(event) => setResponsePath(event.target.value)} /></label>
      </div>
      <label className="textarea-label">{L.bodyMapping}<textarea value={template} onChange={(event) => setTemplate(event.target.value)} /></label>
      <div className="form-grid compact">
        <label>{L.chunkPath}<input value={streamPath} onChange={(event) => setStreamPath(event.target.value)} /></label>
        <div className="capabilities"><Chip tone="info">streaming</Chip><Chip tone="info">tool-use</Chip><Chip tone="info">vision</Chip><Chip>ctx 32k</Chip></div>
      </div>
      <div className="bottom-bar"><span className="status-ok"><i className="ti ti-circle-check" aria-hidden="true" /> {testMessage}</span><div><button type="button" onClick={() => void handleTest()}>{L.test}</button><button className="primary" disabled={busy || !canSave} type="button" onClick={() => void handleSave()}>{L.save}</button></div></div>
    </div>
  );
}
