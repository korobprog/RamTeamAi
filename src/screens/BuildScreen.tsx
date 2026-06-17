import { useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { planImplementationAssignments, previewProjectFiles } from "../projectBuilder";
import { useAppStore } from "../store/appStore";

export function BuildScreen() {
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const [editing, setEditing] = useState(false);
  const artifact = useAppStore((state) => state.artifact);
  const agents = useAppStore((state) => state.agents);
  const updateArtifact = useAppStore((state) => state.updateArtifact);
  const workspacePath = useAppStore((state) => state.workspacePath);
  const selectWorkspaceFolder = useAppStore((state) => state.selectWorkspaceFolder);
  const clearWorkspaceFolder = useAppStore((state) => state.clearWorkspaceFolder);
  const implementProject = useAppStore((state) => state.implementProject);
  const startAgentImplementation = useAppStore((state) => state.startAgentImplementation);
  const lastBuild = useAppStore((state) => state.lastBuild);
  const busy = useAppStore((state) => state.busy);
  const scaffoldReady = artifact.status === "scaffolded" || artifact.status === "built";
  const assignments = planImplementationAssignments(artifact, agents);

  async function handleSelectWorkspace() {
    setSelectingWorkspace(true);
    try {
      await selectWorkspaceFolder();
    } finally {
      setSelectingWorkspace(false);
    }
  }

  return (
    <div className="build-layout">
      <section className="build-main">
        <SectionTitle
          icon="clipboard-check"
          title="Что решила команда"
          subtitle="Согласованный план реализации — сначала подготовьте каркас, затем раздайте задачи агентам"
        />

        <div className="decision-steps">
          {artifact.steps.map((step, index) => (
            <div className={scaffoldReady ? "decision-step done" : "decision-step"} key={step + "-" + index}>
              <span className="decision-step-num">{scaffoldReady ? <i className="ti ti-check" aria-hidden="true" /> : index + 1}</span>
              {editing ? (
                <input
                  value={step}
                  onChange={(event) => {
                    const next = [...artifact.steps];
                    next[index] = event.target.value;
                    updateArtifact({ steps: next });
                  }}
                />
              ) : (
                <span className="decision-step-text">{step}</span>
              )}
            </div>
          ))}
        </div>

        <div className="decision-actions">
          <button className="chip-button" type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Готово" : "Редактировать шаги"}
          </button>
          {editing ? (
            <button className="chip-button" type="button" onClick={() => updateArtifact({ steps: [...artifact.steps, "Новый шаг"] })}>
              Добавить шаг
            </button>
          ) : null}
        </div>

        <div className="mini-label">Стек</div>
        <div className="tool-list">{artifact.stack.map((item) => <Chip key={item}>{item}</Chip>)}</div>
      </section>

      <aside className="project-panel">
        <div className="panel-title">Рабочая папка</div>
        <p className="small-muted">Если папка уже выбрана, каркас и дальнейшая реализация используют именно её — повторно выбирать не нужно.</p>
        <div className={workspacePath ? "workspace-card set" : "workspace-card"}>
          <i className={workspacePath ? "ti ti-folder-check" : "ti ti-folder-x"} aria-hidden="true" />
          <span className="workspace-path" title={workspacePath}>{workspacePath ?? "Папка не выбрана — будет создана в Documents/RamTeamAi Projects"}</span>
        </div>
        <div className="workspace-actions">
          <button className="chip-button" type="button" disabled={selectingWorkspace} onClick={() => void handleSelectWorkspace()}>
            {selectingWorkspace ? "Выбираем..." : workspacePath ? "Сменить папку" : "Выбрать папку"}
          </button>
          {workspacePath ? <button className="chip-button" type="button" disabled={busy} onClick={clearWorkspaceFolder}>Сброс</button> : null}
        </div>

        <button className="primary wide implement-button" type="button" disabled={busy} onClick={() => void implementProject()}>
          <i className="ti ti-hammer" aria-hidden="true" /> {busy ? "Готовим каркас..." : scaffoldReady ? "Обновить каркас" : "Создать каркас проекта"}
        </button>
        <p className="small-muted implement-hint">Шаг 1: команда записывает план и базовый каркас. Шаг 2: агенты берут задачи ниже и реализуют проект в этой же папке.</p>
        <button className="ghost wide implement-button" type="button" disabled={busy || !scaffoldReady} onClick={startAgentImplementation}>
          <i className="ti ti-users" aria-hidden="true" /> Запустить агентов реализации
        </button>

        {lastBuild ? (
          <div className="build-result">
            <Chip tone={lastBuild.skipped ? "warning" : "success"}>
              {lastBuild.skipped ? "пропущено" : lastBuild.phase === "scaffold" ? "каркас готов" : "готово"}
            </Chip>
            <p>{lastBuild.message}</p>
            <small>{lastBuild.rootPath}</small>
          </div>
        ) : null}

        <div className="build-phase-card">
          <div className="mini-label">Следующий этап</div>
          <b>Реализация распределяется между агентами</b>
          <p className="small-muted">Архитектор держит контракты, разработчики пишут код, критик и тестировщик проверяют риски и качество. Рабочая папка остаётся той же.</p>
        </div>

        <div className="panel-title spaced">Задачи агентам</div>
        <div className="assignment-list">
          {assignments.map((item) => (
            <div className="assignment-card" key={item.owner + item.role}>
              <div className="assignment-head">
                <b>{item.owner}</b>
                <span>{item.role}</span>
              </div>
              <p>{item.summary}</p>
              <ul>
                {item.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="panel-title spaced">Дерево проекта</div>
        <pre className="tree-view">{artifact.projectTree}</pre>
        <div className="panel-title spaced">Файлы</div>
        <ul className="file-list">{previewProjectFiles(artifact, Boolean(workspacePath)).map((file) => <li key={file}>{file}</li>)}</ul>
      </aside>
    </div>
  );
}
