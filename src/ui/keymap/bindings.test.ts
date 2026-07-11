// Guard: every per-scope binding references a command that actually exists in the
// catalog. Bindings name commands by string (bindings.ts), so a typo or a renamed/
// removed command is a silent runtime no-op that tsc can't catch — this test does.

import { describe, expect, test } from "bun:test";
import { COMMAND_BY_NAME } from "./commands/index";
import * as bindings from "./bindings";

describe("binding command-names", () => {
  test("every binding references a registered command", () => {
    const referenced = new Set<string>();
    for (const value of Object.values(bindings)) {
      if (!Array.isArray(value)) continue;
      for (const b of value) {
        if (typeof b.cmd === "string") referenced.add(b.cmd);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    const missing = [...referenced].filter((name) => !COMMAND_BY_NAME.has(name));
    expect(missing).toEqual([]);
  });

  test("the changelog popup bindings resolve", () => {
    for (const name of ["changelog.openGithub", "changelog.close", "popup.scrollDown"]) {
      expect(COMMAND_BY_NAME.has(name)).toBe(true);
    }
  });

  test("the full-screen result bindings resolve", () => {
    for (const name of [
      "problem.resultExpand",
      "problem.resultFsClose",
      "popup.scrollHalfDown",
      "popup.scrollHalfUp",
    ]) {
      expect(COMMAND_BY_NAME.has(name)).toBe(true);
    }
  });
});
