import { describe, expect, it } from "vitest";
import { synthesizePlan } from "../index";
import type { ChatMessage, PlanArtifact } from "../../types";

const baseArtifact: PlanArtifact = {
  id: "plan",
  title: "Черновик",
  stack: [],
  steps: [],
  projectTree: "",
  status: "draft",
  edited: false,
};

function message(author: ChatMessage["author"], text: string): ChatMessage {
  return {
    id: author + "-" + Math.random(),
    author,
    text,
    createdAt: new Date().toISOString(),
    tokens: Math.ceil(text.length / 4),
  };
}

describe("synthesizePlan", () => {
  it("drops service/future-promise bullets from explicit implementation steps", () => {
    const plan = synthesizePlan([
      message("user", "Сделай премиальный лендинг на Vite React TypeScript"),
      message("architect", [
        "## Шаги",
        "1. Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
        "2. Подключить Tailwind и `lucide-react`, затем запустить `npm run dev`",
        "3. Выбрать следующий вариант: каркас проекта, премиум-дизайн или RU/EN",
        "4. Если нужен код — я разложу лендинг по файлам и добью недостающие секции",
      ].join("\n")),
    ], baseArtifact);

    expect(plan.steps).toEqual([
      "Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
      "Подключить Tailwind и `lucide-react`",
      "Create stack-matched automated tests in package.json and tests/App.test.tsx (Vitest + React Testing Library) and make npm test runnable",
    ]);
  });

  it("adds a stack-matched automated testing step to fallback plans", () => {
    const plan = synthesizePlan([
      message("user", "Нужен desktop app на Tauri React TypeScript"),
      message("coder", "Сделаю рабочую реализацию без отдельного списка шагов."),
    ], baseArtifact);

    expect(plan.stack).toEqual(expect.arrayContaining(["Tauri", "React", "TypeScript"]));
    expect(plan.steps.at(-1)).toBe(
      "Create stack-matched automated tests in package.json and tests/App.test.tsx (Vitest + React Testing Library) and make npm test runnable",
    );
  });

  it("drops package-manager command-only bullets from explicit implementation steps", () => {
    const plan = synthesizePlan([
      message("user", "Сделай лендинг RamTeamAi на Vite React TypeScript"),
      message("architect", [
        "## Implementation",
        "1. Создать `src/App.tsx` и `src/index.css` для лендинга",
        "2. Run `npm install && npm run dev`, check browser, then run `npm run build`",
        "3. Перейти в `ramteamai-landing` и выполнить `npm install`",
        "4. Create stack-matched automated tests in package.json and tests/App.test.tsx (Vitest + React Testing Library) and make npm test runnable",
      ].join("\n")),
    ], baseArtifact);

    expect(plan.steps).toEqual([
      "Создать `src/App.tsx` и `src/index.css` для лендинга",
      "Create stack-matched automated tests in package.json and tests/App.test.tsx (Vitest + React Testing Library) and make npm test runnable",
    ]);
  });
});
