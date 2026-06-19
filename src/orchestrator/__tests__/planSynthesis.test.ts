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
    ]);
  });
});
