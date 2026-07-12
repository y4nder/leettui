import {
  resolveTheme,
  listThemeNames as listPresetNames,
  type Theme,
  type ThemeColor,
} from "@/ui/themes";
import { useAppStore } from "@/ui/store";
import { persistThemeName } from "@/config";

const DEFAULT_NAME = "tokyo-night";

let _currentName: string = DEFAULT_NAME;
let _currentTheme: Theme = resolveTheme();

// Proxy so every colors.xxx read is always live — no stale captures from module init order
export const colors: Theme = new Proxy({} as Theme, {
  get(_, key) {
    return _currentTheme[key as keyof Theme];
  },
});

interface SetThemeOpts {
  persist?: boolean;
}

export function setTheme(name?: string, opts: SetThemeOpts = {}): void {
  const resolved = name ?? DEFAULT_NAME;
  _currentTheme = resolveTheme(resolved);
  _currentName = resolved;
  if (opts.persist) {
    try {
      persistThemeName(resolved);
    } catch (err) {
      // Persistence is best-effort; surface the failure but don't crash the UI.
      console.error("Failed to persist theme:", err);
    }
  }
  try {
    useAppStore.getState().bumpThemeVersion();
  } catch {
    // store not yet initialized (called during module bootstrap)
  }
}

export function getCurrentThemeName(): string {
  return _currentName;
}

export function listThemeNames(): string[] {
  return listPresetNames();
}

export function cycleTheme(delta: 1 | -1): void {
  const names = listThemeNames();
  const idx = Math.max(0, names.indexOf(_currentName));
  const next = (idx + delta + names.length) % names.length;
  setTheme(names[next], { persist: true });
}

// Called by the palette listener when the terminal palette changes. Rebuilds
// the system theme so RGBA snapshots stay aligned with the new terminal state.
// No-op for non-system themes.
export function rebuildSystemTheme(): void {
  if (_currentName !== "system") return;
  _currentTheme = resolveTheme("system");
  try {
    useAppStore.getState().bumpThemeVersion();
  } catch {
    // store not yet initialized
  }
}

export function difficultyColor(difficulty: string): ThemeColor {
  switch (difficulty) {
    case "Easy":
      return _currentTheme.easy;
    case "Medium":
      return _currentTheme.medium;
    case "Hard":
      return _currentTheme.hard;
    default:
      return _currentTheme.fg;
  }
}

export function statusIcon(status: string | null): string {
  switch (status) {
    case "ac":
      return "✓";
    case "notac":
      return "✗";
    default:
      return " ";
  }
}

export function statusColor(status: string | null): ThemeColor {
  switch (status) {
    case "ac":
      return _currentTheme.accepted;
    case "notac":
      return _currentTheme.attempted;
    default:
      return _currentTheme.fgDim;
  }
}
