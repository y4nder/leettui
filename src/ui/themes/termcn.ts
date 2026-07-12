import type { Theme } from "@/ui/themes/index";

// Themes imported from the termcn OpenTUI registry (github.com/shadcn-labs/termcn,
// `public/r/opentui/theme-*.json`). termcn describes every theme with the same flat
// 23-token `ColorTokens` shape; we only read the 13 tokens below. `fromTermcn` maps
// that shape onto leettui's richer `Theme` interface (src/ui/themes/index.ts).
//
// Mapping was calibrated so the four original hand-tuned presets read the same after
// the switch. termcn's `background` sits at leettui's *surface* level, so `bg`/`surface`
// collapse to one flat level and `muted` serves the popup/alt/status surfaces.
export interface TermcnColors {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
  mutedForeground: string;
  selection: string;
  border: string;
  focusRing: string;
}

export function fromTermcn(c: TermcnColors): Theme {
  return {
    // Difficulty ← semantic feedback colors
    easy: c.success,
    medium: c.warning,
    hard: c.error,

    // Per-question status
    accepted: c.success,
    attempted: c.warning,
    locked: c.mutedForeground,

    // Borders
    border: c.border,
    borderFocused: c.focusRing,

    // Surfaces. termcn has only two dependable levels: `background` and the darker/
    // low-saturation `muted`. We deliberately do NOT use `selection` for the row
    // highlight — many termcn themes set `selection` == `primary`, which would make the
    // selected-row text (fgAccent == primary) the same color as its background. Using the
    // muted surface for the highlight keeps the bright accent/fg text readable on every
    // theme, at the cost of a subtler (rather than vivid) highlight band.
    bg: c.background,
    bgHighlight: c.muted,
    bgPopup: c.background,
    // `surface` backs the *unfocused* panel's selected row. Use `muted` (not
    // `background`) so that selection still shows a highlight band; focused vs unfocused
    // is then distinguished by the foreground (fgAccent vs mutedAccent) and border.
    surface: c.muted,
    surfaceAlt: c.muted,

    // Foreground
    fg: c.foreground,
    fgDim: c.mutedForeground,
    fgAccent: c.primary,
    subtle: c.mutedForeground,
    accent: c.primary,
    // The unfocused selected-row / markdown-bullet foreground. termcn's `secondary` is
    // unreliable here — some themes make it a bright accent, others a near-background
    // surface tint that's illegible on `surface`. `mutedForeground` is purpose-built as
    // legible secondary text, so it always reads (dimmer than the focused `fgAccent`).
    mutedAccent: c.mutedForeground,

    // Status / feedback
    success: c.success,
    warn: c.warning,
    error: c.error,
    info: c.info,

    // Status bar
    statusBar: c.muted,
    statusBarFg: c.foreground,
  };
}

// Curated palettes, transcribed verbatim from the termcn registry. The first four
// re-derive the original preset names (kept as leettui keys — note termcn's file for
// rose-pine is `rosepine` — for config compatibility); the rest are new imports.
export const TERMCN_PALETTES: Record<string, TermcnColors> = {
  "tokyo-night": {
    background: "#24283B",
    foreground: "#C0CAF5",
    primary: "#7AA2F7",
    secondary: "#BB9AF7",
    success: "#9ECE6A",
    warning: "#E0AF68",
    error: "#F7768E",
    info: "#7DCFFF",
    muted: "#1F2335",
    mutedForeground: "#565F89",
    selection: "#364A82",
    border: "#3B4261",
    focusRing: "#7AA2F7",
  },
  catppuccin: {
    background: "#1E1E2E",
    foreground: "#CDD6F4",
    primary: "#CBA6F7",
    secondary: "#89B4FA",
    success: "#A6E3A1",
    warning: "#F9E2AF",
    error: "#F38BA8",
    info: "#89B4FA",
    muted: "#313244",
    mutedForeground: "#6C7086",
    selection: "#313244",
    border: "#45475A",
    focusRing: "#CBA6F7",
  },
  "rose-pine": {
    background: "#191724",
    foreground: "#e0def4",
    primary: "#9ccfd8",
    secondary: "#262330",
    success: "#31748f",
    warning: "#f6c177",
    error: "#eb6f92",
    info: "#9ccfd8",
    muted: "#100f18",
    mutedForeground: "#6e6a86",
    selection: "#9ccfd8",
    border: "#6e6a86",
    focusRing: "#31748f",
  },
  nord: {
    background: "#2E3440",
    foreground: "#ECEFF4",
    primary: "#88C0D0",
    secondary: "#4C566A",
    success: "#A3BE8C",
    warning: "#EBCB8B",
    error: "#BF616A",
    info: "#5E81AC",
    muted: "#3B4252",
    mutedForeground: "#4C566A",
    selection: "#3B4252",
    border: "#4C566A",
    focusRing: "#88C0D0",
  },
  dracula: {
    background: "#282A36",
    foreground: "#F8F8F2",
    primary: "#BD93F9",
    secondary: "#6272A4",
    success: "#50FA7B",
    warning: "#F1FA8C",
    error: "#FF5555",
    info: "#8BE9FD",
    muted: "#44475A",
    mutedForeground: "#6272A4",
    selection: "#44475A",
    border: "#6272A4",
    focusRing: "#BD93F9",
  },
  gruvbox: {
    background: "#282828",
    foreground: "#ebdbb2",
    primary: "#83a598",
    secondary: "#32302f",
    success: "#b8bb26",
    warning: "#fabd2f",
    error: "#fb4934",
    info: "#d3869b",
    muted: "#1d2021",
    mutedForeground: "#928374",
    selection: "#83a598",
    border: "#928374",
    focusRing: "#fb4934",
  },
  everforest: {
    background: "#2d353b",
    foreground: "#d3c6aa",
    primary: "#a7c080",
    secondary: "#373e44",
    success: "#a7c080",
    warning: "#e69875",
    error: "#e67e80",
    info: "#83c092",
    muted: "#1f252a",
    mutedForeground: "#7a8478",
    selection: "#a7c080",
    border: "#7a8478",
    focusRing: "#d699b6",
  },
  kanagawa: {
    background: "#1f1f28",
    foreground: "#dcd7ba",
    primary: "#7e9cd8",
    secondary: "#292a3f",
    success: "#98bb6c",
    warning: "#d7a657",
    error: "#e82424",
    info: "#76946a",
    muted: "#16161f",
    mutedForeground: "#727169",
    selection: "#7e9cd8",
    border: "#727169",
    focusRing: "#957fbb",
  },
  "one-dark": {
    background: "#282C34",
    foreground: "#ABB2BF",
    primary: "#61AFEF",
    secondary: "#C678DD",
    success: "#98C379",
    warning: "#E5C07B",
    error: "#E06C75",
    info: "#56B6C2",
    muted: "#3E4451",
    mutedForeground: "#5C6370",
    selection: "#3E4451",
    border: "#4B5263",
    focusRing: "#61AFEF",
  },
  solarized: {
    background: "#002B36",
    foreground: "#839496",
    primary: "#268BD2",
    secondary: "#2AA198",
    success: "#859900",
    warning: "#B58900",
    error: "#DC322F",
    info: "#2AA198",
    muted: "#073642",
    mutedForeground: "#586E75",
    selection: "#073642",
    border: "#586E75",
    focusRing: "#268BD2",
  },
  ayu: {
    background: "#0f1419",
    foreground: "#d6dae0",
    primary: "#3fb7e3",
    secondary: "#242a33",
    success: "#78d05c",
    warning: "#e4a75c",
    error: "#f58572",
    info: "#66c6f1",
    muted: "#1e2229",
    mutedForeground: "#5a6673",
    selection: "#3fb7e3",
    border: "#5a6673",
    focusRing: "#3fb7e3",
  },
  monokai: {
    background: "#272822",
    foreground: "#F8F8F2",
    primary: "#A6E22E",
    secondary: "#66D9E8",
    success: "#A6E22E",
    warning: "#E6DB74",
    error: "#F92672",
    info: "#66D9E8",
    muted: "#3E3D32",
    mutedForeground: "#75715E",
    selection: "#49483E",
    border: "#75715E",
    focusRing: "#A6E22E",
  },
  nightowl: {
    background: "#011627",
    foreground: "#d6deeb",
    primary: "#82aaff",
    secondary: "#021a2b",
    success: "#c5e478",
    warning: "#ecc48d",
    error: "#ef5350",
    info: "#82aaff",
    muted: "#010c15",
    mutedForeground: "#637777",
    selection: "#82aaff",
    border: "#637777",
    focusRing: "#c792ea",
  },
  "catppuccin-macchiato": {
    background: "#24273a",
    foreground: "#cad3f5",
    primary: "#8aadf4",
    secondary: "#363a4f",
    success: "#a6da95",
    warning: "#eed49f",
    error: "#ed8796",
    info: "#8bd5ca",
    muted: "#1b1e2b",
    mutedForeground: "#939ab7",
    selection: "#8aadf4",
    border: "#939ab7",
    focusRing: "#c6a0f6",
  },
  github: {
    background: "#0d1117",
    foreground: "#c9d1d9",
    primary: "#58a6ff",
    secondary: "#21262d",
    success: "#3fb950",
    warning: "#e3b341",
    error: "#f85149",
    info: "#d29922",
    muted: "#161b22",
    mutedForeground: "#8b949e",
    selection: "#58a6ff",
    border: "#30363d",
    focusRing: "#58a6ff",
  },
  vesper: {
    background: "#101010",
    foreground: "#ffffff",
    primary: "#ffc799",
    secondary: "#181818",
    success: "#99ffe4",
    warning: "#ffc799",
    error: "#ff8080",
    info: "#ffc799",
    muted: "#080808",
    mutedForeground: "#8b8b8b",
    selection: "#ffc799",
    border: "#8b8b8b",
    focusRing: "#a0a0a0",
  },
  synthwave84: {
    background: "#262335",
    foreground: "#ffffff",
    primary: "#36f9f6",
    secondary: "#35334a",
    success: "#72f1b8",
    warning: "#fede5d",
    error: "#fe4450",
    info: "#ff8b39",
    muted: "#1a1a24",
    mutedForeground: "#848bbd",
    selection: "#36f9f6",
    border: "#848bbd",
    focusRing: "#ff7edb",
  },
};

// Order preserved from TERMCN_PALETTES insertion (originals first, then imports).
export const TERMCN_NAMES = Object.keys(TERMCN_PALETTES);

export const TERMCN_PRESETS: Record<string, Theme> = Object.fromEntries(
  Object.entries(TERMCN_PALETTES).map(([name, palette]) => [name, fromTermcn(palette)]),
);
