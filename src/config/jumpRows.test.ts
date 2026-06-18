import { describe, expect, test } from "bun:test";
import { clampJumpRows, DEFAULT_JUMP_ROWS } from "./index";

// Guards the `[scroll] jump_rows` coercion: TOML can hand us anything, and a bad
// value must never become a NaN/zero/negative jump that desyncs the cursor math.
describe("clampJumpRows", () => {
  test("passes through a positive integer", () => {
    expect(clampJumpRows(1)).toBe(1);
    expect(clampJumpRows(10)).toBe(10);
    expect(clampJumpRows(500)).toBe(500); // no upper bound — the cursor clamp pins it
  });

  test("floors a fractional value to whole rows", () => {
    expect(clampJumpRows(10.9)).toBe(10);
    expect(clampJumpRows(1.2)).toBe(1);
  });

  test("falls back to the default below 1 row", () => {
    expect(clampJumpRows(0)).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(0.5)).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(-5)).toBe(DEFAULT_JUMP_ROWS);
  });

  test("falls back to the default for NaN / Infinity", () => {
    expect(clampJumpRows(Number.NaN)).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(Number.POSITIVE_INFINITY)).toBe(DEFAULT_JUMP_ROWS);
  });

  test("falls back to the default for non-numbers (TOML string/bool/missing)", () => {
    expect(clampJumpRows("10")).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(true)).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(undefined)).toBe(DEFAULT_JUMP_ROWS);
    expect(clampJumpRows(null)).toBe(DEFAULT_JUMP_ROWS);
  });
});
