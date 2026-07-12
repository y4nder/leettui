import type { RGBA } from "@opentui/core";
import { tokyoNight } from "@/ui/themes/tokyo-night";
import { catppuccin } from "@/ui/themes/catppuccin";
import { rosePine } from "@/ui/themes/rose-pine";
import { nord } from "@/ui/themes/nord";
import { dracula } from "@/ui/themes/dracula";
import { gruvbox } from "@/ui/themes/gruvbox";
import { everforest } from "@/ui/themes/everforest";
import { kanagawa } from "@/ui/themes/kanagawa";
import { oneDark } from "@/ui/themes/one-dark";
import { solarized } from "@/ui/themes/solarized";
import { ayu } from "@/ui/themes/ayu";
import { monokai } from "@/ui/themes/monokai";
import { nightowl } from "@/ui/themes/nightowl";
import { catppuccinMacchiato } from "@/ui/themes/catppuccin-macchiato";
import { github } from "@/ui/themes/github";
import { vesper } from "@/ui/themes/vesper";
import { synthwave84 } from "@/ui/themes/synthwave84";
import { buildSystemTheme } from "@/ui/themes/system";

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

// Every static preset is expanded from a compact `Palette` via `fromPalette`
// (see `themes/palette.ts`) in its own file. `system` is built lazily because its RGBA
// values must be constructed at runtime (after `@opentui/core` is loaded). The build is
// cheap, so we just re-invoke on each resolve.
export const PRESET_NAMES = [
  "tokyo-night",
  "catppuccin",
  "rose-pine",
  "nord",
  "dracula",
  "gruvbox",
  "everforest",
  "kanagawa",
  "one-dark",
  "solarized",
  "ayu",
  "monokai",
  "nightowl",
  "catppuccin-macchiato",
  "github",
  "vesper",
  "synthwave84",
  "system",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

const STATIC_PRESETS: Record<string, Theme> = {
  "tokyo-night": tokyoNight,
  catppuccin,
  "rose-pine": rosePine,
  nord,
  dracula,
  gruvbox,
  everforest,
  kanagawa,
  "one-dark": oneDark,
  solarized,
  ayu,
  monokai,
  nightowl,
  "catppuccin-macchiato": catppuccinMacchiato,
  github,
  vesper,
  synthwave84,
};

const DEFAULT = "tokyo-night";

export function listThemeNames(): string[] {
  return [...PRESET_NAMES];
}

export function resolveTheme(name?: string): Theme {
  if (!name) return STATIC_PRESETS[DEFAULT]!;
  if (name === "system") return buildSystemTheme();
  const preset = STATIC_PRESETS[name];
  if (preset) return preset;
  console.warn(
    `Unknown theme "${name}". Available: ${PRESET_NAMES.join(", ")}. Falling back to ${DEFAULT}.`,
  );
  return STATIC_PRESETS[DEFAULT]!;
}
