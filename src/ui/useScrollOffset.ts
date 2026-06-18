import { useRef } from "react";

const SCROLLOFF = 5;

// Neovim-style scrolloff: the cursor keeps SCROLLOFF lines of context above/below
// before the window scrolls. Uses a ref so direction is preserved across renders.
export function useScrollOffset(
  selectedIndex: number,
  count: number,
  visibleCount: number,
): number {
  const ref = useRef(0);
  const so = Math.min(SCROLLOFF, Math.floor(visibleCount / 4));
  let next = Math.max(0, Math.min(ref.current, Math.max(0, count - visibleCount)));
  if (selectedIndex >= next + visibleCount - so) {
    next = selectedIndex - visibleCount + so + 1;
  }
  if (selectedIndex < next + so) {
    next = selectedIndex - so;
  }
  next = Math.max(0, Math.min(next, Math.max(0, count - visibleCount)));
  ref.current = next;
  return next;
}
