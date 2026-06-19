import { describe, expect, test } from "bun:test";
import { parseEditorCommand } from "./index";

// Guards the editor-command tokenizer: a configured `[editor] command` (or
// $EDITOR) must split into an argv so flags survive (`code --wait`), while quoted
// paths with spaces stay one token and Windows backslashes are left intact.

describe("parseEditorCommand", () => {
  test("a bare command is a single token", () => {
    expect(parseEditorCommand("vim")).toEqual(["vim"]);
  });

  test("splits a command and its flags on whitespace", () => {
    expect(parseEditorCommand("code --wait")).toEqual(["code", "--wait"]);
    expect(parseEditorCommand("nvim -p")).toEqual(["nvim", "-p"]);
  });

  test("collapses runs of spaces and tabs between tokens", () => {
    expect(parseEditorCommand("  code   --wait\t-n ")).toEqual(["code", "--wait", "-n"]);
  });

  test("double quotes group a token containing spaces", () => {
    expect(parseEditorCommand('"my editor" --wait')).toEqual(["my editor", "--wait"]);
  });

  test("single quotes group too", () => {
    expect(parseEditorCommand("'my editor' -a")).toEqual(["my editor", "-a"]);
  });

  test("keeps Windows backslashes — they are path separators, not escapes", () => {
    expect(
      parseEditorCommand('"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" --wait'),
    ).toEqual(["C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd", "--wait"]);
  });

  test("an empty or whitespace-only string yields no tokens (caller re-defaults)", () => {
    expect(parseEditorCommand("")).toEqual([]);
    expect(parseEditorCommand("   \t ")).toEqual([]);
  });

  test("an empty quoted argument is preserved as a token", () => {
    expect(parseEditorCommand('code ""')).toEqual(["code", ""]);
  });
});
