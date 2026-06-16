import { describe, expect, test } from "bun:test";
import { describeScope, footerSegments, formatKeyToken, questionPanelBindings } from "./keymap";

describe("formatKeyToken", () => {
  test("maps special tokens", () => {
    expect(formatKeyToken("tab")).toBe("Tab");
    expect(formatKeyToken("shift+tab")).toBe("S-Tab");
    expect(formatKeyToken("return")).toBe("Enter");
    expect(formatKeyToken("escape")).toBe("Esc");
    expect(formatKeyToken("down")).toBe("↓");
  });

  test("uppercases shift+letter and prefixes ctrl", () => {
    expect(formatKeyToken("shift+g")).toBe("G");
    expect(formatKeyToken("ctrl+p")).toBe("^P");
  });

  test("passes plain tokens through", () => {
    expect(formatKeyToken("j")).toBe("j");
    expect(formatKeyToken("gg")).toBe("gg");
    expect(formatKeyToken("/")).toBe("/");
  });
});

describe("describeScope", () => {
  test("groups multiple key aliases under one command", () => {
    const scope = describeScope(questionPanelBindings);
    const next = scope.find((b) => b.cmd === "question.next");
    expect(next?.keys).toEqual(["j", "down"]);
    expect(next?.title).toBe("Next question");
    expect(next?.short).toBe("Navigate");
  });
});

describe("footerSegments", () => {
  test("questions panel: local keys first, dedup nav, then global", () => {
    const segs = footerSegments("questions", false);
    const byLabel = new Map(segs.map((s) => [s.label, s.keys]));

    // next/prev share the "Navigate" short → merged into one j/k segment.
    expect(byLabel.get("Navigate")).toBe("j/k");
    expect(byLabel.get("View")).toBe("Enter");
    expect(byLabel.get("Edit")).toBe("e");
    expect(byLabel.get("Run")).toBe("R");
    expect(byLabel.get("Submit")).toBe("s");
    expect(byLabel.get("Yank")).toBe("y");

    // global keys present too
    expect(byLabel.get("Focus")).toBe("Tab");
    expect(byLabel.get("Search")).toBe("/");
    expect(byLabel.get("Help")).toBe("?");
    expect(byLabel.get("Quit")).toBe("q");

    // local before global
    const navIdx = segs.findIndex((s) => s.label === "Navigate");
    const focusIdx = segs.findIndex((s) => s.label === "Focus");
    expect(navIdx).toBeLessThan(focusIdx);
  });

  test("topics panel omits question-only actions", () => {
    const labels = footerSegments("topics", false).map((s) => s.label);
    expect(labels).toContain("Navigate");
    expect(labels).not.toContain("Edit");
    expect(labels).not.toContain("Run");
    expect(labels).not.toContain("View");
    // global still present
    expect(labels).toContain("Help");
  });
});
