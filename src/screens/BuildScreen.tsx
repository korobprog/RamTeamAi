import { type ReactNode, useState } from "react";
import { Chip, SectionTitle } from "../components/FRamTeamAie";
import { planImplementationAssignments, previewProjectFiles } from "../projectBuilder";
import { useAppStore } from "../store/appStore";

const text = {
  decidedTitle: "\u0427\u0442\u043e \u0440\u0435\u0448\u0438\u043b\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0430",
  decidedSubtitle: "\u0421\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u043f\u043b\u0430\u043d \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438: \u043a\u043e\u043c\u0430\u043d\u0434\u0430 \u0441\u0430\u043c\u0430 \u0432\u044b\u0431\u0438\u0440\u0430\u0435\u0442 \u0441\u0442\u0435\u043a \u0438 \u0448\u0430\u0433\u0438, \u0432\u044b \u043c\u043e\u0436\u0435\u0442\u0435 \u043f\u043e\u0434\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0438 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044e",
  scaffold: "\u041a\u0430\u0440\u043a\u0430\u0441",
  agents: "\u0410\u0433\u0435\u043d\u0442\u044b",
  verify: "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430",
  ready: "\u0433\u043e\u0442\u043e\u0432",
  done: "\u0433\u043e\u0442\u043e\u0432\u043e",
  needCreate: "\u043d\u0443\u0436\u043d\u043e \u0441\u043e\u0437\u0434\u0430\u0442\u044c",
  agentsRunning: "\u0430\u0433\u0435\u043d\u0442\u044b \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442",
  needContinue: "\u043d\u0443\u0436\u043d\u043e \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c",
  startImplementation: "\u0437\u0430\u043f\u0443\u0441\u043a \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438",
  nextStage: "\u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u044d\u0442\u0430\u043f",
  chatFilesTests: "\u0447\u0430\u0442, \u0444\u0430\u0439\u043b\u044b, \u0442\u0435\u0441\u0442\u044b",
  planEmptyTitle: "\u041f\u043b\u0430\u043d \u0435\u0449\u0451 \u043d\u0435 \u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d",
  planEmptyBody: "\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0447\u0430\u0442. \u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0430\u0433\u0435\u043d\u0442\u043e\u0432 \u0441\u0430\u043c\u0430 \u0432\u044b\u0431\u0435\u0440\u0435\u0442 \u0441\u0442\u0435\u043a, \u0448\u0430\u0433\u0438 \u0438 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442 \u044d\u0442\u043e\u0442 \u0440\u0430\u0437\u0434\u0435\u043b.",
  editSteps: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0448\u0430\u0433\u0438",
  finish: "\u0413\u043e\u0442\u043e\u0432\u043e",
  addStep: "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0448\u0430\u0433",
  newStep: "\u041d\u043e\u0432\u044b\u0439 \u0448\u0430\u0433",
  stack: "\u0421\u0442\u0435\u043a",
  addTech: "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u044e",
  newTech: "\u041d\u043e\u0432\u0430\u044f \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u044f",
  deleteStep: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0448\u0430\u0433",
  deleteTech: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0438\u044e",
  workspace: "\u0420\u0430\u0431\u043e\u0447\u0430\u044f \u043f\u0430\u043f\u043a\u0430",
  workspaceHint: "\u0415\u0441\u043b\u0438 \u043f\u0430\u043f\u043a\u0430 \u0443\u0436\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u0430, \u043a\u0430\u0440\u043a\u0430\u0441 \u0438 \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0430\u044f \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e\u0442 \u0438\u043c\u0435\u043d\u043d\u043e \u0435\u0451 \u2014 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e \u0432\u044b\u0431\u0438\u0440\u0430\u0442\u044c \u043d\u0435 \u043d\u0443\u0436\u043d\u043e.",
  workspaceMissing: "\u041f\u0430\u043f\u043a\u0430 \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u0430 \u2014 \u0431\u0443\u0434\u0435\u0442 \u0441\u043e\u0437\u0434\u0430\u043d\u0430 \u0432 Documents/RamTeamAi Projects",
  selecting: "\u0412\u044b\u0431\u0438\u0440\u0430\u0435\u043c...",
  changeFolder: "\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u043f\u043a\u0443",
  selectFolder: "\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u043f\u0430\u043f\u043a\u0443",
  reset: "\u0421\u0431\u0440\u043e\u0441",
  preparingScaffold: "\u0413\u043e\u0442\u043e\u0432\u0438\u043c \u043a\u0430\u0440\u043a\u0430\u0441...",
  updateScaffold: "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u0440\u043a\u0430\u0441",
  createScaffold: "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u0430\u0440\u043a\u0430\u0441 \u043f\u0440\u043e\u0435\u043a\u0442\u0430",
  scaffoldHint: "\u0428\u0430\u0433 1 \u0443\u0436\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d, \u0435\u0441\u043b\u0438 \u0432\u0438\u0434\u0438\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 \u00ab\u043a\u0430\u0440\u043a\u0430\u0441 \u0433\u043e\u0442\u043e\u0432\u00bb.",
  nextToImplementation: "\u0414\u0430\u043b\u044c\u0448\u0435 \u043a \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438",
  startAgentsTitle: "\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0430\u0433\u0435\u043d\u0442\u043e\u0432 \u043f\u043e \u043f\u043b\u0430\u043d\u0443 \u043a\u043e\u043c\u0430\u043d\u0434\u044b",
  startAgentsBody: "\u041f\u043e\u0441\u043b\u0435 \u043a\u043b\u0438\u043a\u0430 \u0430\u0433\u0435\u043d\u0442\u044b \u0431\u0443\u0434\u0443\u0442 \u043f\u043e\u044d\u0442\u0430\u043f\u043d\u043e \u0434\u0435\u043b\u0430\u0442\u044c \u0442\u043e, \u0447\u0442\u043e \u0440\u0435\u0448\u0438\u043b\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0430, \u043f\u043e\u043a\u0430 \u0432\u0441\u0435 \u043f\u0443\u043d\u043a\u0442\u044b \u043f\u043b\u0430\u043d\u0430 \u043d\u0435 \u0431\u0443\u0434\u0443\u0442 \u0437\u0430\u043a\u0440\u044b\u0442\u044b.",
  noScaffoldHint: "\u0415\u0441\u043b\u0438 \u043a\u0430\u0440\u043a\u0430\u0441 \u0435\u0449\u0451 \u043d\u0435 \u0433\u043e\u0442\u043e\u0432, \u043a\u043d\u043e\u043f\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u0441\u0442 \u0435\u0433\u043e \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0438 \u0441\u0440\u0430\u0437\u0443 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442 \u0430\u0433\u0435\u043d\u0442\u043e\u0432.",
  assignments: "\u0417\u0430\u0434\u0430\u0447\u0438 \u0430\u0433\u0435\u043d\u0442\u0430\u043c",
  tree: "\u0414\u0435\u0440\u0435\u0432\u043e \u043f\u0440\u043e\u0435\u043a\u0442\u0430",
  files: "\u0424\u0430\u0439\u043b\u044b",
};

type BuildStage = "scaffold" | "agents" | "verify";

interface StageChecklistItem {
  id: string;
  label: string;
  done: boolean;
  note?: string;
  planStepIndex?: number;
}

export function BuildScreen() {
  const [selectingWorkspace, setSelectingWorkspace] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expandedStage, setExpandedStage] = useState<BuildStage>("scaffold");
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
  const checklist = useAppStore((state) => state.implementationChecklist);
  const busy = useAppStore((state) => state.busy);
  const setScreen = useAppStore((state) => state.setScreen);
  const isLegacyDemoPlan = artifact.steps.some((step) => step.includes("Universal Connector") || step.includes("Orchestrator"))
    && artifact.stack.some((item) => item.includes("Tauri") || item.includes("Zustand"));
  const hasDecision = !isLegacyDemoPlan && artifact.steps.length > 0;
  const decisionSteps = hasDecision ? artifact.steps : [];
  const decisionStack = hasDecision ? artifact.stack : [];
  const checklistCurrent = checklist.length === decisionSteps.length && decisionSteps.every((step, index) => checklist[index]?.step === step);
  const effectiveChecklist = checklistCurrent ? checklist : [];
  const checklistTotal = effectiveChecklist.length;
  const checklistDone = effectiveChecklist.filter((item) => item.done).length;
  const allChecklistDone = checklistTotal > 0 && checklistDone === checklistTotal;
  const checklistPartial = checklistTotal > 0 && checklistDone < checklistTotal;
  const readinessStatus = lastBuild?.readiness?.status;
  const isPartial = readinessStatus === "partial" || readinessStatus === "failed";
  const scaffoldReady = hasDecision && !isPartial && (artifact.status === "scaffolded" || artifact.status === "built" || (lastBuild?.phase === "scaffold" && !lastBuild.skipped));
  const scaffoldStepClass = scaffoldReady ? "flow-step done" : "flow-step";
  const implementationRunning = busy && activeRunMode === "implementation";
  const implementationAttempted = hasDecision && lastRunFilesWritten !== undefined;
  const implementationDone = hasDecision && (artifact.status === "built" || allChecklistDone);
  const agentStepClass = implementationDone
    ? "flow-step done implemented"
    : scaffoldReady || implementationRunning || implementationAttempted
      ? "flow-step current"
      : "flow-step";
  const verifyStepClass = allChecklistDone
    ? "flow-step done implemented"
    : implementationAttempted ? "flow-step current verify" : "flow-step";
  const assignments = hasDecision ? planImplementationAssignments(artifact, agents) : [];
  const scaffoldItems: StageChecklistItem[] = [
    {
      id: "scaffold-plan",
      label: "План команды сформирован и готов к запуску",
      done: hasDecision,
    },
    {
      id: "scaffold-workspace",
      label: "Рабочая папка выбрана или будет создана автоматически",
      done: Boolean(workspacePath || lastBuild?.rootPath),
    },
    {
      id: "scaffold-files",
      label: "Каркас, README, PLAN.md и docs/agent-tasks.md записаны",
      done: scaffoldReady,
      note: lastBuild?.message,
    },
  ];
  const agentItems: StageChecklistItem[] = decisionSteps.map((step, index) => ({
    id: "agent-step-" + index,
    label: step,
    done: artifact.status === "built" || Boolean(effectiveChecklist[index]?.done),
    note: effectiveChecklist[index]?.note,
    planStepIndex: index,
  }));
  const testingPassed = implementationDone && !checklistPartial;
  const testFailuresRouted = implementationAttempted && checklistPartial;
  const verifyItems: StageChecklistItem[] = [
    {
      id: "verify-agent-checklist",
      label: "QA-агент создал/обновил в docs/agent-tasks.md адаптивный тестовый 3-step сценарий под приложение",
      done: implementationAttempted,
    },
    {
      id: "verify-install-run",
      label: "QA-агент подготовил окружение и запустил доступные команды dev/build/lint/test/check",
      done: testingPassed,
    },
    {
      id: "verify-browser",
      label: "QA-агент проверил UI через Browser/Playwright MCP и DevTools, включая клики и основные сценарии",
      done: testingPassed,
    },
    {
      id: "verify-auth",
      label: "Если есть авторизация — создать демо-аккаунт и пройти пользовательский путь",
      done: testingPassed,
    },
    {
      id: "verify-fix-loop",
      label: "Если тесты не прошли — QA-агент вернул разработчикам чеклист ошибок на правку",
      done: testingPassed || testFailuresRouted,
      note: checklistPartial ? effectiveChecklist.filter((item) => !item.done).map((item) => item.step).join("; ") : undefined,
    },
    {
      id: "verify-notify",
      label: "Когда все проверки прошли — уведомить пользователя о готовности",
      done: testingPassed,
    },
  ];
  const stagePanels: Record<BuildStage, { title: string; description: string; items: StageChecklistItem[] }> = {
    scaffold: {
      title: "Каркас",
      description: "Подготовка рабочей папки, базовых файлов и Markdown-плана для команды.",
      items: scaffoldItems,
    },
    agents: {
      title: "Агенты",
      description: "Пункты реализации из согласованного плана. Каждый пункт закрывается отдельным чекбоксом.",
      items: agentItems,
    },
    verify: {
      title: "Проверка и тестирование",
      description: "QA-бот, если он есть, сам создаёт app-specific 3-step QA-чеклист, добавляет нужные тесты/команды и возвращает ошибки агентам.",
      items: verifyItems,
    },
  };
  const expandedPanel = stagePanels[expandedStage];
  const expandedDone = expandedPanel.items.filter((item) => item.done).length;

  function normalizePlanItems(items: string[]): string[] {
    return items.map((item) => item.trim()).filter(Boolean);
  }

  function finishEditing() {
    updateArtifact({ steps: normalizePlanItems(decisionSteps), stack: normalizePlanItems(decisionStack) });
    setEditing(false);
  }

  async function handleSelectWorkspace() {
    setSelectingWorkspace(true);
    try {
      await selectWorkspaceFolder();
    } finally {
      setSelectingWorkspace(false);
    }
  }

  async function handleStartAgents() {
    if (busy || !hasDecision) return;
    const scaffoldPrepared = scaffoldReady || await implementProject();
    if (!scaffoldPrepared) return;
    await startAgentImplementation();
  }

  function renderStageButton(
    key: BuildStage,
    className: string,
    marker: ReactNode,
    title: string,
    status: string,
  ) {
    return (
      <button
        className={`${className}${expandedStage === key ? " selected" : ""}`}
        type="button"
        aria-expanded={expandedStage === key}
        aria-controls="stage-checklist-panel"
        onClick={() => setExpandedStage(key)}
      >
        <span>{marker}</span>
        <b>{title}</b>
        <small>{status}</small>
      </button>
    );
  }

  return (
    <div className="build-layout">
      <section className="build-main">
        <SectionTitle icon="clipboard-check" title={text.decidedTitle} subtitle={text.decidedSubtitle} />

        <div className="implementation-flow">
          {renderStageButton("scaffold", scaffoldStepClass, "1", text.scaffold, scaffoldReady ? text.ready : text.needCreate)}
          {renderStageButton("agents", agentStepClass, implementationDone ? <i className="ti ti-check" aria-hidden="true" /> : "2", text.agents, implementationDone ? text.done : implementationRunning ? text.agentsRunning : implementationAttempted ? text.needContinue : text.startImplementation)}
          {renderStageButton("verify", verifyStepClass, allChecklistDone ? <i className="ti ti-check" aria-hidden="true" /> : "3", text.verify, checklistTotal ? `${checklistDone} ${"\u0438\u0437"} ${checklistTotal} ${text.done}` : implementationDone ? text.nextStage : text.chatFilesTests)}
        </div>

        {!hasDecision ? (
          <div className="empty-decision-card"><b>{text.planEmptyTitle}</b><p>{text.planEmptyBody}</p></div>
        ) : null}

        <div className="stage-checklist-panel" id="stage-checklist-panel">
          <div className="stage-checklist-head">
            <div>
              <b>{expandedPanel.title}</b>
              <p>{expandedPanel.description}</p>
            </div>
            <small>{expandedDone} из {expandedPanel.items.length} готово</small>
          </div>
          <div className="stage-checklist">
            {expandedPanel.items.length ? expandedPanel.items.map((item, index) => (
              <div className={item.done ? "stage-check-item done" : "stage-check-item"} key={item.id} title={item.note}>
                <input type="checkbox" checked={item.done} readOnly aria-label={item.label} />
                {editing && expandedStage === "agents" && item.planStepIndex !== undefined ? (
                  <>
                    <input className="stage-check-edit" value={decisionSteps[item.planStepIndex]} onChange={(event) => {
                      const next = [...decisionSteps];
                      next[item.planStepIndex ?? index] = event.target.value;
                      updateArtifact({ steps: next });
                    }} />
                    <button className="mini-action ghosty" type="button" aria-label={text.deleteStep} onClick={() => updateArtifact({ steps: decisionSteps.filter((_, itemIndex) => itemIndex !== item.planStepIndex) })}>{"\u00d7"}</button>
                  </>
                ) : (
                  <span className="stage-check-text">{item.label}</span>
                )}
              </div>
            )) : (
              <div className="stage-check-empty">Список появится после формирования плана.</div>
            )}
          </div>
        </div>

        <div className="decision-actions">
          <button className="chip-button" type="button" disabled={!hasDecision && !editing} onClick={editing ? finishEditing : () => { setExpandedStage("agents"); setEditing(true); }}>{editing ? text.finish : text.editSteps}</button>
          {editing ? <button className="chip-button" type="button" onClick={() => updateArtifact({ steps: [...decisionSteps, text.newStep] })}>{text.addStep}</button> : null}
        </div>

        <div className="mini-label">{text.stack}</div>
        {editing ? (
          <div className="stack-editor">
            {decisionStack.map((item, index) => (
              <div className="stack-chip-editor" key={"stack-" + index}>
                <input value={item} onChange={(event) => {
                  const next = [...decisionStack];
                  next[index] = event.target.value;
                  updateArtifact({ stack: next });
                }} />
                <button className="mini-action ghosty" type="button" aria-label={text.deleteTech} onClick={() => updateArtifact({ stack: decisionStack.filter((_, itemIndex) => itemIndex !== index) })}>{"\u00d7"}</button>
              </div>
            ))}
            <button className="chip-button" type="button" onClick={() => updateArtifact({ stack: [...decisionStack, text.newTech] })}>{text.addTech}</button>
          </div>
        ) : <div className="tool-list">{decisionStack.map((item, index) => <Chip key={item + "-" + index}>{item}</Chip>)}</div>}
      </section>

      <aside className="project-panel">
        <div className="panel-title">{text.workspace}</div>
        <p className="small-muted">{text.workspaceHint}</p>
        <div className={workspacePath ? "workspace-card set" : "workspace-card"}>
          <i className={workspacePath ? "ti ti-folder-check" : "ti ti-folder-x"} aria-hidden="true" />
          <span className="workspace-path" title={workspacePath}>{workspacePath ?? text.workspaceMissing}</span>
        </div>
        <div className="workspace-actions">
          <button className="chip-button" type="button" disabled={selectingWorkspace} onClick={() => void handleSelectWorkspace()}>{selectingWorkspace ? text.selecting : workspacePath ? text.changeFolder : text.selectFolder}</button>
          {workspacePath ? <button className="chip-button" type="button" disabled={busy} onClick={clearWorkspaceFolder}>{text.reset}</button> : null}
        </div>

        <button className="primary wide implement-button" type="button" disabled={busy || !hasDecision} onClick={() => void implementProject()}>
          <i className="ti ti-hammer" aria-hidden="true" /> {busy ? text.preparingScaffold : scaffoldReady ? text.updateScaffold : text.createScaffold}
        </button>
        <p className="small-muted implement-hint">{text.scaffoldHint}</p>

        {lastBuild ? (
          <div className="build-result">
            <Chip tone={lastBuild.skipped || isPartial ? "warning" : "success"}>{lastBuild.skipped ? "skipped" : isPartial ? "partial" : readinessStatus === "build-ok" ? "build ok" : lastBuild.phase === "scaffold" ? "scaffold ok" : "done"}</Chip>
            <p>{lastBuild.message}</p>
            {lastBuild.readiness ? <p className="small-muted">{lastBuild.readiness.message}</p> : null}
            {lastBuild.readiness?.missingFiles.length ? <small>Missing: {lastBuild.readiness.missingFiles.join(", ")}</small> : null}
            <small>{lastBuild.rootPath}</small>
          </div>
        ) : null}

        <div className={scaffoldReady ? "implementation-cta ready pulse-cta" : "implementation-cta"}>
          <div>
            <div className="mini-label">{text.nextToImplementation}</div>
            <b>{text.startAgentsTitle}</b>
            <p className="small-muted">{text.startAgentsBody}</p>
          </div>
          <button className="primary wide implement-button pulse-button" type="button" disabled={busy || !hasDecision} onClick={() => void handleStartAgents()}>
            <i className="ti ti-users" aria-hidden="true" /> {isPartial || checklistPartial ? "Continue implementation" : scaffoldReady ? "Start implementation agents" : "Create scaffold and start agents"}
          </button>
          {!scaffoldReady && hasDecision ? <small className="small-muted">{text.noScaffoldHint}</small> : null}
        </div>

        {implementationDone ? (
          <div className="post-build-cta">
            <div>
              <div className="mini-label">Точечные правки</div>
              <b>Проект готов к режиму доработки</b>
              <p className="small-muted">Откройте split-screen с чатом, live-preview, inspector toolce, терминалом, логами и картой проекта.</p>
            </div>
            <button className="primary wide" type="button" onClick={() => setScreen("workbench")}>
              <i className="ti ti-tools" aria-hidden="true" /> Перейти к правкам
            </button>
          </div>
        ) : null}

        <div className="panel-title spaced">{text.assignments}</div>
        <div className="assignment-list">
          {assignments.map((item) => (
            <div className="assignment-card" key={item.id}>
              <div className="assignment-head"><b>{item.owner}</b><span>{item.role}</span></div>
              <p>{item.summary}</p>
              <ul>{item.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}</ul>
            </div>
          ))}
        </div>

        <div className="panel-title spaced">{text.tree}</div>
        <pre className="tree-view">{hasDecision ? artifact.projectTree : ""}</pre>
        <div className="panel-title spaced">{text.files}</div>
        <ul className="file-list">{hasDecision ? previewProjectFiles(artifact, Boolean(workspacePath)).map((file) => <li key={file}>{file}</li>) : null}</ul>
      </aside>
    </div>
  );
}

