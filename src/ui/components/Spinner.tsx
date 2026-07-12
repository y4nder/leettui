import { useEffect, useState } from "react";

import type { ThemeColor } from "@/ui/themes";

// Monotonic frame counter driving the indeterminate `sweepBar` phase and the
// `TextSpinner` glyph. The timer is local to the calling component, so it only
// ticks while that component is mounted (i.e. while a sync/load is in flight).
export function useTick(intervalMs = 80): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}

// The animated "star" glyph frames (from cli-spinners' `star`), rendered as a
// plain `<text>` rather than the third-party `<spinner>` intrinsic. `<spinner>`
// is registered via `opentui-spinner`'s `extend()` side-effect import, which Bun
// drops under `--compile` + minify — so `<spinner>` is an "Unknown component
// type" in the shipped binary (the black-screen-after-splash bug). `<text>` is a
// built-in intrinsic that always renders, so this is compile-safe everywhere.
const STAR_FRAMES = ["✶", "✸", "✹", "✺", "✹", "✷"];

interface TextSpinnerProps {
  color: ThemeColor;
}

export function TextSpinner({ color }: TextSpinnerProps) {
  const tick = useTick();
  const frame = STAR_FRAMES[tick % STAR_FRAMES.length];
  return <text fg={color}>{frame}</text>;
}
