// `nextCaseName`/`addCase` are pure/dir-injected (like `discoverCases`), so
// they're unit-tested in-process against a real temp dir — no subprocess/temp
// $HOME needed. Asserts the numbering rules (max+1, gap-safe) and the
// write→discover round-trip.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addCase, nextCaseName } from "@/core/solutions/add-case";
import { discoverCases } from "@/core/testRunner";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "leettui-add-case-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("nextCaseName", () => {
  test("no existing cases → case-01", () => {
    expect(nextCaseName(dir)).toBe("case-01");
  });

  test("case-01 + case-02 present → case-03 (max + 1, 2-digit-padded)", () => {
    writeFileSync(join(dir, "case-01.txt"), "a");
    writeFileSync(join(dir, "case-02.txt"), "b");
    expect(nextCaseName(dir)).toBe("case-03");
  });

  test("a gap (case-01, case-03) → case-04, not gap-fill", () => {
    writeFileSync(join(dir, "case-01.txt"), "a");
    writeFileSync(join(dir, "case-03.txt"), "c");
    expect(nextCaseName(dir)).toBe("case-04");
  });
});

describe("addCase", () => {
  test("writes {nextCaseName}.txt verbatim and returns its path; creates testsDir if absent", () => {
    const path = addCase(dir, "[3,3]\n6\n");
    expect(path).toBe(join(dir, "case-01.txt"));
    expect(readFileSync(path, "utf-8")).toBe("[3,3]\n6\n");
  });

  test("never writes a .out — only the .txt input (D-05)", () => {
    addCase(dir, "[1,2]\n3\n");
    expect(() => readFileSync(join(dir, "case-01.out"), "utf-8")).toThrow();
  });

  test("round-trip: the written input is discovered by discoverCases on the next run", () => {
    addCase(dir, "[3,3]\n6\n");
    const discovered = discoverCases(dir);
    expect(discovered).toEqual([
      { name: "case-01", inputPath: join(dir, "case-01.txt"), expectedPath: null },
    ]);
    expect(readFileSync(join(dir, "case-01.txt"), "utf-8")).toBe("[3,3]\n6\n");
  });

  test("sequential calls write monotonically increasing case numbers", () => {
    const p1 = addCase(dir, "first");
    const p2 = addCase(dir, "second");
    expect(p1).toBe(join(dir, "case-01.txt"));
    expect(p2).toBe(join(dir, "case-02.txt"));
    expect(readFileSync(p1, "utf-8")).toBe("first");
    expect(readFileSync(p2, "utf-8")).toBe("second");
  });
});
