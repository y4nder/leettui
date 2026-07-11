import { useReducer, useRef } from "react";
import { followCursor, scrollViewport } from "./listWindow";

// Windowing for the cursor-driven lists, superseding the old useScrollOffset hook with
// a wheel-scrollable viewport. Two inputs move the window:
// - Keyboard (j/k, gg/G, Ctrl+d/u): the cursor moves and the offset FOLLOWS it with
//   Neovim-style scrolloff (followCursor) — unchanged from useScrollOffset.
// - Wheel (scrollBy): the OFFSET moves and the cursor follows only when it would leave
//   the new window's comfort zone (variant "b" — the highlight stays visible, so a
//   keyboard move after wheeling continues from where you're looking, no view jump).
// The offset lives in a ref so direction is preserved across renders; scrollBy forces
// a repaint itself since a wheel tick often changes no React state at all.

export interface ScrollableList {
  scrollOffset: number;
  // Move the viewport by delta rows (wheel). Returns the cursor index the caller must
  // re-select to keep the highlight in the comfort zone, or null when no cursor change
  // is needed (also when the viewport can't move — list fits, or already at an edge).
  scrollBy: (deltaRows: number) => number | null;
}

export function useScrollableList(
  selectedIndex: number,
  count: number,
  visibleCount: number,
): ScrollableList {
  const offsetRef = useRef(0);
  // Latest render args, readable inside the event-time scrollBy closure.
  const argsRef = useRef({ selectedIndex, count, visibleCount });
  argsRef.current = { selectedIndex, count, visibleCount };
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Render-time follow: any cursor/count change (keyboard move, filter, resize) pulls
  // the window along; a wheel-set offset holds because scrollBy's returned cursor sits
  // inside the no-scroll zone (the invariant listWindow.test.ts pins down).
  offsetRef.current = followCursor(offsetRef.current, selectedIndex, count, visibleCount);

  const scrollBy = (deltaRows: number): number | null => {
    const args = argsRef.current;
    const next = scrollViewport({
      offset: offsetRef.current,
      cursor: args.selectedIndex,
      count: args.count,
      visibleCount: args.visibleCount,
      delta: deltaRows,
    });
    if (next.offset === offsetRef.current) return null;
    offsetRef.current = next.offset;
    force();
    return next.cursor === args.selectedIndex ? null : next.cursor;
  };

  return { scrollOffset: offsetRef.current, scrollBy };
}
