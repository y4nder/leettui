import { describe, expect, test } from "bun:test";
import { clamp } from "@/ui/store/slices/selectionSlice";

// The out-of-bounds invariant the Ctrl+d/Ctrl+u jump relies on: moveQuestion/
// moveTopic add the configured jump_rows to the cursor, then clamp. As long as
// clamp pins the result into [0, length-1], no jump — however large the configured
// row count or short the list — can index past the array.
describe("clamp keeps a cursor jump in bounds", () => {
  test("a normal move stays put", () => {
    expect(clamp(3, 10)).toBe(3);
    expect(clamp(0, 10)).toBe(0);
    expect(clamp(9, 10)).toBe(9);
  });

  test("an oversized down-jump lands on the last index, not past it", () => {
    expect(clamp(2 + 500, 5)).toBe(4);
    expect(clamp(Number.MAX_SAFE_INTEGER, 5)).toBe(4);
  });

  test("an oversized up-jump lands on the first index, not negative", () => {
    expect(clamp(2 - 500, 5)).toBe(0);
    expect(clamp(-9999, 5)).toBe(0);
  });

  test("any jump on an empty list stays at 0", () => {
    expect(clamp(10, 0)).toBe(0);
    expect(clamp(-10, 0)).toBe(0);
  });
});
