import { describe, expect, test } from "bun:test";
import { clampPageFraction, DEFAULT_PAGE_FRACTION } from "./index";

// Guards the `[scroll] page_fraction` coercion: TOML can hand us anything, and a
// bad value must never become a NaN/negative jump that desyncs the cursor math.
describe("clampPageFraction", () => {
  test("passes through a valid fraction in (0, 1]", () => {
    expect(clampPageFraction(0.25)).toBe(0.25);
    expect(clampPageFraction(0.5)).toBe(0.5);
    expect(clampPageFraction(1)).toBe(1);
  });

  test("clamps an over-1 fraction down to a full page", () => {
    expect(clampPageFraction(1.5)).toBe(1);
    expect(clampPageFraction(42)).toBe(1);
  });

  test("falls back to the default for non-positive values", () => {
    expect(clampPageFraction(0)).toBe(DEFAULT_PAGE_FRACTION);
    expect(clampPageFraction(-0.5)).toBe(DEFAULT_PAGE_FRACTION);
  });

  test("falls back to the default for NaN / Infinity", () => {
    expect(clampPageFraction(Number.NaN)).toBe(DEFAULT_PAGE_FRACTION);
    expect(clampPageFraction(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PAGE_FRACTION);
  });

  test("falls back to the default for non-numbers (TOML string/bool/missing)", () => {
    expect(clampPageFraction("0.5")).toBe(DEFAULT_PAGE_FRACTION);
    expect(clampPageFraction(true)).toBe(DEFAULT_PAGE_FRACTION);
    expect(clampPageFraction(undefined)).toBe(DEFAULT_PAGE_FRACTION);
    expect(clampPageFraction(null)).toBe(DEFAULT_PAGE_FRACTION);
  });
});
