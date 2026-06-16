import { invoke } from "@tauri-apps/api/core";

export async function safeInvoke<T>(command: string, args?: Record<string, unknown>, fallback?: () => T | Promise<T>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (fallback) return await fallback();
    throw error;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
