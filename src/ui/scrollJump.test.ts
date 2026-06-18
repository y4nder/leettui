import { describe, expect, test } from "bun:test";
import { pageJumpRows } from "./scrollJump";
import { clamp } from "./store/slices/selectionSlice";

describe("pageJumpRows", () => {
  test("is the floored viewport × fraction", () => {
    expect(pageJumpRows(40, 0.5)).toBe(20);
    expect(pageJumpRows(40, 1)).toBe(40);
    expect(pageJumpRows(41, 0.5)).toBe(20); // floor(20.5)
    expect(pageJumpRows(10, 0.25)).toBe(2); // floor(2.5)
  });

  test("never returns less than 1 row (tiny viewport or fraction still moves)", () => {
    expect(pageJumpRows(1, 0.5)).toBe(1);
    expect(pageJumpRows(0, 0.5)).toBe(1);
    expect(pageJumpRows(3, 0.01)).toBe(1); // floor(0.03) → clamped up to 1
  });
});

// The out-of-bounds invariant the page jump relies on: moveQuestion/moveTopic add
// the (possibly oversized) jump to the cursor, then clamp. As long as clamp pins
// the result into range, no jump — however large the configured fraction or list —
// can index past the array.
describe("clamp keeps a page jump in bounds", () => {
  test("an oversized down-jump lands on the last index, not past it", () => {
    const length = 5;
    expect(clamp(2 + pageJumpRows(1000, 1), length)).toBe(length - 1);
    expect(clamp(Number.MAX_SAFE_INTEGER, length)).toBe(length - 1);
  });

  test("an oversized up-jump lands on the first index, not negative", () => {
    expect(clamp(2 - pageJumpRows(1000, 1), 5)).toBe(0);
    expect(clamp(-9999, 5)).toBe(0);
  });

  test("any jump on an empty list stays at 0", () => {
    expect(clamp(pageJumpRows(40, 0.5), 0)).toBe(0);
    expect(clamp(-pageJumpRows(40, 0.5), 0)).toBe(0);
  });
});
