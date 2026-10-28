import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

export type Theme = "system" | "light" | "dark";

/**
 * Applies the chosen theme to the page and to the native window, so the vibrancy behind the
 * sidebar matches the page colors even when the theme differs from the system appearance.
 */
export function useTheme(theme: Theme): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    void getCurrentWindow().setTheme(theme === "system" ? null : theme);
  }, [theme]);
}
