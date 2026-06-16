import { useState } from "react";
import { Chip, SectionTitle } from "../components/FNeurogatee";
import { previewProjectFiles } from "../projectBuilder";
import { useAppStore } from "../store/appStore";

export function BuildScreen() {
  const artifact = useAppStore((state) => state.artifact);
  const updateArtifact = useAppStore((state) => state.updateArtifact);
  const requestBuild = useAppStore((state) => state.requestBuild);
  const lastBuild = useAppStore((state) => state.lastBuild);
  const busy = useAppStore((state) => state.busy);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="build-layout">
      <section className="build-main">
        <SectionTitle icon="clipboard-check" title="Решение → Build" subtitle="Редактируемый артефакт команды перед записью на диск" />
        <label className="textarea-label">Стек<textarea value={artifact.stack.join("\n")} onChange={(event) => updateArtifact({ stack: event.target.value.split("\n").filter(Boolean) })} /></label>
        <div className="mini-label">Шаги</div>
        <div className="plan-steps">
          {artifact.steps.map((step, index) => (
            <div className={index === 3 ? "plan-step edited" : "plan-step"} key={step + "-" + index}><span><i className="ti ti-grip-vertical" aria-hidden="true" /></span><input value={step} onChange={(event) => { const next = [...artifact.steps]; next[index] = event.target.value; updateArtifact({ steps: next }); }} /></div>
          ))}
        </div>
        <button type="button" onClick={() => updateArtifact({ steps: [...artifact.steps, "Новый шаг"] })}>Добавить шаг</button>
      </section>
      <aside className="project-panel">
        <div className="panel-title">Дерево проекта</div>
        <pre className="tree-view">{artifact.projectTree}</pre>
        <div className="panel-title spaced">Файлы Build</div>
        <ul className="file-list">{previewProjectFiles(artifact).map((file) => <li key={file}>{file}</li>)}</ul>
        <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> подтверждаю запись на диск</label>
        <button className="primary wide" type="button" disabled={busy} onClick={() => void requestBuild(confirmed)}>Build проект</button>
        {lastBuild ? <div className="build-result"><Chip tone={lastBuild.skipped ? "warning" : "success"}>{lastBuild.skipped ? "пропущено" : "готово"}</Chip><p>{lastBuild.message}</p><small>{lastBuild.rootPath}</small></div> : null}
      </aside>
    </div>
  );
}
