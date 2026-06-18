// Theme preference: "system" follows the OS (prefers-color-scheme), while
// "light"/"dark" force the palette regardless of the OS. The choice lives in the
// persisted app settings; applyTheme reflects it onto <html data-theme> which the
// CSS variable overrides in design/theme.css key off.

export type ThemePref = "system" | "light" | "dark" | "vibe";

const APP_SETTINGS_STORAGE_KEY = "RamTeamAi.app-settings.v1";

export function isThemePref(value: unknown): value is ThemePref {
  return value === "system" || value === "light" || value === "dark" || value === "vibe";
}

export function applyTheme(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

// Read the saved preference straight from localStorage so the theme can be
// applied before React renders, avoiding a light-to-dark flash on load.
export function readInitialThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { theme?: unknown };
    return isThemePref(parsed.theme) ? parsed.theme : "system";
  } catch {
    return "system";
  }
}
