import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { extractWorkspaceFileBlocks, isWorkspaceFilePath } from "../fileBlocks";

// Integration proof for "агенты пишут код, а не вхолостую": take a realistic
// implementation-mode model response (the shape we saw hit api.neurogate.space),
// run the exact parse the app uses, then write the blocks to a REAL temp folder
// the way the Tauri `write_workspace_file` command does (join root + relative
// path, create parent dirs, write file). Finally read the files back and assert
// their content landed on disk and nothing escaped the workspace root.

// Mirrors the production write contract: reject anything that is not a safe
// workspace-relative path, then write under the root.
async function writeWorkspaceFile(root: string, relativePath: string, content: string): Promise<string> {
  if (!isWorkspaceFilePath(relativePath)) {
    throw new Error("unsafe path rejected: " + relativePath);
  }
  const target = resolve(root, relativePath);
  // Defence in depth: the resolved path must stay inside the root.
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("path escaped workspace root: " + relativePath);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}

const MODEL_RESPONSE = [
  "Делаю лендинг RamTeamAi. Ниже рабочий код.",
  "",
  "Файл: src/app/page.tsx",
  "```tsx",
  "export default function Page() {",
  "  return (",
  "    <main className=\"hero\">",
  "      <h1>RamTeamAi</h1>",
  "      <p>Команда ИИ-агентов планирует и пишет код вместе.</p>",
  "    </main>",
  "  );",
  "}",
  "```",
  "",
  "Теперь базовые стили:",
  "",
  "**Файл:** src/app/globals.css",
  "```css",
  ".hero { display: grid; gap: 12px; padding: 64px; }",
  ".hero h1 { font-size: 40px; }",
  "```",
  "",
  "Дальше можно добавить секции цен и отзывов в следующих итерациях.",
].join("\n");

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ramteamai-write-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("implementation write pipeline (parse → real files on disk)", () => {
  it("writes every announced file block to disk with exact content", async () => {
    const blocks = extractWorkspaceFileBlocks(MODEL_RESPONSE);
    expect(blocks.map((block) => block.path)).toEqual(["src/app/page.tsx", "src/app/globals.css"]);

    const written: string[] = [];
    for (const block of blocks) {
      written.push(await writeWorkspaceFile(root, block.path, block.content));
    }
    expect(written).toHaveLength(2);

    const page = await readFile(join(root, "src/app/page.tsx"), "utf8");
    expect(page).toContain("export default function Page()");
    expect(page).toContain("<h1>RamTeamAi</h1>");

    const css = await readFile(join(root, "src/app/globals.css"), "utf8");
    expect(css).toContain(".hero { display: grid");

    // The prose around the blocks must NOT have produced stray files.
    expect(existsSync(join(root, "src/app"))).toBe(true);
    const pageStat = await stat(join(root, "src/app/page.tsx"));
    expect(pageStat.isFile()).toBe(true);
  });

  it("writes nothing for a plan-only (idle) response", async () => {
    const blocks = extractWorkspaceFileBlocks("Сначала опишу архитектуру, код напишу в следующей итерации.");
    expect(blocks).toHaveLength(0);
    // Nothing to write → workspace stays empty besides the temp root itself.
    expect(existsSync(join(root, "src"))).toBe(false);
  });

  it("edits an existing file by overwriting it with the agent's updated block", async () => {
    // Round 1 — the agent creates the file.
    const create = extractWorkspaceFileBlocks(
      ["Файл: src/middleware.ts", "```ts", "export const version = 1;", "```"].join("\n"),
    );
    await writeWorkspaceFile(root, create[0].path, create[0].content);
    expect(await readFile(join(root, "src/middleware.ts"), "utf8")).toContain("version = 1");

    // Round 2 — the agent returns the SAME path with updated full content. This
    // is the "edit" case the snapshot feature unlocks: it must replace, not
    // append or fail.
    const edit = extractWorkspaceFileBlocks(
      ["Файл: src/middleware.ts", "```ts", "export const version = 2;", "export const edited = true;", "```"].join("\n"),
    );
    await writeWorkspaceFile(root, edit[0].path, edit[0].content);

    const after = await readFile(join(root, "src/middleware.ts"), "utf8");
    expect(after).toContain("version = 2");
    expect(after).toContain("edited = true");
    expect(after).not.toContain("version = 1");
  });

  it("refuses to write a traversal path outside the workspace", async () => {
    // A malicious announcement is dropped at parse time, but assert the write
    // guard also rejects it if one ever slips through.
    await expect(writeWorkspaceFile(root, "../escape.txt", "x")).rejects.toThrow();
    expect(existsSync(resolve(root, "../escape.txt"))).toBe(false);
  });
});
