import { describe, expect, it } from "vitest";
import { buildChecklist, checklistComplete, heuristicChecklist, type ChecklistEvidenceContents, type ChecklistItem } from "../checklist";
import { artifactStatusAfterImplementationRound, buildAutoImplementationSummary, decideAutoRound, nextStalledRounds, projectStatusAfterImplementationRound } from "../autoLoop";

const steps = ["Создать src/App.tsx", "Подключить Tailwind"];

function checklist(doneIndexes: number[] = []) {
  return buildChecklist(steps).map((item) => doneIndexes.includes(item.index) ? { ...item, done: true } : item);
}

interface VirtualWorkspace {
  files: string[];
  contents: ChecklistEvidenceContents;
}

function verifyVirtualWorkspace(planSteps: string[], workspace: VirtualWorkspace): ChecklistItem[] {
  return heuristicChecklist(planSteps, workspace.files, "scaffold-ok", workspace.contents);
}

function simulateAutoImplementation(
  planSteps: string[],
  workspacesAfterRounds: VirtualWorkspace[],
  cap: number,
  filesWrittenAfterRounds: number[] = workspacesAfterRounds.map(() => 1),
) {
  let previous = buildChecklist(planSteps);
  let checklistState = previous;
  let stalledRounds = 0;
  let stopReason = "limit";
  let roundsRun = 0;

  for (let round = 1; round <= cap; round += 1) {
    const decision = decideAutoRound({
      checklist: checklistState,
      round,
      cap,
      stalledRounds,
      autoMode: true,
      busy: false,
    });
    if (decision.action === "stop") {
      stopReason = decision.reason;
      break;
    }

    const workspace = workspacesAfterRounds[Math.min(roundsRun, workspacesAfterRounds.length - 1)];
    checklistState = verifyVirtualWorkspace(planSteps, workspace);
    const filesWritten = filesWrittenAfterRounds[Math.min(roundsRun, filesWrittenAfterRounds.length - 1)] ?? 0;
    stalledRounds = nextStalledRounds(previous, checklistState, filesWritten, stalledRounds);
    previous = checklistState;
    roundsRun += 1;
    if (checklistComplete(checklistState)) {
      stopReason = "complete";
      break;
    }
  }

  return { checklist: checklistState, roundsRun, stalledRounds, stopReason };
}

describe("decideAutoRound", () => {
  it("runs another round while actionable checklist items remain", () => {
    expect(decideAutoRound({
      checklist: checklist([0]),
      round: 1,
      cap: 4,
      stalledRounds: 0,
      autoMode: true,
      busy: false,
    })).toEqual({ action: "run" });
  });

  it("stops as complete when all items are done", () => {
    expect(decideAutoRound({
      checklist: checklist([0, 1]),
      round: 1,
      cap: 4,
      stalledRounds: 0,
      autoMode: true,
      busy: false,
    })).toEqual({ action: "stop", reason: "complete" });
  });

  it("keeps running after repeated no-progress rounds until the safety cap", () => {
    expect(decideAutoRound({
      checklist: checklist([0]),
      round: 2,
      cap: 4,
      stalledRounds: 3,
      autoMode: true,
      busy: false,
    })).toEqual({ action: "run" });
  });

  it("stops at the configured cap", () => {
    expect(decideAutoRound({
      checklist: checklist([0]),
      round: 4,
      cap: 4,
      stalledRounds: 0,
      autoMode: true,
      busy: false,
    })).toEqual({ action: "stop", reason: "limit" });
  });
});

describe("nextStalledRounds", () => {
  it("resets when a round wrote files even before checklist verification catches up", () => {
    expect(nextStalledRounds(checklist([0]), checklist([0]), 1, 2)).toBe(0);
  });

  it("resets when checklist progress advanced", () => {
    expect(nextStalledRounds(checklist([0]), checklist([0, 1]), 0, 2)).toBe(0);
  });

  it("increments when there are no files and no checklist progress", () => {
    expect(nextStalledRounds(checklist([0]), checklist([0]), 0, 2)).toBe(3);
  });
});

describe("buildAutoImplementationSummary", () => {
  it("reports final completion", () => {
    expect(buildAutoImplementationSummary(checklist([0, 1]), "complete", 4)).toContain("✅ Готово");
  });

  it("reports remaining items and stop reason", () => {
    const summary = buildAutoImplementationSummary(checklist([0]), "stalled", 4);
    expect(summary).toContain("выполнено 1 из 2");
    expect(summary).toContain("повторные раунды");
    expect(summary).toContain("Подключить Tailwind");
  });
});

describe("implementation round status", () => {
  it("never marks the project built before checklist finalization", () => {
    expect(projectStatusAfterImplementationRound("scaffold-ok")).toBe("scaffolded");
    expect(artifactStatusAfterImplementationRound("scaffold-ok")).toBe("scaffolded");
  });

  it("keeps partial implementation active/draft", () => {
    expect(projectStatusAfterImplementationRound("partial")).toBe("active");
    expect(artifactStatusAfterImplementationRound("partial")).toBe("draft");
  });
});

describe("auto implementation e2e simulation", () => {
  const landingSteps = [
    "Создать/открыть Vite React TypeScript проект и заменить `src/App.tsx` на код лендинга",
    "Подключить Tailwind и `lucide-react`, затем запустить `npm run dev`",
    "Вставить `src/App.tsx` и `src/index.css` в проект",
    "Выбрать следующий вариант: каркас проекта, премиум-дизайн или RU/EN",
  ];

  it("continues after a partial first round and finishes after evidence appears", () => {
    const partial: VirtualWorkspace = {
      files: ["package.json", "tsconfig.json", "vite.config.ts", "src/main.tsx", "src/App.tsx"],
      contents: {
        "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
        "tsconfig.json": "{}",
        "vite.config.ts": "import { defineConfig } from \"vite\";",
        "src/main.tsx": "import \"./index.css\";",
        "src/App.tsx": "export default function App() { return <main>Landing shell</main>; }",
      },
    };
    const complete: VirtualWorkspace = {
      files: [...partial.files, "src/index.css"],
      contents: {
        ...partial.contents,
        "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest", "lucide-react": "latest", tailwindcss: "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
        "src/App.tsx": "import { Sparkles } from \"lucide-react\"; export default function App() { return <main><Sparkles />Premium landing</main>; }",
        "src/index.css": "@import \"tailwindcss\"; .hero { min-height: 100vh; }",
      },
    };

    const result = simulateAutoImplementation(landingSteps, [partial, complete], 4);

    expect(result.roundsRun).toBe(2);
    expect(result.stopReason).toBe("complete");
    expect(checklistComplete(result.checklist)).toBe(true);
    expect(buildAutoImplementationSummary(result.checklist, "complete", 4)).toContain("✅ Готово");
  });

  it("keeps running while agents are still writing files and stops at the cap if verification never catches up", () => {
    const missingDependencyForever: VirtualWorkspace = {
      files: ["package.json", "tsconfig.json", "vite.config.ts", "src/main.tsx", "src/App.tsx"],
      contents: {
        "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
        "tsconfig.json": "{}",
        "vite.config.ts": "import { defineConfig } from \"vite\";",
        "src/main.tsx": "import \"./index.css\";",
        "src/App.tsx": "export default function App() { return <main>Same rewrite</main>; }",
      },
    };

    const result = simulateAutoImplementation(landingSteps, [missingDependencyForever, missingDependencyForever, missingDependencyForever, missingDependencyForever], 6);

    expect(result.stopReason).toBe("limit");
    expect(result.roundsRun).toBe(5);
    expect(result.stalledRounds).toBe(0);
    expect(checklistComplete(result.checklist)).toBe(false);
    expect(buildAutoImplementationSummary(result.checklist, "limit", 6)).toContain("лимит 6");
  });

  it("continues through quiet rounds and returns the remaining checklist only at the cap", () => {
    const missingDependencyForever: VirtualWorkspace = {
      files: ["package.json", "tsconfig.json", "vite.config.ts", "src/main.tsx", "src/App.tsx"],
      contents: {
        "package.json": JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest" }, devDependencies: { vite: "latest", typescript: "latest" } }),
        "tsconfig.json": "{}",
        "vite.config.ts": "import { defineConfig } from \"vite\";",
        "src/main.tsx": "import \"./index.css\";",
        "src/App.tsx": "export default function App() { return <main>Same stale state</main>; }",
      },
    };

    const result = simulateAutoImplementation(
      landingSteps,
      [missingDependencyForever, missingDependencyForever, missingDependencyForever, missingDependencyForever],
      6,
      [0, 0, 0, 0],
    );

    expect(result.stopReason).toBe("limit");
    expect(result.roundsRun).toBe(5);
    expect(checklistComplete(result.checklist)).toBe(false);
    expect(buildAutoImplementationSummary(result.checklist, "limit", 6)).toContain("чеклист правок");
  });
});
