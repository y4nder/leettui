// Terminal palette detection + subscription.
//
// Called once at boot from `index.tsx`. Two responsibilities:
//
// 1. Warm the renderer's palette cache by calling `getPalette()`. This also
//    confirms whether the terminal supports OSC palette queries — if not, the
//    promise rejects (or times out) and we silently fall back.
// 2. Subscribe to subsequent `palette` events so the system theme can
//    re-derive whenever the user switches their terminal colorscheme.
//
// The system theme uses `RGBA.defaultForeground()` / `defaultBackground()` /
// `fromIndex(n)` — these emit palette-relative ANSI sequences and don't need
// the snapshot themselves, but listening for changes lets us bump
// `themeVersion` and trigger a rerender so any color decisions cached in React
// state pick up new values.

import { CliRenderEvents, type CliRenderer } from "@opentui/core";
import { rebuildSystemTheme } from "@/ui/theme";

export function attachPaletteListener(renderer: CliRenderer): void {
  // Warm the cache. Failures are expected on terminals without OSC support;
  // they're not actionable, so we swallow.
  renderer.getPalette({ size: 16 }).catch(() => {});

  renderer.on(CliRenderEvents.PALETTE, () => {
    rebuildSystemTheme();
  });
}
