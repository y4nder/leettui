// A "system" theme that defers to the terminal's own palette via OpenTUI's
// RGBA helpers. `defaultForeground/Background` emit SGR 39 / 49 — honoring
// whatever foreground/background the terminal has configured. `fromIndex(n)`
// emits indexed-color ANSI so the terminal's palette overrides for that slot
// stay active even if the user retints their colorscheme.
//
// Rebuilt on every resolve so that, if `renderer.on("palette", …)` fires after
// a terminal-theme change, we can re-derive without stale captures.

import { RGBA } from "@opentui/core";
import type { Theme } from "./index";

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

    // Surfaces defer to the terminal background; highlight/popup use the
    // black/bright-black slots so they read regardless of light/dark mode.
    bg: RGBA.defaultBackground(),
    bgHighlight: RGBA.fromIndex(0),
    bgPopup: RGBA.defaultBackground(),
    surface: RGBA.fromIndex(0),
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
