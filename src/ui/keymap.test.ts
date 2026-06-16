import { describe, expect, test } from "bun:test";
import {
  describeScope,
  fitFooter,
  footerSegments,
  formatKeyToken,
  isProblemScopeEntryVisible,
  isScopeEntryVisible,
  problemGlobalBindings,
  problemHelpBindings,
  problemPanelBindings,
  questionPanelBindings,
} from "./keymap";

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

describe("fitFooter", () => {
  const segs = [
    { keys: "j/k", label: "Navigate" },
    { keys: "Enter", label: "View" },
    { keys: "e", label: "Edit" },
  ];

  test("returns everything when it fits", () => {
    expect(fitFooter(segs, 100)).toBe("j/k:Navigate  Enter:View  e:Edit");
  });

  test("drops overflow at a segment boundary with an ellipsis", () => {
    // "j/k:Navigate" = 12, + "  Enter:View" = 24. Budget 20 keeps only the first.
    expect(fitFooter(segs, 20)).toBe("j/k:Navigate …");
  });

  test("never clips mid-segment except when the first alone overflows", () => {
    expect(fitFooter(segs, 5)).toBe("j/k:N");
  });

  test("empty segments → empty string", () => {
    expect(fitFooter([], 40)).toBe("");
  });
});

describe("problem help scope visibility (Stage 12 item 5)", () => {
  type Bindings = Parameters<typeof describeScope>[0];
  const visibleProblem = (b: Bindings) =>
    describeScope(b).filter((x) => isProblemScopeEntryVisible(x, false));
  const visibleBrowse = (b: Bindings) =>
    describeScope(b).filter((x) => isScopeEntryVisible(x, false));

  // Regression guard for the bug that nearly shipped: the problem-view commands are all
  // group:"modal", so the BROWSE predicate collapses the help to near-empty. It's type-
  // and lint-clean (gate-invisible) — only a test catches a revert to isScopeEntryVisible
  // or a command's group flipping to "modal"-hidden.
  test("problem predicate surfaces the modal commands the browse one hides", () => {
    const browseN = visibleBrowse(problemGlobalBindings).length;
    const problemN = visibleProblem(problemGlobalBindings).length;
    expect(problemN).toBeGreaterThan(browseN);
    expect(problemN).toBeGreaterThanOrEqual(15);
  });

  test("problem global scope includes the live-action + help commands", () => {
    const cmds = visibleProblem(problemGlobalBindings).map((b) => b.cmd);
    expect(cmds).toContain("problem.submitFocused"); // the live submit the gating protects
    expect(cmds).toContain("problem.help");
  });

  test("every problem panel's local scope is non-empty", () => {
    for (const panel of ["description", "solutions", "result", "related"] as const) {
      expect(visibleProblem(problemPanelBindings(panel)).length).toBeGreaterThan(0);
    }
  });

  // A binding naming a non-existent command is a typo class tsc can't catch (the title
  // falls back to the raw command name). Guard the new problem layers against it.
  test("no dead bindings in the problem global + help layers", () => {
    for (const scope of [problemGlobalBindings, problemHelpBindings]) {
      for (const b of describeScope(scope)) {
        expect(b.title).not.toBe(b.cmd);
      }
    }
  });
});
