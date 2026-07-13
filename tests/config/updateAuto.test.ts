import { describe, expect, test } from "bun:test";
import { coerceUpdateAuto } from "@/config/index";

// Guards the `[update] auto` coercion: TOML can hand us anything, and a bad
// value must default to true (auto-update on) — off only when clearly false.
describe("coerceUpdateAuto", () => {
  test("passes booleans through", () => {
    expect(coerceUpdateAuto(true)).toBe(true);
    expect(coerceUpdateAuto(false)).toBe(false);
  });

  test("tolerates boolean-ish strings", () => {
    expect(coerceUpdateAuto("true")).toBe(true);
    expect(coerceUpdateAuto("false")).toBe(false);
    expect(coerceUpdateAuto(" True ")).toBe(true);
    expect(coerceUpdateAuto("FALSE")).toBe(false);
  });

  test("anything else defaults to true (auto-update on)", () => {
    expect(coerceUpdateAuto(undefined)).toBe(true);
    expect(coerceUpdateAuto(null)).toBe(true);
    expect(coerceUpdateAuto("yes")).toBe(true);
    expect(coerceUpdateAuto("off")).toBe(true);
    expect(coerceUpdateAuto(0)).toBe(true);
    expect(coerceUpdateAuto({})).toBe(true);
  });
});
