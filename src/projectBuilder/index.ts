import type { BuildResult, PlanArtifact } from "../types";
import { safeInvoke } from "../lib/tauri";

export function previewProjectFiles(artifact: PlanArtifact): string[] {
  return ["src/providers/index.ts", "src/orchestrator/index.ts", "src/mcp/manager.ts", "src/projectBuilder/index.ts", "src-tauri/src/core/provider.rs", "src-tauri/src/core/orchestrator.rs", "src-tauri/src/core/project_builder.rs"].filter((file) => artifact.projectTree.includes(file.split("/")[1]) || file.includes("src-tauri"));
}

export async function buildProject(artifact: PlanArtifact, confirmed: boolean): Promise<BuildResult> {
  return safeInvoke<BuildResult>("build_project", { artifact, confirmed }, () => ({ rootPath: "./generated/Neurogate-project", files: previewProjectFiles(artifact), skipped: !confirmed, message: confirmed ? "Frontend fallback: дерево проекта подготовлено. В Tauri runtime Rust-команда запишет файлы на диск." : "Запись пропущена: нужно подтверждение пользователя." }));
}
