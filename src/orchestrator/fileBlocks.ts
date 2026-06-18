// Pure parsing of agent output into writable workspace files.
//
// In implementation mode an agent only "writes code" if its message contains a
// `Файл: путь` announcement (or a fenced-info path) followed by a fenced code
// block. This module isolates that parsing so it can be unit-tested without the
// browser/Tauri store, which is how we prove agents are not running idle.

export interface WorkspaceFileBlock {
  path: string;
  content: string;
}

export function isWorkspaceFilePath(value: string): boolean {
  const path = value.trim().replace(/^[`'"]+|[`'"]+$/g, "");
  if (!path || path.length > 200) return false;
  if (path.includes("..") || path.includes(":") || path.startsWith("/") || path.startsWith("\\")) return false;
  // A real file path either has an extension or is nested in a folder.
  return /\.[A-Za-z0-9]+$/.test(path) || path.includes("/");
}

// Models announce a file in several shapes. Strip markdown decoration first so
// `Файл:`, `**Файл:**`, `- file:`, `### src/x.ts` and bare paths all match.
export function matchAnnouncedPath(line: string): string | undefined {
  const clean = line.replace(/^[\s>#-]+/, "").replace(/[*_]/g, "").trim();
  const labelled = clean.match(/^(?:файл|file|path|создать|обновить|create|update)\s*[:：-]?\s*`?([^`\s]+)`?/i);
  if (labelled?.[1] && isWorkspaceFilePath(labelled[1])) return labelled[1].trim();

  const bare = clean.match(/^`?([A-Za-z0-9._\-/]+)`?$/);
  if (bare?.[1] && isWorkspaceFilePath(bare[1])) return bare[1].trim();

  return undefined;
}

// Some models put the path into the fence info string, e.g. ```ts src/foo.ts
export function matchFenceInfoPath(fenceLine: string): string | undefined {
  const info = fenceLine.trimStart().replace(/^```+/, "").trim();
  if (!info) return undefined;
  for (const token of info.split(/\s+/)) {
    if (isWorkspaceFilePath(token)) return token.replace(/^[`'"]+|[`'"]+$/g, "").trim();
  }
  return undefined;
}

export function extractWorkspaceFileBlocks(text: string): WorkspaceFileBlock[] {
  const files: WorkspaceFileBlock[] = [];
  const lines = text.split(/\r?\n/);
  let pendingPath: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trimStart().startsWith("```")) {
      const announced = matchAnnouncedPath(line);
      // Keep an earlier announced path if this line is just prose between it and
      // the fence; only replace it when this line itself names a file.
      if (announced) pendingPath = announced;
      continue;
    }

    // Opening fence: resolve the path from the preceding announcement or the
    // fence info string, then consume until the closing fence.
    const path = pendingPath ?? matchFenceInfoPath(line);
    pendingPath = undefined;
    const content: string[] = [];
    index += 1;
    while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
      content.push(lines[index]);
      index += 1;
    }

    if (path && content.length) {
      files.push({ path, content: content.join("\n") + "\n" });
    }
  }

  return files;
}

export interface ImplementationOutcome {
  files: WorkspaceFileBlock[];
  wroteCode: boolean;
}

// Diagnostic helper: did this implementation-mode response actually contain
// writable code, or did the agent just talk (run idle)?
export function describeImplementationOutput(text: string): ImplementationOutcome {
  const files = extractWorkspaceFileBlocks(text);
  return { files, wroteCode: files.length > 0 };
}
