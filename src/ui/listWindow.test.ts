import { describe, expect, test } from "bun:test";

import { followCursor, maxScrollOffset, scrolloffFor, scrollViewport } from "./listWindow";

describe("scrolloffFor", () => {
  test("caps at 5 lines for tall viewports, a quarter for small ones", () => {
    expect(scrolloffFor(40)).toBe(5);
    expect(scrolloffFor(8)).toBe(2);
    expect(scrolloffFor(3)).toBe(0);
    expect(scrolloffFor(1)).toBe(0);
  });
});

describe("followCursor", () => {
  test("stays put while the cursor roams the comfort zone", () => {
    // 20-row window (so=5) at offset 10: rows 15..24 are comfortable.
    expect(followCursor(10, 15, 100, 20)).toBe(10);
    expect(followCursor(10, 24, 100, 20)).toBe(10);
  });

  test("scrolls down/up when the cursor pushes past the margin", () => {
    expect(followCursor(10, 25, 100, 20)).toBe(11);
    expect(followCursor(10, 14, 100, 20)).toBe(9);
  });

  test("clamps at the list edges (cursor may sit inside the margin there)", () => {
    expect(followCursor(5, 0, 100, 20)).toBe(0);
    expect(followCursor(0, 99, 100, 20)).toBe(80);
    expect(followCursor(80, 99, 100, 20)).toBe(80);
  });

  test("short lists never scroll", () => {
    expect(followCursor(0, 4, 5, 20)).toBe(0);
    expect(followCursor(7, 2, 5, 20)).toBe(0);
  });
});

describe("scrollViewport", () => {
  test("moves the viewport and leaves an in-zone cursor alone", () => {
    // Offset 10 → 13; cursor 20 still inside [18, 27] (so=5, visible=20).
    const r = scrollViewport({ offset: 10, cursor: 20, count: 100, visibleCount: 20, delta: 3 });
    expect(r).toEqual({ offset: 13, cursor: 20 });
  });

  test("drags the cursor along when it would leave the comfort zone", () => {
    // Scrolling down past the cursor: clamped up to the new window's top margin.
    const down = scrollViewport({ offset: 10, cursor: 15, count: 100, visibleCount: 20, delta: 5 });
    expect(down).toEqual({ offset: 15, cursor: 20 });
    // Scrolling up past the cursor: clamped down to the new window's bottom margin.
    const up = scrollViewport({ offset: 40, cursor: 54, count: 100, visibleCount: 20, delta: -10 });
    expect(up).toEqual({ offset: 30, cursor: 44 });
  });

  test("the dragged cursor lands inside followCursor's no-scroll zone", () => {
    // The variant-b invariant: applying the returned cursor never re-derives the
    // offset the wheel just set (otherwise keyboard-after-wheel would jump the view).
    for (const delta of [1, 7, -1, -12, 50, -50]) {
      const r = scrollViewport({ offset: 30, cursor: 35, count: 100, visibleCount: 20, delta });
      expect(followCursor(r.offset, r.cursor, 100, 20)).toBe(r.offset);
    }
  });

  test("no-ops at the list edges", () => {
    const top = scrollViewport({ offset: 0, cursor: 3, count: 100, visibleCount: 20, delta: -1 });
    expect(top).toEqual({ offset: 0, cursor: 3 });
    const bottom = scrollViewport({
      offset: 80,
      cursor: 90,
      count: 100,
      visibleCount: 20,
      delta: 1,
    });
    expect(bottom).toEqual({ offset: 80, cursor: 90 });
  });

  test("no-ops when the list fits the viewport", () => {
    expect(maxScrollOffset(5, 20)).toBe(0);
    const r = scrollViewport({ offset: 0, cursor: 2, count: 5, visibleCount: 20, delta: 3 });
    expect(r).toEqual({ offset: 0, cursor: 2 });
  });

  test("clamps an oversized delta to the last window, cursor to the last row's zone", () => {
    const r = scrollViewport({ offset: 0, cursor: 0, count: 100, visibleCount: 20, delta: 999 });
    expect(r.offset).toBe(80);
    // At the bottom edge the zone extends to the true last row, so the cursor lands
    // on the margin boundary and followCursor holds the offset.
    expect(r.cursor).toBe(85);
    expect(followCursor(r.offset, r.cursor, 100, 20)).toBe(80);
  });
});
