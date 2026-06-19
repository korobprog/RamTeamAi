import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  checklistComplete,
  checklistMatchesSteps,
  checklistProgress,
  heuristicChecklist,
  isNonBlockingImplementationStep,
  mergeChecklist,
  parseChecklistVerdict,
  pendingImplementationSteps,
} from "../checklist";

const steps = [
  "Зафиксировать цель и критерии готовности",
  "Собрать каркас на React с навигацией",
  "Подключить данные и формы",
];

describe("buildChecklist", () => {
  it("creates a pending item per step", () => {
    const items = buildChecklist(steps);
    expect(items).toHaveLength(3);
    expect(items.every((item) => !item.done && item.source === "pending")).toBe(true);
  });

  it("does not let service/verification-only items block implementation rounds", () => {
    const items = buildChecklist([
      "Создать src/App.tsx для лендинга",
      "Выбрать следующий вариант: каркас проекта или премиум-дизайн",
      "Запустить npm run dev",
    ]);

    expect(items[0].done).toBe(false);
    expect(items[1].done).toBe(true);
    expect(items[2].done).toBe(true);
    expect(isNonBlockingImplementationStep("Подключить Tailwind и lucide-react, затем запустить npm run dev")).toBe(false);
  });

  it("returns only unfinished actionable steps for the next implementation round", () => {
    const roundSteps = [
      "Создать src/App.tsx для лендинга",
      "Запустить npm run dev",
      "Подключить Tailwind",
    ];
    const checklist = buildChecklist(roundSteps).map((item) => item.index === 0 ? { ...item, done: true } : item);
    expect(pendingImplementationSteps(roundSteps, checklist)).toEqual(["Подключить Tailwind"]);
  });

  it("detects stale checklists even when the step count is unchanged", () => {
    const original = ["Создать App", "Подключить Tailwind"];
    const checklist = buildChecklist(original);
    expect(checklistMatchesSteps(original, checklist)).toBe(true);
    expect(checklistMatchesSteps(["Создать App", "Подключить lucide-react"], checklist)).toBe(false);
  });
});

describe("parseChecklistVerdict", () => {
  it("parses DONE/TODO lines by step number", () => {
    const text = [
      "1. DONE — цель описана в PLAN.md",
      "2. DONE — App.tsx с навигацией готов",
      "3. TODO — формы ещё не подключены",
    ].join("\n");
    const verdicts = parseChecklistVerdict(text, steps);
    expect(verdicts.get(0)?.done).toBe(true);
    expect(verdicts.get(1)?.done).toBe(true);
    expect(verdicts.get(2)?.done).toBe(false);
    expect(verdicts.get(2)?.note).toMatch(/формы/);
  });

  it("parses markdown checkboxes and emoji", () => {
    const text = ["- [x] 1. готово", "- [ ] 2. осталось", "3. ✅ done"].join("\n");
    const verdicts = parseChecklistVerdict(text, steps);
    expect(verdicts.get(0)?.done).toBe(true);
    expect(verdicts.get(1)?.done).toBe(false);
    expect(verdicts.get(2)?.done).toBe(true);
  });

  it("treats an explicit TODO as stronger than a DONE on the same line", () => {
    const verdicts = parseChecklistVerdict("1. DONE, но осталось доработать", steps);
    expect(verdicts.get(0)?.done).toBe(false);
  });

  it("skips ambiguous and out-of-range lines", () => {
    const verdicts = parseChecklistVerdict(["просто текст", "9. DONE"].join("\n"), steps);
    expect(verdicts.size).toBe(0);
  });
});

describe("heuristicChecklist", () => {
  it("marks all steps done when the project is built with real source", () => {
    const items = heuristicChecklist(steps, ["src/App.tsx", "package.json"], "scaffold-ok");
    expect(items.every((item) => item.done)).toBe(true);
    expect(items[0].source).toBe("heuristic");
  });

  it("keeps steps open when the project is only partial", () => {
    const items = heuristicChecklist(steps, ["PLAN.md"], "partial");
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it("does not count meta files as real source", () => {
    const items = heuristicChecklist(steps, ["README.md", "docs/plan.md"], "scaffold-ok");
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it("keeps service-only steps done even while source work is still pending", () => {
    const items = heuristicChecklist(["Если нужен код — разложу лендинг по файлам"], ["README.md"], "partial");
    expect(items[0].done).toBe(true);
    expect(items[0].source).toBe("heuristic");
  });

  it("keeps dependency steps open until package/source evidence exists", () => {
    const items = heuristicChecklist(
      ["Подключить Tailwind и lucide-react"],
      ["package.json", "src/App.tsx"],
      "scaffold-ok",
      {
        "package.json": JSON.stringify({ dependencies: { react: "latest" } }),
        "src/App.tsx": "export default function App() { return <main />; }",
      },
    );
    expect(items[0].done).toBe(false);
    expect(items[0].note).toMatch(/Tailwind|lucide/);
  });

  it("does not close explicit dependency steps when file contents are unavailable", () => {
    const items = heuristicChecklist(
      ["Подключить Tailwind и lucide-react"],
      ["package.json", "src/App.tsx", "src/index.css"],
      "scaffold-ok",
    );
    expect(items[0].done).toBe(false);
    expect(items[0].note).toMatch(/содержимого файлов/);
  });

  it("closes dependency steps when package/source evidence exists", () => {
    const items = heuristicChecklist(
      ["Подключить Tailwind и lucide-react"],
      ["package.json", "src/App.tsx", "src/index.css"],
      "scaffold-ok",
      {
        "package.json": JSON.stringify({ dependencies: { "lucide-react": "latest", tailwindcss: "latest" } }),
        "src/App.tsx": "import { Sparkles } from \"lucide-react\"; export default function App() { return <Sparkles />; }",
        "src/index.css": "@import \"tailwindcss\";",
      },
    );
    expect(items[0].done).toBe(true);
  });

  it("completes the screenshot landing checklist only when code, css and dependencies are present", () => {
    const screenshotSteps = [
      "Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
      "Подключить Tailwind и `lucide-react`, затем запустить `npm run dev`",
      "Вставить `src/App.tsx` и `src/index.css` в проект",
      "Подключить `lucide-react` и проверить сборку `npm run dev`",
      "Выбрать следующий вариант: каркас проекта, премиум-дизайн или RU/EN",
      "Если нужен код — я разложу лендинг по файлам и добью недостающие секции",
    ];
    const files = ["package.json", "tsconfig.json", "vite.config.ts", "src/main.tsx", "src/App.tsx", "src/index.css"];
    const complete = heuristicChecklist(screenshotSteps, files, "scaffold-ok", {
      "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest", "lucide-react": "latest", tailwindcss: "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
      "tsconfig.json": "{}",
      "vite.config.ts": "import { defineConfig } from \"vite\";",
      "src/main.tsx": "import \"./index.css\";",
      "src/App.tsx": "import { Sparkles } from \"lucide-react\"; export default function App() { return <main><Sparkles />Premium landing</main>; }",
      "src/index.css": "@import \"tailwindcss\"; .hero { min-height: 100vh; }",
    });
    expect(complete.every((item) => item.done)).toBe(true);

    const missingCss = heuristicChecklist(screenshotSteps, files.filter((file) => file !== "src/index.css"), "scaffold-ok", {
      "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest", "lucide-react": "latest", tailwindcss: "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
      "src/App.tsx": "import { Sparkles } from \"lucide-react\"; export default function App() { return <main><Sparkles />Premium landing</main>; }",
    });
    expect(missingCss[2].done).toBe(false);
    expect(pendingImplementationSteps(screenshotSteps, missingCss)).toEqual(["Вставить `src/App.tsx` и `src/index.css` в проект"]);
  });
});

describe("mergeChecklist", () => {
  it("prefers the verifier verdict and falls back to heuristic per item", () => {
    const fallback = heuristicChecklist(steps, ["src/App.tsx"], "scaffold-ok"); // all done
    const verdicts = parseChecklistVerdict("3. TODO — формы не готовы", steps);
    const merged = mergeChecklist(steps, verdicts, fallback);
    expect(merged[0].done).toBe(true); // from heuristic
    expect(merged[0].source).toBe("heuristic");
    expect(merged[2].done).toBe(false); // verifier override
    expect(merged[2].source).toBe("verifier");
    expect(checklistComplete(merged)).toBe(false);
  });

  it("reports full completion and progress", () => {
    const fallback = heuristicChecklist(steps, ["src/App.tsx"], "scaffold-ok");
    const merged = mergeChecklist(steps, new Map(), fallback);
    expect(checklistComplete(merged)).toBe(true);
    expect(checklistProgress(merged)).toEqual({ done: 3, total: 3 });
  });

  it("does not reopen service-only items when the verifier asks for manual actions", () => {
    const serviceSteps = ["Выбрать следующий вариант: каркас проекта или премиум-дизайн"];
    const fallback = buildChecklist(serviceSteps);
    const verdicts = parseChecklistVerdict("1. TODO — нужно выбрать вариант вручную", serviceSteps);
    const merged = mergeChecklist(serviceSteps, verdicts, fallback);
    expect(merged[0].done).toBe(true);
  });

  it("does not run another code round only because npm dev was not started manually", () => {
    const implementationStep = ["Подключить Tailwind и lucide-react, затем запустить npm run dev"];
    const fallback = heuristicChecklist(implementationStep, ["package.json", "src/App.tsx", "src/index.css"], "scaffold-ok", {
      "package.json": JSON.stringify({ dependencies: { "lucide-react": "latest", tailwindcss: "latest" } }),
      "src/App.tsx": "import { Rocket } from \"lucide-react\"; export default function App() { return <Rocket />; }",
      "src/index.css": "@import \"tailwindcss\";",
    });
    const verdicts = parseChecklistVerdict("1. TODO — npm run dev ещё не запущен", implementationStep);
    const merged = mergeChecklist(implementationStep, verdicts, fallback);
    expect(merged[0].done).toBe(true);
  });

  it("keeps deterministic file/dependency evidence stronger than a verifier hallucination", () => {
    const implementationStep = ["Подключить Tailwind и lucide-react"];
    const fallback = heuristicChecklist(implementationStep, ["package.json", "src/App.tsx", "src/index.css"], "scaffold-ok", {
      "package.json": JSON.stringify({ dependencies: { "lucide-react": "latest", tailwindcss: "latest" } }),
      "src/App.tsx": "import { Sparkles } from \"lucide-react\"; export default function App() { return <Sparkles />; }",
      "src/index.css": "@import \"tailwindcss\";",
    });
    const verdicts = parseChecklistVerdict("1. TODO — lucide-react не подключён", implementationStep);
    const merged = mergeChecklist(implementationStep, verdicts, fallback);
    expect(merged[0].done).toBe(true);
    expect(merged[0].source).toBe("heuristic");
  });

  it("keeps deterministic missing-file evidence stronger than a false verifier DONE", () => {
    const step = ["Вставить `src/App.tsx` и `src/index.css` в проект"];
    const fallback = heuristicChecklist(step, ["src/App.tsx"], "scaffold-ok", {
      "src/App.tsx": "export default function App() { return <main>Landing</main>; }",
    });
    expect(fallback[0].done).toBe(false);
    expect(fallback[0].note).toMatch(/src\/index\.css/);

    const verdicts = parseChecklistVerdict("1. DONE — всё вставлено", step);
    const merged = mergeChecklist(step, verdicts, fallback);

    expect(merged[0].done).toBe(false);
    expect(merged[0].source).toBe("heuristic");
  });

  it("keeps deterministic missing-dependency evidence stronger than a false verifier DONE", () => {
    const step = ["Подключить Tailwind и lucide-react"];
    const fallback = heuristicChecklist(step, ["package.json", "src/App.tsx", "src/index.css"], "scaffold-ok", {
      "package.json": JSON.stringify({ dependencies: { react: "latest" } }),
      "src/App.tsx": "export default function App() { return <main>Landing</main>; }",
      "src/index.css": ".hero { min-height: 100vh; }",
    });
    expect(fallback[0].done).toBe(false);
    expect(fallback[0].note).toMatch(/Tailwind|lucide-react/);

    const verdicts = parseChecklistVerdict("1. DONE — зависимости подключены", step);
    const merged = mergeChecklist(step, verdicts, fallback);

    expect(merged[0].done).toBe(false);
    expect(merged[0].source).toBe("heuristic");
  });

  it("still lets the verifier reopen generic steps that deterministic evidence cannot prove", () => {
    const genericStep = ["Добавить премиальные секции и адаптивную композицию"];
    const fallback = heuristicChecklist(genericStep, ["src/App.tsx"], "scaffold-ok", {
      "src/App.tsx": "export default function App() { return <main>Basic app with enough source text to count as implemented scaffold.</main>; }".repeat(2),
    });
    expect(fallback[0].done).toBe(true);
    const verdicts = parseChecklistVerdict("1. TODO — нет премиальных секций", genericStep);
    const merged = mergeChecklist(genericStep, verdicts, fallback);
    expect(merged[0].done).toBe(false);
    expect(merged[0].source).toBe("verifier");
  });
});
