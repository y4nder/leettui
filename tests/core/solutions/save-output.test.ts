// `saveGoldenOutputs` is pure/dir-injected (like `discoverCases`), so it's
// unit-tested in-process against a real temp dir — no subprocess/temp-$HOME
// needed. Asserts the golden→grade loop end-to-end: bless a case, then confirm
// `discoverCases`/`compareOutput` (the read side) picks it up as expected.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveGoldenOutputs } from "@/core/solutions/save-output";
import { compareOutput, discoverCases } from "@/core/testRunner";
import type { LocalCaseResult } from "@/core/testRunner";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "leettui-save-output-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("saveGoldenOutputs", () => {
  test("a fresh clean-run case writes {name}.out verbatim, outcome created", () => {
    const cases: LocalCaseResult[] = [{ name: "case-01", status: "ran", actual: "[0,1]" }];
    const results = saveGoldenOutputs(dir, cases);

    expect(results).toEqual([{ name: "case-01", outcome: "created" }]);
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[0,1]");
  });

  test("re-saving with a different actual overwrites the file (D-03), outcome changed", () => {
    saveGoldenOutputs(dir, [{ name: "case-01", status: "ran", actual: "[0,1]" }]);
    const results = saveGoldenOutputs(dir, [{ name: "case-01", status: "ran", actual: "[1,0]" }]);

    expect(results).toEqual([{ name: "case-01", outcome: "changed" }]);
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[1,0]");
  });

  test("re-saving with a JSON-equivalent actual (spacing/whitespace) reports unchanged", () => {
    saveGoldenOutputs(dir, [{ name: "case-01", status: "ran", actual: "[0,1]" }]);
    // Must go through compareOutput (JSON-normalized), not raw `===`.
    const results = saveGoldenOutputs(dir, [
      { name: "case-01", status: "ran", actual: "[0, 1]\n" },
    ]);

    expect(results).toEqual([{ name: "case-01", outcome: "unchanged" }]);
  });

  test("error and timeout cases are skipped — never blessed (D-02)", () => {
    const cases: LocalCaseResult[] = [
      { name: "case-01", status: "error", actual: "Traceback..." },
      { name: "case-02", status: "timeout", actual: "Killed after 10s" },
    ];
    const results = saveGoldenOutputs(dir, cases);

    expect(results).toEqual([
      { name: "case-01", outcome: "skipped" },
      { name: "case-02", outcome: "skipped" },
    ]);
    expect(existsSync(join(dir, "case-01.out"))).toBe(false);
    expect(existsSync(join(dir, "case-02.out"))).toBe(false);
  });

  test("a pre-existing unrelated case-99.out is byte-for-byte unchanged (D-04 safety invariant)", () => {
    writeFileSync(join(dir, "case-99.out"), "untouched-sibling-content");

    saveGoldenOutputs(dir, [{ name: "case-01", status: "ran", actual: "[0,1]" }]);

    expect(readFileSync(join(dir, "case-99.out"), "utf-8")).toBe("untouched-sibling-content");
  });

  test("golden→grade loop: a saved case is discovered with hasExpected + grades pass", () => {
    const actual = "[0,1]";
    saveGoldenOutputs(dir, [{ name: "case-01", status: "ran", actual }]);
    // discoverCases only anchors on a `case-NN.txt` input — seed one so the case
    // is discoverable, matching the real tests/ layout.
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9\n");

    const discovered = discoverCases(dir);
    expect(discovered).toEqual([
      {
        name: "case-01",
        inputPath: join(dir, "case-01.txt"),
        expectedPath: join(dir, "case-01.out"),
      },
    ]);
    const written = readFileSync(join(dir, "case-01.out"), "utf-8");
    expect(compareOutput(actual, written)).toBe(true);
  });
});
