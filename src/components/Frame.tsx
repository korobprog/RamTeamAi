import type { ReactNode } from "react";
import type { ScreenId } from "../types";
import { useAppStore } from "../store/appStore";

const nav: Array<{ id: ScreenId; label: string }> = [
  { id: "onboarding", label: "Старт" },
  { id: "providers", label: "Провайдеры" },
  { id: "custom-api", label: "Кастомный API" },
  { id: "agent-builder", label: "Агент" },
  { id: "topology", label: "Топология" },
  { id: "chat", label: "Диалог" },
  { id: "build", label: "Решение" },
];

export function FNeurogatee({ children }: { children: ReactNode }) {
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);
  const busy = useAppStore((state) => state.busy);

  return (
    <main className="app-shell">
      <section className="window-card">
        <header className="titlebar">
          <div className="brand-mark">R</div>
          <div>
            <h1>Neurogate</h1>
            <p>Universal AI API · Multi-agent Planning · Project Builder</p>
          </div>
          <div className="titlebar-status">{busy ? "выполняется…" : "локальный MVP"}</div>
        </header>
        <nav className="nav-tabs" aria-label="Экраны Neurogate">
          {nav.map((item) => (
            <button className={item.id === screen ? "tab active" : "tab"} key={item.id} type="button" onClick={() => setScreen(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="stage">{children}</div>
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
