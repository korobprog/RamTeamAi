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
  const checklist = useAppStore((state) => state.implementationChecklist);
  const busy = useAppStore((state) => state.busy);
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
  const decisionStepClass = implementationDone
    ? "decision-step implemented"
    : implementationRunning || implementationAttempted
      ? "decision-step implementing"
      : scaffoldReady
        ? "decision-step done"
        : "decision-step";
  const assignments = hasDecision ? planImplementationAssignments(artifact, agents) : [];

  function normalizePlanItems(items: string[]): string[] {
    return items.map((item) => item.trim()).filter(Boolean);
  }

  function finishEditing() {
    updateArtifact({
      steps: normalizePlanItems(decisionSteps),
      stack: normalizePlanItems(decisionStack),
    });
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
          title="Р§С‚Рѕ СЂРµС€РёР»Р° РєРѕРјР°РЅРґР°"
          subtitle="РЎРѕРіР»Р°СЃРѕРІР°РЅРЅС‹Р№ РїР»Р°РЅ СЂРµР°Р»РёР·Р°С†РёРё вЂ” РїРѕРґРіРѕС‚РѕРІСЊС‚Рµ РєР°СЂРєР°СЃ, Р·Р°С‚РµРј РЅР°Р¶РјРёС‚Рµ Р±РѕР»СЊС€СѓСЋ РєРЅРѕРїРєСѓ Р·Р°РїСѓСЃРєР° Р°РіРµРЅС‚РѕРІ"
        />

        <div className="implementation-flow">
          <div className={scaffoldStepClass}><span>1</span><b>{"\u041a\u0430\u0440\u043a\u0430\u0441"}</b><small>{scaffoldReady ? "\u0433\u043e\u0442\u043e\u0432" : "\u043d\u0443\u0436\u043d\u043e \u0441\u043e\u0437\u0434\u0430\u0442\u044c"}</small></div>
          <div className={agentStepClass}><span>{implementationDone ? <i className="ti ti-check" aria-hidden="true" /> : "2"}</span><b>{"\u0410\u0433\u0435\u043d\u0442\u044b"}</b><small>{implementationDone ? "\u0433\u043e\u0442\u043e\u0432\u043e" : implementationRunning ? "\u0430\u0433\u0435\u043d\u0442\u044b \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442" : implementationAttempted ? "\u043d\u0443\u0436\u043d\u043e \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c" : "\u0437\u0430\u043f\u0443\u0441\u043a \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0438"}</small></div>
          <div className={verifyStepClass}><span>{allChecklistDone ? <i className="ti ti-check" aria-hidden="true" /> : "3"}</span><b>{"\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430"}</b><small>{checklistTotal ? `${checklistDone} \u0438\u0437 ${checklistTotal} \u0433\u043e\u0442\u043e\u0432\u043e` : implementationDone ? "\u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u044d\u0442\u0430\u043f" : "\u0447\u0430\u0442, \u0444\u0430\u0439\u043b\u044b, \u0442\u0435\u0441\u0442\u044b"}</small></div>
        </div>

        {!hasDecision ? (
          <div className="empty-decision-card">
            <b>{"\u041f\u043b\u0430\u043d \u0435\u0449\u0451 \u043d\u0435 \u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d"}</b>
            <p>{"\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0447\u0430\u0442. \u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0430\u0433\u0435\u043d\u0442\u043e\u0432 \u0441\u0430\u043c\u0430 \u0432\u044b\u0431\u0435\u0440\u0435\u0442 \u0441\u0442\u0435\u043a, \u0448\u0430\u0433\u0438 \u0438 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442 \u044d\u0442\u043e\u0442 \u0440\u0430\u0437\u0434\u0435\u043b."}</p>
          </div>
        ) : null}

        <div className="decision-steps">
          {decisionSteps.map((step, index) => {
            const stepDone = artifact.status === "built" || Boolean(effectiveChecklist[index]?.done);
            return (
            <div className={stepDone ? decisionStepClass + " implemented" : decisionStepClass} key={"step-" + index} title={effectiveChecklist[index]?.note}>
              <span className="decision-step-num">{stepDone ? <i className="ti ti-check" aria-hidden="true" /> : index + 1}</span>
              {editing ? (
                <>
                  <input
                    value={step}
                    onChange={(event) => {
                      const next = [...decisionSteps];
                      next[index] = event.target.value;
                      updateArtifact({ steps: next });
                    }}
                  />
                  <button
                    className="mini-action ghosty"
                    type="button"
                    aria-label="РЈРґР°Р»РёС‚СЊ С€Р°Рі"
                    onClick={() => updateArtifact({ steps: decisionSteps.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    Г—
                  </button>
                </>
              ) : (
                <span className="decision-step-text">{step}</span>
              )}
            </div>
            );
          })}
        </div>

        <div className="decision-actions">
          <button className="chip-button" type="button" disabled={!hasDecision && !editing} onClick={editing ? finishEditing : () => setEditing(true)}>
            {editing ? "Р“РѕС‚РѕРІРѕ" : "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С€Р°РіРё"}
          </button>
          {editing ? (
            <button className="chip-button" type="button" onClick={() => updateArtifact({ steps: [...decisionSteps, "РќРѕРІС‹Р№ С€Р°Рі"] })}>
              Р”РѕР±Р°РІРёС‚СЊ С€Р°Рі
            </button>
          ) : null}
        </div>

        <div className="mini-label">РЎС‚РµРє</div>
        {editing ? (
          <div className="stack-editor">
            {decisionStack.map((item, index) => (
              <div className="stack-chip-editor" key={"stack-" + index}>
                <input
                  value={item}
                  onChange={(event) => {
                    const next = [...decisionStack];
                    next[index] = event.target.value;
                    updateArtifact({ stack: next });
                  }}
                />
                <button
                  className="mini-action ghosty"
                  type="button"
                  aria-label="РЈРґР°Р»РёС‚СЊ С‚РµС…РЅРѕР»РѕРіРёСЋ"
                  onClick={() => updateArtifact({ stack: decisionStack.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  Г—
                </button>
              </div>
            ))}
            <button className="chip-button" type="button" onClick={() => updateArtifact({ stack: [...decisionStack, "РќРѕРІР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ"] })}>
              Р”РѕР±Р°РІРёС‚СЊ С‚РµС…РЅРѕР»РѕРіРёСЋ
            </button>
          </div>
        ) : (
          <div className="tool-list">{decisionStack.map((item, index) => <Chip key={item + "-" + index}>{item}</Chip>)}</div>
        )}
      </section>

      <aside className="project-panel">
        <div className="panel-title">Р Р°Р±РѕС‡Р°СЏ РїР°РїРєР°</div>
        <p className="small-muted">Р•СЃР»Рё РїР°РїРєР° СѓР¶Рµ РІС‹Р±СЂР°РЅР°, РєР°СЂРєР°СЃ Рё РґР°Р»СЊРЅРµР№С€Р°СЏ СЂРµР°Р»РёР·Р°С†РёСЏ РёСЃРїРѕР»СЊР·СѓСЋС‚ РёРјРµРЅРЅРѕ РµС‘ вЂ” РїРѕРІС‚РѕСЂРЅРѕ РІС‹Р±РёСЂР°С‚СЊ РЅРµ РЅСѓР¶РЅРѕ.</p>
        <div className={workspacePath ? "workspace-card set" : "workspace-card"}>
          <i className={workspacePath ? "ti ti-folder-check" : "ti ti-folder-x"} aria-hidden="true" />
          <span className="workspace-path" title={workspacePath}>{workspacePath ?? "РџР°РїРєР° РЅРµ РІС‹Р±СЂР°РЅР° вЂ” Р±СѓРґРµС‚ СЃРѕР·РґР°РЅР° РІ Documents/RamTeamAi Projects"}</span>
        </div>
        <div className="workspace-actions">
          <button className="chip-button" type="button" disabled={selectingWorkspace} onClick={() => void handleSelectWorkspace()}>
            {selectingWorkspace ? "Р’С‹Р±РёСЂР°РµРј..." : workspacePath ? "РЎРјРµРЅРёС‚СЊ РїР°РїРєСѓ" : "Р’С‹Р±СЂР°С‚СЊ РїР°РїРєСѓ"}
          </button>
          {workspacePath ? <button className="chip-button" type="button" disabled={busy} onClick={clearWorkspaceFolder}>РЎР±СЂРѕСЃ</button> : null}
        </div>

        <button className="primary wide implement-button" type="button" disabled={busy || !hasDecision} onClick={() => void implementProject()}>
          <i className="ti ti-hammer" aria-hidden="true" /> {busy ? "Р“РѕС‚РѕРІРёРј РєР°СЂРєР°СЃ..." : scaffoldReady ? "РћР±РЅРѕРІРёС‚СЊ РєР°СЂРєР°СЃ" : "РЎРѕР·РґР°С‚СЊ РєР°СЂРєР°СЃ РїСЂРѕРµРєС‚Р°"}
        </button>
        <p className="small-muted implement-hint">РЁР°Рі 1 СѓР¶Рµ РІС‹РїРѕР»РЅРµРЅ, РµСЃР»Рё РІРёРґРёС‚Рµ СЃС‚Р°С‚СѓСЃ В«РєР°СЂРєР°СЃ РіРѕС‚РѕРІВ».</p>

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
            <div className="mini-label">Р”Р°Р»СЊС€Рµ Рє СЂРµР°Р»РёР·Р°С†РёРё</div>
            <b>РќР°Р¶РјРёС‚Рµ В«Р—Р°РїСѓСЃС‚РёС‚СЊ Р°РіРµРЅС‚РѕРІ СЂРµР°Р»РёР·Р°С†РёРёВ»</b>
            <p className="small-muted">РџРѕСЃР»Рµ РєР»РёРєР° РїСЂРёР»РѕР¶РµРЅРёРµ РїРµСЂРµР№РґС‘С‚ РІ С‡Р°С‚: РєР°Р¶РґС‹Р№ Р°РіРµРЅС‚ РЅР°РїРёС€РµС‚, С‡С‚Рѕ Р±РµСЂС‘С‚ РІ СЂР°Р±РѕС‚Сѓ Рё РєР°РєРёРµ С„Р°Р№Р»С‹/СЂРµР·СѓР»СЊС‚Р°С‚С‹ РґРѕР»Р¶РµРЅ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ.</p>
          </div>
          <button className="primary wide implement-button pulse-button" type="button" disabled={busy || !hasDecision} onClick={() => void handleStartAgents()}>
            <i className="ti ti-users" aria-hidden="true" /> {isPartial || checklistPartial ? "Continue implementation" : scaffoldReady ? "Start implementation agents" : "Create scaffold and start agents"}
          </button>
          {!scaffoldReady ? <small className="small-muted">Р•СЃР»Рё РєР°СЂРєР°СЃ РµС‰С‘ РЅРµ РіРѕС‚РѕРІ, РєРЅРѕРїРєР° СЃРѕР·РґР°СЃС‚ РµРіРѕ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё Рё СЃСЂР°Р·Сѓ Р·Р°РїСѓСЃС‚РёС‚ Р°РіРµРЅС‚РѕРІ.</small> : null}
        </div>

        <div className="panel-title spaced">Р—Р°РґР°С‡Рё Р°РіРµРЅС‚Р°Рј</div>
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

        <div className="panel-title spaced">Р”РµСЂРµРІРѕ РїСЂРѕРµРєС‚Р°</div>
        <pre className="tree-view">{hasDecision ? artifact.projectTree : ""}</pre>
        <div className="panel-title spaced">Р¤Р°Р№Р»С‹</div>
        <ul className="file-list">{hasDecision ? previewProjectFiles(artifact, Boolean(workspacePath)).map((file) => <li key={file}>{file}</li>) : null}</ul>
      </aside>
    </div>
  );
}

