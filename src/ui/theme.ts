import { resolveTheme, type Theme } from "./themes";

const _colors: Theme = { ...resolveTheme() };

export const colors: Theme = _colors;

export function setTheme(name?: string): void {
  Object.assign(_colors, resolveTheme(name));
}

export function difficultyColor(difficulty: string): string {
  switch (difficulty) {
    case "Easy":
      return colors.easy;
    case "Medium":
      return colors.medium;
    case "Hard":
      return colors.hard;
    default:
      return colors.fg;
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
      return colors.accepted;
    case "notac":
      return colors.attempted;
    default:
      return colors.fgDim;
  }
}
