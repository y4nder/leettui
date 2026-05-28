export const colors = {
  easy: "#00b8a3",
  medium: "#ffc01e",
  hard: "#ff375f",

  accepted: "#00b8a3",
  attempted: "#ffc01e",
  locked: "#666666",

  border: "#5f87af",
  borderFocused: "#87afff",

  bg: "#1a1b26",
  bgHighlight: "#292e42",
  bgPopup: "#1e2030",

  fg: "#c0caf5",
  fgDim: "#565f89",
  fgAccent: "#7aa2f7",

  statusBar: "#16161e",
  statusBarFg: "#a9b1d6",
};

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
