import { useEffect, useState } from "react";

// Monotonic frame counter driving the indeterminate `sweepBar` phase (the spinner
// glyph itself now comes from `opentui-spinner`). The timer is local to the calling
// component, so it only ticks while that component is mounted (i.e. while a sync is
// in flight).
export function useTick(intervalMs = 80): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}
