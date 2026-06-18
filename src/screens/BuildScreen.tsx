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
  const lastRunFilesWritten = useAppStore((state) => state.lastRunFilesWritten);
  const activeRunMode = useAppStore((state) => state.activeRunMode);
  const busy = useAppStore((state) => state.busy);
  const readinessStatus = lastBuild?.readiness?.status;
  const isPartial = readinessStatus === "partial" || readinessStatus === "failed";
  const scaffoldReady = !isPartial && (artifact.status === "scaffolded" || artifact.status === "built" || (lastBuild?.phase === "scaffold" && !lastBuild.skipped));
  const implementationRunning = busy && activeRunMode === "implementation";
  const implementationDone = artifact.status === "built" || lastRunFilesWritten !== undefined;
  const agentStepClass = implementationDone
    ? "flow-step done implemented"
    : scaffoldReady || implementationRunning
      ? "flow-step current"
      : "flow-step";
  const verifyStepClass = implementationDone ? "flow-step current verify" : "flow-step";
  const decisionStepClass = implementationDone
    ? "decision-step implemented"
    : implementationRunning
      ? "decision-step implementing"
      : scaffoldReady
        ? "decision-step done"
        : "decision-step";
  const assignments = planImplementationAssignments(artifact, agents);

  async function handleSelectWorkspace() {
    setSelectingWorkspace(true);
    try {
      await selectWorkspaceFolder();
    } finally {
      setSelectingWorkspace(false);
    }
  }

  async function handleStartAgents() {
    if (busy) return;
    if (!scaffoldReady) {
      await implementProject();
    }
    await startAgentImplementation();
  }

  return (
    <div className="build-layout">
      <section className="build-main">
        <SectionTitle
          icon="clipboard-check"
          title="Что решила команда"
          subtitle="Согласованный план реализации — подготовьте каркас, затем нажмите большую кнопку запуска агентов"
        />

        <div className="implementation-flow">
          <div className="flow-step done"><span>1</span><b>Каркас</b><small>{scaffoldReady ? "готов" : "нужно создать"}</small></div>
          <div className={agentStepClass}><span>{implementationDone ? <i className="ti ti-check" aria-hidden="true" /> : "2"}</span><b>Агенты</b><small>{implementationDone ? "реализация запущена" : implementationRunning ? "агенты работают" : "запуск реализации"}</small></div>
          <div className={verifyStepClass}><span>3</span><b>Проверка</b><small>{implementationDone ? "следующий этап" : "чат, файлы, тесты"}</small></div>
        </div>

        <div className="decision-steps">
          {artifact.steps.map((step, index) => (
            <div className={decisionStepClass} key={step + "-" + index}>
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
        <p className="small-muted implement-hint">Шаг 1 уже выполнен, если видите статус «каркас готов».</p>

        {lastBuild ? (
          <div className="build-result">
            <Chip tone={lastBuild.skipped || isPartial ? "warning" : "success"}>
              {lastBuild.skipped
                ? "skipped"
                : isPartial
                  ? "partial"
                  : readinessStatus === "build-ok"
                    ? "build ok"
                    : lastBuild.phase === "scaffold" ? "scaffold ok" : "done"}
            </Chip>
            <p>{lastBuild.message}</p>
            {lastBuild.readiness ? <p className="small-muted">{lastBuild.readiness.message}</p> : null}
            {lastBuild.readiness?.missingFiles.length ? <small>Missing: {lastBuild.readiness.missingFiles.join(", ")}</small> : null}
            <small>{lastBuild.rootPath}</small>
          </div>
        ) : null}

        <div className={scaffoldReady ? "implementation-cta ready pulse-cta" : "implementation-cta"}>
          <div>
            <div className="mini-label">Дальше к реализации</div>
            <b>Нажмите «Запустить агентов реализации»</b>
            <p className="small-muted">После клика приложение перейдёт в чат: каждый агент напишет, что берёт в работу и какие файлы/результаты должен подготовить.</p>
          </div>
          <button className="primary wide implement-button pulse-button" type="button" disabled={busy} onClick={() => void handleStartAgents()}>
            <i className="ti ti-users" aria-hidden="true" /> {isPartial ? "Continue implementation" : scaffoldReady ? "Start implementation agents" : "Create scaffold and start agents"}
          </button>
          {!scaffoldReady ? <small className="small-muted">Если каркас ещё не готов, кнопка создаст его автоматически и сразу запустит агентов.</small> : null}
        </div>

        <div className="panel-title spaced">Задачи агентам</div>
        <div className="assignment-list">
          {assignments.map((item) => (
            <div className="assignment-card" key={item.id}>
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
