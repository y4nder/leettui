// A "system" theme that defers to the terminal's own palette via OpenTUI's
// RGBA helpers. `defaultForeground/Background` emit SGR 39 / 49 — honoring
// whatever foreground/background the terminal has configured. `fromIndex(n)`
// emits indexed-color ANSI so the terminal's palette overrides for that slot
// stay active even if the user retints their colorscheme.
//
// Rebuilt on every resolve so that, if `renderer.on("palette", …)` fires after
// a terminal-theme change, we can re-derive without stale captures.

import { RGBA } from "@opentui/core";
import type { Theme } from "@/ui/themes/index";

export function buildSystemTheme(): Theme {
  return {
    // Difficulty — keep semantic ANSI slots so a green/yellow/red palette still reads.
    easy: RGBA.fromIndex(2),
    medium: RGBA.fromIndex(3),
    hard: RGBA.fromIndex(1),

    accepted: RGBA.fromIndex(2),
    attempted: RGBA.fromIndex(3),
    locked: RGBA.fromIndex(8),

    border: RGBA.fromIndex(8),
    borderFocused: RGBA.fromIndex(4),

    // Surfaces defer to the terminal background. The selected-row highlights
    // (bgHighlight = focused, surface = unfocused) use bright-black (index 8) rather
    // than black (index 0): index 0 is ~equal to a dark terminal's background, so the
    // selection was invisible; index 8 is the conventional selection gray and stands
    // out against the default background in both light and dark terminals.
    bg: RGBA.defaultBackground(),
    bgHighlight: RGBA.fromIndex(8),
    bgPopup: RGBA.defaultBackground(),
    surface: RGBA.fromIndex(8),
    surfaceAlt: RGBA.defaultBackground(),

    fg: RGBA.defaultForeground(),
    fgDim: RGBA.fromIndex(8),
    fgAccent: RGBA.fromIndex(4),
    subtle: RGBA.fromIndex(8),
    accent: RGBA.fromIndex(4),
    mutedAccent: RGBA.fromIndex(12),

    success: RGBA.fromIndex(2),
    warn: RGBA.fromIndex(3),
    error: RGBA.fromIndex(1),
    info: RGBA.fromIndex(6),

    statusBar: RGBA.fromIndex(0),
    statusBarFg: RGBA.defaultForeground(),
  };
}
