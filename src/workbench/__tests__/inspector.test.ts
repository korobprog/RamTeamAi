import { describe, expect, it } from "vitest";
import { buildWorkbenchDomMessage, createWorkbenchInspectorTargets, createWorkbenchMap, inferPreviewUrl } from "../inspector";
import type { BuildResult, PlanArtifact } from "../../types";

const artifact: PlanArtifact = {
  id: "plan-1",
  title: "Shop desktop",
  stack: ["Tauri", "React"],
  steps: ["Собрать каталог", "Подключить корзину"],
  projectTree: "src/\nsrc-tauri/\npackage.json",
  status: "built",
  edited: true,
};

const build: BuildResult = {
  phase: "implementation",
  rootPath: "C:/tmp/shop",
  files: ["package.json", "src/App.tsx", "src/index.css", "src-tauri/src/main.rs", "src/components/ProductCard.tsx"],
  skipped: false,
  message: "built",
};

describe("post-build workbench inspector", () => {
  it("maps visible DOM targets to likely source files", () => {
    const targets = createWorkbenchInspectorTargets(artifact, build);

    expect(targets.map((target) => target.id)).toContain("hero");
    expect(targets.find((target) => target.id === "hero")?.file).toBe("src/App.tsx");
    expect(targets.find((target) => target.id === "style-surface")?.file).toBe("src/index.css");
    expect(targets.find((target) => target.id === "tauri-bridge")?.file).toBe("src-tauri/src/main.rs");
  });

  it("builds a project map with frontend, backend and data-flow sections", () => {
    const map = createWorkbenchMap(artifact, build);

    expect(map.map((section) => section.title)).toEqual(["Стек", "Маршруты и экраны", "Компоненты", "Backend / IPC", "Потоки данных", "Риски и логи"]);
    expect(map.find((section) => section.title === "Backend / IPC")?.items).toContain("src-tauri/src/main.rs");
    expect(map.find((section) => section.title === "Потоки данных")?.items.join(" ")).toContain("Подключить корзину");
  });

  it("formats selected DOM as an actionable agent prompt", () => {
    const [target] = createWorkbenchInspectorTargets(artifact, build);
    const message = buildWorkbenchDomMessage(target);

    expect(message).toContain("Выбран элемент");
    expect(message).toContain(target.selector);
    expect(message).toContain(`${target.file}:${target.line}`);
    expect(message).toContain("точечную правку");
  });

  it("uses the local Vite preview URL for filesystem workspaces", () => {
    expect(inferPreviewUrl("C:/tmp/shop")).toBe("http://127.0.0.1:5173");
    expect(inferPreviewUrl("https://example.test")).toBe("https://example.test");
  });
});
