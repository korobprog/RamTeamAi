import { useAppStore } from "../store/appStore";

export function OnboardingScreen() {
  const setScreen = useAppStore((state) => state.setScreen);

  return (
    <div className="narrow-screen">
      <div className="hero-mark"><i className="ti ti-hexagon" aria-hidden="true" /></div>
      <h2>Добро пожаловать в RamTeamAi</h2>
      <p className="welcome-sub">Любые ИИ-API. Команды агентов. Планирование вместе.</p>
      <div className="step-list">
        <button className="flow-row" type="button" onClick={() => setScreen("providers")}>
          <span className="flow-num done"><i className="ti ti-check" aria-hidden="true" /></span>
          <span><b>Подключить API</b><small>Anthropic, OpenAI, локальные, кастомные</small></span>
          <span className="chevron"><i className="ti ti-chevron-right" aria-hidden="true" /></span>
        </button>
        <button className="flow-row active" type="button" onClick={() => setScreen("agent-builder")}>
          <span className="flow-num">2</span>
          <span><b>Собрать команду</b><small>Модели и роли агентов</small></span>
          <span className="chevron"><i className="ti ti-chevron-right" aria-hidden="true" /></span>
        </button>
        <button className="flow-row" type="button" onClick={() => setScreen("chat")}>
          <span className="flow-num">3</span>
          <span><b>Запустить Planning Mode</b><small>Поставь задачу — команда найдёт решение</small></span>
          <span className="chevron"><i className="ti ti-chevron-right" aria-hidden="true" /></span>
        </button>
      </div>
      <div className="progress-dots" aria-label="Прогресс онбординга"><i /><i className="active" /><i /></div>
    </div>
  );
}
