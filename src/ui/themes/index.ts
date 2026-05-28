import { tokyoNight } from "./tokyo-night";
import { catppuccin } from "./catppuccin";

export interface Theme {
  easy: string;
  medium: string;
  hard: string;

  accepted: string;
  attempted: string;
  locked: string;

  border: string;
  borderFocused: string;

  bg: string;
  bgHighlight: string;
  bgPopup: string;

  fg: string;
  fgDim: string;
  fgAccent: string;

  statusBar: string;
  statusBarFg: string;
}

export const PRESETS: Record<string, Theme> = {
  "tokyo-night": tokyoNight,
  catppuccin: catppuccin,
};

const DEFAULT = "tokyo-night";

export function resolveTheme(name?: string): Theme {
  if (!name) return PRESETS[DEFAULT]!;
  const preset = PRESETS[name];
  if (preset) return preset;
  console.warn(
    `Unknown theme "${name}". Available: ${Object.keys(PRESETS).join(", ")}. Falling back to ${DEFAULT}.`
  );
  return PRESETS[DEFAULT]!;
}
