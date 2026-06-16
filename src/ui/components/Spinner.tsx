import { useEffect, useState } from "react";

// Braille dot-cycle frames — the same family the headless CLI's `startStatus`
// spinner uses, so the in-TUI and console "working…" affordances feel related.
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Monotonic frame counter driving the sync animations (the spinner glyph and the
// indeterminate `sweepBar`). One shared cadence so they advance in lockstep. The
// timer is local to the calling component, so it only ticks while that component
// is mounted (i.e. while a sync is in flight).
export function useTick(intervalMs = 80): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}
