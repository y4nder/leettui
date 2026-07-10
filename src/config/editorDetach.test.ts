import { describe, expect, test } from "bun:test";
import { coerceEditorDetach, shouldDetachEditor } from "./index";

// Guards the `[editor] detach` coercion: TOML can hand us anything, and a bad
// value must normalize to "auto" rather than accidentally forcing a mode.
describe("coerceEditorDetach", () => {
  test("passes booleans through", () => {
    expect(coerceEditorDetach(true)).toBe(true);
    expect(coerceEditorDetach(false)).toBe(false);
  });

  test("tolerates boolean-ish strings", () => {
    expect(coerceEditorDetach("true")).toBe(true);
    expect(coerceEditorDetach("false")).toBe(false);
    expect(coerceEditorDetach(" True ")).toBe(true);
    expect(coerceEditorDetach("FALSE")).toBe(false);
  });

  test('normalizes "auto" and anything else to "auto"', () => {
    expect(coerceEditorDetach("auto")).toBe("auto");
    expect(coerceEditorDetach("AUTO")).toBe("auto");
    expect(coerceEditorDetach("yes")).toBe("auto");
    expect(coerceEditorDetach(1)).toBe("auto");
    expect(coerceEditorDetach(null)).toBe("auto");
    expect(coerceEditorDetach(undefined)).toBe("auto");
    expect(coerceEditorDetach({})).toBe("auto");
  });
});

describe("shouldDetachEditor", () => {
  test("a forced setting wins regardless of the editor", () => {
    expect(shouldDetachEditor(["vim"], true)).toBe(true);
    expect(shouldDetachEditor(["code", "--wait"], false)).toBe(false);
  });

  test("auto detaches known GUI editors", () => {
    expect(shouldDetachEditor(["code", "--wait"], "auto")).toBe(true);
    expect(shouldDetachEditor(["cursor"], "auto")).toBe(true);
    expect(shouldDetachEditor(["zed"], "auto")).toBe(true);
    expect(shouldDetachEditor(["subl", "-w"], "auto")).toBe(true);
  });

  test("auto matches by basename of a full path", () => {
    expect(shouldDetachEditor(["/usr/bin/code"], "auto")).toBe(true);
    expect(shouldDetachEditor(["/opt/sublime_text/sublime_text"], "auto")).toBe(true);
  });

  test("auto handles Windows paths, extensions, and case", () => {
    expect(
      shouldDetachEditor(
        ["C:\\Users\\x\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"],
        "auto",
      ),
    ).toBe(true);
    expect(shouldDetachEditor(["code.cmd", "--wait"], "auto")).toBe(true);
    expect(shouldDetachEditor(["NOTEPAD.EXE"], "auto")).toBe(true);
  });

  test("auto keeps terminal editors blocking", () => {
    expect(shouldDetachEditor(["vim"], "auto")).toBe(false);
    expect(shouldDetachEditor(["nvim", "-p"], "auto")).toBe(false);
    expect(shouldDetachEditor(["hx"], "auto")).toBe(false);
    expect(shouldDetachEditor(["nano"], "auto")).toBe(false);
    // GUI emacs and `emacs -nw` share a basename — deliberately blocking; force
    // `detach = true` for GUI emacs.
    expect(shouldDetachEditor(["emacs", "-nw"], "auto")).toBe(false);
    expect(shouldDetachEditor(["emacs"], "auto")).toBe(false);
  });

  test("an empty argv never detaches", () => {
    expect(shouldDetachEditor([], "auto")).toBe(false);
  });
});
