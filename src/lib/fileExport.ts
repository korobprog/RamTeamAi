import { isTauriRuntime, safeInvoke } from "./tauri";

type ExportExtension = "txt" | "md";

const EXPORT_FILTERS: Record<ExportExtension, Array<{ name: string; extensions: string[] }>> = {
  txt: [{ name: "Text", extensions: ["txt"] }],
  md: [{ name: "Markdown", extensions: ["md"] }],
};

export async function exportTextFile(
  suggestedName: string,
  content: string,
  extension: ExportExtension,
): Promise<string | undefined> {
  const normalizedName = suggestedName.endsWith(`.${extension}`) ? suggestedName : `${suggestedName}.${extension}`;

  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
      title: `Сохранить ${extension.toUpperCase()}-отчёт`,
      defaultPath: normalizedName,
      filters: EXPORT_FILTERS[extension],
    });
    const filePath = Array.isArray(selected) ? selected[0] : selected ?? undefined;
    if (!filePath) return undefined;

    await safeInvoke<void>("write_text_file_to_path", {
      path: filePath,
      content,
    });
    return filePath;
  }

  if (typeof document === "undefined") {
    throw new Error("Document is unavailable for file export");
  }

  const blob = new Blob([content], {
    type: extension === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = normalizedName;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return normalizedName;
}
