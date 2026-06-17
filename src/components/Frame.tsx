import type { ReactNode } from "react";
import type { ScreenId } from "../types";
import { useAppStore } from "../store/appStore";

const nav: Array<{ id: ScreenId; label: string }> = [
  { id: "onboarding", label: "Старт" },
  { id: "providers", label: "Провайдеры" },
  { id: "custom-api", label: "Кастомный API" },
  { id: "mcp", label: "MCP" },
  { id: "agent-builder", label: "Агент" },
  { id: "topology", label: "Топология" },
  { id: "chat", label: "Диалог" },
  { id: "build", label: "Решение" },
];

export function FRamTeamAie({ children }: { children: ReactNode }) {
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);
  const busy = useAppStore((state) => state.busy);
  const account = useAppStore((state) => state.account);
  const profileName = account.github?.name || account.github?.login || "Профиль";
  const profileSubtitle = account.github ? "GitHub @" + account.github.login : "локальный пользователь";

  return (
    <main className="app-shell">
      <section className="window-card">
        <header className="titlebar">
          <div className="titlebar-left">
            <button className="profile-pill" type="button" onClick={() => setScreen("chat")} title="Профиль пользователя">
              <span className="profile-avatar">
                {account.github?.avatarUrl ? <img src={account.github.avatarUrl} alt="" /> : <i className="ti ti-user" aria-hidden="true" />}
              </span>
              <span>
                <b>{profileName}</b>
                <small>{profileSubtitle}</small>
              </span>
            </button>
            <button
              className={screen === "settings" ? "settings-button active" : "settings-button"}
              type="button"
              aria-label="Настройки программы"
              title="Настройки программы"
              onClick={() => setScreen("settings")}
            >
              <i className="ti ti-settings" aria-hidden="true" />
            </button>
          </div>
          <div className="brand-mark">R</div>
          <div>
            <h1>RamTeamAi</h1>
            <p>Universal AI API · Multi-agent Planning · Project Builder</p>
          </div>
          <div className="titlebar-right">
            <button
              className="donation-fab"
              type="button"
              aria-label="Открыть донаты и кошельки"
              title="Донат и кошельки"
              onClick={() => {
                window.location.hash = "donations";
                setScreen("settings");
              }}
            >
              <i className="ti ti-heart-handshake" aria-hidden="true" />
              <span>Донат</span>
            </button>
            <div className="titlebar-status">{busy ? "выполняется…" : "локальный MVP"}</div>
          </div>
        </header>
        <nav className="nav-tabs" aria-label="Экраны RamTeamAi">
          {nav.map((item) => (
            <button className={item.id === screen ? "tab active" : "tab"} key={item.id} type="button" onClick={() => setScreen(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className={"stage stage-" + screen}>{children}</div>
      </section>
    </main>
  );
}

export function SectionTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="section-title">
      <span className="section-icon"><i className={"ti ti-" + icon} aria-hidden="true" /></span>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "info" | "success" | "warning" }) {
  return <span className={"chip " + tone}>{children}</span>;
}
