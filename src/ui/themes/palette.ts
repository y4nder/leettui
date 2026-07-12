import type { Theme } from "@/ui/themes/index";

// A `Palette` is the compact, human-authored form of a theme: the ~13 semantic color
// roles a colorscheme actually defines (background, foreground, an accent, the
// feedback colors, a muted surface, a selection tint). `fromPalette` expands one into
// leettui's fuller 27-token `Theme`, centralizing the surface/foreground derivation so
// a new theme is just its source colors — no need to hand-pick all 27 slots.
//
// The role set (and the color values of the presets that use it) were referenced from
// the termcn theme documentation (https://www.termcn.dev/docs/themes/opentui), adapted
// to how leettui renders lists/popups.
export interface Palette {
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

export function fromPalette(c: Palette): Theme {
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

    // Surfaces. A palette gives two dependable levels — `background` and the
    // darker/low-saturation `muted`. The selected-row highlights (bgHighlight =
    // focused, surface = unfocused) use `muted` rather than `selection`: many
    // colorschemes set selection == primary, which would make the selected-row text
    // (fgAccent == primary) the same color as its background.
    bg: c.background,
    bgHighlight: c.muted,
    bgPopup: c.background,
    surface: c.muted,
    surfaceAlt: c.muted,

    // Foreground
    fg: c.foreground,
    fgDim: c.mutedForeground,
    fgAccent: c.primary,
    subtle: c.mutedForeground,
    accent: c.primary,
    // Unfocused selected-row / markdown-bullet foreground. `secondary` is unreliable
    // here (some schemes make it a bright accent, others a near-background tint that's
    // illegible on `surface`), so use the purpose-built legible `mutedForeground` —
    // dimmer than the focused `fgAccent`, but always readable.
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
