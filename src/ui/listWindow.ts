// Pure window math for the cursor-driven, wheel-scrollable lists — no React imports,
// unit-tested (the mouse.ts precedent). useScrollableList.ts owns the stateful wiring.

const SCROLLOFF = 5;

// Neovim-style scrolloff: the cursor keeps this many lines of context above/below
// before the window scrolls (capped to a quarter of small viewports).
export function scrolloffFor(visibleCount: number): number {
  return Math.min(SCROLLOFF, Math.floor(visibleCount / 4));
}

export function maxScrollOffset(count: number, visibleCount: number): number {
  return Math.max(0, count - visibleCount);
}

// Keyboard side: derive the next window offset from a cursor move, scrolling only when
// the cursor pushes past the scrolloff margin (so a wheel-positioned window stays put
// while the cursor roams its comfort zone).
export function followCursor(
  prevOffset: number,
  cursor: number,
  count: number,
  visibleCount: number,
): number {
  const so = scrolloffFor(visibleCount);
  const max = maxScrollOffset(count, visibleCount);
  let next = Math.max(0, Math.min(prevOffset, max));
  if (cursor >= next + visibleCount - so) {
    next = cursor - visibleCount + so + 1;
  }
  if (cursor < next + so) {
    next = cursor - so;
  }
  return Math.max(0, Math.min(next, max));
}

// Wheel side: move the viewport itself, dragging the cursor along only when it would
// leave the new window's comfort zone (variant "b" — the highlight always stays
// visible, so a keyboard move afterwards continues from where you're looking instead
// of jumping the view back). The returned cursor sits exactly inside followCursor's
// no-scroll zone, so applying it can never re-derive the offset we just set. At the
// list edges the zone collapses to the true first/last row, matching followCursor.
export function scrollViewport(opts: {
  offset: number;
  cursor: number;
  count: number;
  visibleCount: number;
  delta: number;
}): { offset: number; cursor: number } {
  const { cursor, count, visibleCount, delta } = opts;
  const max = maxScrollOffset(count, visibleCount);
  const offset = Math.max(0, Math.min(opts.offset + delta, max));
  if (offset === opts.offset) return { offset, cursor };
  const so = scrolloffFor(visibleCount);
  const lo = offset === 0 ? 0 : offset + so;
  const hi = offset === max ? count - 1 : offset + visibleCount - 1 - so;
  return { offset, cursor: Math.max(lo, Math.min(cursor, hi)) };
}
