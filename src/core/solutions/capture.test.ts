// `captureFailingCase`/`blessRunOutputs` are pure/dir-injected (like
// `saveGoldenOutputs`), so they're unit-tested in-process against a real temp
// dir — no subprocess/temp-$HOME needed. Covers every D-01..D-07 branch plus
// the T-02.2-01 path-safety invariant and the ROADMAP criterion 3 offline
// round-trip (capture → discoverCases/compareOutput grades it pass).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { blessRunOutputs, captureFailingCase } from "./capture";
import { compareOutput, discoverCases } from "../testRunner";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "leettui-capture-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("captureFailingCase", () => {
  test("no match, expectedOutput present: writes case-NN.txt + case-NN.out, outcome captured (D-01)", () => {
    const result = captureFailingCase(dir, "[2,7,11,15]\n9", "[0,1]");

    expect(result.outcome).toBe("captured");
    expect(result.name).toMatch(/^case-\d+$/);
    expect(readFileSync(join(dir, `${result.name}.txt`), "utf-8")).toBe("[2,7,11,15]\n9");
    expect(readFileSync(join(dir, `${result.name}.out`), "utf-8")).toBe("[0,1]");
  });

  test("no match, expectedOutput undefined: writes case-NN.txt only, no .out, outcome captured (D-03)", () => {
    const result = captureFailingCase(dir, "[1]\n0");

    expect(result.outcome).toBe("captured");
    expect(readFileSync(join(dir, `${result.name}.txt`), "utf-8")).toBe("[1]\n0");
    expect(existsSync(join(dir, `${result.name}.out`))).toBe(false);
  });

  test("normalized-input duplicate (trailing-whitespace/CRLF) is not written twice, outcome duplicate (D-04)", () => {
    writeFileSync(join(dir, "case-01.txt"), "[1,2]\r\n3");
    writeFileSync(join(dir, "case-01.out"), "[1]");

    const result = captureFailingCase(dir, "[1,2]\n3  ", "[1]");

    expect(result).toEqual({
      name: "case-01",
      outcome: "duplicate",
      note: "case-01 already captured",
    });
    // No new case written.
    expect(existsSync(join(dir, "case-02.txt"))).toBe(false);
  });

  test("match with no sibling .out gets it filled from expectedOutput, outcome blessed (D-05)", () => {
    writeFileSync(join(dir, "case-01.txt"), "[1,2]\n3");

    const result = captureFailingCase(dir, "[1,2]\n3", "[3]");

    expect(result).toEqual({ name: "case-01", outcome: "blessed", note: "Blessed case-01.out" });
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[3]");
    expect(existsSync(join(dir, "case-02.txt"))).toBe(false);
  });

  test("match with no sibling .out and no expectedOutput: duplicate, still no .out written", () => {
    writeFileSync(join(dir, "case-01.txt"), "[1,2]\n3");

    const result = captureFailingCase(dir, "[1,2]\n3");

    expect(result).toEqual({
      name: "case-01",
      outcome: "duplicate",
      note: "case-01 already captured",
    });
    expect(existsSync(join(dir, "case-01.out"))).toBe(false);
  });

  test("match whose existing .out disagrees with expectedOutput is left unchanged, outcome mismatch (D-06)", () => {
    writeFileSync(join(dir, "case-01.txt"), "[1,2]\n3");
    writeFileSync(join(dir, "case-01.out"), "[3]");

    const result = captureFailingCase(dir, "[1,2]\n3", "[99]");

    expect(result).toEqual({
      name: "case-01",
      outcome: "mismatch",
      note: "case-01.out disagrees with LeetCode's expected output",
    });
    // Byte-for-byte unchanged.
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[3]");
  });

  test("match whose existing .out agrees (JSON-equivalent spacing) with expectedOutput: duplicate", () => {
    writeFileSync(join(dir, "case-01.txt"), "[1,2]\n3");
    writeFileSync(join(dir, "case-01.out"), "[3]");

    const result = captureFailingCase(dir, "[1,2]\n3", "[3]\n");

    expect(result).toEqual({
      name: "case-01",
      outcome: "duplicate",
      note: "case-01 already captured",
    });
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[3]");
  });

  test("security (T-02.2-01): path-like input still writes a generated case-NN name, nothing outside testsDir", () => {
    const maliciousInput = "../../etc/x\n../../../passwd";
    const result = captureFailingCase(dir, maliciousInput, "pwned");

    expect(result.name).toMatch(/^case-\d+$/);
    expect(existsSync(join(dir, `${result.name}.txt`))).toBe(true);
    expect(existsSync(join(dir, `${result.name}.out`))).toBe(true);
    // The malicious content landed as file CONTENT, not a path segment.
    expect(readFileSync(join(dir, `${result.name}.txt`), "utf-8")).toBe(maliciousInput);
  });

  test("round-trip (ROADMAP criterion 3): a captured case is gradeable offline via discoverCases/compareOutput", () => {
    const expectedOutput = "[0,1]";
    const result = captureFailingCase(dir, "[2,7,11,15]\n9", expectedOutput);

    const discovered = discoverCases(dir);
    const found = discovered.find((c) => c.name === result.name);
    expect(found?.expectedPath).not.toBeNull();
    const written = readFileSync(found?.expectedPath as string, "utf-8");
    expect(compareOutput(expectedOutput, written)).toBe(true);
  });
});

describe("blessRunOutputs", () => {
  test("exampleTestcaseList[i] content-matches a seeded case with no .out: filled from expectedCodeAnswer[i] (D-02)", () => {
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9");

    const results = blessRunOutputs(dir, ["[2,7,11,15]\n9"], ["[0,1]"]);

    expect(results).toEqual([{ name: "case-01", outcome: "blessed", note: "Blessed case-01.out" }]);
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[0,1]");
  });

  test("matching is by content not index: differing case order still blesses the correct case (D-07)", () => {
    // tests/ dir order differs from exampleTestcaseList order.
    writeFileSync(join(dir, "case-01.txt"), "[3,3]\n6");
    writeFileSync(join(dir, "case-02.txt"), "[2,7,11,15]\n9");

    const results = blessRunOutputs(dir, ["[2,7,11,15]\n9", "[3,3]\n6"], ["[0,1]", "[0,1]"]);

    expect(results).toEqual(
      expect.arrayContaining([
        { name: "case-02", outcome: "blessed", note: "Blessed case-02.out" },
        { name: "case-01", outcome: "blessed", note: "Blessed case-01.out" },
      ]),
    );
    expect(readFileSync(join(dir, "case-02.out"), "utf-8")).toBe("[0,1]");
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[0,1]");
  });

  test("a matched case that already has a .out is skipped, never overwritten", () => {
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9");
    writeFileSync(join(dir, "case-01.out"), "[0,1]");

    const results = blessRunOutputs(dir, ["[2,7,11,15]\n9"], ["[9,9]"]);

    expect(results).toEqual([]);
    expect(readFileSync(join(dir, "case-01.out"), "utf-8")).toBe("[0,1]");
  });

  test("an unmatched exampleTestcaseList entry is simply not written", () => {
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9");

    const results = blessRunOutputs(dir, ["[unrelated]\n0"], ["[0,1]"]);

    expect(results).toEqual([]);
    expect(existsSync(join(dir, "case-01.out"))).toBe(false);
  });

  test("undefined/empty expectedCodeAnswer returns []", () => {
    writeFileSync(join(dir, "case-01.txt"), "[2,7,11,15]\n9");

    expect(blessRunOutputs(dir, ["[2,7,11,15]\n9"], undefined)).toEqual([]);
    expect(blessRunOutputs(dir, ["[2,7,11,15]\n9"], [])).toEqual([]);
  });
});
