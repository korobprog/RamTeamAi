import { describe, expect, it } from "vitest";
import {
  describeImplementationOutput,
  extractWorkspaceFileBlocks,
  isWorkspaceFilePath,
} from "../fileBlocks";

// These tests are the diagnostic for "агенты пишут код, а не работают вхолостую":
// the app only writes a file to disk when the model output produces a parseable
// `Файл: путь` + fenced code block. If this parsing is correct, real model
// output of the documented shape results in files; plan-only output does not.

describe("isWorkspaceFilePath", () => {
  it("accepts nested paths and files with extensions", () => {
    expect(isWorkspaceFilePath("src/app/page.tsx")).toBe(true);
    expect(isWorkspaceFilePath("README.md")).toBe(true);
    expect(isWorkspaceFilePath("docs/agent-tasks.md")).toBe(true);
  });

  it("rejects traversal, absolute, drive and prose", () => {
    expect(isWorkspaceFilePath("../secret")).toBe(false);
    expect(isWorkspaceFilePath("/etc/passwd")).toBe(false);
    expect(isWorkspaceFilePath("C:\\Windows")).toBe(false);
    expect(isWorkspaceFilePath("просто текст без файла")).toBe(false);
    expect(isWorkspaceFilePath("Plan")).toBe(false);
  });
});

describe("extractWorkspaceFileBlocks", () => {
  it("parses the documented `Файл:` + fenced block shape", () => {
    const text = [
      "Готово, пишу страницу.",
      "Файл: src/app/page.tsx",
      "```tsx",
      "export default function Page() {",
      "  return <main>Hello</main>;",
      "}",
      "```",
    ].join("\n");

    const files = extractWorkspaceFileBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/app/page.tsx");
    expect(files[0].content).toContain("export default function Page()");
    expect(files[0].content.endsWith("\n")).toBe(true);
  });

  it("parses multiple files in one response", () => {
    const text = [
      "Файл: src/index.ts",
      "```ts",
      "export const x = 1;",
      "```",
      "А теперь стили:",
      "**Файл:** src/styles.css",
      "```css",
      "body { margin: 0; }",
      "```",
    ].join("\n");

    const files = extractWorkspaceFileBlocks(text);
    expect(files.map((file) => file.path)).toEqual(["src/index.ts", "src/styles.css"]);
  });

  it("reads the path from the fence info string", () => {
    const text = ["```ts src/lib/util.ts", "export const ok = true;", "```"].join("\n");
    const files = extractWorkspaceFileBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/lib/util.ts");
  });

  it("accepts English `File:` and `create:` labels", () => {
    const text = [
      "File: src/main.ts",
      "```ts",
      "console.log('hi');",
      "```",
    ].join("\n");
    expect(extractWorkspaceFileBlocks(text)[0].path).toBe("src/main.ts");
  });

  it("recovers the path from a leading comment inside the block", () => {
    const text = [
      "Вот компонент:",
      "```tsx",
      "// src/App.tsx",
      "export default function App() {",
      "  return <main>Hi</main>;",
      "}",
      "```",
    ].join("\n");

    const files = extractWorkspaceFileBlocks(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/App.tsx");
    // The path marker line must not leak into the written file content.
    expect(files[0].content).not.toContain("// src/App.tsx");
    expect(files[0].content).toContain("export default function App()");
  });

  it("recovers a hash/html path comment too", () => {
    const text = [
      "```html",
      "<!-- index.html -->",
      "<div id=\"root\"></div>",
      "```",
    ].join("\n");
    expect(extractWorkspaceFileBlocks(text)[0].path).toBe("index.html");
  });

  it("returns nothing for plan-only output (idle agent)", () => {
    const text = [
      "## План",
      "1. Создадим компонент Page",
      "2. Подключим стили",
      "В следующей итерации напишу код.",
    ].join("\n");
    expect(extractWorkspaceFileBlocks(text)).toHaveLength(0);
  });

  it("ignores a fenced block with no resolvable path", () => {
    const text = ["Пример вывода:", "```", "some console output", "```"].join("\n");
    expect(extractWorkspaceFileBlocks(text)).toHaveLength(0);
  });
});

describe("describeImplementationOutput", () => {
  it("flags real code output as wroteCode", () => {
    const text = ["Файл: src/a.ts", "```ts", "export const a = 1;", "```"].join("\n");
    const outcome = describeImplementationOutput(text);
    expect(outcome.wroteCode).toBe(true);
    expect(outcome.files).toHaveLength(1);
  });

  it("flags plan-only output as not wroteCode (вхолостую)", () => {
    const outcome = describeImplementationOutput("Опишу архитектуру и вернусь к коду позже.");
    expect(outcome.wroteCode).toBe(false);
    expect(outcome.files).toHaveLength(0);
  });
});
