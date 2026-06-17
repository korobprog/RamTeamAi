import { open } from "@tauri-apps/plugin-dialog";
import { isTauriRuntime, safeInvoke } from "../lib/tauri";
import type { WorkspaceInitResult } from "../types";

const WORKSPACE_FILES = ["MEMORY.md", "PLAN.md", "docs/.gitkeep", "src/.gitkeep", "tests/.gitkeep", "assets/.gitkeep"];
const WEB_WORKSPACE_DB_NAME = "RamTeamAi.workspace.v1";
const WEB_WORKSPACE_STORE = "handles";
const WEB_WORKSPACE_HANDLE_KEY = "workspace";

type WebPermissionMode = "read" | "readwrite";
type WebDirectoryPickerOptions = {
  id?: string;
  mode?: WebPermissionMode;
  startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
};
type WebWritableFileStream = {
  write: (data: string | Blob | BufferSource) => Promise<void>;
  close: () => Promise<void>;
};
type WebFileHandle = {
  createWritable: () => Promise<WebWritableFileStream>;
};
type WebDirectoryHandle = {
  kind: "directory";
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<WebDirectoryHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WebFileHandle>;
  queryPermission?: (descriptor?: { mode?: WebPermissionMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: WebPermissionMode }) => Promise<PermissionState>;
};
type WebDirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: WebDirectoryPickerOptions) => Promise<WebDirectoryHandle>;
};

let webDirectoryHandle: WebDirectoryHandle | undefined;

export interface WebWorkspaceWriteResult {
  path: string;
  created: boolean;
  overwritten: boolean;
}

export interface WorkspaceWriteResult {
  path: string;
  created: boolean;
  overwritten: boolean;
}

export async function pickWorkspaceFolder(currentPath?: string): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return pickWebWorkspaceFolder(currentPath);
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "Выберите рабочую папку RamTeamAi",
    defaultPath: currentPath,
  });

  if (Array.isArray(selected)) return selected[0];
  return selected ?? undefined;
}

export async function clearStoredWebWorkspaceFolder(): Promise<void> {
  webDirectoryHandle = undefined;

  if (typeof window === "undefined" || !("indexedDB" in window)) return;

  try {
    const db = await openWebWorkspaceDb();
    const transaction = db.transaction(WEB_WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WEB_WORKSPACE_STORE).delete(WEB_WORKSPACE_HANDLE_KEY);
    await waitForTransaction(transaction);
    db.close();
  } catch {
    // IndexedDB is best-effort here; clearing localStorage in the store is enough for the UI.
  }
}

export async function hasWebWorkspaceFolder(): Promise<boolean> {
  if (isTauriRuntime()) return false;
  const handle = await getWritableWebWorkspaceHandle();
  return Boolean(handle);
}

export async function initWorkspaceFiles(rootPath: string): Promise<WorkspaceInitResult> {
  if (!isTauriRuntime()) {
    const handle = await getWritableWebWorkspaceHandle();
    if (handle) return initWebWorkspaceFiles(handle);
    return getWebWorkspaceFallback(rootPath);
  }

  return safeInvoke<WorkspaceInitResult>("init_workspace", { rootPath });
}

export async function writeWorkspaceTextFile(
  rootPath: string,
  relativePath: string,
  content: string,
  options: { overwrite?: boolean } = {},
): Promise<WorkspaceWriteResult> {
  if (!isTauriRuntime()) {
    const handle = await getWritableWebWorkspaceHandle();
    if (!handle) throw new Error("Нет доступа на запись в выбранную web-папку. Выберите рабочую папку заново.");
    return writeWebFile(handle, relativePath, content, options);
  }

  return safeInvoke<WorkspaceWriteResult>("write_workspace_file", {
    rootPath,
    relativePath,
    content,
    overwrite: options.overwrite ?? true,
  });
}

export async function writeWebWorkspaceFile(
  relativePath: string,
  content: string,
  options: { overwrite?: boolean } = {},
): Promise<WebWorkspaceWriteResult | undefined> {
  if (isTauriRuntime()) return undefined;

  const handle = await getWritableWebWorkspaceHandle();
  if (!handle) return undefined;

  return writeWebFile(handle, relativePath, content, options);
}

async function pickWebWorkspaceFolder(currentPath?: string): Promise<string | undefined> {
  const picker = (window as WebDirectoryPickerWindow).showDirectoryPicker;

  if (typeof picker !== "function") {
    const folderLabel = await pickWebDirectoryWithInput();
    if (folderLabel) return folderLabel;

    const value = window.prompt("Путь к рабочей папке RamTeamAi", currentPath ?? "");
    return value?.trim() || undefined;
  }

  try {
    const handle = await picker.call(window, {
      id: "RamTeamAi-workspace",
      mode: "readwrite",
      startIn: "documents",
    });

    const allowed = await ensureWebDirectoryPermission(handle, "readwrite");
    if (!allowed) return undefined;

    webDirectoryHandle = handle;
    void saveWebDirectoryHandle(handle);
    return getWebWorkspaceLabel(handle);
  } catch (error) {
    if (isAbortError(error) || isSecurityError(error)) return undefined;

    try {
      const handle = await picker.call(window, { mode: "readwrite" });
      const allowed = await ensureWebDirectoryPermission(handle, "readwrite");
      if (!allowed) return undefined;

      webDirectoryHandle = handle;
      void saveWebDirectoryHandle(handle);
      return getWebWorkspaceLabel(handle);
    } catch (fallbackError) {
      if (isAbortError(fallbackError) || isSecurityError(fallbackError)) return undefined;

      const folderLabel = await pickWebDirectoryWithInput();
      if (folderLabel) return folderLabel;

      const value = window.prompt("Путь к рабочей папке RamTeamAi", currentPath ?? "");
      return value?.trim() || undefined;
    }
  }
}

function pickWebDirectoryWithInput(): Promise<string | undefined> {
  if (typeof document === "undefined") return Promise.resolve(undefined);

  const input = document.createElement("input");
  const supportsDirectory = "webkitdirectory" in input || "directory" in input;
  if (!supportsDirectory) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      resolve(value);
    };
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(undefined);
      }, 1500);
    };

    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";

    input.addEventListener("change", () => {
      const selectedFile = input.files?.[0] as (File & { webkitRelativePath?: string }) | undefined;
      const folderName = selectedFile?.webkitRelativePath?.split(/[\\/]/).filter(Boolean)[0];
      finish(folderName ? `web://${folderName}` : undefined);
    }, { once: true });
    input.addEventListener("cancel", () => finish(undefined), { once: true });
    window.addEventListener("focus", onFocus, { once: true });

    document.body.append(input);
    input.click();
  });
}

async function getWritableWebWorkspaceHandle(): Promise<WebDirectoryHandle | undefined> {
  const handle = await getWebWorkspaceHandle();
  if (!handle) return undefined;

  const allowed = await ensureWebDirectoryPermission(handle, "readwrite");
  return allowed ? handle : undefined;
}

async function getWebWorkspaceHandle(): Promise<WebDirectoryHandle | undefined> {
  if (webDirectoryHandle) return webDirectoryHandle;

  const stored = await loadWebDirectoryHandle();
  if (stored) webDirectoryHandle = stored;
  return webDirectoryHandle;
}

async function ensureWebDirectoryPermission(handle: WebDirectoryHandle, mode: WebPermissionMode): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;

  const descriptor = { mode };
  if ((await handle.queryPermission(descriptor)) === "granted") return true;
  return (await handle.requestPermission(descriptor)) === "granted";
}

async function initWebWorkspaceFiles(handle: WebDirectoryHandle): Promise<WorkspaceInitResult> {
  const files: string[] = [];
  const createdFiles: string[] = [];
  const createdAt = new Date().toISOString();

  for (const dir of ["docs", "src", "tests", "assets"]) {
    await handle.getDirectoryHandle(dir, { create: true });
    const file = `${dir}/.gitkeep`;
    const result = await writeWebFile(handle, file, "", { overwrite: false });
    files.push(result.path);
    if (result.created) createdFiles.push(result.path);
  }

  for (const [file, content] of [
    ["MEMORY.md", memoryTemplate(createdAt)],
    ["PLAN.md", planTemplate(createdAt)],
  ] as const) {
    const result = await writeWebFile(handle, file, content, { overwrite: false });
    files.push(result.path);
    if (result.created) createdFiles.push(result.path);
  }

  const existingFiles = files.filter((file) => !createdFiles.includes(file));

  return {
    rootPath: getWebWorkspaceLabel(handle),
    files,
    createdFiles,
    existingFiles,
    message: "Рабочая папка инициализирована через браузерный доступ к файловой системе.",
  };
}

async function writeWebFile(
  root: WebDirectoryHandle,
  relativePath: string,
  content: string,
  options: { overwrite?: boolean },
): Promise<WebWorkspaceWriteResult> {
  const parts = splitWebPath(relativePath);
  if (parts.length === 0) {
    throw new Error("Workspace file path is empty");
  }

  const fileName = parts.at(-1);
  if (!fileName) {
    throw new Error("Workspace file path is empty");
  }

  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(part, { create: true });
  }

  const existed = await webFileExists(directory, fileName);
  if (existed && options.overwrite === false) {
    return { path: parts.join("/"), created: false, overwritten: false };
  }

  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();

  return { path: parts.join("/"), created: !existed, overwritten: existed };
}

async function webFileExists(directory: WebDirectoryHandle, fileName: string): Promise<boolean> {
  try {
    await directory.getFileHandle(fileName, { create: false });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

function splitWebPath(path: string): string[] {
  const parts = path.split(/[\\/]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.includes(":"))) {
    throw new Error("Workspace file path is invalid");
  }
  return parts;
}

function getWebWorkspaceFallback(rootPath: string): WorkspaceInitResult {
  return {
    rootPath: rootPath || "web://RamTeamAi Projects",
    files: WORKSPACE_FILES,
    createdFiles: [],
    existingFiles: WORKSPACE_FILES,
    message: "В web-версии выберите папку через браузерный диалог. Без доступа к File System Access API запись на диск недоступна.",
  };
}

function getWebWorkspaceLabel(handle: WebDirectoryHandle): string {
  return `web://${handle.name || "workspace"}`;
}

function memoryTemplate(createdAt: string): string {
  return `# Memory

Память проекта для RamTeamAi.

## Контекст
- Цель проекта:
- Важные решения:
- Ограничения:
- Ссылки и источники:

## Журнал
- ${createdAt}: рабочая папка инициализирована командой init.
`;
}

function planTemplate(createdAt: string): string {
  return `# Plan

План проекта для RamTeamAi.

## Цель
-

## Задачи
- [ ] Описать задачу
- [ ] Собрать контекст
- [ ] Реализовать решение
- [ ] Проверить результат

## Следующий шаг
-

---
Создано: ${createdAt}
`;
}

function isWebDirectoryHandle(value: unknown): value is WebDirectoryHandle {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { kind?: unknown }).kind === "directory" &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { getDirectoryHandle?: unknown }).getDirectoryHandle === "function" &&
      typeof (value as { getFileHandle?: unknown }).getFileHandle === "function",
  );
}

async function saveWebDirectoryHandle(handle: WebDirectoryHandle): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;

  try {
    const db = await openWebWorkspaceDb();
    const transaction = db.transaction(WEB_WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WEB_WORKSPACE_STORE).put(handle, WEB_WORKSPACE_HANDLE_KEY);
    await waitForTransaction(transaction);
    db.close();
  } catch {
    // Some browsers do not allow FileSystemHandle structured cloning. The in-memory handle still works this session.
  }
}

async function loadWebDirectoryHandle(): Promise<WebDirectoryHandle | undefined> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return undefined;

  try {
    const db = await openWebWorkspaceDb();
    const transaction = db.transaction(WEB_WORKSPACE_STORE, "readonly");
    const value = await idbRequest<unknown>(transaction.objectStore(WEB_WORKSPACE_STORE).get(WEB_WORKSPACE_HANDLE_KEY));
    await waitForTransaction(transaction);
    db.close();
    return isWebDirectoryHandle(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function openWebWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(WEB_WORKSPACE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_WORKSPACE_STORE)) {
        request.result.createObjectStore(WEB_WORKSPACE_STORE);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "SecurityError";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}
