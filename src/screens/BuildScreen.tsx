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
  const scaffoldReady = artifact.status === "scaffolded" || artifact.status === "built" || (lastBuild?.phase === "scaffold" && !lastBuild.skipped);
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
    startAgentImplementation();
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
          <div className={scaffoldReady ? "flow-step current" : "flow-step"}><span>2</span><b>Агенты</b><small>запуск реализации</small></div>
          <div className="flow-step"><span>3</span><b>Проверка</b><small>чат, файлы, тесты</small></div>
        </div>

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
        <p className="small-muted implement-hint">Шаг 1 уже выполнен, если видите статус «каркас готов».</p>

        {lastBuild ? (
          <div className="build-result">
            <Chip tone={lastBuild.skipped ? "warning" : "success"}>
              {lastBuild.skipped ? "пропущено" : lastBuild.phase === "scaffold" ? "каркас готов" : "готово"}
            </Chip>
            <p>{lastBuild.message}</p>
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
            <i className="ti ti-users" aria-hidden="true" /> {scaffoldReady ? "????????? ??????? ??????????" : "??????? ?????? ? ????????? ???????"}
          </button>
          {!scaffoldReady ? <small className="small-muted">???? ?????? ??? ?? ?????, ?????? ??????? ??? ????????????? ? ????? ???????? ???????.</small> : null}
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
