import type { RGBA } from "@opentui/core";
import { tokyoNight } from "./tokyo-night";
import { catppuccin } from "./catppuccin";
import { rosePine } from "./rose-pine";
import { nord } from "./nord";
import { buildSystemTheme } from "./system";

export type ThemeColor = string | RGBA;

export interface Theme {
  // Difficulty (LeetCode-specific)
  easy: ThemeColor;
  medium: ThemeColor;
  hard: ThemeColor;

  // Per-question status
  accepted: ThemeColor;
  attempted: ThemeColor;
  locked: ThemeColor;

  // Borders
  border: ThemeColor;
  borderFocused: ThemeColor;

  // Surfaces
  bg: ThemeColor;
  bgHighlight: ThemeColor;
  bgPopup: ThemeColor;
  surface: ThemeColor;
  surfaceAlt: ThemeColor;

  // Foreground
  fg: ThemeColor;
  fgDim: ThemeColor;
  fgAccent: ThemeColor;
  subtle: ThemeColor;
  accent: ThemeColor;
  mutedAccent: ThemeColor;

  // Status / feedback (semantic, not difficulty)
  success: ThemeColor;
  warn: ThemeColor;
  error: ThemeColor;
  info: ThemeColor;

  // Status bar
  statusBar: ThemeColor;
  statusBarFg: ThemeColor;
}

// `system` is built lazily because its RGBA values must be constructed at
// runtime (after `@opentui/core` is loaded). The build is cheap, so we just
// re-invoke on each resolve.
export const PRESET_NAMES = ["tokyo-night", "catppuccin", "rose-pine", "nord", "system"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

const STATIC_PRESETS: Partial<Record<PresetName, Theme>> = {
  "tokyo-night": tokyoNight,
  catppuccin: catppuccin,
  "rose-pine": rosePine,
  nord: nord,
};

const DEFAULT: PresetName = "tokyo-night";

export function listThemeNames(): string[] {
  return [...PRESET_NAMES];
}

export function resolveTheme(name?: string): Theme {
  if (!name) return STATIC_PRESETS[DEFAULT]!;
  if (name === "system") return buildSystemTheme();
  const preset = STATIC_PRESETS[name as PresetName];
  if (preset) return preset;
  console.warn(
    `Unknown theme "${name}". Available: ${PRESET_NAMES.join(", ")}. Falling back to ${DEFAULT}.`,
  );
  return STATIC_PRESETS[DEFAULT]!;
}
