import { getScrollPageFraction } from "../config";
import { useAppStore } from "./store";

// Rows to move for a Ctrl+d/Ctrl+u jump, given the visible list height and the
// configured page fraction. Always ≥ 1 so a tiny viewport (or a tiny fraction)
// still moves, and floored since rows are sliced by whole index. The result is
// only a *delta* — moveQuestion/moveTopic still clamp the resulting index into
// range, so an oversized fraction can overshoot the list end but never index out
// of bounds. Pure, so both guarantees are unit-tested directly.
export function pageJumpRows(viewportRows: number, fraction: number): number {
  return Math.max(1, Math.floor(viewportRows * fraction));
}

// The live jump size: the current browse list viewport × the configured fraction.
// Read at command time (not subscribed) so a terminal resize or config reload is
// reflected on the next keypress.
export function currentPageJump(): number {
  return pageJumpRows(useAppStore.getState().listViewportRows, getScrollPageFraction());
}
