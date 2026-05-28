import { resolveTheme, type Theme } from "./themes";
import { useAppStore } from "./store";

let _currentTheme: Theme = resolveTheme();

// Proxy so every colors.xxx read is always live — no stale captures from module init order
export const colors: Theme = new Proxy({} as Theme, {
  get(_, key) {
    return _currentTheme[key as keyof Theme];
  },
});

export function setTheme(name?: string): void {
  _currentTheme = resolveTheme(name);
  try {
    useAppStore.getState().bumpThemeVersion();
  } catch {
    // store not yet initialized (called during module bootstrap)
  }
}

export function difficultyColor(difficulty: string): string {
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

export function statusColor(status: string | null): string {
  switch (status) {
    case "ac":
      return _currentTheme.accepted;
    case "notac":
      return _currentTheme.attempted;
    default:
      return _currentTheme.fgDim;
  }
}
