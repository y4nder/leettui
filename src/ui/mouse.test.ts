import { describe, expect, test } from "bun:test";

import { resolveRowClick, wheelRows } from "./mouse";

describe("resolveRowClick", () => {
  test("an unfocused panel's click focuses + selects, never activates", () => {
    expect(resolveRowClick({ clickedIndex: 3, selectedIndex: 0, panelFocused: false })).toBe(
      "focusAndSelect",
    );
    // Even on the already-selected row — the first click expresses "give me this
    // panel", not "run this row" (activation could be destructive, e.g. open $EDITOR).
    expect(resolveRowClick({ clickedIndex: 3, selectedIndex: 3, panelFocused: false })).toBe(
      "focusAndSelect",
    );
  });

  test("a focused panel's click on a different row moves the selection", () => {
    expect(resolveRowClick({ clickedIndex: 5, selectedIndex: 2, panelFocused: true })).toBe(
      "select",
    );
  });

  test("a focused panel's click on the selected row activates", () => {
    expect(resolveRowClick({ clickedIndex: 2, selectedIndex: 2, panelFocused: true })).toBe(
      "activate",
    );
  });
});

describe("wheelRows", () => {
  test("up moves the cursor toward the top (negative)", () => {
    expect(wheelRows("up", 1)).toBe(-1);
  });

  test("down moves the cursor toward the bottom (positive)", () => {
    expect(wheelRows("down", 1)).toBe(1);
  });

  test("scales with the event delta", () => {
    expect(wheelRows("up", 3)).toBe(-3);
    expect(wheelRows("down", 2)).toBe(2);
  });

  test("horizontal and unknown directions are inert", () => {
    expect(wheelRows("left", 1)).toBe(0);
    expect(wheelRows("right", 1)).toBe(0);
    expect(wheelRows(undefined, 1)).toBe(0);
  });
});
