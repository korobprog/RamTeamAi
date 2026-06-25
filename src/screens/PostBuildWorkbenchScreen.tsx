import { useMemo, useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { useAppStore } from "../store/appStore";
import type { ChatMessage, LiveFileActivity } from "../types";
import {
  buildWorkbenchDomMessage,
  createWorkbenchInspectorTargets,
  createWorkbenchMap,
  inferPreviewUrl,
  type WorkbenchInspectorTarget,
} from "../workbench/inspector";

function shortAuthor(message: ChatMessage): string {
  if (message.author === "user") return "Вы";
  if (message.author === "system") return "Система";
  return message.agentRole ?? message.author;
}

function WorkbenchChatLog({ messages }: { messages: ChatMessage[] }) {
  const visible = messages.slice(-6);
  if (!visible.length) {
    return <div className="workbench-empty">История чата появится здесь после первых правок.</div>;
  }
  return (
    <div className="workbench-chat-log">
      {visible.map((message) => (
        <article className={"workbench-message " + message.author} key={message.id}>
          <b>{shortAuthor(message)}</b>
          <p>{message.text.length > 260 ? message.text.slice(0, 260).trimEnd() + "…" : message.text}</p>
        </article>
      ))}
    </div>
  );
}

function LiveActivityLog({ items }: { items: LiveFileActivity[] }) {
  if (!items.length) return <div className="workbench-empty">Пока нет новых записей файлов. После правки здесь появятся create/edit/error события.</div>;
  return (
    <div className="workbench-activity-list">
      {items.slice(0, 8).map((item) => (
        <div className={"workbench-activity " + item.status} key={item.id}>
          <span>{item.status === "failed" ? "!" : item.status === "written" ? "✓" : "•"}</span>
          <div>
            <b>{item.path}</b>
            <small>{item.agentName} · {item.action}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorCard({
  target,
  active,
  onSelect,
  onSend,
}: {
  target: WorkbenchInspectorTarget;
  active: boolean;
  onSelect: () => void;
  onSend: () => void;
}) {
  return (
    <div className={active ? "inspector-target active" : "inspector-target"}>
      <button className="inspector-target-main" type="button" onClick={onSelect}>
        <span className="inspector-target-dot" aria-hidden="true" />
        <b>{target.label}</b>
        <small>{target.selector}</small>
      </button>
      {active ? (
        <span className="inspector-target-actions">
          <span>{target.file}:{target.line}</span>
          <button type="button" onClick={onSend}>Где в коде</button>
        </span>
      ) : null}
    </div>
  );
}

export function PostBuildWorkbenchScreen() {
  const [prompt, setPrompt] = useState("");
  const [mapOpen, setMapOpen] = useState(true);
  const artifact = useAppStore((state) => state.artifact);
  const session = useAppStore((state) => state.session);
  const lastBuild = useAppStore((state) => state.lastBuild);
  const workspacePath = useAppStore((state) => state.workspacePath);
  const liveFileActivity = useAppStore((state) => state.liveFileActivity);
  const runAgentDialogQuestion = useAppStore((state) => state.runAgentDialogQuestion);
  const busy = useAppStore((state) => state.busy);
  const setScreen = useAppStore((state) => state.setScreen);
  const targets = useMemo(() => createWorkbenchInspectorTargets(artifact, lastBuild), [artifact, lastBuild]);
  const projectMap = useMemo(() => createWorkbenchMap(artifact, lastBuild), [artifact, lastBuild]);
  const [selectedId, setSelectedId] = useState(targets[0]?.id ?? "app-shell");
  const selected = targets.find((target) => target.id === selectedId) ?? targets[0];
  const previewUrl = inferPreviewUrl(lastBuild?.rootPath ?? workspacePath);
  const readiness = lastBuild?.readiness;
  const terminalLines = [
    workspacePath ? `cd ${workspacePath}` : "# рабочая папка не выбрана",
    "npm run dev",
    "npm run check && npm test",
    readiness ? `readiness: ${readiness.status} — ${readiness.message}` : "readiness: нет последнего отчёта сборки",
  ];

  async function sendToAgent(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setPrompt("");
    await runAgentDialogQuestion(text);
  }

  async function sendSelectedTarget(target = selected) {
    if (!target) return;
    await sendToAgent(buildWorkbenchDomMessage(target));
  }

  return (
    <div className="workbench-layout">
      <section className="workbench-header">
        <SectionTitle
          icon="tools"
          title="Точечные правки после сборки"
          subtitle="Чат, live-preview, инспектор DOM, терминал и логи собраны в одном экране."
        />
        <div className="workbench-header-actions">
          <Chip tone={artifact.status === "built" ? "success" : "warning"}>{artifact.status === "built" ? "проект собран" : "нужна проверка"}</Chip>
          <button className="chip-button" type="button" onClick={() => setScreen("build")}>К этапам сборки</button>
          <button className="chip-button" type="button" onClick={() => setMapOpen((value) => !value)}>{mapOpen ? "Скрыть карту" : "Открыть карту"}</button>
        </div>
      </section>

      <section className="workbench-chat-panel">
        <div className="workbench-panel-title">
          <b>Чат правок</b>
          <small>Выбранный DOM отправляется главному агенту как контекст.</small>
        </div>
        {selected ? (
          <div className="selected-dom-card">
            <span>toolce inspector</span>
            <b>{selected.label}</b>
            <code>{selected.dom}</code>
            <small>{selected.reason}</small>
            <div className="source-jump-card">
              <span>где это в коде</span>
              <code>{selected.file}:{selected.line}</code>
            </div>
            <button className="primary wide" type="button" disabled={busy} onClick={() => void sendSelectedTarget()}>Отправить выбранный DOM в чат</button>
          </div>
        ) : null}
        <WorkbenchChatLog messages={session.messages} />
        <form className="workbench-composer" onSubmit={(event) => { event.preventDefault(); void sendToAgent(prompt); }}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: уменьши отступы в выбранном hero-блоке и не трогай backend…"
            rows={4}
          />
          <button className="primary" type="submit" disabled={!prompt.trim() || busy}>Отправить правку</button>
        </form>
      </section>

      <section className="workbench-preview-panel">
        <div className="workbench-browser-bar">
          <span className="browser-dot red" /><span className="browser-dot yellow" /><span className="browser-dot green" />
          <code>{previewUrl}</code>
          <Chip tone="info">live-preview</Chip>
        </div>
        <div className="workbench-browser">
          <iframe title="Live preview" src={previewUrl} sandbox="allow-scripts allow-same-origin allow-forms" />
          {selected ? (
            <div className={"preview-highlight highlight-" + selected.id}>
              <span>{selected.label}</span>
            </div>
          ) : null}
        </div>
        <div className="inspector-strip" aria-label="Инспектор элементов сайта">
          {targets.map((target) => (
            <InspectorCard
              key={target.id}
              target={target}
              active={target.id === selected?.id}
              onSelect={() => setSelectedId(target.id)}
              onSend={() => void sendSelectedTarget(target)}
            />
          ))}
        </div>
      </section>

      <section className="workbench-terminal-panel">
        <div className="workbench-panel-title">
          <b>Терминал и логи ошибок</b>
          <small>Команды запуска и последние события файлов.</small>
        </div>
        <pre className="workbench-terminal">{terminalLines.join("\n")}</pre>
        {readiness?.missingFiles.length ? <p className="workbench-error">Missing: {readiness.missingFiles.join(", ")}</p> : null}
        <LiveActivityLog items={liveFileActivity} />
      </section>

      {mapOpen ? (
        <aside className="workbench-map-drawer">
          <div className="workbench-panel-title">
            <b>Карта проекта</b>
            <small>Структура сайта, компонентов, связей и потоков данных.</small>
          </div>
          {projectMap.map((section) => (
            <div className="workbench-map-section" key={section.title}>
              <b>{section.title}</b>
              <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  );
}
